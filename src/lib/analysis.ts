import { complete } from "@/lib/llm";
import type { LLMFinishReason, LLMUsage } from "@/lib/llm";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ClauseAnalysis = {
  riskLevel: RiskLevel;
  explanation: string;
  ambiguousTerms: string[];
  recommendations: string[];
  provider: string;
  model: string;
  finishReason: LLMFinishReason;
  usage: LLMUsage;
  raw: string;
};

const SYSTEM_PROMPT = `You are a contract risk analyst reviewing individual clauses on behalf of the party receiving the contract. For each clause you assess legal and commercial risk.

Assess:
- riskLevel: "HIGH" for clauses that disclaim liability, allow unilateral termination, impose broad/uncapped indemnification, grant one-sided rights, or remove protections; "MEDIUM" for clauses with notable but limited risk; "LOW" for routine or balanced clauses.
- explanation: a short, concrete reason the clause carries that risk.
- ambiguousTerms: vague phrases that could be interpreted differently, e.g. "reasonable efforts", "as soon as practical", "material adverse change", "from time to time", "satisfactory", "good faith". Return the exact phrases found, or an empty list.
- recommendations: specific suggested edits to reduce risk or remove ambiguity.`;

function buildUserPrompt(clauseText: string): string {
  return `Analyze the following contract clause and respond with ONLY a JSON object of this exact shape, no commentary and no markdown code fences:
{"riskLevel":"LOW|MEDIUM|HIGH","explanation":"...","ambiguousTerms":["..."],"recommendations":["..."]}

CLAUSE:
${clauseText}`;
}

function normalizeRisk(value: unknown): RiskLevel {
  const v = String(value ?? "").toUpperCase();
  if (v === "LOW" || v === "MEDIUM" || v === "HIGH" || v === "CRITICAL") {
    return v;
  }
  return "MEDIUM";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function extractJson(raw: string): Record<string, unknown> | null {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    const candidate = s.match(/\{[\s\S]*\}/)?.[0];
    if (candidate) {
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function analyseClauseText(
  clauseText: string
): Promise<ClauseAnalysis> {
  const result = await complete({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(clauseText) },
    ],
    maxTokens: 800,
    temperature: 0.1,
  });

  const parsed = extractJson(result.text);
  if (!parsed) {
    throw new Error("Could not parse analysis JSON from LLM response");
  }

  return {
    riskLevel: normalizeRisk(parsed.riskLevel),
    explanation:
      typeof parsed.explanation === "string"
        ? parsed.explanation.trim()
        : "No explanation provided.",
    ambiguousTerms: toStringArray(parsed.ambiguousTerms),
    recommendations: toStringArray(parsed.recommendations),
    provider: result.provider,
    model: result.model,
    finishReason: result.finishReason,
    usage: result.usage,
    raw: result.text,
  };
}
