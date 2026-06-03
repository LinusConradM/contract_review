import { complete, streamComplete } from "@/lib/llm";
import type { LLMFinishReason, LLMMessage, LLMStreamResult, LLMUsage } from "@/lib/llm";
import type { RiskLevel } from "./analysis";

export type ReviewerOutcome = {
  approved: boolean;
  notes: string | null;
};

export type SummaryClauseInput = {
  number: number;
  text: string;
  riskLevel: RiskLevel;
  explanation: string;
  ambiguousTerms: string[];
  recommendations: string[];
  // null when the clause was analysed but never decided by a reviewer.
  reviewer: ReviewerOutcome | null;
};

export type ContractSummaryInput = {
  title: string;
  reviewer?: string | null;
  clauses: SummaryClauseInput[];
};

export type FinalSummary = {
  document: string;
  provider: string;
  model: string;
  finishReason: LLMFinishReason;
  usage: LLMUsage;
};

const SYSTEM_PROMPT = `You are a senior contract attorney writing the final review memorandum for a contract that has already been (a) analysed clause-by-clause for risk by an AI assistant and (b) reviewed by a human reviewer who accepted or rejected each clause and may have left annotations.

Your job is to synthesise both inputs into a single polished memorandum that could be sent to a client or colleague. Write in clear, professional prose — full sentences and paragraphs, not bullet-point fragments or raw data dumps. The document must read as one coherent narrative, not a list of disconnected clause analyses.

Produce the document in Markdown with exactly these four top-level sections, in this order, using these exact headings:

## Executive Summary
A high-level overview of the contract's overall risk profile in 1–2 short paragraphs: how risky is this contract overall, and what is the headline takeaway for the reader.

## Key Findings
The most important issues identified across the contract, written as prose. Lead with the highest-risk items. Where the human reviewer rejected a clause or left an annotation, weave that feedback in — the reviewer's judgement takes precedence over the AI's initial assessment.

## Risk Breakdown
A concise summary of how risk is distributed across the contract (counts by risk level, how many clauses were accepted vs. flagged for revision by the reviewer, and what that means in practice).

## Clause-by-Clause Detail
For every clause, in numeric order, give: the original AI risk assessment, the reviewer's decision, and a single combined final recommendation. Use this convention:
- If the reviewer approved the clause, mark it "Accepted" and state that no changes are required (unless ambiguity remains worth noting).
- If the reviewer rejected the clause, mark it "Needs revision", quote or paraphrase the reviewer's annotation and reasoning, and give a concrete recommendation.
- If a clause has no reviewer decision, note that it is "Pending review" and rely on the AI assessment.

Be accurate and do not invent facts that are not supported by the provided analyses and reviewer notes.`;

function clip(text: string, max = 600): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function renderClause(c: SummaryClauseInput): string {
  const lines: string[] = [];
  lines.push(`### Clause ${c.number}`);
  lines.push(`Clause text: "${clip(c.text)}"`);
  lines.push(`AI risk assessment: ${c.riskLevel}`);
  lines.push(`AI explanation: ${c.explanation}`);
  if (c.ambiguousTerms.length > 0) {
    lines.push(`Ambiguous terms flagged: ${c.ambiguousTerms.join("; ")}`);
  }
  if (c.recommendations.length > 0) {
    lines.push(`AI recommendations: ${c.recommendations.join("; ")}`);
  }
  if (c.reviewer === null) {
    lines.push(`Reviewer decision: (no decision recorded)`);
  } else if (c.reviewer.approved) {
    lines.push(`Reviewer decision: APPROVED (accepted as-is)`);
    if (c.reviewer.notes) lines.push(`Reviewer annotation: ${c.reviewer.notes}`);
  } else {
    lines.push(`Reviewer decision: REJECTED (needs revision)`);
    lines.push(
      `Reviewer annotation: ${
        c.reviewer.notes && c.reviewer.notes.trim().length > 0
          ? c.reviewer.notes
          : "(reviewer rejected without a written note)"
      }`
    );
  }
  return lines.join("\n");
}

function buildUserPrompt(input: ContractSummaryInput): string {
  const total = input.clauses.length;
  const approved = input.clauses.filter((c) => c.reviewer?.approved).length;
  const rejected = input.clauses.filter(
    (c) => c.reviewer && !c.reviewer.approved
  ).length;
  const byRisk = input.clauses.reduce<Record<string, number>>((acc, c) => {
    acc[c.riskLevel] = (acc[c.riskLevel] ?? 0) + 1;
    return acc;
  }, {});

  const header = [
    `Contract title: ${input.title}`,
    input.reviewer ? `Human reviewer: ${input.reviewer}` : null,
    `Total clauses analysed: ${total}`,
    `Reviewer approved: ${approved} · rejected: ${rejected} · undecided: ${
      total - approved - rejected
    }`,
    `Risk distribution: ${Object.entries(byRisk)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const body = input.clauses
    .slice()
    .sort((a, b) => a.number - b.number)
    .map(renderClause)
    .join("\n\n");

  return `Using the data below, write the final review memorandum exactly as instructed.

=== CONTRACT OVERVIEW ===
${header}

=== CLAUSE ANALYSES AND REVIEWER DECISIONS ===
${body}`;
}

// The system + user messages for the memorandum. Shared by the blocking and
// streaming entry points so both produce an identical document for the same
// input.
export function buildSummaryMessages(input: ContractSummaryInput): LLMMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input) },
  ];
}

export async function generateFinalSummary(
  input: ContractSummaryInput
): Promise<FinalSummary> {
  const result = await complete({
    messages: buildSummaryMessages(input),
    maxTokens: 4000,
    temperature: 0.3,
  });

  const document = result.text.trim();
  if (!document) {
    throw new Error("LLM returned an empty summary document");
  }

  return {
    document,
    provider: result.provider,
    model: result.model,
    finishReason: result.finishReason,
    usage: result.usage,
  };
}

// Streaming variant: returns the token stream (to pipe to the realtime stream)
// plus a `completed` promise that resolves with the final document + metadata
// once the stream is fully consumed. Provider-agnostic — uses the same fallback
// chain as the blocking call.
export async function streamFinalSummary(
  input: ContractSummaryInput
): Promise<LLMStreamResult> {
  return streamComplete({
    messages: buildSummaryMessages(input),
    maxTokens: 4000,
    temperature: 0.3,
  });
}
