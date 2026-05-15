import { HarnessRole, NativeRoles, RoleTargets } from "@harness-kernel/core/agent/role";

class AssistantRole extends HarnessRole {
  label = "Assistant";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.Assistant;
}

export const assistantRole = new AssistantRole();
