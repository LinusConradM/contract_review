import OpenAI from "openai";
import type { LLMCompletionRequest, LLMCompletionResult, LLMProvider } from "../types";

// OpenRouter exposes an OpenAI-compatible endpoint fronting many models, so we
// reuse the OpenAI SDK. The ":free" model variants have their own quota,
// independent of Groq/Gemini, which is the point of adding it to the chain.
const BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export function createOpenRouterProvider(): LLMProvider {
  return {
    name: "openrouter",
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not set");
      }

      const client = new OpenAI({
        apiKey,
        baseURL: BASE_URL,
        // Optional attribution headers OpenRouter uses for ranking.
        defaultHeaders: {
          "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
          "X-Title": "Contract Review",
        },
      });
      const model = request.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

      const response = await client.chat.completions.create({
        model,
        max_tokens: request.maxTokens ?? 512,
        temperature: request.temperature ?? 0.2,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const text = response.choices[0]?.message?.content?.trim();
      if (!text) {
        throw new Error("OpenRouter returned an empty response");
      }

      return { provider: "openrouter", model, text };
    },
  };
}
