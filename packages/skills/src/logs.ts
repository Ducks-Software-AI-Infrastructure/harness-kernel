import { HarnessLog } from "@harness-kernel/core/runner/logging";

export interface SkillActivationRequestedLogFields {
  skillKey: string;
  known: boolean;
  alreadyActive: boolean;
  reason?: string;
}

export interface SkillActivatedLogFields {
  skillKey: string;
  label?: string;
  alreadyActive: boolean;
}

export interface SkillDeactivatedLogFields {
  skillKey: string;
  label?: string;
  alreadyInactive: boolean;
}

export interface SkillRequiredLogFields {
  skillKey: string;
  toolName: string;
  reason: "inactive" | "unknown";
}

export class SkillActivationRequestedLog extends HarnessLog<SkillActivationRequestedLogFields> {
  level = "info" as const;
  category = "agent" as const;

  levelFor(fields: SkillActivationRequestedLogFields): "info" | "warn" {
    return fields.known ? "info" : "warn";
  }

  message(fields: SkillActivationRequestedLogFields): string {
    return `skill.activation.requested key=${fields.skillKey} known=${fields.known} alreadyActive=${fields.alreadyActive}`;
  }
}

export class SkillActivatedLog extends HarnessLog<SkillActivatedLogFields> {
  level = "info" as const;
  category = "agent" as const;

  message(fields: SkillActivatedLogFields): string {
    return `skill.activated key=${fields.skillKey} alreadyActive=${fields.alreadyActive}`;
  }
}

export class SkillDeactivatedLog extends HarnessLog<SkillDeactivatedLogFields> {
  level = "info" as const;
  category = "agent" as const;

  message(fields: SkillDeactivatedLogFields): string {
    return `skill.deactivated key=${fields.skillKey} alreadyInactive=${fields.alreadyInactive}`;
  }
}

export class SkillRequiredLog extends HarnessLog<SkillRequiredLogFields> {
  level = "warn" as const;
  category = "tool" as const;

  message(fields: SkillRequiredLogFields): string {
    return `skill.required key=${fields.skillKey} tool=${fields.toolName} reason=${fields.reason}`;
  }
}
