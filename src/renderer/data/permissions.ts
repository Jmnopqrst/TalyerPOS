import type { Role } from "../types/global";

export type ModuleKey =
  | "dashboard"
  | "pos"
  | "inventory"
  | "jobs"
  | "services"
  | "staff"
  | "suppliers"
  | "reports"
  | "users"
  | "settings"
  | "audit";

const permissions: Record<Role, ModuleKey[]> = {
  Owner: ["dashboard", "pos", "inventory", "jobs", "services", "staff", "suppliers", "reports", "users", "settings", "audit"],
  Admin: ["dashboard", "inventory", "jobs", "services", "staff", "suppliers", "reports", "settings"],
  Cashier: ["dashboard", "pos", "jobs"],
  SuperAdmin: []
};

export function canAccess(role: Role, module: ModuleKey) {
  return permissions[role].includes(module);
}

export function modulesFor(role: Role) {
  return permissions[role];
}
