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

export type ReminderEmailParams = {
  to: string;
  recipientName?: string | null;
  contractTitle: string;
  dashboardUrl: string;
  // How long the contract has been waiting, e.g. "7 days".
  waitingFor: string;
};

// Nudges the owner about a contract still sitting in AWAITING_REVIEW. Same
// Resend / log fallback as the other emails, so it works without an API key.
export async function sendReviewReminderEmail(
  params: ReminderEmailParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const subject = `Reminder: "${params.contractTitle}" is still awaiting your review`;
  const intro = `Hi${
    params.recipientName ? ` ${params.recipientName}` : ""
  }, your contract "${params.contractTitle}" has been waiting for review for ${
    params.waitingFor
  } and hasn't been actioned yet.`;

  if (!apiKey) {
    console.warn(
      "[email] RESEND_API_KEY not set — logging reminder email instead of sending."
    );
    console.warn(
      JSON.stringify(
        { to: params.to, from, subject, dashboardUrl: params.dashboardUrl },
        null,
        2
      )
    );
    console.warn(`${intro}\n\nReview it: ${params.dashboardUrl}`);
    return { sent: false, provider: "log", to: params.to };
  }

  const html = `
  <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; color: #1a2332;">
    <h2 style="margin: 0 0 0.5rem;">Still awaiting your review</h2>
    <p>${escapeHtml(intro)}</p>
    <p style="margin: 1.5rem 0;">
      <a href="${escapeHtml(params.dashboardUrl)}"
         style="display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 6px;">
        Review contract
      </a>
    </p>
    <p style="color: #8b9cb3; font-size: 0.85rem;">The analysis run is paused and resumes once you submit your review.</p>
  </div>`;
  const text = `${intro}\n\nReview it: ${params.dashboardUrl}`;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend failed: ${error.message ?? String(error)}`);
  }

  return { sent: true, provider: "resend", id: data?.id, to: params.to };
}

export type SummaryEmailParams = {
  to: string;
  recipientName?: string | null;
  contractTitle: string;
  dashboardUrl: string;
  // The full final memorandum as Markdown.
  markdown: string;
};

// Renders the Markdown memorandum into simple, email-safe HTML. Handles the
// same subset the report uses: ## / ### headings, - / * bullets, **bold**.
function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  const inline = (s: string) =>
    escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  for (const raw of lines) {
    const line = raw.trim();
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);

    if (h3) {
      closeList();
      html.push(`<h4 style="margin:1rem 0 0.25rem;">${inline(h3[1])}</h4>`);
    } else if (h2) {
      closeList();
      html.push(`<h3 style="margin:1.25rem 0 0.5rem;">${inline(h2[1])}</h3>`);
    } else if (h1) {
      closeList();
      html.push(`<h2 style="margin:1.5rem 0 0.5rem;">${inline(h1[1])}</h2>`);
    } else if (bullet) {
      if (!inList) {
        html.push('<ul style="line-height:1.6;">');
        inList = true;
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
    } else if (line === "") {
      closeList();
    } else {
      closeList();
      html.push(`<p style="line-height:1.6;">${inline(line)}</p>`);
    }
  }
  closeList();
  return html.join("\n");
}

// Sends the completed review memorandum to the contract owner. Same Resend /
// log fallback as sendReviewReadyEmail, so it works without an API key.
export async function sendSummaryEmail(
  params: SummaryEmailParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const subject = `Final review memorandum: ${params.contractTitle}`;
  const intro = `Hi${
    params.recipientName ? ` ${params.recipientName}` : ""
  }, the final review memorandum for "${params.contractTitle}" is ready.`;

  if (!apiKey) {
    console.warn(
      "[email] RESEND_API_KEY not set — logging summary email instead of sending."
    );
    console.warn(
      JSON.stringify(
        { to: params.to, from, subject, dashboardUrl: params.dashboardUrl },
        null,
        2
      )
    );
    console.warn(`${intro}\n\n${params.markdown}`);
    return { sent: false, provider: "log", to: params.to };
  }

  const html = `
  <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 0 auto; color: #1a2332;">
    <p>${escapeHtml(intro)}</p>
    <p style="margin: 0 0 1rem;">
      <a href="${escapeHtml(params.dashboardUrl)}"
         style="display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 6px;">
        Open in dashboard
      </a>
    </p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 1.5rem 0;" />
    ${markdownToHtml(params.markdown)}
  </div>`;

  const text = `${intro}\n\nOpen the dashboard: ${params.dashboardUrl}\n\n${params.markdown}`;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend failed: ${error.message ?? String(error)}`);
  }

  return { sent: true, provider: "resend", id: data?.id, to: params.to };
}
