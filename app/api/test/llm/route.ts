import { complete, listConfiguredProviders } from "@/lib/llm";
import type { LLMProviderName } from "@/lib/llm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TEST_PROMPT =
  "In one sentence, name one common risk when reviewing a software license agreement.";

export async function POST(request: NextRequest) {
  const providerParam = request.nextUrl.searchParams.get(
    "provider"
  ) as LLMProviderName | null;

  const configured = listConfiguredProviders();
  if (configured.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No LLM API keys configured. Set GROQ_API_KEY, OPENAI_API_KEY, and/or ANTHROPIC_API_KEY in .env.local",
      },
      { status: 400 }
    );
  }

  const provider = providerParam ?? configured[0];
  if (!configured.includes(provider)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Provider "${provider}" is not configured. Available: ${configured.join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    const result = await complete({
      provider,
      messages: [
        {
          role: "system",
          content:
            "You are a legal-tech assistant helping lawyers review contracts. Be concise.",
        },
        { role: "user", content: TEST_PROMPT },
      ],
      maxTokens: 128,
    });

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      prompt: TEST_PROMPT,
      response: result.text,
      configuredProviders: configured,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM request failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
