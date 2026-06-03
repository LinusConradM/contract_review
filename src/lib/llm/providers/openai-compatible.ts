import OpenAI from "openai";
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMProviderName,
  LLMStreamResult,
} from "../types";
import { mapOpenAIFinishReason, openAIUsage } from "../metadata";
import { openAICompatibleStream } from "../streaming";

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

// Resolves the API key, client and model from a provider config + request.
// Shared by the blocking and streaming entry points.
function prepare(cfg: OpenAICompatibleConfig, request: LLMCompletionRequest) {
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

  return { client, model };
}

export async function completeOpenAICompatible(
  cfg: OpenAICompatibleConfig,
  request: LLMCompletionRequest
): Promise<LLMCompletionResult> {
  const { client, model } = prepare(cfg, request);

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

export async function streamOpenAICompatible(
  cfg: OpenAICompatibleConfig,
  request: LLMCompletionRequest
): Promise<LLMStreamResult> {
  const { client, model } = prepare(cfg, request);

  const source = await client.chat.completions.create({
    model,
    max_tokens: request.maxTokens ?? 512,
    temperature: request.temperature ?? 0.2,
    stream: true,
    // Ask for a final usage chunk; providers that don't support it simply omit
    // it and usage falls back to null — the standardised shape is unchanged.
    stream_options: { include_usage: true },
    messages: request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  return openAICompatibleStream(cfg.name, model, source);
}
