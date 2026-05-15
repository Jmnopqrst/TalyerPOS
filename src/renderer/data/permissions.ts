import type { Role } from "../types/global";

export type ModuleKey =
  | "dashboard"
  | "pos"
  | "inventory"
  | "jobs"
  | "customers"
  | "services"
  | "staff"
  | "suppliers"
  | "purchases"
  | "reports"
  | "payroll"
  | "users"
  | "settings"
  | "audit";

const permissions: Record<Role, ModuleKey[]> = {
  Owner: ["dashboard", "pos", "inventory", "jobs", "customers", "services", "staff", "suppliers", "purchases", "reports", "payroll", "users", "settings", "audit"],
  Admin: ["dashboard", "inventory", "jobs", "customers", "services", "staff", "suppliers", "purchases", "reports", "settings"],
  Cashier: ["dashboard", "pos", "jobs"],
  SuperAdmin: []
};

export function canAccess(role: Role, module: ModuleKey) {
  return (permissions[role] ?? []).includes(module);
}

export function modulesFor(role: Role) {
  return permissions[role] ?? ["dashboard"];
}
