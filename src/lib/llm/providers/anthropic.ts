import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMProvider,
  LLMStreamResult,
} from "../types";
import { anthropicUsage, mapAnthropicStopReason } from "../metadata";

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

// Splits a request into the Anthropic-shaped (system, messages, model) tuple
// shared by the blocking and streaming entry points.
function prepare(request: LLMCompletionRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const client = new Anthropic({ apiKey });
  const model = request.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const system = request.messages.find((m) => m.role === "system")?.content;
  const messages = request.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  return { client, model, system, messages };
}

export function createAnthropicProvider(): LLMProvider {
  return {
    name: "anthropic",
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
      const { client, model, system, messages } = prepare(request);

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

      return {
        provider: "anthropic",
        model: response.model || model,
        text,
        finishReason: mapAnthropicStopReason(response.stop_reason),
        usage: anthropicUsage(response.usage),
      };
    },
    async stream(request: LLMCompletionRequest): Promise<LLMStreamResult> {
      const { client, model, system, messages } = prepare(request);

      const events = await client.messages.stream({
        model,
        max_tokens: request.maxTokens ?? 512,
        temperature: request.temperature ?? 0.2,
        system,
        messages,
      });

      let resolveCompleted!: (result: LLMCompletionResult) => void;
      let rejectCompleted!: (error: unknown) => void;
      const completed = new Promise<LLMCompletionResult>((resolve, reject) => {
        resolveCompleted = resolve;
        rejectCompleted = reject;
      });

      async function* generate(): AsyncGenerator<string> {
        let text = "";
        try {
          for await (const event of events) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              text += event.delta.text;
              yield event.delta.text;
            }
          }
          const final = await events.finalMessage();
          const trimmed = text.trim();
          if (!trimmed) {
            throw new Error("Anthropic returned an empty response");
          }
          resolveCompleted({
            provider: "anthropic",
            model: final.model || model,
            text: trimmed,
            finishReason: mapAnthropicStopReason(final.stop_reason),
            usage: anthropicUsage(final.usage),
          });
        } catch (error) {
          rejectCompleted(error);
          throw error;
        }
      }

      return {
        provider: "anthropic",
        model,
        textStream: generate(),
        completed,
      };
    },
  };
}
