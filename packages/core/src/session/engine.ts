import type { AgentDefinition } from "../runtime/types.js";
import { NoopRunStorage, type HarnessRunStorage } from "../runtime/storage.js";
import type { HarnessAgentInput, HarnessStorageConfig } from "./types.js";

export async function resolveAgent(input: HarnessAgentInput): Promise<AgentDefinition> {
  return input.definition;
}

export function resolveWorkDir(workDir?: string): string {
  return workDir ?? ".";
}

export function resolveStorage(storage: HarnessStorageConfig | undefined): HarnessRunStorage {
  return storage ?? new NoopRunStorage();
}
