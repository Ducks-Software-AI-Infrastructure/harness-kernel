import {
  HarnessContextProvider,
  systemRole,
  type AgentReadSession,
  type ContextProviderOutput,
  type HarnessRoleSelector,
  type JsonObject,
} from "@harness-kernel/core";
import type { HarnessSkill } from "./skill.js";
import { type SkillRegistry, toSkillRegistry } from "./registry.js";
import {
  listActiveSkills,
  listAvailableSkills,
  listInactiveSkills,
  type SkillStateOptions,
} from "./state.js";

export interface SkillPromptProviderOptions extends SkillStateOptions, JsonObject {
  includeInactiveCatalog?: boolean;
  includeToolNames?: boolean;
  role?: HarnessRoleSelector;
}

function renderTools(toolNames: string[] | undefined): string {
  return toolNames?.length ? ` Tools: ${toolNames.join(", ")}.` : "";
}

function renderCatalogLine(entry: {
  key: string;
  label?: string;
  description: string;
  toolNames?: string[];
}): string {
  const label = entry.label && entry.label !== entry.key ? ` (${entry.label})` : "";
  return `- ${entry.key}${label}: ${entry.description}.${renderTools(entry.toolNames)}`;
}

export class SkillPromptProvider extends HarnessContextProvider<SkillPromptProviderOptions> {
  label = "Skill Context";

  constructor(
    private readonly registry: SkillRegistry,
    private readonly defaults: SkillPromptProviderOptions = {},
  ) {
    super();
    this.role = defaults.role ?? systemRole;
  }

  async render(session: AgentReadSession, options?: SkillPromptProviderOptions): Promise<ContextProviderOutput> {
    const config = { ...this.defaults, ...options };
    const includeInactiveCatalog = config.includeInactiveCatalog ?? true;
    const includeToolNames = config.includeToolNames ?? true;
    const catalogOptions = { includeToolNames, includeMetadata: false };
    const available = listAvailableSkills(this.registry, catalogOptions);
    const active = listActiveSkills(session, this.registry, { ...catalogOptions, stateKey: config.stateKey });
    const inactive = listInactiveSkills(session, this.registry, { ...catalogOptions, stateKey: config.stateKey });
    const activeKeys = new Set(active.map((entry) => entry.key));
    const activeSkills = this.registry.list().filter((skill) => activeKeys.has(skill.key));
    const activePrompts: string[] = [];

    for (const skill of activeSkills) {
      if (!skill.prompt) continue;
      const prompt = typeof skill.prompt === "function"
        ? await skill.prompt(session, skill)
        : skill.prompt;
      if (!prompt.trim()) continue;
      activePrompts.push(`## ${skill.label ?? skill.key} (${skill.key})\n${prompt.trim()}`);
    }

    const sections = [
      "Skills are procedural capabilities. Activate a skill with activate_skill before using gated tools from that skill.",
      "A gated tool that is called too early returns data.code = \"skill.required\" and names the required skill.",
      `Active skills: ${active.length ? active.map((entry) => entry.key).join(", ") : "none"}.`,
    ];

    if (includeInactiveCatalog) {
      sections.push([
        "Available skills:",
        ...(available.length ? available.map(renderCatalogLine) : ["- none"]),
      ].join("\n"));
      sections.push(`Inactive skills: ${inactive.length ? inactive.map((entry) => entry.key).join(", ") : "none"}.`);
    }

    if (activePrompts.length) {
      sections.push(["Active skill instructions:", ...activePrompts].join("\n\n"));
    }

    return {
      role: config.role ?? this.role ?? systemRole,
      content: sections.join("\n\n"),
      metadata: {
        stateKey: config.stateKey,
        activeSkills: active.map((entry) => entry.key),
        availableSkills: available.map((entry) => entry.key),
      },
    };
  }
}

export function createSkillPromptProvider(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillPromptProviderOptions,
): HarnessContextProvider {
  return new SkillPromptProvider(toSkillRegistry(registry), options);
}
