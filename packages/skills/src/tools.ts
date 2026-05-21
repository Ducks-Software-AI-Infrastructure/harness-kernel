import {
  HarnessTool,
  s,
  type AgentActionSession,
  type AgentToolResult,
  type HarnessTool as HarnessToolType,
  type InferInput,
  type ToolApprovalResolver,
  type ToolPermission,
  type ToolRisk,
} from "@harness-kernel/core";
import type { HarnessSkill } from "./skill.js";
import { type SkillRegistry, toSkillRegistry } from "./registry.js";
import {
  activateSkill,
  deactivateSkill,
  isSkillActive,
  listActiveSkills,
  listAvailableSkills,
  listInactiveSkills,
  type SkillActivationResult,
  type SkillDeactivationResult,
  type SkillToolOptions,
} from "./state.js";
import { SkillRequiredEvent } from "./events.js";
import { SkillRequiredLog } from "./logs.js";

const skillKeySchema = s.object({
  key: s.string().min(1),
  reason: s.string().optional(),
});

const listSkillsSchema = s.object({
  includeTools: s.boolean().default(true),
  includeInactive: s.boolean().default(true),
});

type SkillKeyInput = InferInput<typeof skillKeySchema>;
type ListSkillsInput = InferInput<typeof listSkillsSchema>;

export interface SkillGateOptions extends SkillToolOptions {
  skillKeys?: string[];
}

export interface SkillListResult {
  ok: true;
  available: ReturnType<typeof listAvailableSkills>;
  active: ReturnType<typeof listActiveSkills>;
  inactive?: ReturnType<typeof listInactiveSkills>;
}

export class SkillActivationTool extends HarnessTool<SkillKeyInput, SkillActivationResult> {
  name = "activate_skill";
  description = "Activate a declared procedural skill before using its gated tools.";
  schema = skillKeySchema;
  risk = "safe" as const;

  constructor(
    private readonly registry: SkillRegistry,
    private readonly options: SkillToolOptions = {},
  ) {
    super();
  }

  async execute(args: SkillKeyInput, session: AgentActionSession): Promise<AgentToolResult<SkillActivationResult>> {
    const input = skillKeySchema.parse(args);
    const result = await activateSkill(session, this.registry, input, this.options);
    if (!result.ok) {
      return {
        content: `Unknown skill '${result.key}'. Available skills: ${result.availableSkills?.map((entry) => entry.key).join(", ") || "none"}.`,
        data: result,
        metadata: {
          code: result.code,
          skillKey: result.key,
        },
      };
    }

    return {
      content: result.alreadyActive
        ? `Skill '${result.key}' was already active.`
        : `Activated skill '${result.key}'.`,
      data: result,
      metadata: {
        skillKey: result.key,
        alreadyActive: result.alreadyActive,
      },
    };
  }
}

export class SkillDeactivationTool extends HarnessTool<SkillKeyInput, SkillDeactivationResult> {
  name = "deactivate_skill";
  description = "Deactivate a declared procedural skill for this session.";
  schema = skillKeySchema;
  risk = "safe" as const;

  constructor(
    private readonly registry: SkillRegistry,
    private readonly options: SkillToolOptions = {},
  ) {
    super();
  }

  async execute(args: SkillKeyInput, session: AgentActionSession): Promise<AgentToolResult<SkillDeactivationResult>> {
    const input = skillKeySchema.parse(args);
    const result = await deactivateSkill(session, this.registry, input, this.options);
    if (!result.ok) {
      return {
        content: `Unknown skill '${result.key}'. Available skills: ${result.availableSkills?.map((entry) => entry.key).join(", ") || "none"}.`,
        data: result,
        metadata: {
          code: result.code,
          skillKey: result.key,
        },
      };
    }

    return {
      content: result.alreadyInactive
        ? `Skill '${result.key}' was already inactive.`
        : `Deactivated skill '${result.key}'.`,
      data: result,
      metadata: {
        skillKey: result.key,
        alreadyInactive: result.alreadyInactive,
      },
    };
  }
}

export class SkillListTool extends HarnessTool<ListSkillsInput, SkillListResult> {
  name = "list_skills";
  description = "List declared skills, active skills, and inactive skills for this session.";
  schema = listSkillsSchema;
  risk = "safe" as const;

