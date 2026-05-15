import type { SuperAdminSettings } from "../../types/global";
import { formatDateTime } from "./date";

export const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function escapeHtml(value: string | number | undefined | null) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] ?? char));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function nextBackupText(settings: SuperAdminSettings) {
  if (settings.backup_schedule === "Disabled") return "Not scheduled";
  const [hour, minute] = (settings.backup_time || "23:00").split(":").map(Number);
  const next = new Date();
  next.setSeconds(0, 0);
  next.setHours(hour || 0, minute || 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  if (settings.backup_schedule === "Weekly") {
    const targetDay = Number(settings.backup_weekday || 0);
    while (next.getDay() !== targetDay || next <= new Date()) next.setDate(next.getDate() + 1);
  }
  if (settings.backup_schedule === "Monthly") {
    const targetDate = Math.min(Number(settings.backup_month_day || 1), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate());
    next.setDate(targetDate);
    if (next <= new Date()) {
      next.setMonth(next.getMonth() + 1, 1);
      next.setDate(Math.min(Number(settings.backup_month_day || 1), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    }
  }
  return formatDateTime(next);
}
