import OpenAI from "openai";
import type { LLMCompletionRequest, LLMCompletionResult, LLMProvider } from "../types";

const DEFAULT_MODEL = "gpt-4o-mini";

export function createOpenAIProvider(): LLMProvider {
  return {
    name: "openai",
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set");
      }

      const client = new OpenAI({ apiKey });
      const model = request.model ?? DEFAULT_MODEL;

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
        throw new Error("OpenAI returned an empty response");
      }

      return { provider: "openai", model, text };
    },
  };
}