  constructor(
    private readonly registry: SkillRegistry,
    private readonly options: SkillToolOptions = {},
  ) {
    super();
  }

  execute(args: ListSkillsInput, session: AgentActionSession): AgentToolResult<SkillListResult> {
    const input = listSkillsSchema.parse(args);
    const catalogOptions = { includeToolNames: input.includeTools, includeMetadata: true };
    const data: SkillListResult = {
      ok: true,
      available: listAvailableSkills(this.registry, catalogOptions),
      active: listActiveSkills(session, this.registry, { ...catalogOptions, stateKey: this.options.stateKey }),
      ...(input.includeInactive
        ? { inactive: listInactiveSkills(session, this.registry, { ...catalogOptions, stateKey: this.options.stateKey }) }
        : {}),
    };
    return {
      content: `Available skills: ${data.available.map((entry) => entry.key).join(", ") || "none"}. Active skills: ${data.active.map((entry) => entry.key).join(", ") || "none"}.`,
      data,
      metadata: {
        includeTools: input.includeTools,
        includeInactive: input.includeInactive,
      },
    };
  }
}

class SkillGatedTool extends HarnessTool<unknown> {
  label?: string;
  name: string;
  description: string;
  schema?: unknown;
  risk?: ToolRisk;
  permissions?: ToolPermission[];
  requiresApproval?: boolean | ToolApprovalResolver;
  approvalTimeoutMs?: number;

  constructor(
    private readonly skill: HarnessSkill,
    private readonly original: HarnessToolType,
    private readonly options: SkillGateOptions = {},
  ) {
    super();
    this.label = original.label;
    this.name = original.name;
    this.description = `${original.description} Requires activating skill '${skill.key}' first.`;
    this.schema = original.inputSchema;
    this.risk = original.risk;
    this.permissions = original.permissions;
    this.requiresApproval = original.requiresApproval;
    this.approvalTimeoutMs = original.approvalTimeoutMs;
  }

  async execute(args: unknown, session: AgentActionSession): Promise<AgentToolResult> {
    if (!isSkillActive(session, this.skill.key, this.options)) {
      await session.events.emit(SkillRequiredEvent, {
        key: this.skill.key,
        ...(this.skill.label ? { label: this.skill.label } : {}),
        toolName: this.original.name,
        reason: "inactive",
      });
      session.log.emit(SkillRequiredLog, {
        skillKey: this.skill.key,
        toolName: this.original.name,
        reason: "inactive",
      });
      return {
        content: `Tool '${this.original.name}' requires activating skill '${this.skill.key}' first. Call activate_skill with that key.`,
        data: {
          ok: false,
          code: "skill.required",
          requiredSkill: this.skill.key,
          toolName: this.original.name,
        },
        metadata: {
          skillRequired: true,
          requiredSkill: this.skill.key,
          originalToolName: this.original.name,
        },
      };
    }

    return this.original.execute(args, session);
  }
}

export function createSkillActivationTool(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillToolOptions,
): HarnessTool {
  return new SkillActivationTool(toSkillRegistry(registry), options);
}

export function createSkillDeactivationTool(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillToolOptions,
): HarnessTool {
  return new SkillDeactivationTool(toSkillRegistry(registry), options);
}

export function createSkillListTool(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillToolOptions,
): HarnessTool {
  return new SkillListTool(toSkillRegistry(registry), options);
}

export function createSkillGatedTools(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillGateOptions,
): HarnessTool[] {
  const skills = toSkillRegistry(registry);
  const filteredKeys = options?.skillKeys?.map((key) => key.trim()).filter(Boolean);
  if (filteredKeys?.length) {
    const unknownKeys = filteredKeys.filter((key) => !skills.get(key));
    if (unknownKeys.length) throw new Error(`Unknown skill gate filter key '${unknownKeys[0]}'.`);
  }
  const allowedKeys = filteredKeys?.length ? new Set(filteredKeys) : undefined;

  return skills
    .list()
    .filter((skill) => !allowedKeys || allowedKeys.has(skill.key))
    .flatMap((skill) => (skill.tools ?? []).map((tool) => new SkillGatedTool(skill, tool, options)));
}
