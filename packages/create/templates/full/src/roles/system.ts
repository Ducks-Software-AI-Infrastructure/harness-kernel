import { HarnessRole, NativeRoles, RoleTargets } from "@harness-kernel/core/agent/role";

class SystemRole extends HarnessRole {
  label = "System";
  target = RoleTargets.System;
  nativeRole = NativeRoles.System;
  default = true;
}

export const systemRole = new SystemRole();
