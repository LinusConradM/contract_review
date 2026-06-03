export type LLMProviderName = "openai" | "anthropic" | "groq" | "gemini" | "openrouter";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  provider?: LLMProviderName;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// Provider-agnostic finish reason. Each provider's native value (OpenAI's
// "length", Anthropic's "max_tokens", etc.) is normalized to this set so task
// code never has to branch on the provider.
export type LLMFinishReason =
  | "stop"
  | "length"
  | "content_filter"
  | "tool_use"
  | "other";

// Token accounting in a uniform shape. Fields are null when a provider does not
// report them, rather than absent, so the shape is identical everywhere.
export interface LLMUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface LLMCompletionResult {
  provider: LLMProviderName;
  model: string;
  text: string;
  finishReason: LLMFinishReason;
  usage: LLMUsage;
}

// A streaming completion. `textStream` yields token deltas as they arrive;
// `completed` resolves with the same standardised metadata as a non-streaming
// call once the stream has been fully consumed. The shape is identical across
// providers so callers (and the realtime pipe) never branch on the provider.
export interface LLMStreamResult {
  provider: LLMProviderName;
  model: string;
  textStream: AsyncIterable<string>;
  completed: Promise<LLMCompletionResult>;
}

export interface LLMProvider {
  name: LLMProviderName;
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResult>;
  // Optional: not every provider must support streaming, but all of ours do.
  stream?(request: LLMCompletionRequest): Promise<LLMStreamResult>;
}
