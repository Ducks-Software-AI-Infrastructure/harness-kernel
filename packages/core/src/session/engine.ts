import type { AgentDefinition } from "../runtime/types.js";
import { MemorySessionStorage, type HarnessSessionStorage } from "../runtime/storage.js";
import type { HarnessAgentInput, HarnessStorageConfig } from "./types.js";

export async function resolveAgent(input: HarnessAgentInput): Promise<AgentDefinition> {
  return input.definition;
}

export function resolveStorage(storage: HarnessStorageConfig | undefined): HarnessSessionStorage {
  return storage ?? new MemorySessionStorage();
}
