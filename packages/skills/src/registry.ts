import type { HarnessTool, JsonObject } from "@harness-kernel/core";
import type { HarnessSkill } from "./skill.js";

export interface SkillCatalogOptions {
  includeToolNames?: boolean;
  includeMetadata?: boolean;
}

export interface SkillCatalogEntry {
  key: string;
  label?: string;
  description: string;
  active?: boolean;
  toolNames?: string[];
  metadata?: JsonObject;
}

export interface SkillRegistry {
  list(): HarnessSkill[];
  get(key: string): HarnessSkill | undefined;
  require(key: string): HarnessSkill;
  catalog(options?: SkillCatalogOptions): SkillCatalogEntry[];
  tools(): HarnessTool[];
}

function catalogEntry(skill: HarnessSkill, options: SkillCatalogOptions = {}): SkillCatalogEntry {
  const includeToolNames = options.includeToolNames ?? true;
  const includeMetadata = options.includeMetadata ?? true;
  return {
    key: skill.key,
    label: skill.label,
    description: skill.description,
    ...(includeToolNames ? { toolNames: skill.tools?.map((tool) => tool.name) ?? [] } : {}),
    ...(includeMetadata && skill.metadata ? { metadata: skill.metadata } : {}),
  };
}

export function createSkillRegistry(skills: HarnessSkill[]): SkillRegistry {
  const byKey = new Map<string, HarnessSkill>();
  const toolOwners = new Map<string, string>();

  for (const skill of skills) {
    const key = skill.key.trim();
    if (!key) throw new Error("Skill key must not be empty.");
    if (byKey.has(key)) throw new Error(`Duplicate skill key '${key}'.`);
    const normalizedSkill = skill.key === key ? skill : { ...skill, key };
    byKey.set(key, normalizedSkill);

    for (const tool of normalizedSkill.tools ?? []) {
      const toolName = tool.name?.trim();
      if (!toolName) throw new Error(`Skill '${key}' declares a tool with an empty name.`);
      const owner = toolOwners.get(toolName);
      if (owner) {
        throw new Error(`Duplicate skill tool name '${toolName}' declared by skills '${owner}' and '${key}'.`);
      }
      toolOwners.set(toolName, key);
    }
  }

  const list = [...byKey.values()];
  const flattenedTools = list.flatMap((skill) => skill.tools ?? []);

  return {
    list: () => [...list],
    get: (key) => byKey.get(key.trim()),
    require: (key) => {
      const lookupKey = key.trim();
      const skill = byKey.get(lookupKey);
      if (!skill) throw new Error(`Unknown skill '${lookupKey}'.`);
      return skill;
    },
    catalog: (options) => list.map((skill) => catalogEntry(skill, options)),
    tools: () => [...flattenedTools],
  };
}

export function toSkillRegistry(registryOrSkills: SkillRegistry | HarnessSkill[]): SkillRegistry {
  return Array.isArray(registryOrSkills)
    ? createSkillRegistry(registryOrSkills)
    : registryOrSkills;
}
