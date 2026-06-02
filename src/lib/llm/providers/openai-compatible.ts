import OpenAI from "openai";
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMProviderName,
} from "../types";
import { mapOpenAIFinishReason, openAIUsage } from "../metadata";

// Several providers (OpenAI, Google Gemini, OpenRouter) speak the OpenAI
// chat-completions protocol, differing only in base URL, key, and default
// model. This helper centralises the request + response/metadata mapping so
// each provider is a thin config object and the standardised result shape is
// produced in exactly one place.
export type OpenAICompatibleConfig = {
  name: LLMProviderName;
  defaultModel: string;
  // Env vars holding the API key, checked in order (first non-empty wins).
  apiKeyEnv: string[];
  baseURL?: string;
  // Optional env var that overrides the model (e.g. GROQ_MODEL).
  modelEnv?: string;
  // Built per-request so values like APP_URL are read at call time.
  buildHeaders?: () => Record<string, string>;
};

export async function completeOpenAICompatible(
  cfg: OpenAICompatibleConfig,
  request: LLMCompletionRequest
): Promise<LLMCompletionResult> {
  const apiKey = cfg.apiKeyEnv
    .map((name) => process.env[name])
    .find((value) => !!value);
  if (!apiKey) {
    throw new Error(`${cfg.apiKeyEnv.join(" or ")} is not set`);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: cfg.baseURL,
    defaultHeaders: cfg.buildHeaders?.(),
  });

  const model =
    request.model ??
    (cfg.modelEnv ? process.env[cfg.modelEnv] : undefined) ??
    cfg.defaultModel;

  const response = await client.chat.completions.create({
    model,
    max_tokens: request.maxTokens ?? 512,
    temperature: request.temperature ?? 0.2,
    messages: request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const choice = response.choices[0];
  const text = choice?.message?.content?.trim();
  if (!text) {
    throw new Error(`${cfg.name} returned an empty response`);
  }

  return {
    provider: cfg.name,
    model: response.model || model,
    text,
    finishReason: mapOpenAIFinishReason(choice?.finish_reason),
    usage: openAIUsage(response.usage),
  };
}
