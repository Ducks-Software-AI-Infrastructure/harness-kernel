import { createOpenAI } from "@ai-sdk/openai";
import {
  s,
  type HarnessModelProvider,
  type InferOutput,
  type ModelInfo,
  type ModelProviderRunInput,
} from "@harness-kernel/core";
import { AiSdkModelProvider } from "@harness-kernel/provider-ai-sdk";

const modelInfoSchema = s.object({
  id: s.string().min(1),
  label: s.string().optional(),
  provider: s.string().optional(),
  metadata: s.unknown().optional(),
});

export const openAIProviderConfigSchema = s.object({
  id: s.string().min(1).optional(),
  apiKey: s.string().min(1).optional(),
  apiKeyEnv: s.string().min(1).optional(),
  baseURL: s.string().min(1).optional(),
  headers: s.record(s.string()).optional(),
  models: s.array(modelInfoSchema).optional(),
}).describe("OpenAI provider configuration.");

export type OpenAIProviderOptions = InferOutput<typeof openAIProviderConfigSchema>;

function readApiKey(options: OpenAIProviderOptions): string | undefined {
  if (options.apiKey) return options.apiKey;
  if (options.apiKeyEnv) return process.env[options.apiKeyEnv];
  return process.env.OPENAI_API_KEY;
}

export class OpenAIProvider extends AiSdkModelProvider {
  readonly configSchema = openAIProviderConfigSchema;

  constructor(input: OpenAIProviderOptions = {}) {
    const options = openAIProviderConfigSchema.parse(input);
    super({
      namespace: "openai",
      id: options.id ?? "openai",
      label: "OpenAI",
      models: options.models as ModelInfo[] | undefined,
      resolveModel(model: string, _input: ModelProviderRunInput) {
        return createOpenAI({
          apiKey: readApiKey(options),
          baseURL: options.baseURL,
          headers: options.headers,
        })(model);
      },
    });
  }
}

export function createOpenAIProvider(options: OpenAIProviderOptions = {}): HarnessModelProvider {
  return new OpenAIProvider(options);
}
