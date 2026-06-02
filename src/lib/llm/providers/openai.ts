import type { LLMProvider } from "../types";
import { completeOpenAICompatible } from "./openai-compatible";

export function createOpenAIProvider(): LLMProvider {
  return {
    name: "openai",
    complete: (request) =>
      completeOpenAICompatible(
        {
          name: "openai",
          defaultModel: "gpt-4o-mini",
          apiKeyEnv: ["OPENAI_API_KEY"],
          modelEnv: "OPENAI_MODEL",
        },
        request
      ),
  };
}
