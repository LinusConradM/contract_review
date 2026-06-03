import type { LLMProvider } from "../types";
import {
  completeOpenAICompatible,
  streamOpenAICompatible,
  type OpenAICompatibleConfig,
} from "./openai-compatible";

const CONFIG: OpenAICompatibleConfig = {
  name: "openai",
  defaultModel: "gpt-4o-mini",
  apiKeyEnv: ["OPENAI_API_KEY"],
  modelEnv: "OPENAI_MODEL",
};

export function createOpenAIProvider(): LLMProvider {
  return {
    name: "openai",
    complete: (request) => completeOpenAICompatible(CONFIG, request),
    stream: (request) => streamOpenAICompatible(CONFIG, request),
  };
}
