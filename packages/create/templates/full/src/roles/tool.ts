import { HarnessRole, NativeRoles, RoleTargets } from "@harness-kernel/core/agent/role";

class ToolRole extends HarnessRole {
  label = "Tool";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.Tool;
}

export const toolRole = new ToolRole();
