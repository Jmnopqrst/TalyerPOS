import Database from "better-sqlite3";
import { app } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { generateTemporaryPassword, hashPassword, validatePassword, verifyPassword } from "./security";

export type Role = "Owner" | "Admin" | "Cashier" | "SuperAdmin";

export interface UserAccount {
  id: number;
  name: string;
  role: Role;
  username: string;
  contact_number: string;
  address: string;
  email: string;
  is_mechanic: 0 | 1;
  must_change_password: 0 | 1;
  status: "Active" | "Disabled";
}

export interface SuperAdminSettings {
  id: number;
  trial_enabled: 0 | 1;
  trial_started_at: string;
  trial_days: number;
  license_key: string;
  license_status: "Trial" | "Activated";
  last_backup_at: string;
  backup_schedule: "Disabled" | "Daily" | "Weekly" | "Monthly";
  backup_time: string;
  backup_weekday: number;
  backup_month_day: number;
  backup_folder: string;
  backup_retention_count: number;
  last_auto_backup_at: string;
  last_backup_error: string;
  payroll_module_enabled: 0 | 1;
  updated_at: string;
}

function normalizeBackupSchedule(value: string): SuperAdminSettings["backup_schedule"] {
  return ["Daily", "Weekly", "Monthly"].includes(value) ? value as SuperAdminSettings["backup_schedule"] : "Disabled";
}

export interface BackupHistoryRow {
  id: number;
  filename: string;
  file_path: string;
  backup_date: string;
  file_size: number;
  backup_type: "Manual" | "Automatic" | "Hourly Incremental" | "Daily Full" | "Monthly Archive";
  status: "Success" | "Successful" | "Failed" | "Corrupted" | "Partial" | "Skipped";
  duration_ms: number;
  details: string;
  created_at: string;
}

let db: Database.Database | null = null;

const now = () => new Date().toISOString();
const usernamePattern = /^[a-zA-Z0-9._-]{3,32}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const contactCharacterPattern = /^[0-9()\-\s]+$/;

function isValidContactNumber(value: string) {
  const trimmed = value.trim();
  const digitCount = trimmed.replace(/\D/g, "").length;
  return contactCharacterPattern.test(trimmed) && digitCount >= 10 && digitCount <= 11;
}

