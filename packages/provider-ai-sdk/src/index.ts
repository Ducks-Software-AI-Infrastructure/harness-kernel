import type { HarnessModelProvider, ModelInfo, ModelProviderInfo, ModelProviderRunInput, ModelProviderRunResult } from "@harness-kernel/core";
import { runAiSdkToolLoop } from "./tool-loop.js";
import type { AiSdkModelProviderConfig } from "./config.js";

export type { AiSdkModelProviderConfig } from "./config.js";

export class AiSdkModelProvider implements HarnessModelProvider {
  readonly namespace: string;
  readonly id?: string;
  private readonly label?: string;
  private readonly models?: ModelInfo[];

  constructor(private readonly config: AiSdkModelProviderConfig) {
    this.namespace = config.namespace;
    this.id = config.id;
    this.label = config.label;
    this.models = config.models;
  }

  getInfo(): ModelProviderInfo {
    return {
      id: this.id ?? this.namespace,
      label: this.label ?? "AI SDK",
      provider: this.namespace,
    };
  }

  getModels(): ModelInfo[] {
    return this.models ?? [];
  }

  supportsRole(roleId: string): boolean {
    return ["system", "user", "assistant", "tool"].includes(roleId);
  }

  run(input: ModelProviderRunInput): Promise<ModelProviderRunResult> {
    return runAiSdkToolLoop(input, this.config.resolveModel(input.model, input), this.id ?? this.namespace);
  }
}

export function createAiSdkModelProvider(config: AiSdkModelProviderConfig): HarnessModelProvider {
  return new AiSdkModelProvider(config);
}

export { runAiSdkToolLoop } from "./tool-loop.js";
