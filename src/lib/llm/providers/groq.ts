import Groq from "groq-sdk";
import type { LLMCompletionRequest, LLMCompletionResult, LLMProvider } from "../types";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export function createGroqProvider(): LLMProvider {
  return {
    name: "groq",
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error("GROQ_API_KEY is not set");
      }

      const client = new Groq({ apiKey });
      const model = request.model ?? process.env.GROQ_MODEL ?? DEFAULT_MODEL;

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
        throw new Error("Groq returned an empty response");
      }

      return { provider: "groq", model, text };
    },
  };
}