function categoryCodeFromName(name: string) {
  return name
    .replace(/[^A-Za-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase() || "CAT";
}

function fsCopyDatabase(source: string, target: string) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

export function getDatabase() {
  if (db) return db;

  const dbPath = databaseFilePath();
  const database = new Database(dbPath, { timeout: 10000 });
  try {
    database.pragma("busy_timeout = 10000");
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    migrate(database);
    seed(database);
    db = database;
    return db;
  } catch (caught) {
    database.close();
    db = null;
    throw caught;
  }
}

export function databaseFilePath() {
  if (process.env.TALYER_POS_DB_PATH) return process.env.TALYER_POS_DB_PATH;
  return path.join(app.getPath("userData"), "talyer-pos.sqlite");
}

export function closeDatabase() {
  if (!db) return;
  db.close();
  db = null;
}

export function backupDatabaseFile(targetPath: string) {
  getDatabase().pragma("wal_checkpoint(FULL)");
  closeDatabase();
  const source = databaseFilePath();
  fsCopyDatabase(source, targetPath);
  getDatabase();
}

export function inspectDatabaseFile(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error("Database file does not exist.");
  const inspected = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const integrity = inspected.prepare("PRAGMA integrity_check").pluck().get() as string;
    const tables = (inspected.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name);
    const tableSet = new Set(tables);
    const requiredTables = ["users", "inventory", "sales", "sale_items", "job_orders"];
    const missingTables = requiredTables.filter((table) => !tableSet.has(table));
    return {
      integrityOk: integrity === "ok" && missingTables.length === 0,
      integrityDetail: missingTables.length ? `Missing tables: ${missingTables.join(", ")}` : integrity,
      tables
    };
  } finally {
    inspected.close();
  }
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Owner','Admin','Cashier')),
      pin TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active'
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS motorcycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      plate_no TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER,
      color TEXT DEFAULT '',
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      phone TEXT NOT NULL,
      category TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      supplier_id INTEGER,
      status TEXT NOT NULL DEFAULT 'Draft',
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      received_at TEXT,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity_ordered INTEGER NOT NULL,
      quantity_received INTEGER NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES inventory(id)
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      labor_cost REAL NOT NULL DEFAULT 0,
      duration_minutes INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      product_code TEXT,
      category_id INTEGER,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      supplier_id INTEGER,
      stock INTEGER NOT NULL,
      reorder_level INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      sell_price REAL NOT NULL,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    );
    CREATE TABLE IF NOT EXISTS inventory_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      motorcycle_id INTEGER NOT NULL,
      mechanic_id INTEGER,
      status TEXT NOT NULL,
      concern TEXT NOT NULL,
      estimate REAL NOT NULL,
      created_at TEXT NOT NULL,
      due_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(motorcycle_id) REFERENCES motorcycles(id),
      FOREIGN KEY(mechanic_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT NOT NULL UNIQUE,
      cashier_id INTEGER NOT NULL,
      customer_id INTEGER,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_category TEXT NOT NULL DEFAULT 'Manual',
      payment_reference_code TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(cashier_id) REFERENCES users(id),
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL,
      FOREIGN KEY(sale_id) REFERENCES sales(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS approval_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER,
      approver_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(requester_id) REFERENCES users(id),
      FOREIGN KEY(approver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS job_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_order_id INTEGER NOT NULL,
      actor_id INTEGER,
      status TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(job_order_id) REFERENCES job_orders(id),
      FOREIGN KEY(actor_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      recorded_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(recorded_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('Cash','Online Payment')),
      payment_category TEXT NOT NULL DEFAULT 'Manual',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS super_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS super_admin_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      trial_enabled INTEGER NOT NULL DEFAULT 1,
      trial_started_at TEXT NOT NULL,
      trial_days INTEGER NOT NULL DEFAULT 30,
      license_key TEXT NOT NULL DEFAULT '',
      license_status TEXT NOT NULL DEFAULT 'Trial',
      last_backup_at TEXT NOT NULL DEFAULT '',
      backup_schedule TEXT NOT NULL DEFAULT 'Disabled',
      backup_time TEXT NOT NULL DEFAULT '23:00',
      backup_weekday INTEGER NOT NULL DEFAULT 0,
      backup_month_day INTEGER NOT NULL DEFAULT 1,
      backup_folder TEXT NOT NULL DEFAULT '',
      backup_retention_count INTEGER NOT NULL DEFAULT 10,
      last_auto_backup_at TEXT NOT NULL DEFAULT '',
      last_backup_error TEXT NOT NULL DEFAULT '',
      payroll_module_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      super_admin_id INTEGER,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(super_admin_id) REFERENCES super_admins(id)
    );
  `);

  ensureUserColumns(database);
  ensureServiceColumns(database);
  ensureInventoryStructure(database);
  ensureJobOrderColumns(database);
  ensureSaleColumns(database);
  ensureReceiptSettings(database);
  ensurePaymentMethods(database);
  ensureSuperAdminTables(database);
  ensurePayroll(database);
  ensureApprovalLogs(database);
  ensureJobStatusHistory(database);
  ensureExpenses(database);
  ensurePurchaseOrders(database);
  ensurePerformanceIndexes(database);
}

function ensurePurchaseOrders(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      supplier_id INTEGER,
      status TEXT NOT NULL DEFAULT 'Draft',
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      received_at TEXT,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity_ordered INTEGER NOT NULL,
      quantity_received INTEGER NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES inventory(id)
    );
  `);
}

function ensurePerformanceIndexes(database: Database.Database) {
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_receipt_no ON sales(receipt_no);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_job_orders_status ON job_orders(status);
    CREATE INDEX IF NOT EXISTS idx_job_orders_created_at ON job_orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_job_status_history_job_order_id ON job_status_history(job_order_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_mechanic_attendance_date_mechanic ON mechanic_attendance(attendance_date, mechanic_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(period_start, period_end);
    CREATE INDEX IF NOT EXISTS idx_inventory_category_id ON inventory(category_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(purchase_order_id);
  `);
}

function ensureApprovalLogs(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS approval_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER,
      approver_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(requester_id) REFERENCES users(id),
      FOREIGN KEY(approver_id) REFERENCES users(id)
    );
  `);
}

function ensureJobStatusHistory(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS job_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_order_id INTEGER NOT NULL,
      actor_id INTEGER,
      status TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY(job_order_id) REFERENCES job_orders(id),
      FOREIGN KEY(actor_id) REFERENCES users(id)
    );
  `);
}

function ensureExpenses(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      recorded_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(recorded_by) REFERENCES users(id)
    );
  `);
}

function ensureSuperAdminTables(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS super_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS super_admin_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      trial_enabled INTEGER NOT NULL DEFAULT 1,
      trial_started_at TEXT NOT NULL,
      trial_days INTEGER NOT NULL DEFAULT 30,
      license_key TEXT NOT NULL DEFAULT '',
      license_status TEXT NOT NULL DEFAULT 'Trial',
      last_backup_at TEXT NOT NULL DEFAULT '',
      backup_schedule TEXT NOT NULL DEFAULT 'Disabled',
      backup_time TEXT NOT NULL DEFAULT '23:00',
      backup_weekday INTEGER NOT NULL DEFAULT 0,
      backup_month_day INTEGER NOT NULL DEFAULT 1,
      backup_folder TEXT NOT NULL DEFAULT '',
      backup_retention_count INTEGER NOT NULL DEFAULT 10,
      last_auto_backup_at TEXT NOT NULL DEFAULT '',
      last_backup_error TEXT NOT NULL DEFAULT '',
      payroll_module_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      super_admin_id INTEGER,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(super_admin_id) REFERENCES super_admins(id)
    );

    CREATE TABLE IF NOT EXISTS backup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      backup_date TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      backup_type TEXT NOT NULL CHECK(backup_type IN ('Manual','Automatic','Hourly Incremental','Daily Full','Monthly Archive')),
      status TEXT NOT NULL CHECK(status IN ('Success','Successful','Failed','Corrupted','Partial','Skipped')),
      duration_ms INTEGER NOT NULL DEFAULT 0,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
  ensureBackupHistorySchema(database);

  const superAdmin = database.prepare("SELECT id FROM super_admins WHERE lower(username) = lower('superadmin')").get();
  if (!superAdmin) {
    database.prepare("INSERT INTO super_admins (name, username, password_hash, status, created_at) VALUES (?, ?, ?, 'Active', ?)").run(
      "Super Admin",
      "superadmin",
      hashPassword("superadmin123"),
      now()
    );
  } else {
    database.prepare("UPDATE super_admins SET password_hash = ? WHERE lower(username) = lower('superadmin')").run(hashPassword("superadmin123"));
  }

  const settings = database.prepare("SELECT id FROM super_admin_settings WHERE id = 1").get();
  const columns = new Set((database.prepare("PRAGMA table_info(super_admin_settings)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("payroll_module_enabled")) database.prepare("ALTER TABLE super_admin_settings ADD COLUMN payroll_module_enabled INTEGER NOT NULL DEFAULT 0").run();
  if (!columns.has("backup_time")) database.prepare("ALTER TABLE super_admin_settings ADD COLUMN backup_time TEXT NOT NULL DEFAULT '23:00'").run();
  if (!columns.has("backup_weekday")) database.prepare("ALTER TABLE super_admin_settings ADD COLUMN backup_weekday INTEGER NOT NULL DEFAULT 0").run();
  if (!columns.has("backup_month_day")) database.prepare("ALTER TABLE super_admin_settings ADD COLUMN backup_month_day INTEGER NOT NULL DEFAULT 1").run();
  if (!columns.has("backup_folder")) database.prepare("ALTER TABLE super_admin_settings ADD COLUMN backup_folder TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("backup_retention_count")) database.prepare("ALTER TABLE super_admin_settings ADD COLUMN backup_retention_count INTEGER NOT NULL DEFAULT 10").run();
  if (!columns.has("last_auto_backup_at")) database.prepare("ALTER TABLE super_admin_settings ADD COLUMN last_auto_backup_at TEXT NOT NULL DEFAULT ''").run();
  if (!columns.has("last_backup_error")) database.prepare("ALTER TABLE super_admin_settings ADD COLUMN last_backup_error TEXT NOT NULL DEFAULT ''").run();
  if (!settings) {
    database.prepare(`
      INSERT INTO super_admin_settings (id, trial_enabled, trial_started_at, trial_days, license_key, license_status, last_backup_at, backup_schedule, payroll_module_enabled, updated_at)
      VALUES (1, 1, ?, 30, '', 'Trial', '', 'Disabled', 0, ?)
    `).run(now(), now());
  }
}

function ensureBackupHistorySchema(database: Database.Database) {
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'backup_history'").get() as { sql: string } | undefined;
  const needsRebuild = !table?.sql.includes("Hourly Incremental") || !table.sql.includes("Corrupted");
  if (needsRebuild) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS backup_history_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        backup_date TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        backup_type TEXT NOT NULL CHECK(backup_type IN ('Manual','Automatic','Hourly Incremental','Daily Full','Monthly Archive')),
        status TEXT NOT NULL CHECK(status IN ('Success','Successful','Failed','Corrupted','Partial','Skipped')),
        duration_ms INTEGER NOT NULL DEFAULT 0,
        details TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      INSERT INTO backup_history_next (id, filename, file_path, backup_date, file_size, backup_type, status, duration_ms, details, created_at)
      SELECT id, filename, file_path, backup_date, file_size, backup_type, status, 0, details, created_at FROM backup_history;
      DROP TABLE backup_history;
      ALTER TABLE backup_history_next RENAME TO backup_history;
    `);
    return;
  }
  const columns = new Set((database.prepare("PRAGMA table_info(backup_history)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("duration_ms")) database.prepare("ALTER TABLE backup_history ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0").run();
}

function ensurePayroll(database: Database.Database) {
  const userColumns = new Set((database.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((column) => column.name));
  const addUserColumn = (name: string, definition: string) => {
    if (!userColumns.has(name)) database.prepare(`ALTER TABLE users ADD COLUMN ${name} ${definition}`).run();
  };
  addUserColumn("branch_id", "INTEGER");
  addUserColumn("mechanic_code", "TEXT");
  addUserColumn("qr_code", "TEXT");
  addUserColumn("payroll_type", "TEXT NOT NULL DEFAULT 'Per Day'");
  addUserColumn("salary_rate", "REAL NOT NULL DEFAULT 0");
  addUserColumn("compensation_type", "TEXT NOT NULL DEFAULT 'Fixed Salary'");
  addUserColumn("labor_commission_percentage", "REAL NOT NULL DEFAULT 0");

  database.exec(`
    CREATE TABLE IF NOT EXISTS payroll_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      required_hours_per_day REAL NOT NULL DEFAULT 8,
      required_hours_per_week REAL NOT NULL DEFAULT 40,
      required_hours_per_month REAL NOT NULL DEFAULT 176,
      working_days TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
      consider_holidays_paid INTEGER NOT NULL DEFAULT 0,
      holiday_dates TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mechanic_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mechanic_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      time_in TEXT,
      time_out TEXT,
      status TEXT NOT NULL DEFAULT 'Present',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(mechanic_id, attendance_date),
      FOREIGN KEY(mechanic_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payroll_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_name TEXT NOT NULL,
      permission_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(role_name, permission_key)
    );

    CREATE TABLE IF NOT EXISTS job_payroll_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_order_id INTEGER NOT NULL,
      mechanic_id INTEGER NOT NULL,
      allocation_role TEXT NOT NULL DEFAULT 'Lead',
      allocation_type TEXT NOT NULL DEFAULT 'Percent',
      percentage REAL NOT NULL DEFAULT 100,
      fixed_amount REAL NOT NULL DEFAULT 0,
      is_lead INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(job_order_id, mechanic_id),
      FOREIGN KEY(job_order_id) REFERENCES job_orders(id),
      FOREIGN KEY(mechanic_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payroll_cutoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER,
      name TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      pay_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mechanic_id INTEGER NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      payroll_type TEXT NOT NULL,
      compensation_type TEXT NOT NULL,
      attendance_count REAL NOT NULL DEFAULT 0,
      hours_worked REAL NOT NULL DEFAULT 0,
      base_salary REAL NOT NULL DEFAULT 0,
      labor_commission REAL NOT NULL DEFAULT 0,
      additional_incentives REAL NOT NULL DEFAULT 0,
      deductions REAL NOT NULL DEFAULT 0,
      gross_pay REAL NOT NULL DEFAULT 0,
      net_pay REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      payment_date TEXT,
      payment_method TEXT NOT NULL DEFAULT '',
      processed_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(mechanic_id, period_start, period_end),
      FOREIGN KEY(mechanic_id) REFERENCES users(id),
      FOREIGN KEY(processed_by) REFERENCES users(id)
    );
  `);

  const payrollRunColumns = new Set((database.prepare("PRAGMA table_info(payroll_runs)").all() as Array<{ name: string }>).map((column) => column.name));
  const addPayrollRunColumn = (name: string, definition: string) => {
    if (!payrollRunColumns.has(name)) database.prepare(`ALTER TABLE payroll_runs ADD COLUMN ${name} ${definition}`).run();
  };
  addPayrollRunColumn("required_hours", "REAL NOT NULL DEFAULT 0");
  addPayrollRunColumn("expected_hours", "REAL NOT NULL DEFAULT 0");
  addPayrollRunColumn("credited_hours", "REAL NOT NULL DEFAULT 0");
  addPayrollRunColumn("hour_deficit", "REAL NOT NULL DEFAULT 0");
  addPayrollRunColumn("attendance_completion", "REAL NOT NULL DEFAULT 0");
  addPayrollRunColumn("hourly_equivalent_rate", "REAL NOT NULL DEFAULT 0");
  addPayrollRunColumn("holiday_paid_hours", "REAL NOT NULL DEFAULT 0");
  addPayrollRunColumn("cutoff_id", "INTEGER");
  addPayrollRunColumn("branch_id", "INTEGER");
  addPayrollRunColumn("approved_by", "INTEGER");
  addPayrollRunColumn("approved_at", "TEXT");
  addPayrollRunColumn("paid_by", "INTEGER");
  addPayrollRunColumn("voided_by", "INTEGER");
  addPayrollRunColumn("voided_at", "TEXT");
  addPayrollRunColumn("status_reason", "TEXT NOT NULL DEFAULT ''");
  addPayrollRunColumn("locked_at", "TEXT");
  addPayrollRunColumn("attendance_snapshot_json", "TEXT NOT NULL DEFAULT '[]'");
  addPayrollRunColumn("payroll_settings_snapshot_json", "TEXT NOT NULL DEFAULT '{}'");
  addPayrollRunColumn("mechanic_rate_snapshot_json", "TEXT NOT NULL DEFAULT '{}'");
  addPayrollRunColumn("commission_snapshot_json", "TEXT NOT NULL DEFAULT '{}'");
  addPayrollRunColumn("adjustments_snapshot_json", "TEXT NOT NULL DEFAULT '[]'");
  addPayrollRunColumn("cash_advance_snapshot_json", "TEXT NOT NULL DEFAULT '[]'");
  addPayrollRunColumn("computed_totals_snapshot_json", "TEXT NOT NULL DEFAULT '{}'");
  const jobColumns = new Set((database.prepare("PRAGMA table_info(job_orders)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!jobColumns.has("branch_id")) database.prepare("ALTER TABLE job_orders ADD COLUMN branch_id INTEGER").run();
  const attendanceColumns = new Set((database.prepare("PRAGMA table_info(mechanic_attendance)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!attendanceColumns.has("branch_id")) database.prepare("ALTER TABLE mechanic_attendance ADD COLUMN branch_id INTEGER").run();
  database.prepare("UPDATE payroll_runs SET status = 'Draft' WHERE status = 'Pending'").run();
  database.prepare("UPDATE payroll_runs SET locked_at = COALESCE(locked_at, updated_at, payment_date, ?) WHERE status IN ('Approved','Paid')").run(now());
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_branch ON job_orders(branch_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_branch ON mechanic_attendance(branch_id);
    CREATE INDEX IF NOT EXISTS idx_job_payroll_allocations_job ON job_payroll_allocations(job_order_id);
    CREATE INDEX IF NOT EXISTS idx_job_payroll_allocations_mechanic ON job_payroll_allocations(mechanic_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_cutoffs_period ON payroll_cutoffs(period_start, period_end);
    CREATE INDEX IF NOT EXISTS idx_payroll_cutoffs_branch_period ON payroll_cutoffs(branch_id, period_start, period_end);
    CREATE INDEX IF NOT EXISTS idx_payroll_cutoffs_status ON payroll_cutoffs(status);
    CREATE INDEX IF NOT EXISTS idx_payroll_runs_cutoff ON payroll_runs(cutoff_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_mechanic_cutoff_active
      ON payroll_runs(mechanic_id, cutoff_id)
      WHERE cutoff_id IS NOT NULL AND status NOT IN ('Cancelled','Void');
  `);

  const payrollSettings = database.prepare("SELECT id FROM payroll_settings WHERE id = 1").get();
  if (!payrollSettings) {
    database.prepare("INSERT INTO payroll_settings (id, updated_at) VALUES (1, ?)").run(now());
  }
  database.prepare(`
    INSERT OR IGNORE INTO branches (name, code, status, created_at, updated_at)
    VALUES ('Main Branch', 'MAIN', 'Active', ?, ?)
  `).run(now(), now());
  const defaultBranch = database.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get() as { id: number } | undefined;
  if (defaultBranch) {
    database.prepare("UPDATE users SET branch_id = COALESCE(branch_id, ?)").run(defaultBranch.id);
    database.prepare("UPDATE job_orders SET branch_id = COALESCE(branch_id, ?)").run(defaultBranch.id);
    database.prepare("UPDATE mechanic_attendance SET branch_id = COALESCE(branch_id, ?)").run(defaultBranch.id);
    database.prepare("UPDATE payroll_cutoffs SET branch_id = COALESCE(branch_id, ?)").run(defaultBranch.id);
    database.prepare("UPDATE payroll_runs SET branch_id = COALESCE(branch_id, ?)").run(defaultBranch.id);
  }
  const permissionInsert = database.prepare("INSERT OR IGNORE INTO payroll_permissions (role_name, permission_key, enabled, updated_at) VALUES (?, ?, ?, ?)");
  const permissions = ["generate_payroll", "review_payroll", "approve_payroll", "release_payroll", "view_payroll_reports", "manage_payroll_settings"];
  const roles = ["Owner", "Payroll Encoder", "Manager", "Accountant", "Cashier", "Viewer"];
  for (const role of roles) {
    for (const permission of permissions) {
      const enabled = role === "Owner"
        || (role === "Payroll Encoder" && permission === "generate_payroll")
        || (role === "Manager" && ["review_payroll", "approve_payroll", "view_payroll_reports"].includes(permission))
        || (role === "Accountant" && ["release_payroll", "view_payroll_reports"].includes(permission))
        || (role === "Viewer" && permission === "view_payroll_reports")
        ? 1 : 0;
      permissionInsert.run(role, permission, enabled, now());
    }
  }

  const mechanics = database.prepare("SELECT id FROM users WHERE is_mechanic = 1").all() as Array<{ id: number }>;
  const update = database.prepare("UPDATE users SET mechanic_code = COALESCE(mechanic_code, ?), qr_code = COALESCE(qr_code, ?) WHERE id = ?");
  for (const mechanic of mechanics) {
    const code = mechanicCode(mechanic.id);
    update.run(code, code, mechanic.id);
  }
  database.prepare(`
    INSERT OR IGNORE INTO job_payroll_allocations (
      job_order_id, mechanic_id, allocation_role, allocation_type, percentage, fixed_amount, is_lead, created_at, updated_at
    )
    SELECT id, mechanic_id, 'Lead', 'Percent', 100, 0, 1, COALESCE(created_at, ?), COALESCE(created_at, ?)
    FROM job_orders
    WHERE mechanic_id IS NOT NULL
  `).run(now(), now());
}

function ensurePaymentMethods(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('Cash','Online Payment')),
      payment_category TEXT NOT NULL DEFAULT 'Manual',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const columns = new Set((database.prepare("PRAGMA table_info(payment_methods)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("payment_category")) database.prepare("ALTER TABLE payment_methods ADD COLUMN payment_category TEXT NOT NULL DEFAULT 'Manual'").run();

  const insertDefault = database.prepare(`
    INSERT OR IGNORE INTO payment_methods (name, type, payment_category, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Active', ?, ?)
  `);
  const createdAt = now();
  insertDefault.run("Cash", "Cash", "Manual", "Cash payment at counter", createdAt, createdAt);
  insertDefault.run("Online Payment", "Online Payment", "Digital", "Online wallet or bank transfer", createdAt, createdAt);
  database.prepare("UPDATE payment_methods SET payment_category = 'Manual' WHERE lower(name) = 'cash'").run();
  database.prepare(`
    UPDATE payment_methods
    SET payment_category = 'Digital'
    WHERE lower(name) IN ('online payment', 'gcash', 'maya', 'bank transfer')
  `).run();
}

function ensureInventoryStructure(database: Database.Database) {
  const columns = new Set((database.prepare("PRAGMA table_info(inventory)").all() as Array<{ name: string }>).map((column) => column.name));
  const addColumn = (name: string, definition: string) => {
    if (!columns.has(name)) database.prepare(`ALTER TABLE inventory ADD COLUMN ${name} ${definition}`).run();
  };
  addColumn("sku", "TEXT");
  addColumn("product_code", "TEXT");
  addColumn("category_id", "INTEGER");
  addColumn("supplier_id", "INTEGER");
  addColumn("stock", "INTEGER NOT NULL DEFAULT 0");
  addColumn("reorder_level", "INTEGER NOT NULL DEFAULT 5");
  addColumn("unit_cost", "REAL NOT NULL DEFAULT 0");
  addColumn("sell_price", "REAL NOT NULL DEFAULT 0");
  database.exec(`
    CREATE TABLE IF NOT EXISTS inventory_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      actor_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('Stock In','Adjustment')),
      quantity INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      supplier_id INTEGER,
      reference_no TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(item_id) REFERENCES inventory(id),
      FOREIGN KEY(actor_id) REFERENCES users(id),
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    );
  `);

  const defaults = [
    { name: "Engine", code: "ENG" },
    { name: "Brakes", code: "BRK" },
    { name: "Fluids", code: "FLD" },
    { name: "Ignition", code: "IGN" },
    { name: "Drivetrain", code: "DRV" }
  ];
  const insertCategory = database.prepare("INSERT OR IGNORE INTO inventory_categories (name, code, created_at) VALUES (?, ?, ?)");
  for (const category of defaults) insertCategory.run(category.name, category.code, now());

  const legacyCategories = database.prepare("SELECT DISTINCT category FROM inventory WHERE TRIM(category) <> ''").all() as Array<{ category: string }>;
  for (const row of legacyCategories) {
    const name = row.category.trim();
    const code = categoryCodeFromName(name);
    insertCategory.run(name, code, now());
  }

  database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_code ON inventory(product_code)").run();
  database.exec(`
    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      actor_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('Stock In','Adjustment')),
      quantity INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      supplier_id INTEGER,
      reference_no TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(item_id) REFERENCES inventory(id),
      FOREIGN KEY(actor_id) REFERENCES users(id),
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    );
  `);
  const items = database.prepare("SELECT id, category, product_code FROM inventory").all() as Array<{ id: number; category: string; product_code?: string }>;
  const categoryByName = database.prepare("SELECT id, code FROM inventory_categories WHERE lower(name) = lower(?)");
  const updateItem = database.prepare("UPDATE inventory SET category_id = ?, product_code = ? WHERE id = ?");
  for (const item of items) {
    const category = categoryByName.get(item.category || "Engine") as { id: number; code: string } | undefined;
    if (!category) continue;
    const needsCode = !item.product_code || !item.product_code.startsWith(`${category.code}-`);
    updateItem.run(category.id, needsCode ? nextProductCode(database, category.id) : item.product_code, item.id);
  }
}

function ensureUserColumns(database: Database.Database) {
  const columns = new Set((database.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((column) => column.name));
  const addColumn = (name: string, definition: string) => {
    if (!columns.has(name)) database.prepare(`ALTER TABLE users ADD COLUMN ${name} ${definition}`).run();
  };

  addColumn("username", "TEXT");
  addColumn("password_hash", "TEXT");
  addColumn("contact_number", "TEXT NOT NULL DEFAULT ''");
  addColumn("address", "TEXT NOT NULL DEFAULT ''");
  addColumn("email", "TEXT NOT NULL DEFAULT ''");
  addColumn("must_change_password", "INTEGER NOT NULL DEFAULT 0");
  addColumn("created_by", "INTEGER");
  addColumn("created_at", "TEXT");
  addColumn("is_mechanic", "INTEGER NOT NULL DEFAULT 0");

  const users = database.prepare("SELECT id, name, pin, username, password_hash FROM users").all() as Array<{
    id: number;
    name: string;
    pin: string;
    username?: string | null;
    password_hash?: string | null;
  }>;
  const update = database.prepare(`
    UPDATE users
    SET username = ?, password_hash = ?, created_at = COALESCE(created_at, ?)
    WHERE id = ?
  `);

  for (const user of users) {
    const fallbackUsername = user.name.toLowerCase().split(/\s+/)[1] ?? user.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    update.run(user.username || fallbackUsername, user.password_hash || hashPassword(user.pin || "password"), now(), user.id);
  }

  database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)").run();
  database.prepare("UPDATE users SET status = 'Disabled' WHERE status = 'Inactive'").run();
  database.prepare("UPDATE users SET is_mechanic = 1 WHERE lower(name) LIKE '%mechanic%'").run();
  database.prepare("UPDATE users SET role = 'Cashier' WHERE is_mechanic = 1 AND role IN ('Owner', 'Admin')").run();
}

function ensureServiceColumns(database: Database.Database) {
  const columns = new Set((database.prepare("PRAGMA table_info(services)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("labor_cost")) database.prepare("ALTER TABLE services ADD COLUMN labor_cost REAL NOT NULL DEFAULT 0").run();
}

function ensureJobOrderColumns(database: Database.Database) {
  const columns = new Set((database.prepare("PRAGMA table_info(job_orders)").all() as Array<{ name: string }>).map((column) => column.name));
  const addColumn = (name: string, definition: string) => {
    if (!columns.has(name)) database.prepare(`ALTER TABLE job_orders ADD COLUMN ${name} ${definition}`).run();
  };

  addColumn("customer_name", "TEXT NOT NULL DEFAULT ''");
  addColumn("contact_number", "TEXT NOT NULL DEFAULT ''");
  addColumn("motorcycle_type", "TEXT NOT NULL DEFAULT ''");
  addColumn("plate_number", "TEXT NOT NULL DEFAULT ''");
  addColumn("service_id", "INTEGER");
  addColumn("service_price", "REAL NOT NULL DEFAULT 0");
  addColumn("labor_cost", "REAL NOT NULL DEFAULT 0");
  addColumn("additional_labor_cost", "REAL NOT NULL DEFAULT 0");
  addColumn("service_cost", "REAL NOT NULL DEFAULT 0");
  addColumn("products_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("products_cost", "REAL NOT NULL DEFAULT 0");
  addColumn("total_amount", "REAL NOT NULL DEFAULT 0");
  addColumn("payment_method", "TEXT NOT NULL DEFAULT ''");
  addColumn("payment_category", "TEXT NOT NULL DEFAULT 'Manual'");
  addColumn("payment_reference_code", "TEXT NOT NULL DEFAULT ''");
  addColumn("paid_at", "TEXT");
  database.prepare("UPDATE job_orders SET service_price = service_cost WHERE service_price = 0 AND service_cost > 0").run();
  database.prepare(`
    UPDATE job_orders
    SET service_price = COALESCE((SELECT price FROM services WHERE services.id = job_orders.service_id), service_price),
        labor_cost = COALESCE((SELECT labor_cost FROM services WHERE services.id = job_orders.service_id), labor_cost)
    WHERE service_id IS NOT NULL
      AND paid_at IS NULL
  `).run();
  database.prepare("UPDATE job_orders SET service_cost = service_price + labor_cost + additional_labor_cost WHERE paid_at IS NULL").run();
  database.prepare("UPDATE job_orders SET total_amount = service_cost + products_cost WHERE total_amount = 0 OR paid_at IS NULL").run();
  database.prepare("UPDATE job_orders SET status = 'Completed' WHERE status IN ('Released', 'Ready')").run();
}

function ensureSaleColumns(database: Database.Database) {
  const columns = new Set((database.prepare("PRAGMA table_info(sales)").all() as Array<{ name: string }>).map((column) => column.name));
  const addColumn = (name: string, definition: string) => {
    if (!columns.has(name)) database.prepare(`ALTER TABLE sales ADD COLUMN ${name} ${definition}`).run();
  };

  addColumn("payment_category", "TEXT NOT NULL DEFAULT 'Manual'");
  addColumn("payment_reference_code", "TEXT NOT NULL DEFAULT ''");
  addColumn("status", "TEXT NOT NULL DEFAULT 'Completed'");
  addColumn("voided_at", "TEXT");
  addColumn("voided_by", "INTEGER");
  addColumn("void_approved_by", "INTEGER");
  addColumn("void_reason", "TEXT NOT NULL DEFAULT ''");
}

function ensureReceiptSettings(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS receipt_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      system_name TEXT NOT NULL DEFAULT 'TalyerPOS',
      logo_data_url TEXT NOT NULL DEFAULT '',
      receipt_logo_data_url TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL,
      address TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      contact_number TEXT NOT NULL,
      tax_id TEXT NOT NULL,
      footer_message TEXT NOT NULL,
      show_tax_id INTEGER NOT NULL DEFAULT 1,
      show_cashier INTEGER NOT NULL DEFAULT 1,
      paper_width INTEGER NOT NULL DEFAULT 58,
      receipt_template TEXT NOT NULL DEFAULT 'Detailed',
      show_labor_breakdown INTEGER NOT NULL DEFAULT 1,
      custom_header TEXT NOT NULL DEFAULT '',
      custom_footer TEXT NOT NULL DEFAULT '',
      logo_size TEXT NOT NULL DEFAULT 'Medium',
      receipt_output_mode TEXT NOT NULL DEFAULT 'PDF',
      receipt_printer_name TEXT NOT NULL DEFAULT ''
    );
  `);
  const columns = new Set((database.prepare("PRAGMA table_info(receipt_settings)").all() as Array<{ name: string }>).map((column) => column.name));
  const addColumn = (name: string, definition: string) => {
    if (!columns.has(name)) database.prepare(`ALTER TABLE receipt_settings ADD COLUMN ${name} ${definition}`).run();
  };
  addColumn("system_name", "TEXT NOT NULL DEFAULT 'TalyerPOS'");
  addColumn("logo_data_url", "TEXT NOT NULL DEFAULT ''");
  addColumn("receipt_logo_data_url", "TEXT NOT NULL DEFAULT ''");
  addColumn("email", "TEXT NOT NULL DEFAULT ''");
  addColumn("receipt_template", "TEXT NOT NULL DEFAULT 'Detailed'");
  addColumn("show_labor_breakdown", "INTEGER NOT NULL DEFAULT 1");
  addColumn("custom_header", "TEXT NOT NULL DEFAULT ''");
  addColumn("custom_footer", "TEXT NOT NULL DEFAULT ''");
  addColumn("logo_size", "TEXT NOT NULL DEFAULT 'Medium'");
  addColumn("receipt_output_mode", "TEXT NOT NULL DEFAULT 'PDF'");
  addColumn("receipt_printer_name", "TEXT NOT NULL DEFAULT ''");

  const existing = database.prepare("SELECT id FROM receipt_settings WHERE id = 1").get();
  if (!existing) {
    database.prepare(`
      INSERT INTO receipt_settings (id, system_name, logo_data_url, receipt_logo_data_url, business_name, address, email, contact_number, tax_id, footer_message, show_tax_id, show_cashier, paper_width, receipt_template, show_labor_breakdown, custom_header, custom_footer, logo_size, receipt_output_mode, receipt_printer_name)
      VALUES (1, 'TalyerPOS', '', '', 'TalyerPOS Motorcycle Repair Shop', 'Main Branch', 'support@talyerpos.local', '09170000000', 'TIN: 000-000-000-000', 'Thank you. Ride safe!', 1, 1, 58, 'Detailed', 1, '', '', 'Medium', 'PDF', '')
    `).run();
  }
}

function resetSystemSettingsToDefaults(database: Database.Database, timestamp = now()) {
  database.prepare(`
    UPDATE receipt_settings
    SET system_name = 'TalyerPOS',
        logo_data_url = '',
        receipt_logo_data_url = '',
        business_name = 'TalyerPOS',
        address = 'Main Branch',
        email = 'support@talyerpos.local',
        contact_number = '09170000000',
        tax_id = 'TIN: 000-000-000-000',
        footer_message = 'Thank you. Ride safe!',
        show_tax_id = 1,
        show_cashier = 1,
        paper_width = 58,
        receipt_template = 'Detailed',
        show_labor_breakdown = 1,
        custom_header = '',
        custom_footer = '',
        logo_size = 'Medium',
        receipt_output_mode = 'PDF',
        receipt_printer_name = ''
    WHERE id = 1
  `).run();
  database.prepare(`
    UPDATE super_admin_settings
    SET trial_enabled = 0,
        trial_started_at = ?,
        trial_days = 30,
        license_key = '',
        license_status = 'Activated',
        last_backup_at = '',
        backup_schedule = 'Disabled',
        updated_at = ?
    WHERE id = 1
  `).run(timestamp, timestamp);
}

function seed(database: Database.Database) {
  const userCount = database.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (userCount.count > 0) return;

  const insertUser = database.prepare(`
    INSERT INTO users (name, role, pin, username, password_hash, contact_number, address, email, must_change_password, status, created_at, is_mechanic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run("Jestmund Owner", "Owner", "0000", "owner", hashPassword("0000"), "0917 000 0000", "Main branch", "owner@talyerpos.local", 0, "Active", now(), 0);
  insertUser.run("Mika Admin", "Admin", "1111", "admin", hashPassword("1111"), "0917 111 1111", "Main branch", "admin@talyerpos.local", 0, "Active", now(), 0);
  insertUser.run("Rico Cashier", "Cashier", "2222", "cashier", hashPassword("2222"), "0917 222 2222", "Main branch", "cashier@talyerpos.local", 0, "Active", now(), 0);
  insertUser.run("Ben Mechanic", "Admin", "3333", "mechanic", hashPassword("3333"), "0917 333 3333", "Service bay", "", 0, "Active", now(), 1);

  const insertCustomer = database.prepare("INSERT INTO customers (name, phone, email, address, created_at) VALUES (?, ?, ?, ?, ?)");
  insertCustomer.run("Carlo Reyes", "0917 555 1201", "carlo@example.com", "Mandaluyong City", now());
  insertCustomer.run("Ana Santos", "0920 882 4410", "ana@example.com", "Quezon City", now());
  insertCustomer.run("Miguel Cruz", "0998 330 8822", "", "Pasig City", now());

  const insertSupplier = database.prepare("INSERT INTO suppliers (name, contact, phone, category) VALUES (?, ?, ?, ?)");
  insertSupplier.run("MotoParts PH", "Leah Tan", "02 8812 4400", "Engine parts");
  insertSupplier.run("RideSafe Supply", "Nico Lim", "02 7742 1188", "Safety and fluids");

  const insertService = database.prepare("INSERT INTO services (name, category, price, labor_cost, duration_minutes) VALUES (?, ?, ?, ?, ?)");
  insertService.run("Oil Change", "Maintenance", 450, 150, 30);
  insertService.run("Brake Cleaning", "Maintenance", 650, 200, 45);
  insertService.run("Engine Tune-up", "Repair", 1800, 700, 120);
  insertService.run("Electrical Diagnosis", "Diagnostics", 900, 350, 60);

  const insertInventory = database.prepare(`
    INSERT INTO inventory (sku, product_code, category_id, name, category, supplier_id, stock, reorder_level, unit_cost, sell_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const categoryId = (name: string) => (database.prepare("SELECT id FROM inventory_categories WHERE name = ?").get(name) as { id: number }).id;
  insertInventory.run("FLD-001", "FLD-001", categoryId("Fluids"), "10W-40 Engine Oil", "Fluids", 2, 24, 8, 220, 320);
  insertInventory.run("BRK-001", "BRK-001", categoryId("Brakes"), "Brake Pad Set 125cc", "Brakes", 1, 9, 6, 280, 480);
  insertInventory.run("IGN-001", "IGN-001", categoryId("Ignition"), "NGK Spark Plug", "Ignition", 1, 36, 12, 85, 150);
  insertInventory.run("DRV-001", "DRV-001", categoryId("Drivetrain"), "428 Drive Chain", "Drivetrain", 1, 5, 4, 680, 980);

  const insertMotorcycle = database.prepare("INSERT INTO motorcycles (customer_id, plate_no, brand, model, year, color) VALUES (?, ?, ?, ?, ?, ?)");
  insertMotorcycle.run(1, "NAB 4821", "Honda", "Click 125i", 2021, "Matte Black");
  insertMotorcycle.run(2, "MTR 9012", "Yamaha", "Mio Sporty", 2020, "Red");
  insertMotorcycle.run(3, "KZX 7741", "Kawasaki", "Rouser 200NS", 2019, "Blue");

  const insertJob = database.prepare(`
    INSERT INTO job_orders (job_no, customer_id, motorcycle_id, mechanic_id, status, concern, estimate, created_at, due_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertJob.run("JO-1001", 1, 1, 4, "In Progress", "Hard starting and rough idle", 2150, now(), "2026-05-06T10:00:00.000Z");
  insertJob.run("JO-1002", 2, 2, 4, "Completed", "Brake noise during low-speed turns", 780, now(), "2026-05-05T16:00:00.000Z");

  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    1,
    "Seeded",
    "System",
    "Initial local database created",
    now()
  );
}

export function listAll() {
  const database = getDatabase();
  return {
    users: database.prepare(`
      SELECT users.id, users.name, users.role, users.username, users.contact_number, users.address, users.email, users.is_mechanic, users.branch_id,
             users.mechanic_code, users.qr_code, users.payroll_type, users.salary_rate, users.compensation_type, users.labor_commission_percentage,
             users.must_change_password, users.status, users.created_at, creators.name as created_by_name
      FROM users
      LEFT JOIN users creators ON creators.id = users.created_by
      ORDER BY users.id
    `).all(),
    branches: database.prepare("SELECT * FROM branches ORDER BY status, name").all(),
    payrollPermissions: database.prepare("SELECT * FROM payroll_permissions ORDER BY role_name, permission_key").all(),
    jobPayrollAllocations: database.prepare(`
      SELECT job_payroll_allocations.*, users.name as mechanic_name, users.mechanic_code
      FROM job_payroll_allocations
      JOIN users ON users.id = job_payroll_allocations.mechanic_id
      ORDER BY job_payroll_allocations.job_order_id, job_payroll_allocations.is_lead DESC, job_payroll_allocations.id
    `).all(),
    customers: database.prepare("SELECT * FROM customers ORDER BY id DESC").all(),
    motorcycles: database.prepare(`
      SELECT motorcycles.*, customers.name as customer_name
      FROM motorcycles
      JOIN customers ON customers.id = motorcycles.customer_id
      ORDER BY motorcycles.id DESC
    `).all(),
    suppliers: database.prepare("SELECT * FROM suppliers ORDER BY id DESC").all(),
    purchaseOrders: database.prepare(`
      SELECT purchase_orders.*, suppliers.name as supplier_name, users.name as created_by_name
      FROM purchase_orders
      LEFT JOIN suppliers ON suppliers.id = purchase_orders.supplier_id
      LEFT JOIN users ON users.id = purchase_orders.created_by
      ORDER BY purchase_orders.id DESC
    `).all(),
    purchaseOrderItems: database.prepare(`
      SELECT purchase_order_items.*, inventory.product_code, inventory.name as item_name
      FROM purchase_order_items
      JOIN inventory ON inventory.id = purchase_order_items.item_id
      ORDER BY purchase_order_items.id
    `).all(),
    inventoryCategories: database.prepare("SELECT * FROM inventory_categories ORDER BY name").all(),
    services: database.prepare("SELECT * FROM services ORDER BY id DESC").all(),
    inventory: database.prepare(`
      SELECT inventory.*, inventory.product_code as product_code, inventory_categories.name as category_name,
             inventory_categories.code as category_code, suppliers.name as supplier_name
      FROM inventory
      LEFT JOIN inventory_categories ON inventory_categories.id = inventory.category_id
      LEFT JOIN suppliers ON suppliers.id = inventory.supplier_id
      ORDER BY inventory.name
    `).all(),
    inventoryAdjustments: database.prepare(`
      SELECT inventory_adjustments.*, inventory.product_code, inventory.name as item_name, users.name as actor_name, suppliers.name as supplier_name
      FROM inventory_adjustments
      JOIN inventory ON inventory.id = inventory_adjustments.item_id
      JOIN users ON users.id = inventory_adjustments.actor_id
      LEFT JOIN suppliers ON suppliers.id = inventory_adjustments.supplier_id
      ORDER BY inventory_adjustments.id DESC
    `).all(),
    jobOrders: database.prepare(`
      SELECT job_orders.*,
             COALESCE(NULLIF(job_orders.customer_name, ''), customers.name) as customer_name,
             COALESCE(NULLIF(job_orders.contact_number, ''), customers.phone) as contact_number,
             COALESCE(NULLIF(job_orders.plate_number, ''), motorcycles.plate_no) as plate_no,
             COALESCE(NULLIF(job_orders.motorcycle_type, ''), motorcycles.brand || ' ' || motorcycles.model) as motorcycle_type,
             motorcycles.brand,
             motorcycles.model,
             users.name as mechanic_name,
             services.name as service_name,
             services.price as selected_service_price
      FROM job_orders
      LEFT JOIN customers ON customers.id = job_orders.customer_id
      LEFT JOIN motorcycles ON motorcycles.id = job_orders.motorcycle_id
      LEFT JOIN users ON users.id = job_orders.mechanic_id
      LEFT JOIN services ON services.id = job_orders.service_id
      ORDER BY job_orders.id DESC
    `).all(),
    jobStatusHistory: database.prepare(`
      SELECT job_status_history.*, users.name as actor_name
      FROM job_status_history
      LEFT JOIN users ON users.id = job_status_history.actor_id
      ORDER BY job_status_history.created_at, job_status_history.id
    `).all(),
    sales: database.prepare(`
      SELECT sales.*, users.name as cashier_name, customers.name as customer_name
      FROM sales
      JOIN users ON users.id = sales.cashier_id
      LEFT JOIN customers ON customers.id = sales.customer_id
      ORDER BY sales.id DESC
    `).all(),
    saleItems: database.prepare(`
      SELECT sale_items.*
      FROM sale_items
      JOIN sales ON sales.id = sale_items.sale_id
      ORDER BY sale_items.id
    `).all(),
    paymentMethods: database.prepare("SELECT * FROM payment_methods ORDER BY status, name").all(),
    expenses: database.prepare(`
      SELECT expenses.*, users.name as recorded_by_name
      FROM expenses
      LEFT JOIN users ON users.id = expenses.recorded_by
      ORDER BY expenses.expense_date DESC, expenses.id DESC
    `).all(),
    auditLogs: database.prepare(`
      SELECT audit_logs.*, users.name as user_name
      FROM audit_logs
      LEFT JOIN users ON users.id = audit_logs.user_id
      ORDER BY audit_logs.id DESC
      LIMIT 100
    `).all(),
    mechanicAttendance: database.prepare(`
      SELECT mechanic_attendance.*, users.name as mechanic_name, users.mechanic_code
      FROM mechanic_attendance
      JOIN users ON users.id = mechanic_attendance.mechanic_id
      ORDER BY mechanic_attendance.attendance_date DESC, mechanic_attendance.id DESC
    `).all(),
    payrollRuns: database.prepare(`
      SELECT payroll_runs.*, users.name as mechanic_name, users.mechanic_code, processors.name as processed_by_name,
             approvers.name as approved_by_name, payers.name as paid_by_name, payroll_cutoffs.name as cutoff_name,
             payroll_cutoffs.pay_date as cutoff_pay_date
      FROM payroll_runs
      JOIN users ON users.id = payroll_runs.mechanic_id
      LEFT JOIN users processors ON processors.id = payroll_runs.processed_by
      LEFT JOIN users approvers ON approvers.id = payroll_runs.approved_by
      LEFT JOIN users payers ON payers.id = payroll_runs.paid_by
      LEFT JOIN payroll_cutoffs ON payroll_cutoffs.id = payroll_runs.cutoff_id
      ORDER BY payroll_runs.period_start DESC, payroll_runs.id DESC
    `).all(),
    payrollCutoffs: database.prepare("SELECT * FROM payroll_cutoffs ORDER BY period_start DESC, id DESC").all(),
    payrollSettings: database.prepare("SELECT * FROM payroll_settings WHERE id = 1").get(),
    receiptSettings: database.prepare("SELECT * FROM receipt_settings WHERE id = 1").get(),
    superAdminSettings: getSuperAdminSettings(database)
  };
}

export type DataScope = "all" | "core" | "sales" | "inventory" | "jobs" | "customers" | "payroll" | "reports" | "settings" | "users" | "staff" | "suppliers" | "purchases" | "audit";

export function listDataScope(scope: DataScope) {
  if (scope === "all") return listAll();
  const database = getDatabase();

  const users = () => database.prepare(`
    SELECT users.id, users.name, users.role, users.username, users.contact_number, users.address, users.email, users.is_mechanic, users.branch_id,
           users.mechanic_code, users.qr_code, users.payroll_type, users.salary_rate, users.compensation_type, users.labor_commission_percentage,
           users.must_change_password, users.status, users.created_at, creators.name as created_by_name
    FROM users
    LEFT JOIN users creators ON creators.id = users.created_by
    ORDER BY users.id
  `).all();
  const customers = () => database.prepare("SELECT * FROM customers ORDER BY id DESC").all();
  const motorcycles = () => database.prepare(`
    SELECT motorcycles.*, customers.name as customer_name
    FROM motorcycles
    JOIN customers ON customers.id = motorcycles.customer_id
    ORDER BY motorcycles.id DESC
  `).all();
  const suppliers = () => database.prepare("SELECT * FROM suppliers ORDER BY id DESC").all();
  const purchaseOrders = () => database.prepare(`
    SELECT purchase_orders.*, suppliers.name as supplier_name, users.name as created_by_name
    FROM purchase_orders
    LEFT JOIN suppliers ON suppliers.id = purchase_orders.supplier_id
    LEFT JOIN users ON users.id = purchase_orders.created_by
    ORDER BY purchase_orders.id DESC
  `).all();
  const purchaseOrderItems = () => database.prepare(`
    SELECT purchase_order_items.*, inventory.product_code, inventory.name as item_name
    FROM purchase_order_items
    JOIN inventory ON inventory.id = purchase_order_items.item_id
    ORDER BY purchase_order_items.id
  `).all();
  const inventoryCategories = () => database.prepare("SELECT * FROM inventory_categories ORDER BY name").all();
  const services = () => database.prepare("SELECT * FROM services ORDER BY id DESC").all();
  const inventory = () => database.prepare(`
    SELECT inventory.*, inventory.product_code as product_code, inventory_categories.name as category_name,
           inventory_categories.code as category_code, suppliers.name as supplier_name
    FROM inventory
    LEFT JOIN inventory_categories ON inventory_categories.id = inventory.category_id
    LEFT JOIN suppliers ON suppliers.id = inventory.supplier_id
    ORDER BY inventory.name
  `).all();
  const inventoryAdjustments = () => database.prepare(`
    SELECT inventory_adjustments.*, inventory.product_code, inventory.name as item_name, users.name as actor_name, suppliers.name as supplier_name
    FROM inventory_adjustments
    JOIN inventory ON inventory.id = inventory_adjustments.item_id
    JOIN users ON users.id = inventory_adjustments.actor_id
    LEFT JOIN suppliers ON suppliers.id = inventory_adjustments.supplier_id
    ORDER BY inventory_adjustments.id DESC
  `).all();
  const jobOrders = () => database.prepare(`
    SELECT job_orders.*,
           COALESCE(NULLIF(job_orders.customer_name, ''), customers.name) as customer_name,
           COALESCE(NULLIF(job_orders.contact_number, ''), customers.phone) as contact_number,
           COALESCE(NULLIF(job_orders.plate_number, ''), motorcycles.plate_no) as plate_no,
           COALESCE(NULLIF(job_orders.motorcycle_type, ''), motorcycles.brand || ' ' || motorcycles.model) as motorcycle_type,
           motorcycles.brand,
           motorcycles.model,
           users.name as mechanic_name,
           services.name as service_name,
           services.price as selected_service_price
    FROM job_orders
    LEFT JOIN customers ON customers.id = job_orders.customer_id
    LEFT JOIN motorcycles ON motorcycles.id = job_orders.motorcycle_id
    LEFT JOIN users ON users.id = job_orders.mechanic_id
    LEFT JOIN services ON services.id = job_orders.service_id
    ORDER BY job_orders.id DESC
  `).all();
  const jobStatusHistory = () => database.prepare(`
    SELECT job_status_history.*, users.name as actor_name
    FROM job_status_history
    LEFT JOIN users ON users.id = job_status_history.actor_id
    ORDER BY job_status_history.created_at, job_status_history.id
  `).all();
  const sales = () => database.prepare(`
    SELECT sales.*, users.name as cashier_name, customers.name as customer_name
    FROM sales
    JOIN users ON users.id = sales.cashier_id
    LEFT JOIN customers ON customers.id = sales.customer_id
    ORDER BY sales.id DESC
  `).all();
  const saleItems = () => database.prepare(`
    SELECT sale_items.*
    FROM sale_items
    JOIN sales ON sales.id = sale_items.sale_id
    ORDER BY sale_items.id
  `).all();
  const paymentMethods = () => database.prepare("SELECT * FROM payment_methods ORDER BY status, name").all();
  const expenses = () => database.prepare(`
    SELECT expenses.*, users.name as recorded_by_name
    FROM expenses
    LEFT JOIN users ON users.id = expenses.recorded_by
    ORDER BY expenses.expense_date DESC, expenses.id DESC
  `).all();
  const auditLogs = () => database.prepare(`
    SELECT audit_logs.*, users.name as user_name
    FROM audit_logs
    LEFT JOIN users ON users.id = audit_logs.user_id
    ORDER BY audit_logs.id DESC
    LIMIT 100
  `).all();
  const mechanicAttendance = () => database.prepare(`
    SELECT mechanic_attendance.*, users.name as mechanic_name, users.mechanic_code
    FROM mechanic_attendance
    JOIN users ON users.id = mechanic_attendance.mechanic_id
    ORDER BY mechanic_attendance.attendance_date DESC, mechanic_attendance.id DESC
  `).all();
  const payrollRuns = () => database.prepare(`
    SELECT payroll_runs.*, users.name as mechanic_name, users.mechanic_code, processors.name as processed_by_name,
           approvers.name as approved_by_name, payers.name as paid_by_name, payroll_cutoffs.name as cutoff_name,
           payroll_cutoffs.pay_date as cutoff_pay_date
    FROM payroll_runs
    JOIN users ON users.id = payroll_runs.mechanic_id
    LEFT JOIN users processors ON processors.id = payroll_runs.processed_by
    LEFT JOIN users approvers ON approvers.id = payroll_runs.approved_by
    LEFT JOIN users payers ON payers.id = payroll_runs.paid_by
    LEFT JOIN payroll_cutoffs ON payroll_cutoffs.id = payroll_runs.cutoff_id
    ORDER BY payroll_runs.period_start DESC, payroll_runs.id DESC
  `).all();
  const payrollCutoffs = () => database.prepare("SELECT * FROM payroll_cutoffs ORDER BY period_start DESC, id DESC").all();
  const payrollSettings = () => database.prepare("SELECT * FROM payroll_settings WHERE id = 1").get();
  const branches = () => database.prepare("SELECT * FROM branches ORDER BY status, name").all();
  const payrollPermissions = () => database.prepare("SELECT * FROM payroll_permissions ORDER BY role_name, permission_key").all();
  const jobPayrollAllocations = () => database.prepare(`
    SELECT job_payroll_allocations.*, users.name as mechanic_name, users.mechanic_code
    FROM job_payroll_allocations
    JOIN users ON users.id = job_payroll_allocations.mechanic_id
    ORDER BY job_payroll_allocations.job_order_id, job_payroll_allocations.is_lead DESC, job_payroll_allocations.id
  `).all();
  const receiptSettings = () => database.prepare("SELECT * FROM receipt_settings WHERE id = 1").get();
  const superAdminSettings = () => getSuperAdminSettings(database);

  if (scope === "core") return { users: users(), receiptSettings: receiptSettings(), superAdminSettings: superAdminSettings(), paymentMethods: paymentMethods() };
  if (scope === "sales") return { inventory: inventory(), inventoryCategories: inventoryCategories(), sales: sales(), saleItems: saleItems(), paymentMethods: paymentMethods(), receiptSettings: receiptSettings(), auditLogs: auditLogs() };
  if (scope === "inventory") return { suppliers: suppliers(), purchaseOrders: purchaseOrders(), purchaseOrderItems: purchaseOrderItems(), inventoryCategories: inventoryCategories(), inventory: inventory(), inventoryAdjustments: inventoryAdjustments(), auditLogs: auditLogs() };
  if (scope === "jobs") return { users: users(), branches: branches(), customers: customers(), motorcycles: motorcycles(), services: services(), inventory: inventory(), jobOrders: jobOrders(), jobPayrollAllocations: jobPayrollAllocations(), jobStatusHistory: jobStatusHistory(), paymentMethods: paymentMethods(), receiptSettings: receiptSettings(), auditLogs: auditLogs() };
  if (scope === "customers") return { customers: customers(), motorcycles: motorcycles(), services: services(), inventory: inventory(), jobOrders: jobOrders(), sales: sales(), saleItems: saleItems(), auditLogs: auditLogs() };
  if (scope === "payroll") return { users: users(), branches: branches(), jobOrders: jobOrders(), jobPayrollAllocations: jobPayrollAllocations(), mechanicAttendance: mechanicAttendance(), payrollRuns: payrollRuns(), payrollCutoffs: payrollCutoffs(), payrollPermissions: payrollPermissions(), payrollSettings: payrollSettings(), auditLogs: auditLogs() };
  if (scope === "reports") return { users: users(), services: services(), inventory: inventory(), jobOrders: jobOrders(), sales: sales(), saleItems: saleItems(), expenses: expenses(), receiptSettings: receiptSettings(), auditLogs: auditLogs() };
  if (scope === "settings") return { receiptSettings: receiptSettings(), paymentMethods: paymentMethods(), inventoryCategories: inventoryCategories(), auditLogs: auditLogs() };
  if (scope === "users") return { users: users(), auditLogs: auditLogs() };
  if (scope === "staff") return { users: users(), jobOrders: jobOrders(), auditLogs: auditLogs() };
  if (scope === "suppliers") return { suppliers: suppliers(), inventory: inventory(), purchaseOrders: purchaseOrders(), auditLogs: auditLogs() };
  if (scope === "purchases") return { suppliers: suppliers(), inventory: inventory(), inventoryAdjustments: inventoryAdjustments(), purchaseOrders: purchaseOrders(), purchaseOrderItems: purchaseOrderItems(), auditLogs: auditLogs() };
  if (scope === "audit") return { auditLogs: auditLogs() };
  return listAll();
}

export function listSalesData() {
  return listDataScope("sales");
}

export function listInventoryData() {
  return listDataScope("inventory");
}

export function listJobsData() {
  return listDataScope("jobs");
}

export function listPayrollData() {
  return listDataScope("payroll");
}

export function listReportsData() {
  return listDataScope("reports");
}

function getSuperAdminSettings(database = getDatabase()) {
  const settings = database.prepare("SELECT * FROM super_admin_settings WHERE id = 1").get() as SuperAdminSettings;
  const trial = trialStatus(settings);
  return { ...settings, backup_schedule: normalizeBackupSchedule(settings.backup_schedule), trial };
}

function trialStatus(settings: SuperAdminSettings) {
  const start = new Date(settings.trial_started_at);
  const expiresAt = new Date(start.getTime() + settings.trial_days * 24 * 60 * 60 * 1000);
  const nowDate = new Date();
  const remainingMs = expiresAt.getTime() - nowDate.getTime();
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  const active = settings.license_status === "Activated" || !settings.trial_enabled || remainingMs > 0;
  return {
    active,
    expired: !active,
    daysRemaining,
    expiresAt: expiresAt.toISOString()
  };
}

function isTrialExpired(database: Database.Database) {
  const settings = getSuperAdminSettings(database) as SuperAdminSettings & { trial: { expired: boolean } };
  return settings.license_status !== "Activated" && Boolean(settings.trial_enabled) && settings.trial.expired;
}

function requireSuperAdmin(database: Database.Database, superAdminId: number) {
  const actor = database.prepare("SELECT id, username FROM super_admins WHERE id = ? AND status = 'Active'").get(superAdminId) as { id: number; username: string } | undefined;
  if (!actor) throw new Error("Only Super Admin can perform this action.");
  return actor;
}

export function getSuperAdminConsoleData() {
  const database = getDatabase();
  const pageCount = (database.prepare("PRAGMA page_count").get() as { page_count: number }).page_count;
  const pageSize = (database.prepare("PRAGMA page_size").get() as { page_size: number }).page_size;
  const integrityStatus = database.prepare("PRAGMA integrity_check").pluck().get() as string;
  const indexRows = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>;
  const existingIndexes = new Set(indexRows.map((row) => row.name));
  const expectedIndexes = [
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
  ];
  const databasePath = databaseFilePath();
  const walPath = `${databasePath}-wal`;
  const failedBackups = database.prepare("SELECT COUNT(*) as count FROM backup_history WHERE status IN ('Failed','Corrupted','Partial')").get() as { count: number };
  const approvalSensitive = database.prepare("SELECT COUNT(*) as count FROM sales WHERE status = 'Completed'").get() as { count: number };
  const failedReceipts = database.prepare("SELECT COUNT(*) as count FROM system_logs WHERE action LIKE '%failed%' OR details LIKE '%failed%'").get() as { count: number };
  const settings = getSuperAdminSettings(database);
  return {
    settings,
    health: {
      databaseSizeBytes: pageCount * pageSize,
      lastBackupAt: settings.last_backup_at,
      failedTransactions: 0,
      failedReceipts: failedReceipts.count,
      integrityStatus,
      integrityOk: integrityStatus === "ok",
      lastMigrationCheckAt: now(),
      pageCount,
      pageSize,
      walSizeBytes: fs.existsSync(walPath) ? fs.statSync(walPath).size : 0,
      indexesPresent: expectedIndexes.filter((name) => existingIndexes.has(name)),
      indexesMissing: expectedIndexes.filter((name) => !existingIndexes.has(name)),
      failedBackupCount: failedBackups.count,
      pendingApprovalSensitiveActions: approvalSensitive.count
    },
    backupHistory: database.prepare("SELECT * FROM backup_history ORDER BY backup_date DESC, id DESC LIMIT 50").all(),
    systemLogs: database.prepare("SELECT * FROM system_logs ORDER BY id DESC LIMIT 100").all()
  };
}

export function updateTrialSettings(payload: { superAdminId: number; trialEnabled: boolean; trialDays: number; backupSchedule?: "Disabled" | "Daily" | "Weekly" | "Monthly"; licenseKey?: string; payrollModuleEnabled?: boolean }) {
  const database = getDatabase();
  requireSuperAdmin(database, payload.superAdminId);
  const trialDays = Math.max(1, Math.min(365, Number(payload.trialDays) || 30));
  const schedule = ["Disabled", "Daily", "Weekly", "Monthly"].includes(payload.backupSchedule || "") ? payload.backupSchedule : undefined;
  const licenseKey = payload.licenseKey?.trim() ?? "";
  const licenseStatus = licenseKey ? "Activated" : "Trial";
  if (schedule) {
    database.prepare(`
      UPDATE super_admin_settings
      SET trial_enabled = ?, trial_days = ?, backup_schedule = ?, license_key = ?, license_status = ?, payroll_module_enabled = ?, updated_at = ?
      WHERE id = 1
    `).run(payload.trialEnabled ? 1 : 0, trialDays, schedule, licenseKey, licenseStatus, payload.payrollModuleEnabled ? 1 : 0, now());
  } else {
    database.prepare(`
      UPDATE super_admin_settings
      SET trial_enabled = ?, trial_days = ?, license_key = ?, license_status = ?, payroll_module_enabled = ?, updated_at = ?
      WHERE id = 1
    `).run(payload.trialEnabled ? 1 : 0, trialDays, licenseKey, licenseStatus, payload.payrollModuleEnabled ? 1 : 0, now());
  }
  database.prepare("INSERT INTO system_logs (super_admin_id, action, details, created_at) VALUES (?, ?, ?, ?)").run(
    payload.superAdminId,
    "Trial Settings Updated",
    `Trial ${payload.trialEnabled ? "enabled" : "disabled"}, ${trialDays} days, license ${licenseStatus}, payroll module ${payload.payrollModuleEnabled ? "visible" : "hidden"}`,
    now()
  );
  return getSuperAdminConsoleData();
}

export function recordSystemLog(payload: { superAdminId?: number; action: string; details: string }) {
  const database = getDatabase();
  database.prepare("INSERT INTO system_logs (super_admin_id, action, details, created_at) VALUES (?, ?, ?, ?)").run(
    payload.superAdminId ?? null,
    payload.action,
    payload.details,
    now()
  );
}

export function updateAutomaticBackupSettings(payload: {
  superAdminId: number;
  backupSchedule: "Disabled" | "Daily" | "Weekly" | "Monthly";
  backupTime: string;
  backupWeekday: number;
  backupMonthDay: number;
  backupFolder: string;
  backupRetentionCount: number;
}) {
  const database = getDatabase();
  requireSuperAdmin(database, payload.superAdminId);
  const schedule = ["Disabled", "Daily", "Weekly", "Monthly"].includes(payload.backupSchedule) ? payload.backupSchedule : "Disabled";
  if (!/^\d{2}:\d{2}$/.test(payload.backupTime)) throw new Error("Backup time must use HH:MM format.");
  const [hour, minute] = payload.backupTime.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("Backup time is invalid.");
  const weekday = Math.max(0, Math.min(6, Number(payload.backupWeekday) || 0));
  const monthDay = Math.max(1, Math.min(31, Number(payload.backupMonthDay) || 1));
  const retention = Math.max(7, Math.min(30, Number(payload.backupRetentionCount) || 10));
  const folder = payload.backupFolder.trim() || (schedule === "Disabled" ? "" : path.join(app.getPath("userData"), "backups"));
  if (schedule !== "Disabled") {
    if (!folder) throw new Error("Backup folder is required for automatic backups.");
    fs.mkdirSync(folder, { recursive: true });
    if (!fs.existsSync(folder)) throw new Error("Backup folder does not exist.");
    fs.accessSync(folder, fs.constants.W_OK);
  }
  database.prepare(`
    UPDATE super_admin_settings
    SET backup_schedule = ?, backup_time = ?, backup_weekday = ?, backup_month_day = ?, backup_folder = ?,
        backup_retention_count = ?, last_backup_error = '', updated_at = ?
    WHERE id = 1
  `).run(schedule, payload.backupTime, weekday, monthDay, folder, retention, now());
  recordSystemLog({ superAdminId: payload.superAdminId, action: "Automatic Backup Settings Updated", details: `Automatic backup ${schedule}, retention ${retention}.` });
  return getSuperAdminConsoleData();
}

export function recordBackupHistory(payload: {
  filename: string;
  filePath: string;
  fileSize?: number;
  backupType: BackupHistoryRow["backup_type"];
  status: BackupHistoryRow["status"];
  durationMs?: number;
  details: string;
}) {
  const database = getDatabase();
  const createdAt = now();
  database.prepare(`
    INSERT INTO backup_history (filename, file_path, backup_date, file_size, backup_type, status, duration_ms, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(payload.filename, payload.filePath, createdAt, payload.fileSize || 0, payload.backupType, payload.status, payload.durationMs || 0, payload.details, createdAt);
}

export function markBackupCreated(superAdminId: number | undefined, details: string, meta?: { filename?: string; filePath?: string; fileSize?: number; backupType?: BackupHistoryRow["backup_type"]; durationMs?: number }) {
  const database = getDatabase();
  const timestamp = now();
  database.prepare("UPDATE super_admin_settings SET last_backup_at = ?, last_backup_error = '', updated_at = ? WHERE id = 1").run(timestamp, timestamp);
  if (meta?.backupType === "Automatic" || meta?.backupType === "Hourly Incremental" || meta?.backupType === "Daily Full" || meta?.backupType === "Monthly Archive") database.prepare("UPDATE super_admin_settings SET last_auto_backup_at = ? WHERE id = 1").run(timestamp);
  if (meta?.filePath) recordBackupHistory({ filename: meta.filename || path.basename(meta.filePath), filePath: meta.filePath, fileSize: meta.fileSize || 0, backupType: meta.backupType || "Manual", status: "Successful", durationMs: meta.durationMs, details });
  recordSystemLog({ superAdminId, action: "Backup Created", details });
}

export function markBackupFailed(details: string, filePath = "", backupType: BackupHistoryRow["backup_type"] = "Automatic", status: BackupHistoryRow["status"] = "Failed", durationMs = 0) {
  const database = getDatabase();
  database.prepare("UPDATE super_admin_settings SET last_backup_error = ?, updated_at = ? WHERE id = 1").run(details, now());
  recordBackupHistory({ filename: filePath ? path.basename(filePath) : "Automatic backup", filePath, backupType, status, durationMs, details });
  recordSystemLog({ action: "Backup Failed", details });
}

export function getAutomaticBackupSettings() {
  return getSuperAdminSettings(getDatabase());
}

export function getLatestBackupByType(backupType: BackupHistoryRow["backup_type"]) {
  return getDatabase().prepare(`
    SELECT * FROM backup_history
    WHERE backup_type = ? AND status IN ('Success','Successful')
    ORDER BY backup_date DESC, id DESC
    LIMIT 1
  `).get(backupType) as BackupHistoryRow | undefined;
}

export function optimizeDatabase(payload: { superAdminId: number }) {
  const database = getDatabase();
  requireSuperAdmin(database, payload.superAdminId);
  database.pragma("wal_checkpoint(TRUNCATE)");
  database.exec("VACUUM");
  recordSystemLog({ superAdminId: payload.superAdminId, action: "Database Optimized", details: "VACUUM and WAL checkpoint completed." });
  return getSuperAdminConsoleData();
}

export function clearOldLogs(payload: { superAdminId: number; daysToKeep: number }) {
  const database = getDatabase();
  requireSuperAdmin(database, payload.superAdminId);
  const days = Math.max(1, Number(payload.daysToKeep) || 30);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const audit = database.prepare("DELETE FROM audit_logs WHERE created_at < ?").run(cutoff);
  const system = database.prepare("DELETE FROM system_logs WHERE created_at < ?").run(cutoff);
  recordSystemLog({ superAdminId: payload.superAdminId, action: "Logs Cleared", details: `Removed ${audit.changes} audit logs and ${system.changes} system logs older than ${days} days.` });
  return getSuperAdminConsoleData();
}

export function verifySuperAdminPassword(superAdminId: number, password: string) {
  const database = getDatabase();
  const actor = database.prepare("SELECT id, password_hash FROM super_admins WHERE id = ? AND status = 'Active'").get(superAdminId) as { id: number; password_hash: string } | undefined;
  return Boolean(actor && verifyPassword(password, actor.password_hash));
}

export function clearOperationalDatabase(payload: { superAdminId: number; backupPath: string }) {
  const database = getDatabase();
  requireSuperAdmin(database, payload.superAdminId);
  const createdAt = now();

  const reset = database.transaction(() => {
    database.prepare("DELETE FROM payroll_runs").run();
    database.prepare("DELETE FROM payroll_cutoffs").run();
    database.prepare("DELETE FROM mechanic_attendance").run();
    database.prepare("DELETE FROM job_payroll_allocations").run();
    database.prepare("DELETE FROM approval_logs").run();
    database.prepare("DELETE FROM sale_items").run();
    database.prepare("DELETE FROM sales").run();
    database.prepare("DELETE FROM job_status_history").run();
    database.prepare("DELETE FROM job_orders").run();
    database.prepare("DELETE FROM expenses").run();
    database.prepare("DELETE FROM motorcycles").run();
    database.prepare("DELETE FROM customers").run();
    database.prepare("DELETE FROM purchase_order_items").run();
    database.prepare("DELETE FROM purchase_orders").run();
    database.prepare("DELETE FROM inventory_adjustments").run();
    database.prepare("DELETE FROM inventory").run();
    database.prepare("DELETE FROM inventory_categories").run();
    database.prepare("DELETE FROM suppliers").run();
    database.prepare("DELETE FROM services").run();
    database.prepare("DELETE FROM payment_methods").run();
    database.prepare("DELETE FROM audit_logs").run();
    database.prepare("DELETE FROM users").run();
    resetSystemSettingsToDefaults(database, createdAt);

    database.prepare(`
      INSERT INTO users (name, role, pin, username, password_hash, contact_number, address, email, must_change_password, status, created_at, is_mechanic)
      VALUES (?, 'Owner', '0000', 'Owner', ?, '', '', '', 1, 'Active', ?, 0)
    `).run("Default Owner", hashPassword("0000"), createdAt);

    const insertDefaultPayment = database.prepare(`
      INSERT INTO payment_methods (name, type, payment_category, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Active', ?, ?)
    `);
    insertDefaultPayment.run("Cash", "Cash", "Manual", "Cash payment at counter", createdAt, createdAt);
    insertDefaultPayment.run("Online Payment", "Online Payment", "Digital", "Online wallet or bank transfer", createdAt, createdAt);

    database.prepare("INSERT INTO system_logs (super_admin_id, action, details, created_at) VALUES (?, ?, ?, ?)").run(
      payload.superAdminId,
      "Database Cleared",
      `Operational database and system settings reset to defaults. Backup before reset: ${payload.backupPath}. Default Owner account recreated.`,
      createdAt
    );
  });

  reset();
  ensureInventoryStructure(database);
  return getSuperAdminConsoleData();
}

export function updateReceiptSettings(payload: {
  actorId: number;
  systemName: string;
  logoDataUrl: string;
  businessName: string;
  address: string;
  email: string;
  contactNumber: string;
  taxId: string;
  footerMessage: string;
  showTaxId: boolean;
  showCashier: boolean;
  paperWidth: number;
  receiptTemplate: "Compact" | "Detailed";
  showLaborBreakdown: boolean;
  customHeader: string;
  customFooter: string;
  logoSize: "Small" | "Medium" | "Large";
}) {
  const database = getDatabase();
  const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(payload.actorId) as { id: number; role: Role } | undefined;
  if (!actor || actor.role !== "Owner") throw new Error("Only Owner accounts can update receipt settings.");
  if (!payload.systemName.trim()) throw new Error("System name is required.");
  if (!payload.businessName.trim()) throw new Error("Business name is required.");
  if (!payload.address.trim()) throw new Error("Business address is required.");
  if (payload.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) throw new Error("Email address is invalid.");
  if (!isValidContactNumber(payload.contactNumber)) throw new Error("Contact number must contain 10 to 11 digits and may include spaces, parentheses, or dashes.");
  const paperWidth = [58, 80, 216].includes(Number(payload.paperWidth)) ? Number(payload.paperWidth) : 58;
  const receiptTemplate = payload.receiptTemplate === "Compact" ? "Compact" : "Detailed";
  const logoSize = ["Small", "Medium", "Large"].includes(payload.logoSize) ? payload.logoSize : "Medium";

  database.prepare(`
    UPDATE receipt_settings
    SET system_name = ?, logo_data_url = ?, receipt_logo_data_url = '', business_name = ?, address = ?, email = ?, contact_number = ?, tax_id = ?, footer_message = ?,
        show_tax_id = ?, show_cashier = ?, paper_width = ?, receipt_template = ?, show_labor_breakdown = ?, custom_header = ?, custom_footer = ?, logo_size = ?
    WHERE id = 1
  `).run(
    payload.systemName.trim(),
    payload.logoDataUrl.trim(),
    payload.businessName.trim(),
    payload.address.trim(),
    payload.email.trim(),
    payload.contactNumber.trim(),
    payload.taxId.trim(),
    payload.footerMessage.trim(),
    payload.showTaxId ? 1 : 0,
    payload.showCashier ? 1 : 0,
    paperWidth,
    receiptTemplate,
    payload.showLaborBreakdown ? 1 : 0,
    payload.customHeader.trim(),
    payload.customFooter.trim(),
    logoSize
  );
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Receipt Settings",
    "Updated receipt format settings",
    now()
  );
  return database.prepare("SELECT * FROM receipt_settings WHERE id = 1").get();
}

export function getReceiptSettings() {
  return getDatabase().prepare("SELECT * FROM receipt_settings WHERE id = 1").get() as {
    receipt_output_mode: "Printer" | "PDF";
    receipt_printer_name: string;
  };
}

export function updateReceiptPrinterSettings(payload: { actorId: number; outputMode: "Printer" | "PDF"; printerName: string } & ApprovalPayload) {
  const database = getDatabase();
  requireInventoryManager(database, payload.actorId);
  const approval = requireSensitiveApproval(database, payload.actorId, payload, "Changed Printer Settings", "Receipt Printer");
  if (!["Printer", "PDF"].includes(payload.outputMode)) throw new Error("Select a valid receipt output option.");
  if (payload.outputMode === "Printer" && !payload.printerName.trim()) throw new Error("Select a valid receipt printer.");
  const previous = database.prepare("SELECT receipt_output_mode, receipt_printer_name FROM receipt_settings WHERE id = 1").get() as { receipt_output_mode: string; receipt_printer_name: string };
  database.prepare("UPDATE receipt_settings SET receipt_output_mode = ?, receipt_printer_name = ? WHERE id = 1").run(
    payload.outputMode,
    payload.outputMode === "Printer" ? payload.printerName.trim() : ""
  );
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Printer Settings",
    `Receipt output changed from ${previous.receipt_output_mode || "PDF"} ${previous.receipt_printer_name || ""} to ${payload.outputMode} ${payload.outputMode === "Printer" ? payload.printerName.trim() : ""}. Approved by ${approval.name}. Reason: ${approval.reason}`.trim(),
    now()
  );
  return database.prepare("SELECT * FROM receipt_settings WHERE id = 1").get();
}

function requireInventoryManager(database: Database.Database, actorId: number) {
  const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId) as { id: number; role: Role } | undefined;
  if (!actor || !["Owner", "Admin"].includes(actor.role)) throw new Error("Only Owner and Admin accounts can manage inventory.");
  return actor;
}

function requireServiceManager(database: Database.Database, actorId: number) {
  const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId) as { id: number; role: Role } | undefined;
  if (!actor || !["Owner", "Admin"].includes(actor.role)) throw new Error("Only Owner and Admin accounts can manage services.");
  return actor;
}

function requireMechanicManager(database: Database.Database, actorId: number) {
  const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId) as { id: number; role: Role } | undefined;
  if (!actor || !["Owner", "Admin"].includes(actor.role)) throw new Error("Only Owner and Admin accounts can manage mechanics.");
  return actor;
}

function requireSupplierManager(database: Database.Database, actorId: number) {
  const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId) as { id: number; role: Role } | undefined;
  if (!actor || !["Owner", "Admin"].includes(actor.role)) throw new Error("Only Owner and Admin accounts can manage suppliers.");
  return actor;
}

function requireExpenseManager(database: Database.Database, actorId: number) {
  const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId) as { id: number; role: Role } | undefined;
  if (!actor || !["Owner", "Admin"].includes(actor.role)) throw new Error("Only Owner and Admin accounts can manage expenses.");
  return actor;
}

function requireOwner(database: Database.Database, actorId: number) {
  const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId) as { id: number; role: Role } | undefined;
  if (!actor || actor.role !== "Owner") throw new Error("Only Owner accounts can manage payment methods.");
  return actor;
}

function requirePayrollOwner(database: Database.Database, actorId: number) {
  const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId) as { id: number; role: Role } | undefined;
  if (!actor || actor.role !== "Owner") throw new Error("Only Owner accounts can manage payroll.");
  return actor;
}

function requirePayrollPermission(database: Database.Database, actorId: number, permission: string) {
  const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId) as { id: number; role: string } | undefined;
  if (!actor) throw new Error("Payroll access requires an active account.");
  if (actor.role === "Owner") return actor;
  const granted = database.prepare("SELECT enabled FROM payroll_permissions WHERE role_name = ? AND permission_key = ?").get(actor.role, permission) as { enabled: number } | undefined;
  if (!granted?.enabled) throw new Error("Your account does not have permission for this payroll action.");
  return actor;
}

type ApprovalPayload = {
  approvalUsername?: string;
  approvalPassword?: string;
  approvalReason?: string;
};

function requireSensitiveApproval(database: Database.Database, requesterId: number | null, approval: ApprovalPayload, action: string, entity: string, entityId = "") {
  const username = approval.approvalUsername?.trim() ?? "";
  const password = approval.approvalPassword ?? "";
  const reason = approval.approvalReason?.trim() ?? "";
  if (!username || !password) throw new Error("Owner or Admin approval is required.");
  if (!reason) throw new Error("Approval reason is required.");
  const approver = database.prepare("SELECT id, name, role, password_hash FROM users WHERE lower(username) = lower(?) AND status = 'Active'").get(username) as
    | { id: number; name: string; role: Role; password_hash: string }
    | undefined;
  if (!approver || !["Owner", "Admin"].includes(approver.role) || !verifyPassword(password, approver.password_hash)) {
    throw new Error("Approval credentials are invalid or not allowed.");
  }
  database.prepare(`
    INSERT INTO approval_logs (requester_id, approver_id, action, entity, entity_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(requesterId, approver.id, action, entity, entityId, reason, now());
  return { ...approver, reason };
}

function paymentMethodInUse(database: Database.Database, name: string) {
  const saleUse = database.prepare("SELECT id FROM sales WHERE payment_method = ? LIMIT 1").get(name);
  const jobUse = database.prepare("SELECT id FROM job_orders WHERE payment_method = ? LIMIT 1").get(name);
  return Boolean(saleUse || jobUse);
}

type PaymentCategory = "Manual" | "Digital";

function normalizePaymentCategory(value: string | undefined): PaymentCategory {
  if (value === "Manual" || value === "Digital") return value;
  throw new Error("Payment category is required.");
}

function validateActivePaymentMethod(database: Database.Database, name: string, referenceCode?: string) {
  const method = database.prepare("SELECT id, name, payment_category FROM payment_methods WHERE name = ? AND status = 'Active'").get(name.trim()) as
    | { id: number; name: string; payment_category: PaymentCategory }
    | undefined;
  if (!method) throw new Error("Select an active payment method.");
  if (method.payment_category === "Digital" && !referenceCode?.trim()) throw new Error("Reference code is required for digital payments.");
  return method;
}

export function createPaymentMethod(payload: { actorId: number; name: string; paymentCategory: PaymentCategory; description?: string }) {
  const database = getDatabase();
  requireOwner(database, payload.actorId);
  const name = payload.name.trim();
  const paymentCategory = normalizePaymentCategory(payload.paymentCategory);
  if (!name) throw new Error("Payment method name is required.");
  const duplicate = database.prepare("SELECT id FROM payment_methods WHERE lower(name) = lower(?)").get(name);
  if (duplicate) throw new Error("Payment method name must be unique.");
  const createdAt = now();
  const result = database.prepare(`
    INSERT INTO payment_methods (name, type, payment_category, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Active', ?, ?)
  `).run(name, paymentCategory === "Manual" ? "Cash" : "Online Payment", paymentCategory, payload.description?.trim() ?? "", createdAt, createdAt);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Created",
    "Payment Method",
    `Created ${name} (${paymentCategory})`,
    createdAt
  );
  return database.prepare("SELECT * FROM payment_methods WHERE id = ?").get(result.lastInsertRowid);
}

export function updatePaymentMethod(payload: { actorId: number; methodId: number; name: string; paymentCategory: PaymentCategory; description?: string }) {
  const database = getDatabase();
  requireOwner(database, payload.actorId);
  const current = database.prepare("SELECT * FROM payment_methods WHERE id = ?").get(payload.methodId) as { id: number; name: string } | undefined;
  if (!current) throw new Error("Payment method was not found.");
  const name = payload.name.trim();
  const paymentCategory = normalizePaymentCategory(payload.paymentCategory);
  if (!name) throw new Error("Payment method name is required.");
  const duplicate = database.prepare("SELECT id FROM payment_methods WHERE lower(name) = lower(?) AND id <> ?").get(name, payload.methodId);
  if (duplicate) throw new Error("Payment method name must be unique.");
  const updatedAt = now();
  database.prepare("UPDATE payment_methods SET name = ?, type = ?, payment_category = ?, description = ?, updated_at = ? WHERE id = ?").run(
    name,
    paymentCategory === "Manual" ? "Cash" : "Online Payment",
    paymentCategory,
    payload.description?.trim() ?? "",
    updatedAt,
    payload.methodId
  );
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Payment Method",
    `Updated ${current.name} to ${name} (${paymentCategory})`,
    updatedAt
  );
  return database.prepare("SELECT * FROM payment_methods WHERE id = ?").get(payload.methodId);
}

export function setPaymentMethodStatus(payload: { actorId: number; methodId: number; status: "Active" | "Inactive" }) {
  const database = getDatabase();
  requireOwner(database, payload.actorId);
  if (!["Active", "Inactive"].includes(payload.status)) throw new Error("Payment method status is invalid.");
  const current = database.prepare("SELECT * FROM payment_methods WHERE id = ?").get(payload.methodId) as { id: number; name: string } | undefined;
  if (!current) throw new Error("Payment method was not found.");
  const updatedAt = now();
  database.prepare("UPDATE payment_methods SET status = ?, updated_at = ? WHERE id = ?").run(payload.status, updatedAt, payload.methodId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    payload.status === "Active" ? "Enabled" : "Disabled",
    "Payment Method",
    `${payload.status === "Active" ? "Enabled" : "Disabled"} ${current.name}`,
    updatedAt
  );
  return { ok: true };
}

export function deletePaymentMethod(payload: { actorId: number; methodId: number }) {
  const database = getDatabase();
  requireOwner(database, payload.actorId);
  const current = database.prepare("SELECT * FROM payment_methods WHERE id = ?").get(payload.methodId) as { id: number; name: string } | undefined;
  if (!current) throw new Error("Payment method was not found.");
  if (paymentMethodInUse(database, current.name)) throw new Error("Payment method is used in past transactions and cannot be deleted.");
  const deletedAt = now();
  database.prepare("DELETE FROM payment_methods WHERE id = ?").run(payload.methodId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Deleted",
    "Payment Method",
    `Deleted ${current.name}`,
    deletedAt
  );
  return { ok: true };
}

function validateServicePayload(payload: { name: string; category: string; durationMinutes: number; price: number; laborCost: number }) {
  const name = payload.name.trim();
  const category = payload.category.trim();
  const durationMinutes = Number(payload.durationMinutes);
  const price = Number(payload.price);
  const laborCost = Number(payload.laborCost);

  if (!name) throw new Error("Service name is required.");
  if (!category) throw new Error("Service category is required.");
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error("Duration must be greater than zero.");
  if (!Number.isFinite(price) || price < 0) throw new Error("Price must be zero or greater.");
  if (!Number.isFinite(laborCost) || laborCost < 0) throw new Error("Labor cost must be zero or greater.");
  return { name, category, durationMinutes: Math.round(durationMinutes), price, laborCost };
}

export function createService(payload: { actorId: number; name: string; category: string; durationMinutes: number; price: number; laborCost: number }) {
  const database = getDatabase();
  requireServiceManager(database, payload.actorId);
  const service = validateServicePayload(payload);
  const createdAt = now();
  const result = database.prepare(`
    INSERT INTO services (name, category, price, labor_cost, duration_minutes)
    VALUES (?, ?, ?, ?, ?)
  `).run(service.name, service.category, service.price, service.laborCost, service.durationMinutes);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Created",
    "Service",
    `Created ${service.name}`,
    createdAt
  );
  return database.prepare("SELECT * FROM services WHERE id = ?").get(result.lastInsertRowid);
}

export function updateService(payload: { actorId: number; serviceId: number; name: string; category: string; durationMinutes: number; price: number; laborCost: number }) {
  const database = getDatabase();
  requireServiceManager(database, payload.actorId);
  const current = database.prepare("SELECT id, name FROM services WHERE id = ?").get(payload.serviceId) as { id: number; name: string } | undefined;
  if (!current) throw new Error("Service was not found.");
  const service = validateServicePayload(payload);
  const updatedAt = now();
  database.prepare(`
    UPDATE services
    SET name = ?, category = ?, price = ?, labor_cost = ?, duration_minutes = ?
    WHERE id = ?
  `).run(service.name, service.category, service.price, service.laborCost, service.durationMinutes, payload.serviceId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Service",
    `Updated ${current.name} to ${service.name}`,
    updatedAt
  );
  return database.prepare("SELECT * FROM services WHERE id = ?").get(payload.serviceId);
}

export function deleteService(payload: { actorId: number; serviceId: number }) {
  const database = getDatabase();
  requireServiceManager(database, payload.actorId);
  const current = database.prepare("SELECT id, name FROM services WHERE id = ?").get(payload.serviceId) as { id: number; name: string } | undefined;
  if (!current) throw new Error("Service was not found.");
  const inUse = database.prepare("SELECT id FROM job_orders WHERE service_id = ? LIMIT 1").get(payload.serviceId);
  if (inUse) throw new Error("This service is already used in job orders and cannot be deleted.");
  const deletedAt = now();
  database.prepare("DELETE FROM services WHERE id = ?").run(payload.serviceId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Deleted",
    "Service",
    `Deleted ${current.name}`,
    deletedAt
  );
  return { ok: true };
}

function validateMechanicPayload(payload: { name: string; contactNumber: string; address: string; status: "Active" | "Disabled" | "Inactive" }) {
  const name = payload.name.trim();
  const contactNumber = payload.contactNumber.trim();
  const address = payload.address.trim();
  const status = payload.status === "Inactive" ? "Disabled" : payload.status;
  if (!name) throw new Error("Mechanic name is required.");
  if (!contactNumber || !isValidContactNumber(contactNumber)) throw new Error("Contact number must contain 10 to 11 digits and may include spaces, parentheses, or dashes.");
  if (!address) throw new Error("Address is required.");
  if (!["Active", "Disabled"].includes(status)) throw new Error("Mechanic status is required.");
  return { name, contactNumber, address, status: status as "Active" | "Disabled" };
}

function nextMechanicUsername(database: Database.Database, name: string) {
  const base = `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "mechanic"}.mechanic`.slice(0, 24);
  let username = base;
  let sequence = 1;
  while (database.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
    username = `${base}.${sequence}`.slice(0, 32);
    sequence += 1;
  }
  return username;
}

function mechanicCode(id: number) {
  return `MEC-${String(id).padStart(5, "0")}`;
}

export function createMechanic(payload: { actorId: number; name: string; contactNumber: string; address: string; status: "Active" | "Disabled" | "Inactive" }) {
  const database = getDatabase();
  requireMechanicManager(database, payload.actorId);
  const mechanic = validateMechanicPayload(payload);
  const createdAt = now();
  const username = nextMechanicUsername(database, mechanic.name);
  const password = crypto.randomBytes(16).toString("hex");
  const result = database.prepare(`
    INSERT INTO users (name, role, pin, username, password_hash, contact_number, address, email, is_mechanic, must_change_password, status, created_at, payroll_type, salary_rate, compensation_type, labor_commission_percentage)
    VALUES (?, 'Cashier', '', ?, ?, ?, ?, '', 1, 0, ?, ?, 'Per Day', 0, 'Fixed Salary', 0)
  `).run(mechanic.name, username, hashPassword(password), mechanic.contactNumber, mechanic.address, mechanic.status, createdAt);
  const code = mechanicCode(Number(result.lastInsertRowid));
  database.prepare("UPDATE users SET mechanic_code = ?, qr_code = ? WHERE id = ?").run(code, code, result.lastInsertRowid);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Created",
    "Mechanic",
    `Created mechanic ${mechanic.name}`,
    createdAt
  );
  return sanitizeUser(database.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid) as UserAccount);
}

export function updateMechanic(payload: { actorId: number; mechanicId: number; name: string; contactNumber: string; address: string; status: "Active" | "Disabled" | "Inactive" }) {
  const database = getDatabase();
  requireMechanicManager(database, payload.actorId);
  const current = database.prepare("SELECT id, name FROM users WHERE id = ? AND is_mechanic = 1").get(payload.mechanicId) as { id: number; name: string } | undefined;
  if (!current) throw new Error("Mechanic was not found.");
  const mechanic = validateMechanicPayload(payload);
  const updatedAt = now();
  database.prepare("UPDATE users SET name = ?, contact_number = ?, address = ?, status = ? WHERE id = ? AND is_mechanic = 1").run(
    mechanic.name,
    mechanic.contactNumber,
    mechanic.address,
    mechanic.status,
    payload.mechanicId
  );
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Mechanic",
    `Updated mechanic ${current.name} to ${mechanic.name}`,
    updatedAt
  );
  return sanitizeUser(database.prepare("SELECT * FROM users WHERE id = ?").get(payload.mechanicId) as UserAccount);
}

export function setMechanicStatus(payload: { actorId: number; mechanicId: number; status: "Active" | "Disabled" | "Inactive" }) {
  const database = getDatabase();
  requireMechanicManager(database, payload.actorId);
  const status = payload.status === "Inactive" ? "Disabled" : payload.status;
  if (!["Active", "Disabled"].includes(status)) throw new Error("Mechanic status is required.");
  const current = database.prepare("SELECT id, name FROM users WHERE id = ? AND is_mechanic = 1").get(payload.mechanicId) as { id: number; name: string } | undefined;
  if (!current) throw new Error("Mechanic was not found.");
  const updatedAt = now();
  database.prepare("UPDATE users SET status = ? WHERE id = ? AND is_mechanic = 1").run(status, payload.mechanicId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    status === "Active" ? "Enabled" : "Disabled",
    "Mechanic",
    `${status === "Active" ? "Enabled" : "Disabled"} mechanic ${current.name}`,
    updatedAt
  );
  return { ok: true };
}

export function deleteMechanic(payload: { actorId: number; mechanicId: number }) {
  const database = getDatabase();
  requireMechanicManager(database, payload.actorId);
  const current = database.prepare("SELECT id, name FROM users WHERE id = ? AND is_mechanic = 1").get(payload.mechanicId) as { id: number; name: string } | undefined;
  if (!current) throw new Error("Mechanic was not found.");
  const inUse = database.prepare("SELECT id FROM job_orders WHERE mechanic_id = ? LIMIT 1").get(payload.mechanicId);
  if (inUse) throw new Error("This mechanic is assigned to job orders and cannot be deleted.");
  const deletedAt = now();
  database.prepare("DELETE FROM users WHERE id = ? AND is_mechanic = 1").run(payload.mechanicId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Deleted",
    "Mechanic",
    `Deleted mechanic ${current.name}`,
    deletedAt
  );
  return { ok: true };
}

export function updateMechanicPayroll(payload: {
  actorId: number;
  mechanicId: number;
  payrollType: "Per Hour" | "Per Day" | "Per Week" | "Per Month";
  salaryRate: number;
  compensationType: "Fixed Salary" | "Commission" | "Hybrid";
  laborCommissionPercentage: number;
}) {
  const database = getDatabase();
  requirePayrollPermission(database, payload.actorId, "manage_payroll_settings");
  const payrollTypes = ["Per Hour", "Per Day", "Per Week", "Per Month"];
  const compensationTypes = ["Fixed Salary", "Commission", "Hybrid"];
  if (!payrollTypes.includes(payload.payrollType)) throw new Error("Payroll type is required.");
  if (!compensationTypes.includes(payload.compensationType)) throw new Error("Compensation type is required.");
  const salaryRate = Number(payload.salaryRate);
  const commission = Number(payload.laborCommissionPercentage);
  if (!Number.isFinite(salaryRate) || salaryRate < 0) throw new Error("Salary rate must be zero or greater.");
  if (!Number.isFinite(commission) || commission < 0 || commission > 100) throw new Error("Commission percentage must be between 0 and 100.");
  const mechanic = database.prepare("SELECT id, name FROM users WHERE id = ? AND is_mechanic = 1").get(payload.mechanicId) as { id: number; name: string } | undefined;
  if (!mechanic) throw new Error("Mechanic was not found.");
  database.prepare(`
    UPDATE users
    SET payroll_type = ?, salary_rate = ?, compensation_type = ?, labor_commission_percentage = ?
    WHERE id = ? AND is_mechanic = 1
  `).run(payload.payrollType, salaryRate, payload.compensationType, commission, payload.mechanicId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Payroll Settings",
    `Updated payroll setup for ${mechanic.name}`,
    now()
  );
  return sanitizeUser(database.prepare("SELECT * FROM users WHERE id = ?").get(payload.mechanicId) as UserAccount);
}

export function updatePayrollSettings(payload: {
  actorId: number;
  requiredHoursPerDay: number;
  requiredHoursPerWeek: number;
  requiredHoursPerMonth: number;
  workingDays: number[];
  considerHolidaysPaid: boolean;
  holidayDates: string[];
}) {
  const database = getDatabase();
  requirePayrollPermission(database, payload.actorId, "manage_payroll_settings");
  const requiredDay = clampPayrollHours(payload.requiredHoursPerDay, 0, 24, "Required hours per day");
  const requiredWeek = clampPayrollHours(payload.requiredHoursPerWeek, 0, 168, "Required hours per week");
  const requiredMonth = clampPayrollHours(payload.requiredHoursPerMonth, 0, 744, "Required hours per month");
  const workingDays = Array.from(new Set(payload.workingDays.map(Number).filter((day) => day >= 0 && day <= 6))).sort((left, right) => left - right);
  if (!workingDays.length) throw new Error("At least one working day is required.");
  const holidayDates = Array.from(new Set(payload.holidayDates.map((date) => date.trim()).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort();
  const updatedAt = now();
  database.prepare(`
    UPDATE payroll_settings
    SET required_hours_per_day = ?, required_hours_per_week = ?, required_hours_per_month = ?,
        working_days = ?, consider_holidays_paid = ?, holiday_dates = ?, updated_at = ?
    WHERE id = 1
  `).run(requiredDay, requiredWeek, requiredMonth, workingDays.join(","), payload.considerHolidaysPaid ? 1 : 0, holidayDates.join(","), updatedAt);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Payroll Settings",
    "Updated payroll computation settings",
    updatedAt
  );
  return database.prepare("SELECT * FROM payroll_settings WHERE id = 1").get();
}

export function recordMechanicAttendance(payload: { actorId?: number; qrCode: string }) {
  const database = getDatabase();
  const qrCode = payload.qrCode.trim();
  if (!qrCode) throw new Error("Mechanic QR code is required.");
  const mechanic = database.prepare("SELECT id, name FROM users WHERE is_mechanic = 1 AND status = 'Active' AND (qr_code = ? OR mechanic_code = ?)").get(qrCode, qrCode) as { id: number; name: string } | undefined;
  if (!mechanic) throw new Error("Mechanic QR code was not found.");
  const timestamp = now();
  const attendanceDate = timestamp.slice(0, 10);
  const existing = database.prepare("SELECT * FROM mechanic_attendance WHERE mechanic_id = ? AND attendance_date = ?").get(mechanic.id, attendanceDate) as { id: number; time_in?: string; time_out?: string } | undefined;
  if (!existing) {
    database.prepare(`
      INSERT INTO mechanic_attendance (mechanic_id, attendance_date, time_in, status, created_at, updated_at)
      VALUES (?, ?, ?, 'Present', ?, ?)
    `).run(mechanic.id, attendanceDate, timestamp, timestamp, timestamp);
    return { action: "Time In", mechanicName: mechanic.name, recordedAt: timestamp };
  }
  if (!existing.time_in) throw new Error("Incomplete previous attendance detected.");
  if (existing.time_out) throw new Error("Attendance already recorded for today.");
  if (existing.time_in && new Date(timestamp).getTime() <= new Date(existing.time_in).getTime()) {
    throw new Error("Time Out cannot be earlier than Time In.");
  }
  database.prepare("UPDATE mechanic_attendance SET time_out = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, existing.id);
  return { action: "Time Out", mechanicName: mechanic.name, recordedAt: timestamp };
}

export function updateMechanicAttendance(payload: { actorId: number; attendanceId?: number; mechanicId: number; attendanceDate: string; timeIn?: string; timeOut?: string; status: "Present" | "Absent" | "Late" | "Incomplete Attendance"; notes?: string }) {
  const database = getDatabase();
  requirePayrollPermission(database, payload.actorId, "manage_payroll_settings");
  const mechanic = database.prepare("SELECT id, name FROM users WHERE id = ? AND is_mechanic = 1").get(payload.mechanicId) as { id: number; name: string } | undefined;
  if (!mechanic) throw new Error("Mechanic was not found.");
  if (!payload.attendanceDate) throw new Error("Attendance date is required.");
  const status = ["Present", "Absent", "Late", "Incomplete Attendance"].includes(payload.status) ? payload.status : "Present";
  if (payload.timeIn && payload.timeOut && new Date(payload.timeOut).getTime() < new Date(payload.timeIn).getTime()) {
    throw new Error("Time Out cannot be earlier than Time In.");
  }
  const updatedAt = now();
  if (payload.attendanceId) {
    database.prepare(`
      UPDATE mechanic_attendance
      SET attendance_date = ?, time_in = ?, time_out = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(payload.attendanceDate, payload.timeIn || null, payload.timeOut || null, status, payload.notes?.trim() || "", updatedAt, payload.attendanceId);
  } else {
    database.prepare(`
      INSERT INTO mechanic_attendance (mechanic_id, attendance_date, time_in, time_out, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.mechanicId, payload.attendanceDate, payload.timeIn || null, payload.timeOut || null, status, payload.notes?.trim() || "", updatedAt, updatedAt);
  }
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Attendance",
    `Updated attendance for ${mechanic.name} on ${payload.attendanceDate}`,
    updatedAt
  );
  return { ok: true };
}

function hoursBetween(start?: string, end?: string) {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, ms / 36e5);
}

function clampPayrollHours(value: number, min: number, max: number, label: string) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return Number(numeric.toFixed(2));
}

function eachDate(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (!Number.isNaN(cursor.getTime()) && cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function payrollSettings(database: Database.Database) {
  return database.prepare("SELECT * FROM payroll_settings WHERE id = 1").get() as {
    required_hours_per_day: number;
    required_hours_per_week: number;
    required_hours_per_month: number;
    working_days: string;
    consider_holidays_paid: 0 | 1;
    holiday_dates: string;
  };
}

function expectedHoursForPeriod(database: Database.Database, payrollType: string, periodStart: string, periodEnd: string) {
  const settings = payrollSettings(database);
  const workingDays = new Set(String(settings.working_days || "1,2,3,4,5,6").split(",").map(Number));
  const holidayDates = new Set(String(settings.holiday_dates || "").split(",").map((date) => date.trim()).filter(Boolean));
  const dates = eachDate(periodStart, periodEnd);
  const workingDates = dates.filter((date) => workingDays.has(new Date(`${date}T00:00:00`).getDay()));
  const holidayWorkingDates = workingDates.filter((date) => holidayDates.has(date));
  const payableWorkingDates = workingDates.filter((date) => settings.consider_holidays_paid || !holidayDates.has(date));
  const dailyRequired = Number(settings.required_hours_per_day || 8);
  const periodExpected = Number((payableWorkingDates.length * dailyRequired).toFixed(2));
  const holidayPaidHours = settings.consider_holidays_paid ? Number((holidayWorkingDates.length * dailyRequired).toFixed(2)) : 0;
  const configuredRequired = payrollType === "Per Week"
    ? Number(settings.required_hours_per_week || 40)
    : payrollType === "Per Month"
      ? Number(settings.required_hours_per_month || 176)
      : dailyRequired;
  return {
    settings,
    requiredHours: configuredRequired,
    expectedHours: payrollType === "Per Hour" ? 0 : payrollType === "Per Day" ? dailyRequired : Math.min(configuredRequired, periodExpected || configuredRequired),
    holidayPaidHours,
    holidayCount: holidayWorkingDates.length
  };
}

function computePayroll(database: Database.Database, mechanicId: number, periodStart: string, periodEnd: string, deductions = 0) {
  const mechanic = database.prepare("SELECT * FROM users WHERE id = ? AND is_mechanic = 1").get(mechanicId) as UserAccount & {
    payroll_type: string;
    salary_rate: number;
    compensation_type: string;
    labor_commission_percentage: number;
  } | undefined;
  if (!mechanic) throw new Error("Mechanic was not found.");
  const attendance = database.prepare(`
    SELECT * FROM mechanic_attendance
    WHERE mechanic_id = ? AND attendance_date BETWEEN ? AND ?
  `).all(mechanicId, periodStart, periodEnd) as Array<{ attendance_date: string; time_in?: string; time_out?: string; status: string }>;
  const payrollType = mechanic.payroll_type || "Per Day";
  const compensationType = mechanic.compensation_type || "Fixed Salary";
  const salaryRate = Number(mechanic.salary_rate || 0);
  const expected = expectedHoursForPeriod(database, payrollType, periodStart, periodEnd);
  const attendanceRows = attendance.filter((entry) => entry.status !== "Absent" && entry.time_in);
  const attendanceCount = attendanceRows.length;
  const rawHoursWorked = Number(attendanceRows.reduce((sum, entry) => sum + hoursBetween(entry.time_in, entry.time_out), 0).toFixed(2));
  const hoursWorked = Math.min(rawHoursWorked, 24 * Math.max(1, attendanceCount));
  const creditedHours = Number((hoursWorked + expected.holidayPaidHours).toFixed(2));
  const expectedHours = Number(expected.expectedHours || 0);
  const requiredHours = Number(expected.requiredHours || 0);
  const hourDeficit = expectedHours > 0 ? Number(Math.max(0, expectedHours - creditedHours).toFixed(2)) : 0;
  const attendanceCompletion = expectedHours > 0 ? Number(Math.min(100, (creditedHours / expectedHours) * 100).toFixed(2)) : 100;
  let attendanceSalary = 0;
  let hourlyEquivalentRate = 0;
  if (payrollType === "Per Hour") {
    attendanceSalary = hoursWorked * salaryRate;
    hourlyEquivalentRate = salaryRate;
  } else if (payrollType === "Per Day") {
    hourlyEquivalentRate = requiredHours > 0 ? salaryRate / requiredHours : 0;
    attendanceSalary = attendanceRows.reduce((sum, entry) => {
      const rendered = Math.min(hoursBetween(entry.time_in, entry.time_out), requiredHours || 24);
      return sum + (requiredHours > 0 && rendered < requiredHours ? rendered * hourlyEquivalentRate : salaryRate);
    }, 0);
    if (expected.holidayPaidHours > 0 && requiredHours > 0) attendanceSalary += (expected.holidayPaidHours / requiredHours) * salaryRate;
  } else {
    hourlyEquivalentRate = requiredHours > 0 ? salaryRate / requiredHours : 0;
    attendanceSalary = expectedHours > 0 ? Math.min(salaryRate, creditedHours * hourlyEquivalentRate) : salaryRate;
  }
  const labor = database.prepare(`
    WITH allocated AS (
      SELECT job_orders.id,
             CASE
               WHEN job_payroll_allocations.allocation_type = 'Fixed' THEN job_payroll_allocations.fixed_amount
               ELSE (job_orders.labor_cost + job_orders.additional_labor_cost) * (job_payroll_allocations.percentage / 100.0)
             END as labor_share,
             CASE
               WHEN job_payroll_allocations.allocation_type = 'Fixed' THEN job_payroll_allocations.fixed_amount
               ELSE job_orders.additional_labor_cost * (job_payroll_allocations.percentage / 100.0)
             END as additional_share
      FROM job_payroll_allocations
      JOIN job_orders ON job_orders.id = job_payroll_allocations.job_order_id
      WHERE job_payroll_allocations.mechanic_id = ?
        AND job_orders.status = 'Completed'
        AND date(COALESCE(job_orders.paid_at, job_orders.created_at)) BETWEEN date(?) AND date(?)
    ),
    legacy AS (
      SELECT job_orders.id,
             job_orders.labor_cost + job_orders.additional_labor_cost as labor_share,
             job_orders.additional_labor_cost as additional_share
      FROM job_orders
      WHERE job_orders.mechanic_id = ?
        AND job_orders.status = 'Completed'
        AND date(COALESCE(job_orders.paid_at, job_orders.created_at)) BETWEEN date(?) AND date(?)
        AND NOT EXISTS (SELECT 1 FROM job_payroll_allocations WHERE job_payroll_allocations.job_order_id = job_orders.id)
    )
    SELECT COUNT(*) as servicesCompleted,
           COALESCE(SUM(labor_share), 0) as laborFees,
           COALESCE(SUM(additional_share), 0) as additionalLabor
    FROM (SELECT * FROM allocated UNION ALL SELECT * FROM legacy)
  `).get(mechanicId, periodStart, periodEnd, mechanicId, periodStart, periodEnd) as { servicesCompleted: number; laborFees: number; additionalLabor: number };
  const commissionRate = Number(mechanic.labor_commission_percentage || 0);
  const laborCommission = compensationType === "Fixed Salary" ? 0 : Number(labor.laborFees || 0) * (commissionRate / 100);
  const baseSalary = compensationType === "Commission" ? 0 : attendanceSalary;
  const additionalIncentives = compensationType === "Fixed Salary" ? 0 : Number(labor.additionalLabor || 0) * (commissionRate / 100);
  const grossPay = Math.max(0, baseSalary + laborCommission);
  const netPay = Math.max(0, grossPay - Math.max(0, deductions));
  return {
    mechanic,
    attendanceCount,
    hoursWorked,
    requiredHours,
    expectedHours,
    creditedHours,
    hourDeficit,
    attendanceCompletion,
    hourlyEquivalentRate,
    holidayPaidHours: expected.holidayPaidHours,
    payrollType,
    compensationType,
    baseSalary,
    laborCommission,
    additionalIncentives,
    deductions: Math.max(0, deductions),
    grossPay,
    netPay,
    servicesCompleted: labor.servicesCompleted,
    laborFees: Number(labor.laborFees || 0),
    additionalLabor: Number(labor.additionalLabor || 0)
  };
}

function payrollRunById(database: Database.Database, payrollId: number) {
  return database.prepare(`
    SELECT payroll_runs.*, users.name as mechanic_name, users.mechanic_code, processors.name as processed_by_name,
           approvers.name as approved_by_name, payers.name as paid_by_name, payroll_cutoffs.name as cutoff_name,
           payroll_cutoffs.pay_date as cutoff_pay_date
    FROM payroll_runs
    JOIN users ON users.id = payroll_runs.mechanic_id
    LEFT JOIN users processors ON processors.id = payroll_runs.processed_by
    LEFT JOIN users approvers ON approvers.id = payroll_runs.approved_by
    LEFT JOIN users payers ON payers.id = payroll_runs.paid_by
    LEFT JOIN payroll_cutoffs ON payroll_cutoffs.id = payroll_runs.cutoff_id
    WHERE payroll_runs.id = ?
  `).get(payrollId);
}

function payrollSnapshot(database: Database.Database, computed: ReturnType<typeof computePayroll>, periodStart: string, periodEnd: string) {
  const attendance = database.prepare(`
    SELECT * FROM mechanic_attendance
    WHERE mechanic_id = ? AND attendance_date BETWEEN ? AND ?
    ORDER BY attendance_date, id
  `).all(computed.mechanic.id, periodStart, periodEnd);
  const allocations = database.prepare(`
    SELECT job_payroll_allocations.*, job_orders.job_no, job_orders.labor_cost, job_orders.additional_labor_cost
    FROM job_payroll_allocations
    JOIN job_orders ON job_orders.id = job_payroll_allocations.job_order_id
    WHERE job_payroll_allocations.mechanic_id = ?
      AND job_orders.status = 'Completed'
      AND date(COALESCE(job_orders.paid_at, job_orders.created_at)) BETWEEN date(?) AND date(?)
    ORDER BY job_orders.id, job_payroll_allocations.id
  `).all(computed.mechanic.id, periodStart, periodEnd);
  return {
    attendanceSnapshot: JSON.stringify(attendance),
    payrollSettingsSnapshot: JSON.stringify(payrollSettings(database)),
    mechanicRateSnapshot: JSON.stringify({
      mechanicId: computed.mechanic.id,
      name: computed.mechanic.name,
      payrollType: computed.payrollType,
      salaryRate: Number(computed.mechanic.salary_rate || 0),
      compensationType: computed.compensationType,
      laborCommissionPercentage: Number(computed.mechanic.labor_commission_percentage || 0)
    }),
    commissionSnapshot: JSON.stringify({
      servicesCompleted: computed.servicesCompleted,
      laborFees: computed.laborFees,
      additionalLabor: computed.additionalLabor,
      laborCommission: computed.laborCommission,
      additionalIncentives: computed.additionalIncentives,
      allocations
    }),
    computedTotalsSnapshot: JSON.stringify({
      attendanceCount: computed.attendanceCount,
      hoursWorked: computed.hoursWorked,
      requiredHours: computed.requiredHours,
      expectedHours: computed.expectedHours,
      creditedHours: computed.creditedHours,
      hourDeficit: computed.hourDeficit,
      attendanceCompletion: computed.attendanceCompletion,
      baseSalary: computed.baseSalary,
      grossPay: computed.grossPay,
      deductions: computed.deductions,
      netPay: computed.netPay
    })
  };
}

function validatePayrollPeriod(periodStart: string, periodEnd: string) {
  if (!periodStart || !periodEnd || periodStart > periodEnd) throw new Error("Valid payroll period is required.");
}

function payrollCutoffById(database: Database.Database, cutoffId: number) {
  return database.prepare("SELECT * FROM payroll_cutoffs WHERE id = ?").get(cutoffId) as { id: number; name: string; period_start: string; period_end: string; pay_date: string; status: string; branch_id?: number | null } | undefined;
}

function ensureLegacyCutoff(database: Database.Database, actorId: number, periodStart: string, periodEnd: string) {
  const existing = database.prepare("SELECT * FROM payroll_cutoffs WHERE period_start = ? AND period_end = ? AND status <> 'Cancelled' ORDER BY id LIMIT 1").get(periodStart, periodEnd) as ReturnType<typeof payrollCutoffById>;
  if (existing) return existing;
  const createdAt = now();
  const name = `${periodStart} to ${periodEnd}`;
  const result = database.prepare(`
    INSERT INTO payroll_cutoffs (name, period_start, period_end, pay_date, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Open', ?, ?, ?)
  `).run(name, periodStart, periodEnd, periodEnd, actorId, createdAt, createdAt);
  return payrollCutoffById(database, Number(result.lastInsertRowid));
}

export function createPayrollCutoff(payload: { actorId: number; name: string; periodStart: string; periodEnd: string; payDate: string; branchId?: number | null }) {
  const database = getDatabase();
  requirePayrollPermission(database, payload.actorId, "generate_payroll");
  const name = payload.name.trim();
  if (!name) throw new Error("Cutoff name is required.");
  validatePayrollPeriod(payload.periodStart, payload.periodEnd);
  if (!payload.payDate) throw new Error("Pay date is required.");
  const branchId = payload.branchId || null;
  const overlap = database.prepare(`
    SELECT id FROM payroll_cutoffs
    WHERE status <> 'Cancelled'
      AND COALESCE(branch_id, 0) = COALESCE(?, 0)
      AND NOT (period_end < ? OR period_start > ?)
    LIMIT 1
  `).get(branchId, payload.periodStart, payload.periodEnd);
  if (overlap) throw new Error("Payroll cutoff overlaps an existing cutoff.");
  const createdAt = now();
  const result = database.prepare(`
    INSERT INTO payroll_cutoffs (branch_id, name, period_start, period_end, pay_date, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'Open', ?, ?, ?)
  `).run(branchId, name, payload.periodStart, payload.periodEnd, payload.payDate, payload.actorId, createdAt, createdAt);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Created",
    "Payroll Cutoff",
    `Created payroll cutoff ${name} (${payload.periodStart} to ${payload.periodEnd})`,
    createdAt
  );
  return payrollCutoffById(database, Number(result.lastInsertRowid));
}

export function generatePayroll(payload: { actorId: number; mechanicId: number; periodStart?: string; periodEnd?: string; cutoffId?: number; deductions?: number }) {
  const database = getDatabase();
  requirePayrollPermission(database, payload.actorId, "generate_payroll");
  const selectedCutoff = payload.cutoffId ? payrollCutoffById(database, payload.cutoffId) : undefined;
  if (payload.cutoffId && !selectedCutoff) throw new Error("Payroll cutoff was not found.");
  if (selectedCutoff?.status === "Cancelled") throw new Error("Cancelled payroll cutoffs cannot be used.");
  const periodStart = selectedCutoff?.period_start || payload.periodStart || "";
  const periodEnd = selectedCutoff?.period_end || payload.periodEnd || "";
  validatePayrollPeriod(periodStart, periodEnd);
  const cutoff = selectedCutoff || ensureLegacyCutoff(database, payload.actorId, periodStart, periodEnd);
  const existing = cutoff?.id
    ? database.prepare("SELECT id FROM payroll_runs WHERE mechanic_id = ? AND cutoff_id = ? AND status NOT IN ('Cancelled','Void')").get(payload.mechanicId, cutoff.id)
    : database.prepare("SELECT id FROM payroll_runs WHERE mechanic_id = ? AND period_start = ? AND period_end = ? AND status NOT IN ('Cancelled','Void')").get(payload.mechanicId, periodStart, periodEnd);
  if (existing) throw new Error("Payroll already exists for this mechanic and period.");
  const computed = computePayroll(database, payload.mechanicId, periodStart, periodEnd, payload.deductions || 0);
  const snapshot = payrollSnapshot(database, computed, periodStart, periodEnd);
  const createdAt = now();
  const result = database.prepare(`
    INSERT INTO payroll_runs (
      mechanic_id, cutoff_id, branch_id, period_start, period_end, payroll_type, compensation_type, attendance_count, hours_worked,
      required_hours, expected_hours, credited_hours, hour_deficit, attendance_completion, hourly_equivalent_rate, holiday_paid_hours,
      base_salary, labor_commission, additional_incentives, deductions, gross_pay, net_pay, status, processed_by,
      attendance_snapshot_json, payroll_settings_snapshot_json, mechanic_rate_snapshot_json, commission_snapshot_json,
      computed_totals_snapshot_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.mechanicId,
    cutoff?.id || null,
    cutoff?.branch_id || null,
    periodStart,
    periodEnd,
    computed.payrollType,
    computed.compensationType,
    computed.attendanceCount,
    computed.hoursWorked,
    computed.requiredHours,
    computed.expectedHours,
    computed.creditedHours,
    computed.hourDeficit,
    computed.attendanceCompletion,
    computed.hourlyEquivalentRate,
    computed.holidayPaidHours,
    computed.baseSalary,
    computed.laborCommission,
    computed.additionalIncentives,
    computed.deductions,
    computed.grossPay,
    computed.netPay,
    payload.actorId,
    snapshot.attendanceSnapshot,
    snapshot.payrollSettingsSnapshot,
    snapshot.mechanicRateSnapshot,
    snapshot.commissionSnapshot,
    snapshot.computedTotalsSnapshot,
    createdAt,
    createdAt
  );
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Generated",
    "Payroll",
    `Generated draft payroll for ${computed.mechanic.name} ${periodStart} to ${periodEnd}`,
    createdAt
  );
  return payrollRunById(database, Number(result.lastInsertRowid));
}

function transitionPayrollStatus(payload: { actorId: number; payrollId: number; nextStatus: "Pending Review" | "Approved" | "Cancelled" | "Void"; reason?: string }) {
  const database = getDatabase();
  const permission = payload.nextStatus === "Approved" ? "approve_payroll" : payload.nextStatus === "Pending Review" ? "review_payroll" : "approve_payroll";
  requirePayrollPermission(database, payload.actorId, permission);
  const payroll = database.prepare("SELECT * FROM payroll_runs WHERE id = ?").get(payload.payrollId) as { id: number; status: string; locked_at?: string | null; mechanic_id: number } | undefined;
  if (!payroll) throw new Error("Payroll was not found.");
  const from = payroll.status === "Pending" ? "Draft" : payroll.status;
  const allowed: Record<string, string[]> = {
    Draft: ["Pending Review", "Approved", "Cancelled"],
    "Pending Review": ["Approved", "Cancelled"],
    Approved: ["Void"],
    Paid: ["Void"]
  };
  if (!allowed[from]?.includes(payload.nextStatus)) throw new Error(`Cannot move payroll from ${from} to ${payload.nextStatus}.`);
  if ((payload.nextStatus === "Cancelled" || payload.nextStatus === "Void") && !payload.reason?.trim()) throw new Error("A reason is required for payroll cancellation or void.");
  const changedAt = now();
  const lockAt = payload.nextStatus === "Approved" || payload.nextStatus === "Void" ? (payroll.locked_at || changedAt) : payroll.locked_at || null;
  database.prepare(`
    UPDATE payroll_runs
    SET status = ?, approved_by = CASE WHEN ? = 'Approved' THEN ? ELSE approved_by END,
        approved_at = CASE WHEN ? = 'Approved' THEN ? ELSE approved_at END,
        voided_by = CASE WHEN ? = 'Void' THEN ? ELSE voided_by END,
        voided_at = CASE WHEN ? = 'Void' THEN ? ELSE voided_at END,
        status_reason = CASE WHEN ? IN ('Cancelled','Void') THEN ? ELSE status_reason END,
        locked_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    payload.nextStatus,
    payload.nextStatus,
    payload.actorId,
    payload.nextStatus,
    changedAt,
    payload.nextStatus,
    payload.actorId,
    payload.nextStatus,
    changedAt,
    payload.nextStatus,
    payload.reason?.trim() || "",
    lockAt,
    changedAt,
    payload.payrollId
  );
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    payload.nextStatus,
    "Payroll",
    `Payroll #${payload.payrollId} moved from ${from} to ${payload.nextStatus}${payload.reason ? `: ${payload.reason.trim()}` : ""}`,
    changedAt
  );
  return payrollRunById(database, payload.payrollId);
}

export function submitPayrollForReview(payload: { actorId: number; payrollId: number }) {
  return transitionPayrollStatus({ ...payload, nextStatus: "Pending Review" });
}

export function approvePayrollRun(payload: { actorId: number; payrollId: number }) {
  return transitionPayrollStatus({ ...payload, nextStatus: "Approved" });
}

export function cancelPayrollRun(payload: { actorId: number; payrollId: number; reason: string }) {
  return transitionPayrollStatus({ ...payload, nextStatus: "Cancelled" });
}

export function voidPayrollRun(payload: { actorId: number; payrollId: number; reason: string }) {
  return transitionPayrollStatus({ ...payload, nextStatus: "Void" });
}

export function markPayrollPaid(payload: { actorId: number; payrollId: number; paymentMethod?: string }) {
  const database = getDatabase();
  requirePayrollPermission(database, payload.actorId, "release_payroll");
  const payroll = database.prepare("SELECT id, status, locked_at FROM payroll_runs WHERE id = ?").get(payload.payrollId) as { id: number; status: string; locked_at?: string | null } | undefined;
  if (!payroll) throw new Error("Payroll was not found.");
  if (payroll.status === "Paid") throw new Error("Payroll is already paid.");
  if (payroll.status !== "Approved") throw new Error("Payroll must be approved before it can be marked paid.");
  const paidAt = now();
  database.prepare("UPDATE payroll_runs SET status = 'Paid', payment_date = ?, payment_method = ?, processed_by = ?, paid_by = ?, locked_at = COALESCE(locked_at, ?), updated_at = ? WHERE id = ?").run(
    paidAt,
    payload.paymentMethod?.trim() || "",
    payload.actorId,
    payload.actorId,
    paidAt,
    paidAt,
    payload.payrollId
  );
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Paid",
    "Payroll",
    `Marked payroll #${payload.payrollId} as paid`,
    paidAt
  );
  return { ok: true, paidAt };
}

function validateSupplierPayload(payload: { name: string; contact: string; phone: string }) {
  const name = payload.name.trim();
  const contact = payload.contact.trim();
  const phone = payload.phone.trim();
  if (!name) throw new Error("Supplier name is required.");
  if (!contact) throw new Error("Contact person is required.");
  if (!phone || !isValidContactNumber(phone)) throw new Error("Contact number must contain 10 to 11 digits and may include spaces, parentheses, or dashes.");
  return { name, contact, phone };
}

export function createSupplier(payload: { actorId: number; name: string; contact: string; phone: string }) {
  const database = getDatabase();
  requireSupplierManager(database, payload.actorId);
  const supplier = validateSupplierPayload(payload);
  const duplicate = database.prepare("SELECT id FROM suppliers WHERE lower(name) = lower(?)").get(supplier.name);
  if (duplicate) throw new Error("Supplier name must be unique.");
  const createdAt = now();
  const result = database.prepare("INSERT INTO suppliers (name, contact, phone, category) VALUES (?, ?, ?, '')").run(supplier.name, supplier.contact, supplier.phone);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Created",
    "Supplier",
    `Created supplier ${supplier.name}`,
    createdAt
  );
  return database.prepare("SELECT id, name, contact, phone FROM suppliers WHERE id = ?").get(result.lastInsertRowid);
}

export function updateSupplier(payload: { actorId: number; supplierId: number; name: string; contact: string; phone: string }) {
  const database = getDatabase();
  requireSupplierManager(database, payload.actorId);
  const current = database.prepare("SELECT id, name FROM suppliers WHERE id = ?").get(payload.supplierId) as { id: number; name: string } | undefined;
  if (!current) throw new Error("Supplier was not found.");
  const supplier = validateSupplierPayload(payload);
  const duplicate = database.prepare("SELECT id FROM suppliers WHERE lower(name) = lower(?) AND id <> ?").get(supplier.name, payload.supplierId);
  if (duplicate) throw new Error("Supplier name must be unique.");
  const updatedAt = now();
  database.prepare("UPDATE suppliers SET name = ?, contact = ?, phone = ?, category = '' WHERE id = ?").run(supplier.name, supplier.contact, supplier.phone, payload.supplierId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Supplier",
    `Updated supplier ${current.name} to ${supplier.name}`,
    updatedAt
  );
  return database.prepare("SELECT id, name, contact, phone FROM suppliers WHERE id = ?").get(payload.supplierId);
}

export function deleteSupplier(payload: { actorId: number; supplierId: number }) {
  const database = getDatabase();
  requireSupplierManager(database, payload.actorId);
  const current = database.prepare("SELECT id, name FROM suppliers WHERE id = ?").get(payload.supplierId) as { id: number; name: string } | undefined;
  if (!current) throw new Error("Supplier was not found.");
  const inUse = database.prepare("SELECT id FROM inventory WHERE supplier_id = ? LIMIT 1").get(payload.supplierId);
  if (inUse) throw new Error("This supplier is linked to inventory items and cannot be deleted.");
  const deletedAt = now();
  database.prepare("DELETE FROM suppliers WHERE id = ?").run(payload.supplierId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Deleted",
    "Supplier",
    `Deleted supplier ${current.name}`,
    deletedAt
  );
  return { ok: true };
}

export function createExpense(payload: { actorId: number; expenseDate: string; category: string; description: string; amount: number }) {
  const database = getDatabase();
  requireExpenseManager(database, payload.actorId);
  const expense = validateExpensePayload(payload);
  const createdAt = now();
  const result = database.prepare(`
    INSERT INTO expenses (expense_date, category, description, amount, recorded_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(expense.expenseDate, expense.category, expense.description, expense.amount, payload.actorId, createdAt, createdAt);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Created",
    "Expense",
    `Recorded ${expense.category} expense ${expense.amount.toFixed(2)}: ${expense.description}`,
    createdAt
  );
  return { id: Number(result.lastInsertRowid) };
}

export function updateExpense(payload: { actorId: number; expenseId: number; expenseDate: string; category: string; description: string; amount: number }) {
  const database = getDatabase();
  requireExpenseManager(database, payload.actorId);
  const current = database.prepare("SELECT id FROM expenses WHERE id = ?").get(payload.expenseId);
  if (!current) throw new Error("Expense was not found.");
  const expense = validateExpensePayload(payload);
  const updatedAt = now();
  database.prepare(`
    UPDATE expenses
    SET expense_date = ?, category = ?, description = ?, amount = ?, updated_at = ?
    WHERE id = ?
  `).run(expense.expenseDate, expense.category, expense.description, expense.amount, updatedAt, payload.expenseId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Expense",
    `Updated ${expense.category} expense ${expense.amount.toFixed(2)}: ${expense.description}`,
    updatedAt
  );
  return { ok: true };
}

export function deleteExpense(payload: { actorId: number; expenseId: number }) {
  const database = getDatabase();
  requireExpenseManager(database, payload.actorId);
  const expense = database.prepare("SELECT * FROM expenses WHERE id = ?").get(payload.expenseId) as { id: number; category: string; description: string; amount: number } | undefined;
  if (!expense) throw new Error("Expense was not found.");
  database.prepare("DELETE FROM expenses WHERE id = ?").run(payload.expenseId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Deleted",
    "Expense",
    `Deleted ${expense.category} expense ${Number(expense.amount).toFixed(2)}: ${expense.description}`,
    now()
  );
  return { ok: true };
}

function validateExpensePayload(payload: { expenseDate: string; category: string; description: string; amount: number }) {
  const expenseDate = payload.expenseDate.trim();
  const category = payload.category.trim();
  const description = payload.description.trim();
  const amount = Number(payload.amount);
  if (!expenseDate) throw new Error("Expense date is required.");
  if (!category) throw new Error("Expense category is required.");
  if (!description) throw new Error("Expense description is required.");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Expense amount must be zero or greater.");
  return { expenseDate, category, description, amount };
}

function normalizeCategoryCode(code: string) {
  return code.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function nextProductCode(database: Database.Database, categoryId: number) {
  const category = database.prepare("SELECT id, code FROM inventory_categories WHERE id = ?").get(categoryId) as { id: number; code: string } | undefined;
  if (!category) throw new Error("Category must exist before assigning an item.");
  const existing = database.prepare("SELECT product_code FROM inventory WHERE category_id = ? AND product_code LIKE ?").all(categoryId, `${category.code}-%`) as Array<{ product_code: string }>;
  const maxSequence = existing.reduce((max, item) => {
    const match = item.product_code?.match(/-(\d+)$/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  return `${category.code}-${String(maxSequence + 1).padStart(3, "0")}`;
}

export function createInventoryCategory(payload: { actorId: number; name: string; code: string }) {
  const database = getDatabase();
  requireInventoryManager(database, payload.actorId);
  const name = payload.name.trim();
  const code = normalizeCategoryCode(payload.code);
  if (!name) throw new Error("Category name is required.");
  if (!code) throw new Error("Category code is required.");
  const duplicate = database.prepare("SELECT id FROM inventory_categories WHERE lower(name) = lower(?) OR code = ?").get(name, code);
  if (duplicate) throw new Error("Category name or code already exists.");
  const result = database.prepare("INSERT INTO inventory_categories (name, code, created_at) VALUES (?, ?, ?)").run(name, code, now());
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Created", "Inventory Category", `Created ${name} (${code})`, now());
  return database.prepare("SELECT * FROM inventory_categories WHERE id = ?").get(result.lastInsertRowid);
}

export function deleteInventoryCategory(payload: { actorId: number; categoryId: number }) {
  const database = getDatabase();
  requireInventoryManager(database, payload.actorId);
  const category = database.prepare("SELECT id, name, code FROM inventory_categories WHERE id = ?").get(payload.categoryId) as
    | { id: number; name: string; code: string }
    | undefined;
  if (!category) throw new Error("Category was not found.");
  const itemCount = database.prepare("SELECT COUNT(*) as count FROM inventory WHERE category_id = ?").get(payload.categoryId) as { count: number };
  if (itemCount.count > 0) throw new Error("This category still has inventory items and cannot be deleted.");
  database.prepare("DELETE FROM inventory_categories WHERE id = ?").run(payload.categoryId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Deleted",
    "Inventory Category",
    `Deleted ${category.name} (${category.code})`,
    now()
  );
  return { ok: true };
}

export function createInventoryItem(payload: { actorId: number; categoryId: number; name: string; stock: number; reorderLevel?: number; unitCost?: number; sellPrice: number; supplierId?: number | null }) {
  const database = getDatabase();
  requireInventoryManager(database, payload.actorId);
  const name = payload.name.trim();
  const stock = Number(payload.stock);
  const reorderLevel = Number(payload.reorderLevel ?? 0);
  const unitCost = Number(payload.unitCost ?? 0);
  const sellPrice = Number(payload.sellPrice);
  if (!name) throw new Error("Item name is required.");
  if (!Number.isFinite(stock) || stock < 0) throw new Error("Stock count must be zero or higher.");
  if (!Number.isFinite(reorderLevel) || reorderLevel < 0) throw new Error("Reorder level must be zero or higher.");
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Unit cost must be zero or higher.");
  if (!Number.isFinite(sellPrice) || sellPrice < 0) throw new Error("Sell price must be zero or higher.");
  const category = database.prepare("SELECT id, name FROM inventory_categories WHERE id = ?").get(payload.categoryId) as { id: number; name: string } | undefined;
  if (!category) throw new Error("Category must exist before assigning an item.");
  const productCode = nextProductCode(database, category.id);
  database.prepare(`
    INSERT INTO inventory (sku, product_code, category_id, name, category, supplier_id, stock, reorder_level, unit_cost, sell_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(productCode, productCode, category.id, name, category.name, payload.supplierId || null, Math.floor(stock), Math.floor(reorderLevel), unitCost, sellPrice);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Created", "Inventory", `Created ${productCode} ${name}`, now());
  return { productCode };
}

export function updateInventoryItem(payload: { actorId: number; itemId: number; categoryId: number; name: string; stock: number; reorderLevel?: number; unitCost?: number; sellPrice: number; supplierId?: number | null }) {
  const database = getDatabase();
  requireInventoryManager(database, payload.actorId);
  const item = database.prepare("SELECT id, product_code, reorder_level, unit_cost FROM inventory WHERE id = ?").get(payload.itemId) as { id: number; product_code: string; reorder_level: number; unit_cost: number } | undefined;
  if (!item) throw new Error("Inventory item was not found.");
  const category = database.prepare("SELECT id, name FROM inventory_categories WHERE id = ?").get(payload.categoryId) as { id: number; name: string } | undefined;
  if (!category) throw new Error("Category must exist before assigning an item.");
  const name = payload.name.trim();
  const stock = Number(payload.stock);
  const reorderLevel = Number(payload.reorderLevel ?? item.reorder_level ?? 0);
  const unitCost = Number(payload.unitCost ?? item.unit_cost ?? 0);
  const sellPrice = Number(payload.sellPrice);
  if (!name) throw new Error("Item name is required.");
  if (!Number.isFinite(stock) || stock < 0) throw new Error("Stock count must be zero or higher.");
  if (!Number.isFinite(reorderLevel) || reorderLevel < 0) throw new Error("Reorder level must be zero or higher.");
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Unit cost must be zero or higher.");
  if (!Number.isFinite(sellPrice) || sellPrice < 0) throw new Error("Sell price must be zero or higher.");
  database.prepare("UPDATE inventory SET category_id = ?, category = ?, name = ?, supplier_id = ?, stock = ?, reorder_level = ?, unit_cost = ?, sell_price = ? WHERE id = ?").run(
    category.id,
    category.name,
    name,
    payload.supplierId || null,
    Math.floor(stock),
    Math.floor(reorderLevel),
    unitCost,
    sellPrice,
    payload.itemId
  );
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Updated", "Inventory", `Updated ${item.product_code}`, now());
  return { ok: true };
}

export function stockInInventoryItem(payload: { actorId: number; itemId: number; quantity: number; supplierId?: number | null; referenceNo?: string; reason: string }) {
  const database = getDatabase();
  requireInventoryManager(database, payload.actorId);
  const quantity = Math.floor(Number(payload.quantity));
  const reason = payload.reason.trim();
  const referenceNo = payload.referenceNo?.trim() ?? "";
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Stock in quantity must be greater than zero.");
  if (!reason) throw new Error("Reason is required.");
  const item = database.prepare("SELECT id, product_code, name, stock FROM inventory WHERE id = ?").get(payload.itemId) as { id: number; product_code: string; name: string; stock: number } | undefined;
  if (!item) throw new Error("Inventory item was not found.");
  if (payload.supplierId) {
    const supplier = database.prepare("SELECT id FROM suppliers WHERE id = ?").get(payload.supplierId);
    if (!supplier) throw new Error("Supplier was not found.");
  }
  const previousStock = Number(item.stock);
  const newStock = previousStock + quantity;
  if (!Number.isSafeInteger(newStock)) throw new Error("Stock in quantity is too large.");
  const createdAt = now();
  const transaction = database.transaction(() => {
    const updated = database.prepare("UPDATE inventory SET stock = ? WHERE id = ?").run(newStock, item.id);
    if (updated.changes !== 1) throw new Error("Inventory item was not updated. Please refresh and try again.");
    database.prepare(`
      INSERT INTO inventory_adjustments (item_id, actor_id, movement_type, quantity, previous_stock, new_stock, supplier_id, reference_no, reason, created_at)
      VALUES (?, ?, 'Stock In', ?, ?, ?, ?, ?, ?, ?)
    `).run(item.id, payload.actorId, quantity, previousStock, newStock, payload.supplierId || null, referenceNo, reason, createdAt);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
      payload.actorId,
      "Stock In",
      "Inventory",
      `Added ${quantity} stock to ${item.product_code} ${item.name}. ${previousStock} -> ${newStock}. Reason: ${reason}`,
      createdAt
    );
  });
  transaction();
  return { ok: true, previousStock, newStock };
}

type PurchaseOrderStatus = "Draft" | "Ordered" | "Partially Received" | "Received" | "Cancelled";

function nextPurchaseOrderNumber(database: Database.Database) {
  const datePart = now().slice(0, 10).replace(/-/g, "");
  const prefix = `PO-${datePart}`;
  const latest = database.prepare("SELECT order_no FROM purchase_orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1").get(`${prefix}-%`) as { order_no: string } | undefined;
  const latestSequence = Number(latest?.order_no.match(/-(\d+)$/)?.[1] ?? 0);
  return `${prefix}-${String(latestSequence + 1).padStart(4, "0")}`;
}

export function createPurchaseOrder(payload: {
  actorId: number;
  supplierId?: number | null;
  notes?: string;
  items: Array<{ itemId: number; quantityOrdered: number; unitCost?: number }>;
}) {
  const database = getDatabase();
  requireInventoryManager(database, payload.actorId);
  if (payload.supplierId) {
    const supplier = database.prepare("SELECT id FROM suppliers WHERE id = ?").get(payload.supplierId);
    if (!supplier) throw new Error("Supplier was not found.");
  }
  const itemRows = payload.items.map((item) => ({
    itemId: Number(item.itemId),
    quantityOrdered: Math.floor(Number(item.quantityOrdered)),
    unitCost: Math.max(0, Number(item.unitCost || 0))
  })).filter((item) => item.itemId > 0 && item.quantityOrdered > 0);
  if (!itemRows.length) throw new Error("Add at least one item to the purchase order.");
  if (new Set(itemRows.map((item) => item.itemId)).size !== itemRows.length) {
    throw new Error("Each purchase order item can only appear once.");
  }
  for (const item of itemRows) {
    const inventoryItem = database.prepare("SELECT id FROM inventory WHERE id = ?").get(item.itemId);
    if (!inventoryItem) throw new Error("A purchase order item was not found in inventory.");
  }

  const createdAt = now();
  const orderNo = nextPurchaseOrderNumber(database);
  const transaction = database.transaction(() => {
    const order = database.prepare(`
      INSERT INTO purchase_orders (order_no, supplier_id, status, notes, created_by, created_at, updated_at)
      VALUES (?, ?, 'Ordered', ?, ?, ?, ?)
    `).run(orderNo, payload.supplierId || null, payload.notes?.trim() ?? "", payload.actorId, createdAt, createdAt);
    const insertItem = database.prepare(`
      INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity_ordered, quantity_received, unit_cost)
      VALUES (?, ?, ?, 0, ?)
    `);
    for (const item of itemRows) insertItem.run(order.lastInsertRowid, item.itemId, item.quantityOrdered, item.unitCost);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
      payload.actorId,
      "Created",
      "Purchase Order",
      `Created ${orderNo} with ${itemRows.length} item(s)`,
      createdAt
    );
    return { id: Number(order.lastInsertRowid), orderNo };
  });
  return transaction();
}

export function updatePurchaseOrderStatus(payload: {
  actorId: number;
  purchaseOrderId: number;
  status: PurchaseOrderStatus;
  receivedItems?: Array<{ itemId: number; quantityReceived: number }>;
}) {
  const database = getDatabase();
  requireInventoryManager(database, payload.actorId);
  const allowed: PurchaseOrderStatus[] = ["Draft", "Ordered", "Partially Received", "Received", "Cancelled"];
  if (!allowed.includes(payload.status)) throw new Error("Invalid purchase order status.");
  const order = database.prepare("SELECT id, order_no, supplier_id, status FROM purchase_orders WHERE id = ?").get(payload.purchaseOrderId) as
    | { id: number; order_no: string; supplier_id?: number | null; status: PurchaseOrderStatus }
    | undefined;
  if (!order) throw new Error("Purchase order was not found.");
  if (order.status === "Cancelled") throw new Error("Cancelled purchase orders can no longer be updated.");
  const items = database.prepare("SELECT * FROM purchase_order_items WHERE purchase_order_id = ?").all(payload.purchaseOrderId) as Array<{
    id: number;
    item_id: number;
    quantity_ordered: number;
    quantity_received: number;
  }>;
  const receiveMap = new Map((payload.receivedItems ?? []).map((item) => [Number(item.itemId), Math.max(0, Math.floor(Number(item.quantityReceived) || 0))]));
  const updatedAt = now();

  const transaction = database.transaction(() => {
    if (payload.status === "Received" || payload.status === "Partially Received") {
      for (const item of items) {
        const targetReceived = payload.status === "Received" && !receiveMap.has(item.item_id)
          ? item.quantity_ordered
          : Math.min(item.quantity_ordered, receiveMap.get(item.item_id) ?? item.quantity_received);
        const delta = targetReceived - Number(item.quantity_received || 0);
        if (delta <= 0) continue;
        const inventoryItem = database.prepare("SELECT id, product_code, name, stock FROM inventory WHERE id = ?").get(item.item_id) as { id: number; product_code: string; name: string; stock: number } | undefined;
        if (!inventoryItem) throw new Error("Inventory item was not found while receiving purchase order.");
        const previousStock = Number(inventoryItem.stock);
        const newStock = previousStock + delta;
        database.prepare("UPDATE inventory SET stock = ? WHERE id = ?").run(newStock, item.item_id);
        database.prepare("UPDATE purchase_order_items SET quantity_received = ? WHERE id = ?").run(targetReceived, item.id);
        database.prepare(`
          INSERT INTO inventory_adjustments (item_id, actor_id, movement_type, quantity, previous_stock, new_stock, supplier_id, reference_no, reason, created_at)
          VALUES (?, ?, 'Stock In', ?, ?, ?, ?, ?, ?, ?)
        `).run(item.item_id, payload.actorId, delta, previousStock, newStock, order.supplier_id || null, order.order_no, "Purchase order received", updatedAt);
      }
    }

    const refreshed = database.prepare("SELECT quantity_ordered, quantity_received FROM purchase_order_items WHERE purchase_order_id = ?").all(payload.purchaseOrderId) as Array<{ quantity_ordered: number; quantity_received: number }>;
    const allReceived = refreshed.length > 0 && refreshed.every((item) => item.quantity_received >= item.quantity_ordered);
    const anyReceived = refreshed.some((item) => item.quantity_received > 0);
    const finalStatus = payload.status === "Cancelled"
      ? "Cancelled"
      : allReceived
        ? "Received"
        : anyReceived
          ? "Partially Received"
          : payload.status === "Received"
            ? "Ordered"
            : payload.status;
    database.prepare("UPDATE purchase_orders SET status = ?, updated_at = ?, received_at = ? WHERE id = ?").run(
      finalStatus,
      updatedAt,
      finalStatus === "Received" ? updatedAt : null,
      payload.purchaseOrderId
    );
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
      payload.actorId,
      "Updated",
      "Purchase Order",
      `Updated ${order.order_no} to ${finalStatus}`,
      updatedAt
    );
  });
  transaction();
  return { ok: true };
}

export function adjustInventoryStock(payload: { actorId: number; itemId: number; newStock: number; reason: string; referenceNo?: string }) {
  const database = getDatabase();
  requireInventoryManager(database, payload.actorId);
  const newStock = Math.floor(Number(payload.newStock));
  const reason = payload.reason.trim();
  const referenceNo = payload.referenceNo?.trim() ?? "";
  if (!Number.isFinite(newStock) || newStock < 0) throw new Error("Adjusted stock must be zero or higher.");
  if (!reason) throw new Error("Reason is required.");
  const item = database.prepare("SELECT id, product_code, name, stock FROM inventory WHERE id = ?").get(payload.itemId) as { id: number; product_code: string; name: string; stock: number } | undefined;
  if (!item) throw new Error("Inventory item was not found.");
  const previousStock = Number(item.stock);
  const quantityDelta = newStock - previousStock;
  const createdAt = now();
  const transaction = database.transaction(() => {
    const updated = database.prepare("UPDATE inventory SET stock = ? WHERE id = ?").run(newStock, item.id);
    if (updated.changes !== 1) throw new Error("Inventory item was not updated. Please refresh and try again.");
    database.prepare(`
      INSERT INTO inventory_adjustments (item_id, actor_id, movement_type, quantity, previous_stock, new_stock, supplier_id, reference_no, reason, created_at)
      VALUES (?, ?, 'Adjustment', ?, ?, ?, NULL, ?, ?, ?)
    `).run(item.id, payload.actorId, quantityDelta, previousStock, newStock, referenceNo, reason, createdAt);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
      payload.actorId,
      "Adjusted Stock",
      "Inventory",
      `Adjusted ${item.product_code} ${item.name}. ${previousStock} -> ${newStock}. Reason: ${reason}`,
      createdAt
    );
  });
  transaction();
  return { ok: true, previousStock, newStock };
}

export function deleteInventoryItem(payload: { actorId: number; itemId: number } & ApprovalPayload) {
  const database = getDatabase();
  requireInventoryManager(database, payload.actorId);
  const item = database.prepare("SELECT id, product_code, name FROM inventory WHERE id = ?").get(payload.itemId) as { id: number; product_code: string; name: string } | undefined;
  if (!item) throw new Error("Inventory item was not found.");
  const approval = requireSensitiveApproval(database, payload.actorId, payload, "Deleted Inventory Item", "Inventory", String(payload.itemId));
  const saleUse = database.prepare("SELECT id FROM sale_items WHERE item_type = 'part' AND item_id = ? LIMIT 1").get(payload.itemId);
  const jobOrders = database.prepare("SELECT id, products_json FROM job_orders WHERE paid_at IS NULL").all() as Array<{ id: number; products_json: string }>;
  const jobUse = jobOrders.some((job) => {
    try {
      return (JSON.parse(job.products_json || "[]") as Array<{ itemId: number }>).some((product) => product.itemId === payload.itemId);
    } catch {
      return false;
    }
  });
  if (saleUse || jobUse) throw new Error("This item is already used in transactions and cannot be deleted.");
  database.prepare("DELETE FROM inventory WHERE id = ?").run(payload.itemId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Deleted", "Inventory", `Deleted ${item.product_code} ${item.name}. Approved by ${approval.name}. Reason: ${approval.reason}`, now());
  return { ok: true };
}

export function login(username: string, password: string): UserAccount | null {
  const database = getDatabase();
  const superAdmin = database
    .prepare("SELECT * FROM super_admins WHERE lower(username) = lower(?) AND status = 'Active'")
    .get(username.trim()) as { id: number; name: string; username: string; password_hash: string; status: "Active" | "Disabled" } | undefined;
  if (superAdmin && verifyPassword(password, superAdmin.password_hash)) {
    recordSystemLog({ superAdminId: superAdmin.id, action: "Login", details: `Super Admin ${superAdmin.username} signed in.` });
    return {
      id: superAdmin.id,
      name: superAdmin.name,
      role: "SuperAdmin",
      username: superAdmin.username,
      contact_number: "",
      address: "",
      email: "",
      is_mechanic: 0,
      must_change_password: 0,
      status: superAdmin.status
    };
  }

  if (isTrialExpired(database)) throw new Error("Trial period has expired. Please contact your system provider.");

  const user = database
    .prepare("SELECT * FROM users WHERE lower(username) = lower(?) AND status = 'Active'")
    .get(username.trim()) as (UserAccount & { password_hash: string }) | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return sanitizeUser(user);
}

export function changePassword(payload: { userId: number; currentPassword: string; newPassword: string }) {
  const database = getDatabase();
  const user = database.prepare("SELECT * FROM users WHERE id = ? AND status = 'Active'").get(payload.userId) as
    | (UserAccount & { password_hash: string })
    | undefined;
  if (!user || !verifyPassword(payload.currentPassword, user.password_hash)) throw new Error("Current password is incorrect.");
  validatePassword(payload.newPassword);
  database.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(hashPassword(payload.newPassword), payload.userId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.userId,
    "Changed password",
    "User",
    `User ${user.username} completed first-login password change`,
    now()
  );
  return sanitizeUser({ ...user, must_change_password: 0 });
}

export function createUser(payload: {
  creatorId: number;
  role: Role;
  name: string;
  contactNumber: string;
  address: string;
  email?: string;
  username: string;
}) {
  const database = getDatabase();
  const creator = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(payload.creatorId) as { id: number; role: Role } | undefined;
  if (!creator || creator.role !== "Owner") throw new Error("Only Owner accounts can create users.");

  const username = payload.username.trim();
  const email = payload.email?.trim() ?? "";
  validateUserPayload({ ...payload, username, email });

  const duplicate = database.prepare("SELECT id FROM users WHERE lower(username) = lower(?)").get(username);
  if (duplicate) throw new Error("Username already exists.");

  const temporaryPassword = generateTemporaryPassword();
  const result = database.prepare(`
    INSERT INTO users (
      name, role, pin, username, password_hash, contact_number, address, email,
      must_change_password, status, created_by, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active', ?, ?)
  `).run(
    payload.name.trim(),
    payload.role,
    "",
    username,
    hashPassword(temporaryPassword),
    payload.contactNumber.trim(),
    payload.address.trim(),
    email,
    payload.creatorId,
    now()
  );

  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.creatorId,
    "Created",
    "User",
    `Created ${payload.role} account ${username}`,
    now()
  );

  return {
    user: sanitizeUser(database.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid) as UserAccount),
    credentials: {
      username,
      temporaryPassword,
      emailSent: false
    }
  };
}

export function disableUser(payload: { ownerId: number; targetUserId: number }) {
  const database = getDatabase();
  const owner = database.prepare("SELECT id, role, username FROM users WHERE id = ? AND status = 'Active'").get(payload.ownerId) as
    | { id: number; role: Role; username: string }
    | undefined;
  if (!owner || owner.role !== "Owner") throw new Error("Only Owner accounts can disable users.");
  if (payload.ownerId === payload.targetUserId) throw new Error("You cannot disable your own account while signed in.");

  const target = database.prepare("SELECT id, username, status FROM users WHERE id = ?").get(payload.targetUserId) as
    | { id: number; username: string; status: "Active" | "Disabled" }
    | undefined;
  if (!target) throw new Error("User account was not found.");
  if (target.status === "Disabled") throw new Error("This account is already disabled.");

  database.prepare("UPDATE users SET status = 'Disabled' WHERE id = ?").run(payload.targetUserId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.ownerId,
    "Disabled",
    "User",
    `Disabled account ${target.username}`,
    now()
  );
  return { ok: true };
}

export function enableUser(payload: { ownerId: number; targetUserId: number }) {
  const database = getDatabase();
  const owner = database.prepare("SELECT id, role, username FROM users WHERE id = ? AND status = 'Active'").get(payload.ownerId) as
    | { id: number; role: Role; username: string }
    | undefined;
  if (!owner || owner.role !== "Owner") throw new Error("Only Owner accounts can re-enable users.");

  const target = database.prepare("SELECT id, username, status FROM users WHERE id = ?").get(payload.targetUserId) as
    | { id: number; username: string; status: "Active" | "Disabled" }
    | undefined;
  if (!target) throw new Error("User account was not found.");
  if (target.status === "Active") throw new Error("This account is already active.");

  database.prepare("UPDATE users SET status = 'Active' WHERE id = ?").run(payload.targetUserId);
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.ownerId,
    "Re-enabled",
    "User",
    `Re-enabled account ${target.username}`,
    now()
  );
  return { ok: true };
}

type JobPayrollAllocationInput = {
  mechanicId: number;
  allocationRole?: string;
  allocationType?: "Percent" | "Fixed";
  percentage?: number;
  fixedAmount?: number;
  isLead?: boolean;
};

function normalizeJobPayrollAllocations(database: Database.Database, allocations: JobPayrollAllocationInput[]) {
  if (!allocations.length) throw new Error("At least one payroll allocation is required.");
  const normalized = allocations.map((allocation) => {
    const mechanic = database.prepare("SELECT id FROM users WHERE id = ? AND status = 'Active' AND is_mechanic = 1").get(allocation.mechanicId);
    if (!mechanic) throw new Error("Payroll allocation mechanic was not found.");
    const allocationType = allocation.allocationType === "Fixed" ? "Fixed" : "Percent";
    const percentage = Math.max(0, Number(allocation.percentage || 0));
    const fixedAmount = Math.max(0, Number(allocation.fixedAmount || 0));
    if (allocationType === "Percent" && percentage <= 0) throw new Error("Percent allocations must be greater than zero.");
    if (allocationType === "Fixed" && fixedAmount <= 0) throw new Error("Fixed allocations must be greater than zero.");
    return {
      mechanicId: allocation.mechanicId,
      allocationRole: (allocation.allocationRole || (allocation.isLead ? "Lead" : "Helper")).trim() || "Helper",
      allocationType,
      percentage,
      fixedAmount,
      isLead: allocation.isLead ? 1 : 0
    };
  });
  const percentTotal = normalized.filter((allocation) => allocation.allocationType === "Percent").reduce((sum, allocation) => sum + allocation.percentage, 0);
  if (percentTotal > 100.001) throw new Error("Percent payroll allocations cannot exceed 100%.");
  if (!normalized.some((allocation) => allocation.isLead)) normalized[0].isLead = 1;
  return normalized;
}

function upsertJobPayrollAllocations(database: Database.Database, jobOrderId: number, allocations: JobPayrollAllocationInput[]) {
  const normalized = normalizeJobPayrollAllocations(database, allocations);
  const timestamp = now();
  database.prepare("DELETE FROM job_payroll_allocations WHERE job_order_id = ?").run(jobOrderId);
  const insert = database.prepare(`
    INSERT INTO job_payroll_allocations (
      job_order_id, mechanic_id, allocation_role, allocation_type, percentage, fixed_amount, is_lead, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const allocation of normalized) {
    insert.run(jobOrderId, allocation.mechanicId, allocation.allocationRole, allocation.allocationType, allocation.percentage, allocation.fixedAmount, allocation.isLead, timestamp, timestamp);
  }
  return normalized;
}

export function createJobOrder(payload: {
  actorId: number;
  customerName: string;
  contactNumber: string;
  motorcycleType: string;
  plateNumber: string;
  serviceId: number;
  mechanicId: number;
  branchId?: number;
}) {
  const database = getDatabase();
  const customerName = payload.customerName.trim();
  const contactNumber = payload.contactNumber.trim();
  const motorcycleType = payload.motorcycleType.trim();
  const plateNumber = payload.plateNumber.trim().toUpperCase();
  if (!customerName) throw new Error("Customer name is required.");
  if (!isValidContactNumber(contactNumber)) throw new Error("Contact number must contain 10 to 11 digits and may include spaces, parentheses, or dashes.");
  if (!motorcycleType) throw new Error("Motorcycle type is required.");
  if (!plateNumber) throw new Error("Plate number is required.");

  const service = database.prepare("SELECT id, name, price, labor_cost FROM services WHERE id = ?").get(payload.serviceId) as { id: number; name: string; price: number; labor_cost: number } | undefined;
  if (!service) throw new Error("Service to avail is required.");
  const servicePrice = Number(service.price);
  const laborCost = Number(service.labor_cost || 0);
  const serviceTotal = servicePrice + laborCost;
  const mechanic = database.prepare("SELECT id, branch_id FROM users WHERE id = ? AND status = 'Active' AND is_mechanic = 1 AND role NOT IN ('Owner', 'Admin')").get(payload.mechanicId) as { id: number; branch_id?: number | null } | undefined;
  if (!mechanic) throw new Error("Select mechanic is required.");
  const branchId = payload.branchId || mechanic.branch_id || (database.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get() as { id: number } | undefined)?.id || null;

  const createdAt = now();
  const datePart = createdAt.slice(0, 10).replace(/-/g, "");
  const count = database.prepare("SELECT COUNT(*) as count FROM job_orders WHERE job_no LIKE ?").get(`JO-${datePart}-%`) as { count: number };
  const jobNo = `JO-${datePart}-${String(count.count + 1).padStart(5, "0")}`;

  const transaction = database.transaction(() => {
    const customer = database.prepare("INSERT INTO customers (name, phone, email, address, created_at) VALUES (?, ?, '', '', ?)").run(customerName, contactNumber, createdAt);
    const motorcycle = database.prepare("INSERT INTO motorcycles (customer_id, plate_no, brand, model, year, color) VALUES (?, ?, ?, '', NULL, '')").run(
      customer.lastInsertRowid,
      plateNumber,
      motorcycleType
    );
    const job = database.prepare(`
      INSERT INTO job_orders (
        job_no, customer_id, motorcycle_id, mechanic_id, branch_id, status, concern, estimate, created_at, due_at,
        customer_name, contact_number, motorcycle_type, plate_number, service_id, service_price, labor_cost, additional_labor_cost,
        service_cost, products_json, products_cost, total_amount
      )
      VALUES (?, ?, ?, ?, ?, 'In Progress', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '[]', 0, ?)
    `).run(
      jobNo,
      customer.lastInsertRowid,
      motorcycle.lastInsertRowid,
      payload.mechanicId,
      branchId,
      service.name,
      serviceTotal,
      createdAt,
      createdAt,
      customerName,
      contactNumber,
      motorcycleType,
      plateNumber,
      service.id,
      servicePrice,
      laborCost,
      serviceTotal,
      serviceTotal
    );
    upsertJobPayrollAllocations(database, Number(job.lastInsertRowid), [{ mechanicId: payload.mechanicId, allocationRole: "Lead", allocationType: "Percent", percentage: 100, fixedAmount: 0, isLead: true }]);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
      payload.actorId,
      "Created",
      "Job Order",
      `Created ${jobNo}`,
      createdAt
    );
    logJobStatus(database, Number(job.lastInsertRowid), payload.actorId, "Created", `Job order ${jobNo} created.`);
    logJobStatus(database, Number(job.lastInsertRowid), payload.actorId, "In Progress", "Job order started.");
    return { jobNo, id: Number(job.lastInsertRowid) };
  });

  return transaction();
}

export function updateJobOrder(payload: {
  actorId: number;
  jobOrderId: number;
  status: string;
  products: Array<{ itemId: number; name: string; quantity: number; unitPrice: number }>;
  additionalLaborCost?: number;
  payrollAllocations?: JobPayrollAllocationInput[];
}) {
  const database = getDatabase();
  const status = normalizeJobStatus(payload.status);
  const allowedStatuses = ["In Progress", "Completed"];
  if (!allowedStatuses.includes(status)) throw new Error("Invalid job order status.");
  const job = database.prepare("SELECT id, job_no, status, service_price, labor_cost, paid_at FROM job_orders WHERE id = ?").get(payload.jobOrderId) as
    | { id: number; job_no: string; status: string; service_price: number; labor_cost: number; paid_at?: string }
    | undefined;
  if (!job) throw new Error("Job order was not found.");
  if (job.paid_at) throw new Error("Paid job orders can no longer be edited.");

  const products = payload.products.map((product) => ({
    itemId: product.itemId,
    name: product.name,
    quantity: Math.max(1, Number(product.quantity) || 1),
    unitPrice: Number(product.unitPrice) || 0
  }));
  const additionalLaborCost = Number(payload.additionalLaborCost ?? 0);
  if (!Number.isFinite(additionalLaborCost) || additionalLaborCost < 0) throw new Error("Additional labor cost must be zero or greater.");
  const productsCost = products.reduce((sum, product) => sum + product.quantity * product.unitPrice, 0);
  const servicePrice = Number(job.service_price || 0);
  const laborCost = Number(job.labor_cost || 0);
  const serviceCost = servicePrice + laborCost + additionalLaborCost;
  const totalAmount = serviceCost + productsCost;

  database.prepare(`
    UPDATE job_orders
    SET status = ?, products_json = ?, products_cost = ?, additional_labor_cost = ?, service_cost = ?, total_amount = ?
    WHERE id = ?
  `).run(
    status,
    JSON.stringify(products),
    productsCost,
    additionalLaborCost,
    serviceCost,
    totalAmount,
    payload.jobOrderId
  );
  if (payload.payrollAllocations?.length) {
    upsertJobPayrollAllocations(database, payload.jobOrderId, payload.payrollAllocations);
  }
  database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
    payload.actorId,
    "Updated",
    "Job Order",
    `Updated ${job.job_no} status to ${status}`,
    now()
  );
  if (job.status !== status) logJobStatus(database, payload.jobOrderId, payload.actorId, status, `Status changed from ${job.status} to ${status}.`);
  return { ok: true, servicePrice, laborCost, additionalLaborCost, serviceCost, productsCost, totalAmount };
}

function logJobStatus(database: Database.Database, jobOrderId: number, actorId: number | null, status: string, details = "") {
  database.prepare(`
    INSERT INTO job_status_history (job_order_id, actor_id, status, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(jobOrderId, actorId, status, details, now());
}

function normalizeJobStatus(status: string) {
  const normalized = status.trim();
  if (normalized === "Ready" || normalized === "Released") return "Completed";
  return normalized;
}

function reduceInventoryStock(database: Database.Database, itemId: number, quantity: number, label: string) {
  const safeQuantity = Math.floor(Number(quantity));
  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) throw new Error(`Invalid stock quantity for ${label}.`);
  const result = database.prepare("UPDATE inventory SET stock = stock - ? WHERE id = ? AND stock >= ?").run(safeQuantity, itemId, safeQuantity);
  if (result.changes !== 1) {
    const item = database.prepare("SELECT product_code, name, stock FROM inventory WHERE id = ?").get(itemId) as { product_code: string; name: string; stock: number } | undefined;
    if (!item) throw new Error(`${label} is no longer available in inventory.`);
    throw new Error(`Insufficient stock for ${item.product_code} ${item.name}. Available: ${item.stock}, required: ${safeQuantity}.`);
  }
}

export function payJobOrder(payload: { actorId: number; jobOrderId: number; paymentMethod: string; paymentReferenceCode?: string }) {
  const database = getDatabase();
  const method = validateActivePaymentMethod(database, payload.paymentMethod, payload.paymentReferenceCode);
  const referenceCode = method.payment_category === "Digital" ? payload.paymentReferenceCode?.trim() ?? "" : "";
  const job = database.prepare("SELECT * FROM job_orders WHERE id = ?").get(payload.jobOrderId) as
    | { id: number; job_no: string; status: string; products_json: string; total_amount: number; paid_at?: string }
    | undefined;
  if (!job) throw new Error("Job order was not found.");
  if (job.status !== "Completed") throw new Error("Only completed job orders can be paid.");
  if (job.paid_at) throw new Error("This job order has already been paid.");

  const products = JSON.parse(job.products_json || "[]") as Array<{ itemId: number; quantity: number }>;
  const paidAt = now();
  const transaction = database.transaction(() => {
    for (const product of products) reduceInventoryStock(database, product.itemId, product.quantity, "job product");
    database.prepare(`
      UPDATE job_orders
      SET payment_method = ?, payment_category = ?, payment_reference_code = ?, paid_at = ?, status = 'Completed'
      WHERE id = ?
    `).run(method.name, method.payment_category, referenceCode, paidAt, payload.jobOrderId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
      payload.actorId,
      "Paid",
      "Job Order",
      `Paid ${job.job_no} via ${method.name}`,
      paidAt
    );
    logJobStatus(database, payload.jobOrderId, payload.actorId, "Paid", `Paid via ${method.name}.`);
  });
  transaction();
  return { receiptNo: job.job_no, total: job.total_amount, paidAt, paymentCategory: method.payment_category, paymentReferenceCode: referenceCode };
}

export function createSale(payload: {
  cashierId: number;
  customerId?: number;
  items: Array<{ itemType: "part" | "service"; itemId: number; name: string; quantity: number; unitPrice: number }>;
  discount: number;
  paymentMethod: string;
  paymentReferenceCode?: string;
}) {
  const database = getDatabase();
  const method = validateActivePaymentMethod(database, payload.paymentMethod, payload.paymentReferenceCode);
  const referenceCode = method.payment_category === "Digital" ? payload.paymentReferenceCode?.trim() ?? "" : "";
  const subtotal = payload.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const total = Math.max(subtotal - payload.discount, 0);

  const transaction = database.transaction(() => {
    const receiptNo = nextTransactionNumber(database);
    const createdAt = now();
    const sale = database.prepare(`
      INSERT INTO sales (receipt_no, cashier_id, customer_id, subtotal, discount, total, payment_method, payment_category, payment_reference_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(receiptNo, payload.cashierId, payload.customerId ?? null, subtotal, payload.discount, total, method.name, method.payment_category, referenceCode, createdAt);

    const insertItem = database.prepare(`
      INSERT INTO sale_items (sale_id, item_type, item_id, name, quantity, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of payload.items) {
      insertItem.run(sale.lastInsertRowid, item.itemType, item.itemId, item.name, item.quantity, item.unitPrice, item.quantity * item.unitPrice);
      if (item.itemType === "part") reduceInventoryStock(database, item.itemId, item.quantity, item.name);
    }

    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
      payload.cashierId,
      "Created",
      "Sale",
      `Receipt ${receiptNo} total ${total.toFixed(2)}`,
      createdAt
    );

    return { receiptNo, subtotal, discount: payload.discount, total, createdAt, paymentCategory: method.payment_category, paymentReferenceCode: referenceCode };
  });

  return transaction();
}

export function voidOrRefundSale(payload: { actorId: number; saleId: number; actionType: "Void" | "Refund" } & ApprovalPayload) {
  const database = getDatabase();
  const sale = database.prepare("SELECT id, receipt_no, status FROM sales WHERE id = ?").get(payload.saleId) as { id: number; receipt_no: string; status: string } | undefined;
  if (!sale) throw new Error("Transaction was not found.");
  if (sale.status === "Voided" || sale.status === "Refunded") throw new Error("This transaction has already been voided or refunded.");
  const actionType = payload.actionType === "Refund" ? "Refund" : "Void";
  const approval = requireSensitiveApproval(database, payload.actorId, payload, `${actionType} Sale`, "Sale", String(payload.saleId));
  const items = database.prepare("SELECT item_type, item_id, quantity FROM sale_items WHERE sale_id = ?").all(payload.saleId) as Array<{ item_type: string; item_id: number; quantity: number }>;
  const completedAt = now();
  const transaction = database.transaction(() => {
    const restoreStock = database.prepare("UPDATE inventory SET stock = stock + ? WHERE id = ?");
    for (const item of items) {
      if (item.item_type === "part") restoreStock.run(item.quantity, item.item_id);
    }
    database.prepare(`
      UPDATE sales
      SET status = ?, voided_at = ?, voided_by = ?, void_approved_by = ?, void_reason = ?
      WHERE id = ?
    `).run(actionType === "Refund" ? "Refunded" : "Voided", completedAt, payload.actorId, approval.id, approval.reason, payload.saleId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(
      payload.actorId,
      actionType === "Refund" ? "Refunded" : "Voided",
      "Sale",
      `${actionType} ${sale.receipt_no}. Approved by ${approval.name}. Reason: ${approval.reason}`,
      completedAt
    );
  });
  transaction();
  return { ok: true };
}

function nextTransactionNumber(database: Database.Database) {
  const date = new Date();
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const prefix = `TRN-${year}${month}${day}`;
  const latest = database
    .prepare("SELECT receipt_no FROM sales WHERE receipt_no LIKE ? ORDER BY receipt_no DESC LIMIT 1")
    .get(`${prefix}-%`) as { receipt_no: string } | undefined;
  const latestSequence = Number(latest?.receipt_no.match(/-(\d+)$/)?.[1] ?? 0);
  return `${prefix}-${String(latestSequence + 1).padStart(4, "0")}`;
}

function sanitizeUser<T extends UserAccount>(user: T): UserAccount {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    username: user.username,
    contact_number: user.contact_number,
    address: user.address,
    email: user.email,
    is_mechanic: user.is_mechanic,
    must_change_password: user.must_change_password,
    status: user.status
  };
}

function validateUserPayload(payload: { role: Role; name: string; contactNumber: string; address: string; email?: string; username: string }) {
  if (!["Owner", "Admin", "Cashier"].includes(payload.role)) throw new Error("Role is required.");
  if (!payload.name.trim()) throw new Error("Full name is required.");
  if (!payload.contactNumber.trim() || !isValidContactNumber(payload.contactNumber)) throw new Error("Contact number must contain 10 to 11 digits and may include spaces, parentheses, or dashes.");
  if (!payload.address.trim()) throw new Error("Address is required.");
  if (!usernamePattern.test(payload.username)) throw new Error("Username must be 3-32 characters and use only letters, numbers, dot, dash, or underscore.");
  if (payload.email && !emailPattern.test(payload.email)) throw new Error("Email address must be valid.");
}
