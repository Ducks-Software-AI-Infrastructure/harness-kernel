import { HarnessRole, NativeRoles, RoleTargets } from "@harness-kernel/core/agent/role";

class UserRole extends HarnessRole {
  label = "User";
  target = RoleTargets.Messages;
  nativeRole = NativeRoles.User;
}

export const userRole = new UserRole();
