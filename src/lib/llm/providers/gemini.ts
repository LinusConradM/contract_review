import type { LLMProvider } from "../types";
import {
  completeOpenAICompatible,
  streamOpenAICompatible,
  type OpenAICompatibleConfig,
} from "./openai-compatible";

// Google exposes an OpenAI-compatible endpoint, so we reuse the shared helper
// rather than pulling in a separate Gemini dependency.
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

const CONFIG: OpenAICompatibleConfig = {
  name: "gemini",
  baseURL: BASE_URL,
  defaultModel: "gemini-2.5-flash",
  apiKeyEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  modelEnv: "GEMINI_MODEL",
};

export function createGeminiProvider(): LLMProvider {
  return {
    name: "gemini",
    complete: (request) => completeOpenAICompatible(CONFIG, request),
    stream: (request) => streamOpenAICompatible(CONFIG, request),
  };
}
