import { constructTypeOf, snakeFromType } from "./naming.js";

export interface HarnessRoleSummary {
  type: string;
  name: string;
  label?: string;
  target: string;
  nativeRole?: string;
  default?: boolean;
  description?: string;
}

export enum RoleTargets {
  System = "system",
  Messages = "messages",
  Hidden = "hidden",
}

export enum NativeRoles {
  System = "system",
  User = "user",
  Assistant = "assistant",
  Tool = "tool",
}

export abstract class HarnessRole {
  protected declare readonly __harnessRoleBrand: true;

  label?: string;
  name?: string;
  abstract target: RoleTargets | (string & {});
  nativeRole?: NativeRoles | (string & {});
  default?: boolean;
  description?: string;

  get type(): string {
    return constructTypeOf(this);
  }

}

export type HarnessRoleClass<TRole extends HarnessRole = HarnessRole> = abstract new (...args: any[]) => TRole;
export type HarnessRoleDefinition = HarnessRole;
export type HarnessRoleSelector<TRole extends HarnessRole = HarnessRole> = TRole | HarnessRoleClass<TRole>;

export class SystemRole extends HarnessRole {
  static type = "system";
  label = "System";
  name = "system";
  target = RoleTargets.System;
  nativeRole = NativeRoles.System;
  default = true;
}

export class UserRole extends HarnessRole {
  static type = "user";
  label = "User";
  name = "user";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.User;
}

export class AssistantRole extends HarnessRole {
  static type = "assistant";
  label = "Assistant";
  name = "assistant";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.Assistant;
}

export class ToolRole extends HarnessRole {
  static type = "tool";
  label = "Tool";
  name = "tool";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.Tool;
}

export const systemRole = new SystemRole();
export const userRole = new UserRole();
export const assistantRole = new AssistantRole();
export const toolRole = new ToolRole();
