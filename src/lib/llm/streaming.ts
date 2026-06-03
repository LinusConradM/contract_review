import type {
  LLMCompletionResult,
  LLMProviderName,
  LLMStreamResult,
} from "./types";
import { mapOpenAIFinishReason, openAIUsage } from "./metadata";

// The chunk shape shared by every OpenAI-protocol provider (OpenAI, Groq,
// Gemini-compat, OpenRouter) when streaming with `stream: true`.
export type OpenAIStreamChunk = {
  model?: string;
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?:
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | null;
};

// Wraps a raw OpenAI-style chunk stream into the standardised LLMStreamResult:
// yields content deltas as they arrive and resolves `completed` with the final
// accumulated text + normalised metadata once the stream ends. Produced in one
// place so every OpenAI-compatible provider emits an identical result shape.
export function openAICompatibleStream(
  provider: LLMProviderName,
  fallbackModel: string,
  source: AsyncIterable<OpenAIStreamChunk>
): LLMStreamResult {
  let resolveCompleted!: (result: LLMCompletionResult) => void;
  let rejectCompleted!: (error: unknown) => void;
  const completed = new Promise<LLMCompletionResult>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  async function* generate(): AsyncGenerator<string> {
    let model = fallbackModel;
    let text = "";
    let finishReason: string | null | undefined;
    let usage: OpenAIStreamChunk["usage"];
    try {
      for await (const chunk of source) {
        if (chunk.model) model = chunk.model;
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) usage = chunk.usage;
        const delta = choice?.delta?.content ?? "";
        if (delta) {
          text += delta;
          yield delta;
        }
      }
      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error(`${provider} returned an empty response`);
      }
      resolveCompleted({
        provider,
        model,
        text: trimmed,
        finishReason: mapOpenAIFinishReason(finishReason),
        usage: openAIUsage(usage),
      });
    } catch (error) {
      rejectCompleted(error);
      throw error;
    }
  }

  return {
    provider,
    model: fallbackModel,
    textStream: generate(),
    completed,
  };
}
