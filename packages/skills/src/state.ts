import type {
  AgentActionSession,
  AgentReadSession,
  AgentSharedState,
} from "@harness-kernel/core";
import type { HarnessSkill } from "./skill.js";
import {
  type SkillCatalogEntry,
  type SkillCatalogOptions,
  type SkillRegistry,
  toSkillRegistry,
} from "./registry.js";
import {
  SkillActivatedEvent,
  SkillActivationRequestedEvent,
  SkillDeactivatedEvent,
} from "./events.js";
import {
  SkillActivatedLog,
  SkillActivationRequestedLog,
  SkillDeactivatedLog,
} from "./logs.js";

export const DEFAULT_SKILL_STATE_KEY = "skills";

export interface SkillStateOptions {
  stateKey?: string;
}

export interface ActiveSkillState {
  key: string;
  activatedAt: string;
  activatedByToolCallId?: string;
  reason?: string;
}

export interface SkillState {
  active: Record<string, ActiveSkillState>;
}

export type SkillErrorCode = "skill.unknown" | "skill.required";

export interface SkillActivationResult {
  ok: boolean;
  key: string;
  known: boolean;
  alreadyActive: boolean;
  skill?: SkillCatalogEntry;
  active?: ActiveSkillState;
  code?: "skill.unknown";
  availableSkills?: SkillCatalogEntry[];
}

export interface SkillDeactivationResult {
  ok: boolean;
  key: string;
  known: boolean;
  alreadyInactive: boolean;
  skill?: SkillCatalogEntry;
  code?: "skill.unknown";
  availableSkills?: SkillCatalogEntry[];
}

export interface SkillToolOptions extends SkillStateOptions {}

function nowIso(): string {
  return new Date().toISOString();
}

