import { logger, metadata, task, wait } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/db";
import { sendReviewReminderEmail } from "@/lib/email";

function dashboardUrl(contractId: string): string {
  const base = process.env.APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/contracts/${contractId}/review`;
}

// Follow-up reminder. Triggered (fire-and-forget) the moment a contract enters
// human review, this run sleeps for a week using wait.for() — Trigger.dev
// checkpoints the run and frees the compute while it waits, so the 7-day delay
// costs nothing. When it wakes, it only nudges the owner if the contract is
// *still* awaiting review (i.e. nobody actioned it in the meantime).
//
// The wait duration is overridable via REVIEW_REMINDER_DELAY_SECONDS so the
// flow can be exercised end-to-end without waiting a real week.
export const reviewReminder = task({
  id: "review-reminder",
  // The run is mostly asleep; give it a generous ceiling so the active work
  // (the email send) always has room after the checkpointed wait resumes.
  maxDuration: 600,
  run: async (payload: { contractId: string }) => {
    const { contractId } = payload ?? {};
    if (!contractId) {
      throw new Error("Missing contractId in payload.");
    }

    const overrideSeconds = Number(process.env.REVIEW_REMINDER_DELAY_SECONDS);
    const useOverride = Number.isFinite(overrideSeconds) && overrideSeconds > 0;
    const waitingFor = useOverride ? `${overrideSeconds} seconds` : "7 days";

    metadata.set("contractId", contractId);
    metadata.set("stage", "waiting");
    metadata.set("waitingFor", waitingFor);

    logger.log("Scheduling review reminder", { contractId, waitingFor });
    if (useOverride) {
      await wait.for({ seconds: overrideSeconds });
    } else {
      await wait.for({ days: 7 });
    }

    metadata.set("stage", "checking");
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        status: true,
        title: true,
        user: { select: { email: true, name: true } },
      },
    });

    if (!contract) {
      logger.warn("Reminder: contract no longer exists", { contractId });
      metadata.set("stage", "skipped");
      return { contractId, reminded: false, reason: "not-found" };
    }

    // The whole point of the reminder: only nudge if it's still unactioned.
    if (contract.status !== "AWAITING_REVIEW") {
      logger.log("Reminder skipped — contract already actioned", {
        contractId,
        status: contract.status,
      });
      metadata.set("stage", "skipped");
      return {
        contractId,
        reminded: false,
        reason: "already-actioned",
        status: contract.status,
      };
    }

    if (!contract.user?.email) {
      metadata.set("stage", "skipped");
      return { contractId, reminded: false, reason: "no-recipient" };
    }

    const sent = await sendReviewReminderEmail({
      to: contract.user.email,
      recipientName: contract.user.name,
      contractTitle: contract.title,
      dashboardUrl: dashboardUrl(contractId),
      waitingFor,
    });
    logger.log("Reminder email dispatched", {
      contractId,
      to: sent.to,
      provider: sent.provider,
      sent: sent.sent,
    });
    metadata.set("stage", "reminded");

    return { contractId, reminded: true, emailed: sent.sent };
  },
});
