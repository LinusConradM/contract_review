import type { LLMProvider } from "../types";
import { completeOpenAICompatible } from "./openai-compatible";

// Google exposes an OpenAI-compatible endpoint, so we reuse the shared helper
// rather than pulling in a separate Gemini dependency.
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

export function createGeminiProvider(): LLMProvider {
  return {
    name: "gemini",
    complete: (request) =>
      completeOpenAICompatible(
        {
          name: "gemini",
          baseURL: BASE_URL,
          defaultModel: "gemini-2.5-flash",
          apiKeyEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
          modelEnv: "GEMINI_MODEL",
        },
        request
      ),
  };
}
