export type LLMProviderName = "openai" | "anthropic" | "groq";

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

export interface LLMCompletionResult {
  provider: LLMProviderName;
  model: string;
  text: string;
}

export interface LLMProvider {
  name: LLMProviderName;
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResult>;
}
