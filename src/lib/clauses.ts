import { complete } from "@/lib/llm";

const MAX_INPUT_CHARS = 120_000;

const SYSTEM_PROMPT = `You are a contract parsing assistant. You split raw contract text into individual, well-formed clauses.

A clause is a distinct logical unit: a numbered or lettered provision, a paragraph, a definition, a condition, a representation, or a warranty.

Rules:
- Clean up obvious PDF extraction artifacts: page numbers, repeated headers/footers, and words split across line breaks by hyphenation.
- DO NOT summarize, paraphrase, reorder, or invent text. Preserve the original wording of each clause.
- Do not split a single sentence across clauses. Each clause must be self-contained and coherent.
- Keep a numbered heading together with the text it introduces.`;

function buildUserPrompt(text: string): string {
  return `Split the following contract text into clauses. Return ONLY a JSON object of the form {"clauses": ["full text of clause 1", "full text of clause 2"]} with no commentary and no markdown code fences.

CONTRACT TEXT:
${text}`;
}

export function parseClauses(raw: string): string[] {
  let s = raw.trim();

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    const candidate = s.match(/\{[\s\S]*\}/)?.[0] ?? s.match(/\[[\s\S]*\]/)?.[0];
    if (candidate) {
      try {
        parsed = JSON.parse(candidate);
      } catch {
        return [];
      }
    }
  }

  let clauses: unknown[] = [];
  if (Array.isArray(parsed)) {
    clauses = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { clauses?: unknown }).clauses)
  ) {
    clauses = (parsed as { clauses: unknown[] }).clauses;
  }

  return clauses
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

// Last-resort split when the model returns unparseable output: break on blank
// lines so the contract still yields clauses rather than failing outright.
export function fallbackSplit(text: string): string[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 0);
  return blocks.length > 0 ? blocks : [text.trim()].filter(Boolean);
}

export type ClauseSplitResult = {
  clauses: string[];
  provider: string;
  model: string;
  usedFallback: boolean;
};

export async function splitIntoClauses(text: string): Promise<ClauseSplitResult> {
  const input = text.slice(0, MAX_INPUT_CHARS);

  const result = await complete({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
    maxTokens: 8000,
    temperature: 0.1,
  });

  let clauses = parseClauses(result.text);
  let usedFallback = false;
  if (clauses.length === 0) {
    clauses = fallbackSplit(input);
    usedFallback = true;
  }

  return {
    clauses,
    provider: result.provider,
    model: result.model,
    usedFallback,
  };
}
