import Groq from "groq-sdk";
import type {
  LLMCompletionRequest,
  LLMCompletionResult,
  LLMProvider,
  LLMStreamResult,
} from "../types";
import { mapOpenAIFinishReason, openAIUsage } from "../metadata";
import { openAICompatibleStream } from "../streaming";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function client(): { groq: Groq; model: (req: LLMCompletionRequest) => string } {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }
  return {
    groq: new Groq({ apiKey }),
    model: (req) => req.model ?? process.env.GROQ_MODEL ?? DEFAULT_MODEL,
  };
}

export function createGroqProvider(): LLMProvider {
  return {
    name: "groq",
    async complete(request: LLMCompletionRequest): Promise<LLMCompletionResult> {
      const { groq, model: pick } = client();
      const model = pick(request);

      const response = await groq.chat.completions.create({
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
        throw new Error("Groq returned an empty response");
      }

      return {
        provider: "groq",
        model: response.model || model,
        text,
        finishReason: mapOpenAIFinishReason(choice?.finish_reason),
        usage: openAIUsage(response.usage),
      };
    },
    async stream(request: LLMCompletionRequest): Promise<LLMStreamResult> {
      const { groq, model: pick } = client();
      const model = pick(request);

      // groq-sdk supports `stream_options.include_usage` at runtime (the final
      // chunk carries token usage) but its types omit it. Assigning to a
      // variable (with `stream: true as const`) skips the object-literal excess
      // property check while still selecting the streaming overload.
      const params = {
        model,
        max_tokens: request.maxTokens ?? 512,
        temperature: request.temperature ?? 0.2,
        stream: true as const,
        stream_options: { include_usage: true },
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };
      const source = await groq.chat.completions.create(params);

      return openAICompatibleStream("groq", model, source);
    },
  };
}
