import type { LLMProvider } from "../types";
import { completeOpenAICompatible } from "./openai-compatible";

// OpenRouter fronts many models behind the OpenAI protocol. The ":free" model
// variants have their own quota, independent of Groq/Gemini, which is the point
// of adding it to the chain.
const BASE_URL = "https://openrouter.ai/api/v1";

export function createOpenRouterProvider(): LLMProvider {
  return {
    name: "openrouter",
    complete: (request) =>
      completeOpenAICompatible(
        {
          name: "openrouter",
          baseURL: BASE_URL,
          defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
          apiKeyEnv: ["OPENROUTER_API_KEY"],
          modelEnv: "OPENROUTER_MODEL",
          // Optional attribution headers OpenRouter uses for ranking.
          buildHeaders: () => ({
            "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
            "X-Title": "Contract Review",
          }),
        },
        request
      ),
  };
}
