import { HarnessEvent, s } from "@harness-kernel/core";

export interface SkillActivationRequestedPayload {
  key: string;
  reason?: string;
  known: boolean;
  alreadyActive: boolean;
}

export interface SkillActivatedPayload {
  key: string;
  label?: string;
  reason?: string;
  alreadyActive: boolean;
  activatedByToolCallId?: string;
}

export interface SkillDeactivatedPayload {
  key: string;
  label?: string;
  reason?: string;
  alreadyInactive: boolean;
  deactivatedByToolCallId?: string;
}

export interface SkillRequiredPayload {
  key: string;
  label?: string;
  toolName: string;
  reason: "inactive" | "unknown";
}

export class SkillActivationRequestedEvent extends HarnessEvent<SkillActivationRequestedPayload> {
  static override type = "skill:activation_requested";
  static override schema = s.object({
    key: s.string().min(1),
    reason: s.string().optional(),
    known: s.boolean(),
    alreadyActive: s.boolean(),
  });
}

export class SkillActivatedEvent extends HarnessEvent<SkillActivatedPayload> {
  static override type = "skill:activated";
  static override schema = s.object({
    key: s.string().min(1),
    label: s.string().optional(),
    reason: s.string().optional(),
    alreadyActive: s.boolean(),
    activatedByToolCallId: s.string().optional(),
  });
}

export class SkillDeactivatedEvent extends HarnessEvent<SkillDeactivatedPayload> {
  static override type = "skill:deactivated";
  static override schema = s.object({
    key: s.string().min(1),
    label: s.string().optional(),
    reason: s.string().optional(),
    alreadyInactive: s.boolean(),
    deactivatedByToolCallId: s.string().optional(),
  });
}

export class SkillRequiredEvent extends HarnessEvent<SkillRequiredPayload> {
  static override type = "skill:required";
  static override schema = s.object({
    key: s.string().min(1),
    label: s.string().optional(),
    toolName: s.string().min(1),
    reason: s.enum(["inactive", "unknown"] as const),
  });
}

export function skillEvents() {
  return [
    SkillActivationRequestedEvent,
    SkillActivatedEvent,
    SkillDeactivatedEvent,
    SkillRequiredEvent,
  ];
}
