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

export interface LLMProvider {
  name: LLMProviderName;
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResult>;
}
