export { backupDatabaseFile, closeDatabase, databaseFilePath, getDatabase } from "../database";

export const performanceIndexNames = [
  "idx_sales_created_at",
  "idx_sales_receipt_no",
  "idx_sale_items_sale_id",
  "idx_job_orders_status",
  "idx_job_orders_created_at",
  "idx_job_status_history_job_order_id",
  "idx_audit_logs_created_at",
  "idx_mechanic_attendance_date_mechanic",
  "idx_payroll_runs_period",
  "idx_inventory_category_id",
  "idx_inventory_name"
] as const;