function stateKey(options?: SkillStateOptions): string {
  return options?.stateKey?.trim() || DEFAULT_SKILL_STATE_KEY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSharedState(sessionOrState: AgentReadSession | AgentSharedState): AgentSharedState {
  if (
    isRecord(sessionOrState)
    && isRecord(sessionOrState.state)
    && typeof sessionOrState.state.get === "function"
  ) {
    return sessionOrState.state.get() as AgentSharedState;
  }
  return sessionOrState as AgentSharedState;
}

function normalizeActiveSkill(key: string, value: unknown): ActiveSkillState | undefined {
  if (!isRecord(value)) return undefined;
  const storedKey = typeof value.key === "string" && value.key.trim() ? value.key.trim() : key;
  const activatedAt = typeof value.activatedAt === "string" && value.activatedAt.trim()
    ? value.activatedAt
    : nowIso();
  return {
    key: storedKey,
    activatedAt,
    ...(typeof value.activatedByToolCallId === "string" && value.activatedByToolCallId.trim()
      ? { activatedByToolCallId: value.activatedByToolCallId }
      : {}),
    ...(typeof value.reason === "string" && value.reason.trim() ? { reason: value.reason } : {}),
  };
}

function skillCatalogEntry(skill: HarnessSkill, options?: SkillCatalogOptions): SkillCatalogEntry {
  return toSkillRegistry([skill]).catalog(options)[0]!;
}

export function getSkillState(
  sessionOrState: AgentReadSession | AgentSharedState,
  options?: SkillStateOptions,
): SkillState {
  const sharedState = readSharedState(sessionOrState);
  const raw = sharedState[stateKey(options)];
  if (!isRecord(raw) || !isRecord(raw.active)) return { active: {} };

  const active: Record<string, ActiveSkillState> = {};
  for (const [key, value] of Object.entries(raw.active)) {
    const normalized = normalizeActiveSkill(key, value);
    if (normalized) active[key] = normalized;
  }
  return { active };
}

export function setSkillState(
  session: AgentActionSession,
  state: SkillState,
  options?: SkillStateOptions,
): void {
  session.state.update({
    [stateKey(options)]: {
      active: { ...state.active },
    },
  } as Partial<AgentSharedState>);
}

export function listAvailableSkills(
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillCatalogOptions,
): SkillCatalogEntry[] {
  return toSkillRegistry(registry).catalog(options);
}

export function listActiveSkills(
  sessionOrState: AgentReadSession | AgentSharedState,
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillCatalogOptions & SkillStateOptions,
): SkillCatalogEntry[] {
  const skillState = getSkillState(sessionOrState, options);
  return toSkillRegistry(registry)
    .list()
    .filter((skill) => Boolean(skillState.active[skill.key]))
    .map((skill) => ({ ...skillCatalogEntry(skill, options), active: true }));
}

export function listInactiveSkills(
  sessionOrState: AgentReadSession | AgentSharedState,
  registry: SkillRegistry | HarnessSkill[],
  options?: SkillCatalogOptions & SkillStateOptions,
): SkillCatalogEntry[] {
  const skillState = getSkillState(sessionOrState, options);
  return toSkillRegistry(registry)
    .list()
    .filter((skill) => !skillState.active[skill.key])
    .map((skill) => ({ ...skillCatalogEntry(skill, options), active: false }));
}

export function isSkillActive(
  sessionOrState: AgentReadSession | AgentSharedState,
  key: string,
  options?: SkillStateOptions,
): boolean {
  return Boolean(getSkillState(sessionOrState, options).active[key]);
}

export async function activateSkill(
  session: AgentActionSession,
  registry: SkillRegistry | HarnessSkill[],
  input: { key: string; reason?: string },
  options?: SkillToolOptions,
): Promise<SkillActivationResult> {
  const key = input.key.trim();
  const skills = toSkillRegistry(registry);
  const skill = skills.get(key);
  const alreadyActive = isSkillActive(session, key, options);
  const known = Boolean(skill);

  await session.events.emit(SkillActivationRequestedEvent, {
    key,
    ...(input.reason ? { reason: input.reason } : {}),
    known,
    alreadyActive,
  });
  session.log.emit(SkillActivationRequestedLog, {
    skillKey: key,
    known,
    alreadyActive,
    reason: input.reason,
  });

  if (!skill) {
    return {
      ok: false,
      key,
      known: false,
      alreadyActive,
      code: "skill.unknown",
      availableSkills: skills.catalog({ includeToolNames: true }),
    };
  }

  let active = getSkillState(session, options).active[key];
  if (!active) {
    active = {
      key,
      activatedAt: nowIso(),
      ...(session.toolCall?.id ? { activatedByToolCallId: session.toolCall.id } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    };
    const current = getSkillState(session, options);
    setSkillState(session, {
      active: {
        ...current.active,
        [key]: active,
      },
    }, options);
  }

  await session.events.emit(SkillActivatedEvent, {
    key,
    ...(skill.label ? { label: skill.label } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    alreadyActive,
    ...(active.activatedByToolCallId ? { activatedByToolCallId: active.activatedByToolCallId } : {}),
  });
  session.log.emit(SkillActivatedLog, {
    skillKey: key,
    label: skill.label,
    alreadyActive,
  });

  return {
    ok: true,
    key,
    known: true,
    alreadyActive,
    skill: skillCatalogEntry(skill, { includeToolNames: true }),
    active,
  };
}

export async function deactivateSkill(
  session: AgentActionSession,
  registry: SkillRegistry | HarnessSkill[],
  input: { key: string; reason?: string },
  options?: SkillToolOptions,
): Promise<SkillDeactivationResult> {
  const key = input.key.trim();
  const skills = toSkillRegistry(registry);
  const skill = skills.get(key);
  if (!skill) {
    return {
      ok: false,
      key,
      known: false,
      alreadyInactive: true,
      code: "skill.unknown",
      availableSkills: skills.catalog({ includeToolNames: true }),
    };
  }

  const current = getSkillState(session, options);
  const alreadyInactive = !current.active[key];
  if (!alreadyInactive) {
    const nextActive = { ...current.active };
    delete nextActive[key];
    setSkillState(session, { active: nextActive }, options);
  }

  await session.events.emit(SkillDeactivatedEvent, {
    key,
    ...(skill.label ? { label: skill.label } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    alreadyInactive,
    ...(session.toolCall?.id ? { deactivatedByToolCallId: session.toolCall.id } : {}),
  });
  session.log.emit(SkillDeactivatedLog, {
    skillKey: key,
    label: skill.label,
    alreadyInactive,
  });

  return {
    ok: true,
    key,
    known: true,
    alreadyInactive,
    skill: skillCatalogEntry(skill, { includeToolNames: true }),
  };
}
