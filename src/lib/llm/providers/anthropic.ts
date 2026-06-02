import Anthropic from "@anthropic-ai/sdk";
import type { LLMCompletionRequest, LLMCompletionResult, LLMProvider } from "../types";

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

export function createAnthropicProvider(): LLMProvider {
  return {
    name: "anthropic",
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not set");
      }

      const client = new Anthropic({ apiKey });
      const model = request.model ?? DEFAULT_MODEL;

      const system = request.messages.find((m) => m.role === "system")?.content;
      const messages = request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const response = await client.messages.create({
        model,
        max_tokens: request.maxTokens ?? 512,
        temperature: request.temperature ?? 0.2,
        system,
        messages,
      });

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      if (!text) {
        throw new Error("Anthropic returned an empty response");
      }

      return { provider: "anthropic", model, text };
    },
  };
}
