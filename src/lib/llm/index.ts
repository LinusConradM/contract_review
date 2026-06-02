import { createAnthropicProvider } from "./providers/anthropic";
import { createGeminiProvider } from "./providers/gemini";
import { createGroqProvider } from "./providers/groq";
import { createOpenAIProvider } from "./providers/openai";
import { createOpenRouterProvider } from "./providers/openrouter";
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMProvider,
  LLMProviderName,
} from "./types";

export type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMFinishReason,
  LLMMessage,
  LLMProviderName,
  LLMUsage,
} from "./types";

const providers: Record<LLMProviderName, () => LLMProvider> = {
  openai: createOpenAIProvider,
  anthropic: createAnthropicProvider,
  groq: createGroqProvider,
  gemini: createGeminiProvider,
  openrouter: createOpenRouterProvider,
};

function hasKey(name: LLMProviderName): boolean {
  switch (name) {
    case "groq":
      return !!process.env.GROQ_API_KEY;
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "anthropic":
      return !!process.env.ANTHROPIC_API_KEY;
    case "gemini":
      return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    case "openrouter":
      return !!process.env.OPENROUTER_API_KEY;
  }
}

// Canonical preference order, used when no LLM_PROVIDER is set. Free providers
// first (groq -> gemini -> openrouter), then paid (openai -> anthropic).
const CANONICAL_ORDER: LLMProviderName[] = [
  "groq",
  "gemini",
  "openrouter",
  "openai",
  "anthropic",
];

export function listConfiguredProviders(): LLMProviderName[] {
  return CANONICAL_ORDER.filter(hasKey);
}

export function getDefaultProvider(): LLMProviderName {
  const configured = process.env.LLM_PROVIDER as LLMProviderName | undefined;
  if (configured && configured in providers && hasKey(configured)) {
    return configured;
  }
  const first = listConfiguredProviders()[0];
  if (first) return first;
  throw new Error(
    "No LLM provider configured. Set GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY (optionally LLM_PROVIDER)."
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

// The preferred provider first, then the remaining configured providers as
// fallbacks. Lets complete() fall through when the primary is rate-limited.
function getProviderOrder(): LLMProviderName[] {
  const configured = listConfiguredProviders();
  const preferred = process.env.LLM_PROVIDER as LLMProviderName | undefined;
  const order: LLMProviderName[] = [];
  if (preferred && configured.includes(preferred)) {
    order.push(preferred);
  }
  for (const name of configured) {
    if (!order.includes(name)) order.push(name);
  }
  return order;
}

export async function complete(
  request: LLMCompletionRequest
): Promise<LLMCompletionResult> {
  // An explicit provider choice is respected as-is — no automatic fallback.
  if (request.provider) {
    return getProvider(request.provider).complete(request);
  }

  const order = getProviderOrder();
  if (order.length === 0) {
    // Triggers the consistent "no provider configured" error.
    getDefaultProvider();
  }

  let lastError: unknown;
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    try {
      return await getProvider(name).complete(request);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const next = order[i + 1];
      console.warn(
        `[llm] provider "${name}" failed: ${message}` +
          (next ? ` — falling back to "${next}"` : " — no more providers to try")
      );
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `All configured LLM providers failed (${order.join(", ")}). Last error: ${detail}`
  );
}
