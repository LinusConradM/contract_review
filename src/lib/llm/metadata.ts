import type { LLMFinishReason, LLMUsage } from "./types";

// OpenAI-shape responses (OpenAI, Groq, Gemini-compat, OpenRouter) all use the
// same finish_reason vocabulary.
export function mapOpenAIFinishReason(
  reason: string | null | undefined
): LLMFinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    default:
      return "other";
  }
}

export function mapAnthropicStopReason(
  reason: string | null | undefined
): LLMFinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_use";
    default:
      return "other";
  }
}

export function openAIUsage(
  usage:
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | null
    | undefined
): LLMUsage {
  return {
    promptTokens: usage?.prompt_tokens ?? null,
    completionTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
  };
}

export function anthropicUsage(
  usage: { input_tokens?: number; output_tokens?: number } | null | undefined
): LLMUsage {
  const promptTokens = usage?.input_tokens ?? null;
  const completionTokens = usage?.output_tokens ?? null;
  return {
    promptTokens,
    completionTokens,
    totalTokens:
      promptTokens !== null && completionTokens !== null
        ? promptTokens + completionTokens
        : null,
  };
}
