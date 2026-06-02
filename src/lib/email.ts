import { Resend } from "resend";
import type { RiskLevel } from "./analysis";

export type ReviewEmailStats = {
  totalClauses: number;
  byRisk: Record<RiskLevel, number>;
  clausesWithAmbiguity: number;
  totalRecommendations: number;
};

export type ReviewEmailParams = {
  to: string;
  recipientName?: string | null;
  contractTitle: string;
  dashboardUrl: string;
  stats: ReviewEmailStats;
};

export type SendResult = {
  sent: boolean;
  provider: "resend" | "log";
  id?: string;
  to: string;
};

const DEFAULT_FROM = "Contract Review <onboarding@resend.dev>";

function renderText(p: ReviewEmailParams): string {
  const { stats } = p;
  const high = stats.byRisk.CRITICAL + stats.byRisk.HIGH;
  return [
    `Hi${p.recipientName ? ` ${p.recipientName}` : ""},`,
    "",
    `Your contract "${p.contractTitle}" has finished automated analysis and is ready for your review.`,
    "",
    "Summary:",
    `  • ${stats.totalClauses} clauses analysed`,
    `  • ${high} high/critical risk · ${stats.byRisk.MEDIUM} medium · ${stats.byRisk.LOW} low`,
    `  • ${stats.clausesWithAmbiguity} clauses with ambiguous language`,
    `  • ${stats.totalRecommendations} recommendations`,
    "",
    `Open the review dashboard to approve or request changes:`,
    p.dashboardUrl,
    "",
    "The analysis run is paused and will resume once you submit your review.",
  ].join("\n");
}

function renderHtml(p: ReviewEmailParams): string {
  const { stats } = p;
  const high = stats.byRisk.CRITICAL + stats.byRisk.HIGH;
  return `
  <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; color: #1a2332;">
    <h2 style="margin: 0 0 0.5rem;">Contract ready for review</h2>
    <p>Hi${p.recipientName ? ` ${escapeHtml(p.recipientName)}` : ""}, your contract
      <strong>${escapeHtml(p.contractTitle)}</strong> has finished automated analysis.</p>
    <ul style="line-height: 1.6;">
      <li><strong>${stats.totalClauses}</strong> clauses analysed</li>
      <li><strong>${high}</strong> high/critical · <strong>${stats.byRisk.MEDIUM}</strong> medium · <strong>${stats.byRisk.LOW}</strong> low risk</li>
      <li><strong>${stats.clausesWithAmbiguity}</strong> clauses with ambiguous language</li>
      <li><strong>${stats.totalRecommendations}</strong> recommendations</li>
    </ul>
    <p style="margin: 1.5rem 0;">
      <a href="${escapeHtml(p.dashboardUrl)}"
         style="display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 6px;">
        Review contract
      </a>
    </p>
    <p style="color: #8b9cb3; font-size: 0.85rem;">The analysis run is paused and resumes once you submit your review.</p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Sends via Resend when RESEND_API_KEY is configured; otherwise logs the full
// email so the pipeline (and tests) work without an account. Drop a key into
// .env to start delivering real mail.
export async function sendReviewReadyEmail(
  params: ReviewEmailParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const subject = `Review ready: ${params.contractTitle}`;

  if (!apiKey) {
    console.warn(
      "[email] RESEND_API_KEY not set — logging email instead of sending."
    );
    console.warn(
      JSON.stringify(
        { to: params.to, from, subject, dashboardUrl: params.dashboardUrl, stats: params.stats },
        null,
        2
      )
    );
    console.warn(renderText(params));
    return { sent: false, provider: "log", to: params.to };
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject,
    html: renderHtml(params),
    text: renderText(params),
  });

  if (error) {
    throw new Error(`Resend failed: ${error.message ?? String(error)}`);
  }

  return { sent: true, provider: "resend", id: data?.id, to: params.to };
}
