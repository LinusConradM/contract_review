import { createAnthropicProvider } from "./providers/anthropic";
import { createGroqProvider } from "./providers/groq";
import { createOpenAIProvider } from "./providers/openai";
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMProvider,
  LLMProviderName,
} from "./types";

export type { LLMCompletionRequest, LLMCompletionResult, LLMMessage, LLMProviderName } from "./types";

const providers: Record<LLMProviderName, () => LLMProvider> = {
  openai: createOpenAIProvider,
  anthropic: createAnthropicProvider,
  groq: createGroqProvider,
};

export function getDefaultProvider(): LLMProviderName {
  const configured = process.env.LLM_PROVIDER as LLMProviderName | undefined;
  if (configured && configured in providers) {
    return configured;
  }
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  throw new Error(
    "No LLM provider configured. Set GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY (optionally LLM_PROVIDER)."
  );
}

export function getProvider(name?: LLMProviderName): LLMProvider {
  const providerName = name ?? getDefaultProvider();
  const factory = providers[providerName];
  if (!factory) {
    throw new Error(`Unknown LLM provider: ${providerName}`);
  }
  return factory();
}

export async function complete(
  request: LLMCompletionRequest
): Promise<LLMCompletionResult> {
  const provider = getProvider(request.provider);
  return provider.complete(request);
}

export function listConfiguredProviders(): LLMProviderName[] {
  const available: LLMProviderName[] = [];
  if (process.env.GROQ_API_KEY) available.push("groq");
  if (process.env.OPENAI_API_KEY) available.push("openai");
  if (process.env.ANTHROPIC_API_KEY) available.push("anthropic");
  return available;
}
