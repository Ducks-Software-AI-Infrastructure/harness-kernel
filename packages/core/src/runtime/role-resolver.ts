import {
  getConstructLabel,
  getConstructType,
  getRoleName,
  isRoleClass,
  isRoleInstance,
  roleMatchesSelector,
} from "./constructs.js";
import {
  NativeRoles,
  RoleTargets,
  type AgentMessage,
  type AgentMessageRole,
  type HarnessRoleDefinition,
  type HarnessRoleSelector,
  type HarnessRoleSummary,
} from "./types.js";

export interface ResolvedRole {
  role: AgentMessageRole;
  authorRole: string;
  roleType: string;
  target: HarnessRoleDefinition["target"];
  definition?: HarnessRoleDefinition;
}

export class RoleResolver {
  constructor(
    private readonly roles: HarnessRoleDefinition[],
    private readonly input: {
      modelProviderId: string;
      supportsRole?: (roleId: string) => boolean;
    },
  ) {}

  resolve(selector: HarnessRoleSelector | string): ResolvedRole {
    const definition = this.definitionFromSelector(selector);
    if (!definition) {
      if (typeof selector !== "string") throw new Error(`Unknown role '${getConstructType(selector)}'.`);
      return {
        role: selector as AgentMessageRole,
        authorRole: selector,
        roleType: selector,
        target: selector === NativeRoles.System ? RoleTargets.System : RoleTargets.Messages,
      };
    }

    return {
      role: (definition.nativeRole ?? getRoleName(definition)) as AgentMessageRole,
      authorRole: getRoleName(definition),
      roleType: getConstructType(definition),
      target: definition.target,
      definition,
    };
  }

  assertModelProviderSupportsMessages(messages: AgentMessage[]): void {
    for (const message of messages) {
      if (message.hidden || message.role === "event") continue;
      this.assertModelProviderSupportsRole(message.role);
    }
  }

  summary(role: HarnessRoleDefinition): HarnessRoleSummary {
    return {
      type: getConstructType(role),
      name: getRoleName(role),
      label: getConstructLabel(role),
      target: role.target,
      nativeRole: role.nativeRole,
      default: role.default,
      description: role.description,
    };
  }

  private definitionFromSelector(selector: HarnessRoleSelector | string): HarnessRoleDefinition | undefined {
    const registered = this.roles.find((role) => roleMatchesSelector(role, selector));
    if (registered) return registered;
    if (typeof selector === "string") return undefined;
    if (isRoleInstance(selector)) return selector;
    if (isRoleClass(selector)) {
      try {
        return new (selector as new () => HarnessRoleDefinition)();
      } catch (error) {
        throw new Error(`Role '${getConstructType(selector)}' must be registered as an instance or have a zero-argument constructor.`);
      }
    }
    return undefined;
  }

  private assertModelProviderSupportsRole(role: AgentMessageRole): void {
    const supportsRole = this.input.supportsRole;
    if (supportsRole && !supportsRole(role)) {
      throw new Error(`Model provider '${this.input.modelProviderId}' does not support native role '${role}'.`);
    }
  }
}
