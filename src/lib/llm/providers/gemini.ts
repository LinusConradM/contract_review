import OpenAI from "openai";
import type { LLMCompletionRequest, LLMCompletionResult, LLMProvider } from "../types";

// Google exposes an OpenAI-compatible endpoint, so we reuse the OpenAI SDK
// rather than pulling in a separate Gemini dependency.
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const DEFAULT_MODEL = "gemini-2.5-flash";

function geminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

export function createGeminiProvider(): LLMProvider {
  return {
    name: "gemini",
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
      const apiKey = geminiApiKey();
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set");
      }

      const client = new OpenAI({ apiKey, baseURL: BASE_URL });
      const model = request.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

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
        throw new Error("Gemini returned an empty response");
      }

      return { provider: "gemini", model, text };
    },
  };
}
