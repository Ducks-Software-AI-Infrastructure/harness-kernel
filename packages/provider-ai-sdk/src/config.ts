import type { LanguageModel } from "ai";
import type { ModelInfo, ModelProviderRunInput } from "@harness-kernel/core";

export interface AiSdkModelProviderConfig {
  namespace: string;
  id?: string;
  label?: string;
  models?: ModelInfo[];
  resolveModel(model: string, input: ModelProviderRunInput): LanguageModel;
}
