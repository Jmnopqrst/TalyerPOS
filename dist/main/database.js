"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabase = getDatabase;
exports.databaseFilePath = databaseFilePath;
exports.closeDatabase = closeDatabase;
exports.backupDatabaseFile = backupDatabaseFile;
exports.listAll = listAll;
exports.getSuperAdminConsoleData = getSuperAdminConsoleData;
exports.updateTrialSettings = updateTrialSettings;
exports.recordSystemLog = recordSystemLog;
exports.markBackupCreated = markBackupCreated;
exports.optimizeDatabase = optimizeDatabase;
exports.clearOldLogs = clearOldLogs;
exports.verifySuperAdminPassword = verifySuperAdminPassword;
exports.clearOperationalDatabase = clearOperationalDatabase;
exports.updateReceiptSettings = updateReceiptSettings;
exports.getReceiptSettings = getReceiptSettings;
exports.updateReceiptPrinterSettings = updateReceiptPrinterSettings;
exports.createPaymentMethod = createPaymentMethod;
exports.updatePaymentMethod = updatePaymentMethod;
exports.setPaymentMethodStatus = setPaymentMethodStatus;
exports.deletePaymentMethod = deletePaymentMethod;
exports.createService = createService;
exports.updateService = updateService;
exports.deleteService = deleteService;
exports.createMechanic = createMechanic;
exports.updateMechanic = updateMechanic;
exports.setMechanicStatus = setMechanicStatus;
exports.deleteMechanic = deleteMechanic;
exports.createSupplier = createSupplier;
exports.updateSupplier = updateSupplier;
exports.deleteSupplier = deleteSupplier;
exports.createExpense = createExpense;
exports.updateExpense = updateExpense;
exports.deleteExpense = deleteExpense;
exports.createInventoryCategory = createInventoryCategory;
exports.deleteInventoryCategory = deleteInventoryCategory;
exports.createInventoryItem = createInventoryItem;
exports.updateInventoryItem = updateInventoryItem;
exports.stockInInventoryItem = stockInInventoryItem;
exports.adjustInventoryStock = adjustInventoryStock;
exports.deleteInventoryItem = deleteInventoryItem;
exports.login = login;
exports.changePassword = changePassword;
exports.createUser = createUser;
exports.disableUser = disableUser;
exports.enableUser = enableUser;
exports.createJobOrder = createJobOrder;
exports.updateJobOrder = updateJobOrder;
exports.payJobOrder = payJobOrder;
exports.createSale = createSale;
exports.voidOrRefundSale = voidOrRefundSale;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const electron_1 = require("electron");
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
let db = null;
const now = () => new Date().toISOString();
const usernamePattern = /^[a-zA-Z0-9._-]{3,32}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const contactCharacterPattern = /^[0-9()\-\s]+$/;
function isValidContactNumber(value) {
    const trimmed = value.trim();
    const digitCount = trimmed.replace(/\D/g, "").length;
    return contactCharacterPattern.test(trimmed) && digitCount >= 10 && digitCount <= 11;
}
function categoryCodeFromName(name) {
    return name
        .replace(/[^A-Za-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 4)
        .toUpperCase() || "CAT";
}
function fsCopyDatabase(source, target) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(target), { recursive: true });
    node_fs_1.default.copyFileSync(source, target);
}
function getDatabase() {
    if (db)
        return db;
    const dbPath = databaseFilePath();
    const database = new better_sqlite3_1.default(dbPath, { timeout: 10000 });
    try {
        database.pragma("busy_timeout = 10000");
        database.pragma("journal_mode = WAL");
        database.pragma("foreign_keys = ON");
        migrate(database);
        seed(database);
        db = database;
        return db;
    }
    catch (caught) {
        database.close();
        db = null;
        throw caught;
    }
}
function databaseFilePath() {
    return node_path_1.default.join(electron_1.app.getPath("userData"), "talyer-pos.sqlite");
}
function closeDatabase() {
    if (!db)
        return;
    db.close();
    db = null;
}
function backupDatabaseFile(targetPath) {
    getDatabase().pragma("wal_checkpoint(FULL)");
    closeDatabase();
    const source = databaseFilePath();
    fsCopyDatabase(source, targetPath);
    getDatabase();
}
function migrate(database) {
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
      backup_schedule TEXT NOT NULL DEFAULT 'Manual',
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
    ensureApprovalLogs(database);
    ensureJobStatusHistory(database);
    ensureExpenses(database);
}
function ensureApprovalLogs(database) {
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
function ensureJobStatusHistory(database) {
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
function ensureExpenses(database) {
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
function ensureSuperAdminTables(database) {
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
      backup_schedule TEXT NOT NULL DEFAULT 'Manual',
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
    const superAdmin = database.prepare("SELECT id FROM super_admins WHERE lower(username) = lower('superadmin')").get();
    if (!superAdmin) {
        database.prepare("INSERT INTO super_admins (name, username, password_hash, status, created_at) VALUES (?, ?, ?, 'Active', ?)").run("Super Admin", "superadmin", hashPassword("superadmin123"), now());
    }
    else {
        database.prepare("UPDATE super_admins SET password_hash = ? WHERE lower(username) = lower('superadmin')").run(hashPassword("superadmin123"));
    }
    const settings = database.prepare("SELECT id FROM super_admin_settings WHERE id = 1").get();
    if (!settings) {
        database.prepare(`
      INSERT INTO super_admin_settings (id, trial_enabled, trial_started_at, trial_days, license_key, license_status, last_backup_at, backup_schedule, updated_at)
      VALUES (1, 1, ?, 30, '', 'Trial', '', 'Manual', ?)
    `).run(now(), now());
    }
}
function ensurePaymentMethods(database) {
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
    const columns = new Set(database.prepare("PRAGMA table_info(payment_methods)").all().map((column) => column.name));
    if (!columns.has("payment_category"))
        database.prepare("ALTER TABLE payment_methods ADD COLUMN payment_category TEXT NOT NULL DEFAULT 'Manual'").run();
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
function ensureInventoryStructure(database) {
    const columns = new Set(database.prepare("PRAGMA table_info(inventory)").all().map((column) => column.name));
    const addColumn = (name, definition) => {
        if (!columns.has(name))
            database.prepare(`ALTER TABLE inventory ADD COLUMN ${name} ${definition}`).run();
    };
    addColumn("product_code", "TEXT");
    addColumn("category_id", "INTEGER");
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
    for (const category of defaults)
        insertCategory.run(category.name, category.code, now());
    const legacyCategories = database.prepare("SELECT DISTINCT category FROM inventory WHERE TRIM(category) <> ''").all();
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
    const items = database.prepare("SELECT id, category, product_code FROM inventory").all();
    const categoryByName = database.prepare("SELECT id, code FROM inventory_categories WHERE lower(name) = lower(?)");
    const updateItem = database.prepare("UPDATE inventory SET category_id = ?, product_code = ? WHERE id = ?");
    for (const item of items) {
        const category = categoryByName.get(item.category || "Engine");
        if (!category)
            continue;
        const needsCode = !item.product_code || !item.product_code.startsWith(`${category.code}-`);
        updateItem.run(category.id, needsCode ? nextProductCode(database, category.id) : item.product_code, item.id);
    }
}
function ensureUserColumns(database) {
    const columns = new Set(database.prepare("PRAGMA table_info(users)").all().map((column) => column.name));
    const addColumn = (name, definition) => {
        if (!columns.has(name))
            database.prepare(`ALTER TABLE users ADD COLUMN ${name} ${definition}`).run();
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
    const users = database.prepare("SELECT id, name, pin, username, password_hash FROM users").all();
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
function ensureServiceColumns(database) {
    const columns = new Set(database.prepare("PRAGMA table_info(services)").all().map((column) => column.name));
    if (!columns.has("labor_cost"))
        database.prepare("ALTER TABLE services ADD COLUMN labor_cost REAL NOT NULL DEFAULT 0").run();
}
function ensureJobOrderColumns(database) {
    const columns = new Set(database.prepare("PRAGMA table_info(job_orders)").all().map((column) => column.name));
    const addColumn = (name, definition) => {
        if (!columns.has(name))
            database.prepare(`ALTER TABLE job_orders ADD COLUMN ${name} ${definition}`).run();
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
function ensureSaleColumns(database) {
    const columns = new Set(database.prepare("PRAGMA table_info(sales)").all().map((column) => column.name));
    const addColumn = (name, definition) => {
        if (!columns.has(name))
            database.prepare(`ALTER TABLE sales ADD COLUMN ${name} ${definition}`).run();
    };
    addColumn("payment_category", "TEXT NOT NULL DEFAULT 'Manual'");
    addColumn("payment_reference_code", "TEXT NOT NULL DEFAULT ''");
    addColumn("status", "TEXT NOT NULL DEFAULT 'Completed'");
    addColumn("voided_at", "TEXT");
    addColumn("voided_by", "INTEGER");
    addColumn("void_approved_by", "INTEGER");
    addColumn("void_reason", "TEXT NOT NULL DEFAULT ''");
}
function ensureReceiptSettings(database) {
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
      receipt_output_mode TEXT NOT NULL DEFAULT 'PDF',
      receipt_printer_name TEXT NOT NULL DEFAULT ''
    );
  `);
    const columns = new Set(database.prepare("PRAGMA table_info(receipt_settings)").all().map((column) => column.name));
    const addColumn = (name, definition) => {
        if (!columns.has(name))
            database.prepare(`ALTER TABLE receipt_settings ADD COLUMN ${name} ${definition}`).run();
    };
    addColumn("system_name", "TEXT NOT NULL DEFAULT 'TalyerPOS'");
    addColumn("logo_data_url", "TEXT NOT NULL DEFAULT ''");
    addColumn("receipt_logo_data_url", "TEXT NOT NULL DEFAULT ''");
    addColumn("email", "TEXT NOT NULL DEFAULT ''");
    addColumn("receipt_output_mode", "TEXT NOT NULL DEFAULT 'PDF'");
    addColumn("receipt_printer_name", "TEXT NOT NULL DEFAULT ''");
    const existing = database.prepare("SELECT id FROM receipt_settings WHERE id = 1").get();
    if (!existing) {
        database.prepare(`
      INSERT INTO receipt_settings (id, system_name, logo_data_url, receipt_logo_data_url, business_name, address, email, contact_number, tax_id, footer_message, show_tax_id, show_cashier, paper_width, receipt_output_mode, receipt_printer_name)
      VALUES (1, 'TalyerPOS', '', '', 'TalyerPOS Motorcycle Repair Shop', 'Main Branch', 'support@talyerpos.local', '09170000000', 'TIN: 000-000-000-000', 'Thank you. Ride safe!', 1, 1, 58, 'PDF', '')
    `).run();
    }
}
function resetSystemSettingsToDefaults(database, timestamp = now()) {
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
        backup_schedule = 'Manual',
        updated_at = ?
    WHERE id = 1
  `).run(timestamp, timestamp);
}
function seed(database) {
    const userCount = database.prepare("SELECT COUNT(*) as count FROM users").get();
    if (userCount.count > 0)
        return;
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
    const categoryId = (name) => database.prepare("SELECT id FROM inventory_categories WHERE name = ?").get(name).id;
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
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(1, "Seeded", "System", "Initial local database created", now());
}
function listAll() {
    const database = getDatabase();
    return {
        users: database.prepare(`
      SELECT users.id, users.name, users.role, users.username, users.contact_number, users.address, users.email, users.is_mechanic,
             users.must_change_password, users.status, users.created_at, creators.name as created_by_name
      FROM users
      LEFT JOIN users creators ON creators.id = users.created_by
      ORDER BY users.id
    `).all(),
        customers: database.prepare("SELECT * FROM customers ORDER BY id DESC").all(),
        motorcycles: database.prepare(`
      SELECT motorcycles.*, customers.name as customer_name
      FROM motorcycles
      JOIN customers ON customers.id = motorcycles.customer_id
      ORDER BY motorcycles.id DESC
    `).all(),
        suppliers: database.prepare("SELECT * FROM suppliers ORDER BY id DESC").all(),
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
        receiptSettings: database.prepare("SELECT * FROM receipt_settings WHERE id = 1").get(),
        superAdminSettings: getSuperAdminSettings(database)
    };
}
function getSuperAdminSettings(database = getDatabase()) {
    const settings = database.prepare("SELECT * FROM super_admin_settings WHERE id = 1").get();
    const trial = trialStatus(settings);
    return { ...settings, trial };
}
function trialStatus(settings) {
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
function isTrialExpired(database) {
    const settings = getSuperAdminSettings(database);
    return settings.license_status !== "Activated" && Boolean(settings.trial_enabled) && settings.trial.expired;
}
function requireSuperAdmin(database, superAdminId) {
    const actor = database.prepare("SELECT id, username FROM super_admins WHERE id = ? AND status = 'Active'").get(superAdminId);
    if (!actor)
        throw new Error("Only Super Admin can perform this action.");
    return actor;
}
function getSuperAdminConsoleData() {
    const database = getDatabase();
    const pageCount = database.prepare("PRAGMA page_count").get().page_count;
    const pageSize = database.prepare("PRAGMA page_size").get().page_size;
    const failedReceipts = database.prepare("SELECT COUNT(*) as count FROM system_logs WHERE action LIKE '%failed%' OR details LIKE '%failed%'").get();
    const settings = getSuperAdminSettings(database);
    return {
        settings,
        health: {
            databaseSizeBytes: pageCount * pageSize,
            lastBackupAt: settings.last_backup_at,
            failedTransactions: 0,
            failedReceipts: failedReceipts.count
        },
        backupHistory: database.prepare("SELECT * FROM system_logs WHERE action IN ('Backup Created', 'Database Exported', 'Database Restored') ORDER BY id DESC LIMIT 20").all(),
        systemLogs: database.prepare("SELECT * FROM system_logs ORDER BY id DESC LIMIT 100").all()
    };
}
function updateTrialSettings(payload) {
    const database = getDatabase();
    requireSuperAdmin(database, payload.superAdminId);
    const trialDays = Math.max(1, Math.min(365, Number(payload.trialDays) || 30));
    const schedule = ["Manual", "Daily", "Weekly"].includes(payload.backupSchedule) ? payload.backupSchedule : "Manual";
    const licenseKey = payload.licenseKey?.trim() ?? "";
    const licenseStatus = licenseKey ? "Activated" : "Trial";
    database.prepare(`
    UPDATE super_admin_settings
    SET trial_enabled = ?, trial_days = ?, backup_schedule = ?, license_key = ?, license_status = ?, updated_at = ?
    WHERE id = 1
  `).run(payload.trialEnabled ? 1 : 0, trialDays, schedule, licenseKey, licenseStatus, now());
    database.prepare("INSERT INTO system_logs (super_admin_id, action, details, created_at) VALUES (?, ?, ?, ?)").run(payload.superAdminId, "Trial Settings Updated", `Trial ${payload.trialEnabled ? "enabled" : "disabled"}, ${trialDays} days, backup ${schedule}, license ${licenseStatus}`, now());
    return getSuperAdminConsoleData();
}
function recordSystemLog(payload) {
    const database = getDatabase();
    database.prepare("INSERT INTO system_logs (super_admin_id, action, details, created_at) VALUES (?, ?, ?, ?)").run(payload.superAdminId ?? null, payload.action, payload.details, now());
}
function markBackupCreated(superAdminId, details) {
    const database = getDatabase();
    database.prepare("UPDATE super_admin_settings SET last_backup_at = ?, updated_at = ? WHERE id = 1").run(now(), now());
    recordSystemLog({ superAdminId, action: "Backup Created", details });
}
function optimizeDatabase(payload) {
    const database = getDatabase();
    requireSuperAdmin(database, payload.superAdminId);
    database.pragma("wal_checkpoint(TRUNCATE)");
    database.exec("VACUUM");
    recordSystemLog({ superAdminId: payload.superAdminId, action: "Database Optimized", details: "VACUUM and WAL checkpoint completed." });
    return getSuperAdminConsoleData();
}
function clearOldLogs(payload) {
    const database = getDatabase();
    requireSuperAdmin(database, payload.superAdminId);
    const days = Math.max(1, Number(payload.daysToKeep) || 30);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const audit = database.prepare("DELETE FROM audit_logs WHERE created_at < ?").run(cutoff);
    const system = database.prepare("DELETE FROM system_logs WHERE created_at < ?").run(cutoff);
    recordSystemLog({ superAdminId: payload.superAdminId, action: "Logs Cleared", details: `Removed ${audit.changes} audit logs and ${system.changes} system logs older than ${days} days.` });
    return getSuperAdminConsoleData();
}
function verifySuperAdminPassword(superAdminId, password) {
    const database = getDatabase();
    const actor = database.prepare("SELECT id, password_hash FROM super_admins WHERE id = ? AND status = 'Active'").get(superAdminId);
    return Boolean(actor && verifyPassword(password, actor.password_hash));
}
function clearOperationalDatabase(payload) {
    const database = getDatabase();
    requireSuperAdmin(database, payload.superAdminId);
    const createdAt = now();
    const reset = database.transaction(() => {
        database.prepare("DELETE FROM sale_items").run();
        database.prepare("DELETE FROM sales").run();
        database.prepare("DELETE FROM job_status_history").run();
        database.prepare("DELETE FROM job_orders").run();
        database.prepare("DELETE FROM expenses").run();
        database.prepare("DELETE FROM motorcycles").run();
        database.prepare("DELETE FROM customers").run();
        database.prepare("DELETE FROM inventory").run();
        database.prepare("DELETE FROM inventory_adjustments").run();
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
        database.prepare("INSERT INTO system_logs (super_admin_id, action, details, created_at) VALUES (?, ?, ?, ?)").run(payload.superAdminId, "Database Cleared", `Operational database and system settings reset to defaults. Backup before reset: ${payload.backupPath}. Default Owner account recreated.`, createdAt);
    });
    reset();
    ensureInventoryStructure(database);
    return getSuperAdminConsoleData();
}
function updateReceiptSettings(payload) {
    const database = getDatabase();
    const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(payload.actorId);
    if (!actor || actor.role !== "Owner")
        throw new Error("Only Owner accounts can update receipt settings.");
    if (!payload.systemName.trim())
        throw new Error("System name is required.");
    if (!payload.businessName.trim())
        throw new Error("Business name is required.");
    if (!payload.address.trim())
        throw new Error("Business address is required.");
    if (payload.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim()))
        throw new Error("Email address is invalid.");
    if (!isValidContactNumber(payload.contactNumber))
        throw new Error("Contact number must contain 10 to 11 digits and may include spaces, parentheses, or dashes.");
    database.prepare(`
    UPDATE receipt_settings
    SET system_name = ?, logo_data_url = ?, receipt_logo_data_url = '', business_name = ?, address = ?, email = ?, contact_number = ?, tax_id = ?, footer_message = ?,
        show_tax_id = ?, show_cashier = ?, paper_width = ?
    WHERE id = 1
  `).run(payload.systemName.trim(), payload.logoDataUrl.trim(), payload.businessName.trim(), payload.address.trim(), payload.email.trim(), payload.contactNumber.trim(), payload.taxId.trim(), payload.footerMessage.trim(), payload.showTaxId ? 1 : 0, payload.showCashier ? 1 : 0, payload.paperWidth === 80 ? 80 : 58);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Updated", "Receipt Settings", "Updated receipt format settings", now());
    return database.prepare("SELECT * FROM receipt_settings WHERE id = 1").get();
}
function getReceiptSettings() {
    return getDatabase().prepare("SELECT * FROM receipt_settings WHERE id = 1").get();
}
function updateReceiptPrinterSettings(payload) {
    const database = getDatabase();
    requireInventoryManager(database, payload.actorId);
    const approval = requireSensitiveApproval(database, payload.actorId, payload, "Changed Printer Settings", "Receipt Printer");
    if (!["Printer", "PDF"].includes(payload.outputMode))
        throw new Error("Select a valid receipt output option.");
    if (payload.outputMode === "Printer" && !payload.printerName.trim())
        throw new Error("Select a valid receipt printer.");
    const previous = database.prepare("SELECT receipt_output_mode, receipt_printer_name FROM receipt_settings WHERE id = 1").get();
    database.prepare("UPDATE receipt_settings SET receipt_output_mode = ?, receipt_printer_name = ? WHERE id = 1").run(payload.outputMode, payload.outputMode === "Printer" ? payload.printerName.trim() : "");
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Updated", "Printer Settings", `Receipt output changed from ${previous.receipt_output_mode || "PDF"} ${previous.receipt_printer_name || ""} to ${payload.outputMode} ${payload.outputMode === "Printer" ? payload.printerName.trim() : ""}. Approved by ${approval.name}. Reason: ${approval.reason}`.trim(), now());
    return database.prepare("SELECT * FROM receipt_settings WHERE id = 1").get();
}
function requireInventoryManager(database, actorId) {
    const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId);
    if (!actor || !["Owner", "Admin"].includes(actor.role))
        throw new Error("Only Owner and Admin accounts can manage inventory.");
    return actor;
}
function requireServiceManager(database, actorId) {
    const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId);
    if (!actor || !["Owner", "Admin"].includes(actor.role))
        throw new Error("Only Owner and Admin accounts can manage services.");
    return actor;
}
function requireMechanicManager(database, actorId) {
    const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId);
    if (!actor || !["Owner", "Admin"].includes(actor.role))
        throw new Error("Only Owner and Admin accounts can manage mechanics.");
    return actor;
}
function requireSupplierManager(database, actorId) {
    const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId);
    if (!actor || !["Owner", "Admin"].includes(actor.role))
        throw new Error("Only Owner and Admin accounts can manage suppliers.");
    return actor;
}
function requireExpenseManager(database, actorId) {
    const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId);
    if (!actor || !["Owner", "Admin"].includes(actor.role))
        throw new Error("Only Owner and Admin accounts can manage expenses.");
    return actor;
}
function requireOwner(database, actorId) {
    const actor = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(actorId);
    if (!actor || actor.role !== "Owner")
        throw new Error("Only Owner accounts can manage payment methods.");
    return actor;
}
function requireSensitiveApproval(database, requesterId, approval, action, entity, entityId = "") {
    const username = approval.approvalUsername?.trim() ?? "";
    const password = approval.approvalPassword ?? "";
    const reason = approval.approvalReason?.trim() ?? "";
    if (!username || !password)
        throw new Error("Owner or Admin approval is required.");
    if (!reason)
        throw new Error("Approval reason is required.");
    const approver = database.prepare("SELECT id, name, role, password_hash FROM users WHERE lower(username) = lower(?) AND status = 'Active'").get(username);
    if (!approver || !["Owner", "Admin"].includes(approver.role) || !verifyPassword(password, approver.password_hash)) {
        throw new Error("Approval credentials are invalid or not allowed.");
    }
    database.prepare(`
    INSERT INTO approval_logs (requester_id, approver_id, action, entity, entity_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(requesterId, approver.id, action, entity, entityId, reason, now());
    return { ...approver, reason };
}
function paymentMethodInUse(database, name) {
    const saleUse = database.prepare("SELECT id FROM sales WHERE payment_method = ? LIMIT 1").get(name);
    const jobUse = database.prepare("SELECT id FROM job_orders WHERE payment_method = ? LIMIT 1").get(name);
    return Boolean(saleUse || jobUse);
}
function normalizePaymentCategory(value) {
    if (value === "Manual" || value === "Digital")
        return value;
    throw new Error("Payment category is required.");
}
function validateActivePaymentMethod(database, name, referenceCode) {
    const method = database.prepare("SELECT id, name, payment_category FROM payment_methods WHERE name = ? AND status = 'Active'").get(name.trim());
    if (!method)
        throw new Error("Select an active payment method.");
    if (method.payment_category === "Digital" && !referenceCode?.trim())
        throw new Error("Reference code is required for digital payments.");
    return method;
}
function createPaymentMethod(payload) {
    const database = getDatabase();
    requireOwner(database, payload.actorId);
    const name = payload.name.trim();
    const paymentCategory = normalizePaymentCategory(payload.paymentCategory);
    if (!name)
        throw new Error("Payment method name is required.");
    const duplicate = database.prepare("SELECT id FROM payment_methods WHERE lower(name) = lower(?)").get(name);
    if (duplicate)
        throw new Error("Payment method name must be unique.");
    const createdAt = now();
    const result = database.prepare(`
    INSERT INTO payment_methods (name, type, payment_category, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Active', ?, ?)
  `).run(name, paymentCategory === "Manual" ? "Cash" : "Online Payment", paymentCategory, payload.description?.trim() ?? "", createdAt, createdAt);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Created", "Payment Method", `Created ${name} (${paymentCategory})`, createdAt);
    return database.prepare("SELECT * FROM payment_methods WHERE id = ?").get(result.lastInsertRowid);
}
function updatePaymentMethod(payload) {
    const database = getDatabase();
    requireOwner(database, payload.actorId);
    const current = database.prepare("SELECT * FROM payment_methods WHERE id = ?").get(payload.methodId);
    if (!current)
        throw new Error("Payment method was not found.");
    const name = payload.name.trim();
    const paymentCategory = normalizePaymentCategory(payload.paymentCategory);
    if (!name)
        throw new Error("Payment method name is required.");
    const duplicate = database.prepare("SELECT id FROM payment_methods WHERE lower(name) = lower(?) AND id <> ?").get(name, payload.methodId);
    if (duplicate)
        throw new Error("Payment method name must be unique.");
    const updatedAt = now();
    database.prepare("UPDATE payment_methods SET name = ?, type = ?, payment_category = ?, description = ?, updated_at = ? WHERE id = ?").run(name, paymentCategory === "Manual" ? "Cash" : "Online Payment", paymentCategory, payload.description?.trim() ?? "", updatedAt, payload.methodId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Updated", "Payment Method", `Updated ${current.name} to ${name} (${paymentCategory})`, updatedAt);
    return database.prepare("SELECT * FROM payment_methods WHERE id = ?").get(payload.methodId);
}
function setPaymentMethodStatus(payload) {
    const database = getDatabase();
    requireOwner(database, payload.actorId);
    if (!["Active", "Inactive"].includes(payload.status))
        throw new Error("Payment method status is invalid.");
    const current = database.prepare("SELECT * FROM payment_methods WHERE id = ?").get(payload.methodId);
    if (!current)
        throw new Error("Payment method was not found.");
    const updatedAt = now();
    database.prepare("UPDATE payment_methods SET status = ?, updated_at = ? WHERE id = ?").run(payload.status, updatedAt, payload.methodId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, payload.status === "Active" ? "Enabled" : "Disabled", "Payment Method", `${payload.status === "Active" ? "Enabled" : "Disabled"} ${current.name}`, updatedAt);
    return { ok: true };
}
function deletePaymentMethod(payload) {
    const database = getDatabase();
    requireOwner(database, payload.actorId);
    const current = database.prepare("SELECT * FROM payment_methods WHERE id = ?").get(payload.methodId);
    if (!current)
        throw new Error("Payment method was not found.");
    if (paymentMethodInUse(database, current.name))
        throw new Error("Payment method is used in past transactions and cannot be deleted.");
    const deletedAt = now();
    database.prepare("DELETE FROM payment_methods WHERE id = ?").run(payload.methodId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Deleted", "Payment Method", `Deleted ${current.name}`, deletedAt);
    return { ok: true };
}
function validateServicePayload(payload) {
    const name = payload.name.trim();
    const category = payload.category.trim();
    const durationMinutes = Number(payload.durationMinutes);
    const price = Number(payload.price);
    const laborCost = Number(payload.laborCost);
    if (!name)
        throw new Error("Service name is required.");
    if (!category)
        throw new Error("Service category is required.");
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0)
        throw new Error("Duration must be greater than zero.");
    if (!Number.isFinite(price) || price < 0)
        throw new Error("Price must be zero or greater.");
    if (!Number.isFinite(laborCost) || laborCost < 0)
        throw new Error("Labor cost must be zero or greater.");
    return { name, category, durationMinutes: Math.round(durationMinutes), price, laborCost };
}
function createService(payload) {
    const database = getDatabase();
    requireServiceManager(database, payload.actorId);
    const service = validateServicePayload(payload);
    const createdAt = now();
    const result = database.prepare(`
    INSERT INTO services (name, category, price, labor_cost, duration_minutes)
    VALUES (?, ?, ?, ?, ?)
  `).run(service.name, service.category, service.price, service.laborCost, service.durationMinutes);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Created", "Service", `Created ${service.name}`, createdAt);
    return database.prepare("SELECT * FROM services WHERE id = ?").get(result.lastInsertRowid);
}
function updateService(payload) {
    const database = getDatabase();
    requireServiceManager(database, payload.actorId);
    const current = database.prepare("SELECT id, name FROM services WHERE id = ?").get(payload.serviceId);
    if (!current)
        throw new Error("Service was not found.");
    const service = validateServicePayload(payload);
    const updatedAt = now();
    database.prepare(`
    UPDATE services
    SET name = ?, category = ?, price = ?, labor_cost = ?, duration_minutes = ?
    WHERE id = ?
  `).run(service.name, service.category, service.price, service.laborCost, service.durationMinutes, payload.serviceId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Updated", "Service", `Updated ${current.name} to ${service.name}`, updatedAt);
    return database.prepare("SELECT * FROM services WHERE id = ?").get(payload.serviceId);
}
function deleteService(payload) {
    const database = getDatabase();
    requireServiceManager(database, payload.actorId);
    const current = database.prepare("SELECT id, name FROM services WHERE id = ?").get(payload.serviceId);
    if (!current)
        throw new Error("Service was not found.");
    const inUse = database.prepare("SELECT id FROM job_orders WHERE service_id = ? LIMIT 1").get(payload.serviceId);
    if (inUse)
        throw new Error("This service is already used in job orders and cannot be deleted.");
    const deletedAt = now();
    database.prepare("DELETE FROM services WHERE id = ?").run(payload.serviceId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Deleted", "Service", `Deleted ${current.name}`, deletedAt);
    return { ok: true };
}
function validateMechanicPayload(payload) {
    const name = payload.name.trim();
    const contactNumber = payload.contactNumber.trim();
    const address = payload.address.trim();
    const status = payload.status === "Inactive" ? "Disabled" : payload.status;
    if (!name)
        throw new Error("Mechanic name is required.");
    if (!contactNumber || !isValidContactNumber(contactNumber))
        throw new Error("Contact number must contain 10 to 11 digits and may include spaces, parentheses, or dashes.");
    if (!address)
        throw new Error("Address is required.");
    if (!["Active", "Disabled"].includes(status))
        throw new Error("Mechanic status is required.");
    return { name, contactNumber, address, status: status };
}
function nextMechanicUsername(database, name) {
    const base = `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "mechanic"}.mechanic`.slice(0, 24);
    let username = base;
    let sequence = 1;
    while (database.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
        username = `${base}.${sequence}`.slice(0, 32);
        sequence += 1;
    }
    return username;
}
function createMechanic(payload) {
    const database = getDatabase();
    requireMechanicManager(database, payload.actorId);
    const mechanic = validateMechanicPayload(payload);
    const createdAt = now();
    const username = nextMechanicUsername(database, mechanic.name);
    const password = node_crypto_1.default.randomBytes(16).toString("hex");
    const result = database.prepare(`
    INSERT INTO users (name, role, pin, username, password_hash, contact_number, address, email, is_mechanic, must_change_password, status, created_at)
    VALUES (?, 'Cashier', '', ?, ?, ?, ?, '', 1, 0, ?, ?)
  `).run(mechanic.name, username, hashPassword(password), mechanic.contactNumber, mechanic.address, mechanic.status, createdAt);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Created", "Mechanic", `Created mechanic ${mechanic.name}`, createdAt);
    return sanitizeUser(database.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid));
}
function updateMechanic(payload) {
    const database = getDatabase();
    requireMechanicManager(database, payload.actorId);
    const current = database.prepare("SELECT id, name FROM users WHERE id = ? AND is_mechanic = 1").get(payload.mechanicId);
    if (!current)
        throw new Error("Mechanic was not found.");
    const mechanic = validateMechanicPayload(payload);
    const updatedAt = now();
    database.prepare("UPDATE users SET name = ?, contact_number = ?, address = ?, status = ? WHERE id = ? AND is_mechanic = 1").run(mechanic.name, mechanic.contactNumber, mechanic.address, mechanic.status, payload.mechanicId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Updated", "Mechanic", `Updated mechanic ${current.name} to ${mechanic.name}`, updatedAt);
    return sanitizeUser(database.prepare("SELECT * FROM users WHERE id = ?").get(payload.mechanicId));
}
function setMechanicStatus(payload) {
    const database = getDatabase();
    requireMechanicManager(database, payload.actorId);
    const status = payload.status === "Inactive" ? "Disabled" : payload.status;
    if (!["Active", "Disabled"].includes(status))
        throw new Error("Mechanic status is required.");
    const current = database.prepare("SELECT id, name FROM users WHERE id = ? AND is_mechanic = 1").get(payload.mechanicId);
    if (!current)
        throw new Error("Mechanic was not found.");
    const updatedAt = now();
    database.prepare("UPDATE users SET status = ? WHERE id = ? AND is_mechanic = 1").run(status, payload.mechanicId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, status === "Active" ? "Enabled" : "Disabled", "Mechanic", `${status === "Active" ? "Enabled" : "Disabled"} mechanic ${current.name}`, updatedAt);
    return { ok: true };
}
function deleteMechanic(payload) {
    const database = getDatabase();
    requireMechanicManager(database, payload.actorId);
    const current = database.prepare("SELECT id, name FROM users WHERE id = ? AND is_mechanic = 1").get(payload.mechanicId);
    if (!current)
        throw new Error("Mechanic was not found.");
    const inUse = database.prepare("SELECT id FROM job_orders WHERE mechanic_id = ? LIMIT 1").get(payload.mechanicId);
    if (inUse)
        throw new Error("This mechanic is assigned to job orders and cannot be deleted.");
    const deletedAt = now();
    database.prepare("DELETE FROM users WHERE id = ? AND is_mechanic = 1").run(payload.mechanicId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Deleted", "Mechanic", `Deleted mechanic ${current.name}`, deletedAt);
    return { ok: true };
}
function validateSupplierPayload(payload) {
    const name = payload.name.trim();
    const contact = payload.contact.trim();
    const phone = payload.phone.trim();
    if (!name)
        throw new Error("Supplier name is required.");
    if (!contact)
        throw new Error("Contact person is required.");
    if (!phone || !isValidContactNumber(phone))
        throw new Error("Contact number must contain 10 to 11 digits and may include spaces, parentheses, or dashes.");
    return { name, contact, phone };
}
function createSupplier(payload) {
    const database = getDatabase();
    requireSupplierManager(database, payload.actorId);
    const supplier = validateSupplierPayload(payload);
    const duplicate = database.prepare("SELECT id FROM suppliers WHERE lower(name) = lower(?)").get(supplier.name);
    if (duplicate)
        throw new Error("Supplier name must be unique.");
    const createdAt = now();
    const result = database.prepare("INSERT INTO suppliers (name, contact, phone, category) VALUES (?, ?, ?, '')").run(supplier.name, supplier.contact, supplier.phone);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Created", "Supplier", `Created supplier ${supplier.name}`, createdAt);
    return database.prepare("SELECT id, name, contact, phone FROM suppliers WHERE id = ?").get(result.lastInsertRowid);
}
function updateSupplier(payload) {
    const database = getDatabase();
    requireSupplierManager(database, payload.actorId);
    const current = database.prepare("SELECT id, name FROM suppliers WHERE id = ?").get(payload.supplierId);
    if (!current)
        throw new Error("Supplier was not found.");
    const supplier = validateSupplierPayload(payload);
    const duplicate = database.prepare("SELECT id FROM suppliers WHERE lower(name) = lower(?) AND id <> ?").get(supplier.name, payload.supplierId);
    if (duplicate)
        throw new Error("Supplier name must be unique.");
    const updatedAt = now();
    database.prepare("UPDATE suppliers SET name = ?, contact = ?, phone = ?, category = '' WHERE id = ?").run(supplier.name, supplier.contact, supplier.phone, payload.supplierId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Updated", "Supplier", `Updated supplier ${current.name} to ${supplier.name}`, updatedAt);
    return database.prepare("SELECT id, name, contact, phone FROM suppliers WHERE id = ?").get(payload.supplierId);
}
function deleteSupplier(payload) {
    const database = getDatabase();
    requireSupplierManager(database, payload.actorId);
    const current = database.prepare("SELECT id, name FROM suppliers WHERE id = ?").get(payload.supplierId);
    if (!current)
        throw new Error("Supplier was not found.");
    const inUse = database.prepare("SELECT id FROM inventory WHERE supplier_id = ? LIMIT 1").get(payload.supplierId);
    if (inUse)
        throw new Error("This supplier is linked to inventory items and cannot be deleted.");
    const deletedAt = now();
    database.prepare("DELETE FROM suppliers WHERE id = ?").run(payload.supplierId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Deleted", "Supplier", `Deleted supplier ${current.name}`, deletedAt);
    return { ok: true };
}
function createExpense(payload) {
    const database = getDatabase();
    requireExpenseManager(database, payload.actorId);
    const expense = validateExpensePayload(payload);
    const createdAt = now();
    const result = database.prepare(`
    INSERT INTO expenses (expense_date, category, description, amount, recorded_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(expense.expenseDate, expense.category, expense.description, expense.amount, payload.actorId, createdAt, createdAt);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Created", "Expense", `Recorded ${expense.category} expense ${expense.amount.toFixed(2)}: ${expense.description}`, createdAt);
    return { id: Number(result.lastInsertRowid) };
}
function updateExpense(payload) {
    const database = getDatabase();
    requireExpenseManager(database, payload.actorId);
    const current = database.prepare("SELECT id FROM expenses WHERE id = ?").get(payload.expenseId);
    if (!current)
        throw new Error("Expense was not found.");
    const expense = validateExpensePayload(payload);
    const updatedAt = now();
    database.prepare(`
    UPDATE expenses
    SET expense_date = ?, category = ?, description = ?, amount = ?, updated_at = ?
    WHERE id = ?
  `).run(expense.expenseDate, expense.category, expense.description, expense.amount, updatedAt, payload.expenseId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Updated", "Expense", `Updated ${expense.category} expense ${expense.amount.toFixed(2)}: ${expense.description}`, updatedAt);
    return { ok: true };
}
function deleteExpense(payload) {
    const database = getDatabase();
    requireExpenseManager(database, payload.actorId);
    const expense = database.prepare("SELECT * FROM expenses WHERE id = ?").get(payload.expenseId);
    if (!expense)
        throw new Error("Expense was not found.");
    database.prepare("DELETE FROM expenses WHERE id = ?").run(payload.expenseId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Deleted", "Expense", `Deleted ${expense.category} expense ${Number(expense.amount).toFixed(2)}: ${expense.description}`, now());
    return { ok: true };
}
function validateExpensePayload(payload) {
    const expenseDate = payload.expenseDate.trim();
    const category = payload.category.trim();
    const description = payload.description.trim();
    const amount = Number(payload.amount);
    if (!expenseDate)
        throw new Error("Expense date is required.");
    if (!category)
        throw new Error("Expense category is required.");
    if (!description)
        throw new Error("Expense description is required.");
    if (!Number.isFinite(amount) || amount < 0)
        throw new Error("Expense amount must be zero or greater.");
    return { expenseDate, category, description, amount };
}
function normalizeCategoryCode(code) {
    return code.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
function nextProductCode(database, categoryId) {
    const category = database.prepare("SELECT id, code FROM inventory_categories WHERE id = ?").get(categoryId);
    if (!category)
        throw new Error("Category must exist before assigning an item.");
    const existing = database.prepare("SELECT product_code FROM inventory WHERE category_id = ? AND product_code LIKE ?").all(categoryId, `${category.code}-%`);
    const maxSequence = existing.reduce((max, item) => {
        const match = item.product_code?.match(/-(\d+)$/);
        return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    return `${category.code}-${String(maxSequence + 1).padStart(3, "0")}`;
}
function createInventoryCategory(payload) {
    const database = getDatabase();
    requireInventoryManager(database, payload.actorId);
    const name = payload.name.trim();
    const code = normalizeCategoryCode(payload.code);
    if (!name)
        throw new Error("Category name is required.");
    if (!code)
        throw new Error("Category code is required.");
    const duplicate = database.prepare("SELECT id FROM inventory_categories WHERE lower(name) = lower(?) OR code = ?").get(name, code);
    if (duplicate)
        throw new Error("Category name or code already exists.");
    const result = database.prepare("INSERT INTO inventory_categories (name, code, created_at) VALUES (?, ?, ?)").run(name, code, now());
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Created", "Inventory Category", `Created ${name} (${code})`, now());
    return database.prepare("SELECT * FROM inventory_categories WHERE id = ?").get(result.lastInsertRowid);
}
function deleteInventoryCategory(payload) {
    const database = getDatabase();
    requireInventoryManager(database, payload.actorId);
    const category = database.prepare("SELECT id, name, code FROM inventory_categories WHERE id = ?").get(payload.categoryId);
    if (!category)
        throw new Error("Category was not found.");
    const itemCount = database.prepare("SELECT COUNT(*) as count FROM inventory WHERE category_id = ?").get(payload.categoryId);
    if (itemCount.count > 0)
        throw new Error("This category still has inventory items and cannot be deleted.");
    database.prepare("DELETE FROM inventory_categories WHERE id = ?").run(payload.categoryId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Deleted", "Inventory Category", `Deleted ${category.name} (${category.code})`, now());
    return { ok: true };
}
function createInventoryItem(payload) {
    const database = getDatabase();
    requireInventoryManager(database, payload.actorId);
    const name = payload.name.trim();
    const stock = Number(payload.stock);
    const sellPrice = Number(payload.sellPrice);
    if (!name)
        throw new Error("Item name is required.");
    if (!Number.isFinite(stock) || stock < 0)
        throw new Error("Stock count must be zero or higher.");
    if (!Number.isFinite(sellPrice) || sellPrice < 0)
        throw new Error("Sell price must be zero or higher.");
    const category = database.prepare("SELECT id, name FROM inventory_categories WHERE id = ?").get(payload.categoryId);
    if (!category)
        throw new Error("Category must exist before assigning an item.");
    const productCode = nextProductCode(database, category.id);
    database.prepare(`
    INSERT INTO inventory (sku, product_code, category_id, name, category, supplier_id, stock, reorder_level, unit_cost, sell_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
  `).run(productCode, productCode, category.id, name, category.name, payload.supplierId || null, Math.floor(stock), sellPrice);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Created", "Inventory", `Created ${productCode} ${name}`, now());
    return { productCode };
}
function updateInventoryItem(payload) {
    const database = getDatabase();
    requireInventoryManager(database, payload.actorId);
    const item = database.prepare("SELECT id, product_code FROM inventory WHERE id = ?").get(payload.itemId);
    if (!item)
        throw new Error("Inventory item was not found.");
    const category = database.prepare("SELECT id, name FROM inventory_categories WHERE id = ?").get(payload.categoryId);
    if (!category)
        throw new Error("Category must exist before assigning an item.");
    const name = payload.name.trim();
    const stock = Number(payload.stock);
    const sellPrice = Number(payload.sellPrice);
    if (!name)
        throw new Error("Item name is required.");
    if (!Number.isFinite(stock) || stock < 0)
        throw new Error("Stock count must be zero or higher.");
    if (!Number.isFinite(sellPrice) || sellPrice < 0)
        throw new Error("Sell price must be zero or higher.");
    database.prepare("UPDATE inventory SET category_id = ?, category = ?, name = ?, supplier_id = ?, stock = ?, sell_price = ? WHERE id = ?").run(category.id, category.name, name, payload.supplierId || null, Math.floor(stock), sellPrice, payload.itemId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Updated", "Inventory", `Updated ${item.product_code}`, now());
    return { ok: true };
}
function stockInInventoryItem(payload) {
    const database = getDatabase();
    requireInventoryManager(database, payload.actorId);
    const quantity = Math.floor(Number(payload.quantity));
    const reason = payload.reason.trim();
    const referenceNo = payload.referenceNo?.trim() ?? "";
    if (!Number.isFinite(quantity) || quantity <= 0)
        throw new Error("Stock in quantity must be greater than zero.");
    if (!reason)
        throw new Error("Reason is required.");
    const item = database.prepare("SELECT id, product_code, name, stock FROM inventory WHERE id = ?").get(payload.itemId);
    if (!item)
        throw new Error("Inventory item was not found.");
    if (payload.supplierId) {
        const supplier = database.prepare("SELECT id FROM suppliers WHERE id = ?").get(payload.supplierId);
        if (!supplier)
            throw new Error("Supplier was not found.");
    }
    const previousStock = Number(item.stock);
    const newStock = previousStock + quantity;
    const createdAt = now();
    const transaction = database.transaction(() => {
        database.prepare("UPDATE inventory SET stock = ? WHERE id = ?").run(newStock, item.id);
        database.prepare(`
      INSERT INTO inventory_adjustments (item_id, actor_id, movement_type, quantity, previous_stock, new_stock, supplier_id, reference_no, reason, created_at)
      VALUES (?, ?, 'Stock In', ?, ?, ?, ?, ?, ?, ?)
    `).run(item.id, payload.actorId, quantity, previousStock, newStock, payload.supplierId || null, referenceNo, reason, createdAt);
        database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Stock In", "Inventory", `Added ${quantity} stock to ${item.product_code} ${item.name}. ${previousStock} -> ${newStock}. Reason: ${reason}`, createdAt);
    });
    transaction();
    return { ok: true, previousStock, newStock };
}
function adjustInventoryStock(payload) {
    const database = getDatabase();
    requireInventoryManager(database, payload.actorId);
    const newStock = Math.floor(Number(payload.newStock));
    const reason = payload.reason.trim();
    const referenceNo = payload.referenceNo?.trim() ?? "";
    if (!Number.isFinite(newStock) || newStock < 0)
        throw new Error("Adjusted stock must be zero or higher.");
    if (!reason)
        throw new Error("Reason is required.");
    const item = database.prepare("SELECT id, product_code, name, stock FROM inventory WHERE id = ?").get(payload.itemId);
    if (!item)
        throw new Error("Inventory item was not found.");
    const previousStock = Number(item.stock);
    const quantityDelta = newStock - previousStock;
    const createdAt = now();
    const transaction = database.transaction(() => {
        database.prepare("UPDATE inventory SET stock = ? WHERE id = ?").run(newStock, item.id);
        database.prepare(`
      INSERT INTO inventory_adjustments (item_id, actor_id, movement_type, quantity, previous_stock, new_stock, supplier_id, reference_no, reason, created_at)
      VALUES (?, ?, 'Adjustment', ?, ?, ?, NULL, ?, ?, ?)
    `).run(item.id, payload.actorId, quantityDelta, previousStock, newStock, referenceNo, reason, createdAt);
        database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Adjusted Stock", "Inventory", `Adjusted ${item.product_code} ${item.name}. ${previousStock} -> ${newStock}. Reason: ${reason}`, createdAt);
    });
    transaction();
    return { ok: true, previousStock, newStock };
}
function deleteInventoryItem(payload) {
    const database = getDatabase();
    requireInventoryManager(database, payload.actorId);
    const item = database.prepare("SELECT id, product_code, name FROM inventory WHERE id = ?").get(payload.itemId);
    if (!item)
        throw new Error("Inventory item was not found.");
    const approval = requireSensitiveApproval(database, payload.actorId, payload, "Deleted Inventory Item", "Inventory", String(payload.itemId));
    const saleUse = database.prepare("SELECT id FROM sale_items WHERE item_type = 'part' AND item_id = ? LIMIT 1").get(payload.itemId);
    const jobOrders = database.prepare("SELECT id, products_json FROM job_orders WHERE paid_at IS NULL").all();
    const jobUse = jobOrders.some((job) => {
        try {
            return JSON.parse(job.products_json || "[]").some((product) => product.itemId === payload.itemId);
        }
        catch {
            return false;
        }
    });
    if (saleUse || jobUse)
        throw new Error("This item is already used in transactions and cannot be deleted.");
    database.prepare("DELETE FROM inventory WHERE id = ?").run(payload.itemId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Deleted", "Inventory", `Deleted ${item.product_code} ${item.name}. Approved by ${approval.name}. Reason: ${approval.reason}`, now());
    return { ok: true };
}
function login(username, password) {
    const database = getDatabase();
    const superAdmin = database
        .prepare("SELECT * FROM super_admins WHERE lower(username) = lower(?) AND status = 'Active'")
        .get(username.trim());
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
    if (isTrialExpired(database))
        throw new Error("Trial period has expired. Please contact your system provider.");
    const user = database
        .prepare("SELECT * FROM users WHERE lower(username) = lower(?) AND status = 'Active'")
        .get(username.trim());
    if (!user || !verifyPassword(password, user.password_hash))
        return null;
    return sanitizeUser(user);
}
function changePassword(payload) {
    const database = getDatabase();
    const user = database.prepare("SELECT * FROM users WHERE id = ? AND status = 'Active'").get(payload.userId);
    if (!user || !verifyPassword(payload.currentPassword, user.password_hash))
        throw new Error("Current password is incorrect.");
    validatePassword(payload.newPassword);
    database.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(hashPassword(payload.newPassword), payload.userId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.userId, "Changed password", "User", `User ${user.username} completed first-login password change`, now());
    return sanitizeUser({ ...user, must_change_password: 0 });
}
function createUser(payload) {
    const database = getDatabase();
    const creator = database.prepare("SELECT id, role FROM users WHERE id = ? AND status = 'Active'").get(payload.creatorId);
    if (!creator || creator.role !== "Owner")
        throw new Error("Only Owner accounts can create users.");
    const username = payload.username.trim();
    const email = payload.email?.trim() ?? "";
    validateUserPayload({ ...payload, username, email });
    const duplicate = database.prepare("SELECT id FROM users WHERE lower(username) = lower(?)").get(username);
    if (duplicate)
        throw new Error("Username already exists.");
    const temporaryPassword = generateTemporaryPassword();
    const result = database.prepare(`
    INSERT INTO users (
      name, role, pin, username, password_hash, contact_number, address, email,
      must_change_password, status, created_by, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Active', ?, ?)
  `).run(payload.name.trim(), payload.role, "", username, hashPassword(temporaryPassword), payload.contactNumber.trim(), payload.address.trim(), email, payload.creatorId, now());
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.creatorId, "Created", "User", `Created ${payload.role} account ${username}`, now());
    return {
        user: sanitizeUser(database.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid)),
        credentials: {
            username,
            temporaryPassword,
            emailSent: false
        }
    };
}
function disableUser(payload) {
    const database = getDatabase();
    const owner = database.prepare("SELECT id, role, username FROM users WHERE id = ? AND status = 'Active'").get(payload.ownerId);
    if (!owner || owner.role !== "Owner")
        throw new Error("Only Owner accounts can disable users.");
    if (payload.ownerId === payload.targetUserId)
        throw new Error("You cannot disable your own account while signed in.");
    const target = database.prepare("SELECT id, username, status FROM users WHERE id = ?").get(payload.targetUserId);
    if (!target)
        throw new Error("User account was not found.");
    if (target.status === "Disabled")
        throw new Error("This account is already disabled.");
    database.prepare("UPDATE users SET status = 'Disabled' WHERE id = ?").run(payload.targetUserId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.ownerId, "Disabled", "User", `Disabled account ${target.username}`, now());
    return { ok: true };
}
function enableUser(payload) {
    const database = getDatabase();
    const owner = database.prepare("SELECT id, role, username FROM users WHERE id = ? AND status = 'Active'").get(payload.ownerId);
    if (!owner || owner.role !== "Owner")
        throw new Error("Only Owner accounts can re-enable users.");
    const target = database.prepare("SELECT id, username, status FROM users WHERE id = ?").get(payload.targetUserId);
    if (!target)
        throw new Error("User account was not found.");
    if (target.status === "Active")
        throw new Error("This account is already active.");
    database.prepare("UPDATE users SET status = 'Active' WHERE id = ?").run(payload.targetUserId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.ownerId, "Re-enabled", "User", `Re-enabled account ${target.username}`, now());
    return { ok: true };
}
function createJobOrder(payload) {
    const database = getDatabase();
    const customerName = payload.customerName.trim();
    const contactNumber = payload.contactNumber.trim();
    const motorcycleType = payload.motorcycleType.trim();
    const plateNumber = payload.plateNumber.trim().toUpperCase();
    if (!customerName)
        throw new Error("Customer name is required.");
    if (!isValidContactNumber(contactNumber))
        throw new Error("Contact number must contain 10 to 11 digits and may include spaces, parentheses, or dashes.");
    if (!motorcycleType)
        throw new Error("Motorcycle type is required.");
    if (!plateNumber)
        throw new Error("Plate number is required.");
    const service = database.prepare("SELECT id, name, price, labor_cost FROM services WHERE id = ?").get(payload.serviceId);
    if (!service)
        throw new Error("Service to avail is required.");
    const servicePrice = Number(service.price);
    const laborCost = Number(service.labor_cost || 0);
    const serviceTotal = servicePrice + laborCost;
    const mechanic = database.prepare("SELECT id FROM users WHERE id = ? AND status = 'Active' AND is_mechanic = 1 AND role NOT IN ('Owner', 'Admin')").get(payload.mechanicId);
    if (!mechanic)
        throw new Error("Select mechanic is required.");
    const createdAt = now();
    const datePart = createdAt.slice(0, 10).replace(/-/g, "");
    const count = database.prepare("SELECT COUNT(*) as count FROM job_orders WHERE job_no LIKE ?").get(`JO-${datePart}-%`);
    const jobNo = `JO-${datePart}-${String(count.count + 1).padStart(5, "0")}`;
    const transaction = database.transaction(() => {
        const customer = database.prepare("INSERT INTO customers (name, phone, email, address, created_at) VALUES (?, ?, '', '', ?)").run(customerName, contactNumber, createdAt);
        const motorcycle = database.prepare("INSERT INTO motorcycles (customer_id, plate_no, brand, model, year, color) VALUES (?, ?, ?, '', NULL, '')").run(customer.lastInsertRowid, plateNumber, motorcycleType);
        const job = database.prepare(`
      INSERT INTO job_orders (
        job_no, customer_id, motorcycle_id, mechanic_id, status, concern, estimate, created_at, due_at,
        customer_name, contact_number, motorcycle_type, plate_number, service_id, service_price, labor_cost, additional_labor_cost,
        service_cost, products_json, products_cost, total_amount
      )
      VALUES (?, ?, ?, ?, 'In Progress', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '[]', 0, ?)
    `).run(jobNo, customer.lastInsertRowid, motorcycle.lastInsertRowid, payload.mechanicId, service.name, serviceTotal, createdAt, createdAt, customerName, contactNumber, motorcycleType, plateNumber, service.id, servicePrice, laborCost, serviceTotal, serviceTotal);
        database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Created", "Job Order", `Created ${jobNo}`, createdAt);
        logJobStatus(database, Number(job.lastInsertRowid), payload.actorId, "Created", `Job order ${jobNo} created.`);
        logJobStatus(database, Number(job.lastInsertRowid), payload.actorId, "In Progress", "Job order started.");
        return { jobNo, id: Number(job.lastInsertRowid) };
    });
    return transaction();
}
function updateJobOrder(payload) {
    const database = getDatabase();
    const status = normalizeJobStatus(payload.status);
    const allowedStatuses = ["In Progress", "Completed"];
    if (!allowedStatuses.includes(status))
        throw new Error("Invalid job order status.");
    const job = database.prepare("SELECT id, job_no, status, service_price, labor_cost, paid_at FROM job_orders WHERE id = ?").get(payload.jobOrderId);
    if (!job)
        throw new Error("Job order was not found.");
    if (job.paid_at)
        throw new Error("Paid job orders can no longer be edited.");
    const products = payload.products.map((product) => ({
        itemId: product.itemId,
        name: product.name,
        quantity: Math.max(1, Number(product.quantity) || 1),
        unitPrice: Number(product.unitPrice) || 0
    }));
    const additionalLaborCost = Number(payload.additionalLaborCost ?? 0);
    if (!Number.isFinite(additionalLaborCost) || additionalLaborCost < 0)
        throw new Error("Additional labor cost must be zero or greater.");
    const productsCost = products.reduce((sum, product) => sum + product.quantity * product.unitPrice, 0);
    const servicePrice = Number(job.service_price || 0);
    const laborCost = Number(job.labor_cost || 0);
    const serviceCost = servicePrice + laborCost + additionalLaborCost;
    const totalAmount = serviceCost + productsCost;
    database.prepare(`
    UPDATE job_orders
    SET status = ?, products_json = ?, products_cost = ?, additional_labor_cost = ?, service_cost = ?, total_amount = ?
    WHERE id = ?
  `).run(status, JSON.stringify(products), productsCost, additionalLaborCost, serviceCost, totalAmount, payload.jobOrderId);
    database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Updated", "Job Order", `Updated ${job.job_no} status to ${status}`, now());
    if (job.status !== status)
        logJobStatus(database, payload.jobOrderId, payload.actorId, status, `Status changed from ${job.status} to ${status}.`);
    return { ok: true, servicePrice, laborCost, additionalLaborCost, serviceCost, productsCost, totalAmount };
}
function logJobStatus(database, jobOrderId, actorId, status, details = "") {
    database.prepare(`
    INSERT INTO job_status_history (job_order_id, actor_id, status, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(jobOrderId, actorId, status, details, now());
}
function normalizeJobStatus(status) {
    const normalized = status.trim();
    if (normalized === "Ready" || normalized === "Released")
        return "Completed";
    return normalized;
}
function payJobOrder(payload) {
    const database = getDatabase();
    const method = validateActivePaymentMethod(database, payload.paymentMethod, payload.paymentReferenceCode);
    const referenceCode = method.payment_category === "Digital" ? payload.paymentReferenceCode?.trim() ?? "" : "";
    const job = database.prepare("SELECT * FROM job_orders WHERE id = ?").get(payload.jobOrderId);
    if (!job)
        throw new Error("Job order was not found.");
    if (job.status !== "Completed")
        throw new Error("Only completed job orders can be paid.");
    if (job.paid_at)
        throw new Error("This job order has already been paid.");
    const products = JSON.parse(job.products_json || "[]");
    const paidAt = now();
    const transaction = database.transaction(() => {
        const reduceStock = database.prepare("UPDATE inventory SET stock = stock - ? WHERE id = ? AND stock >= ?");
        for (const product of products)
            reduceStock.run(product.quantity, product.itemId, product.quantity);
        database.prepare(`
      UPDATE job_orders
      SET payment_method = ?, payment_category = ?, payment_reference_code = ?, paid_at = ?, status = 'Completed'
      WHERE id = ?
    `).run(method.name, method.payment_category, referenceCode, paidAt, payload.jobOrderId);
        database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, "Paid", "Job Order", `Paid ${job.job_no} via ${method.name}`, paidAt);
        logJobStatus(database, payload.jobOrderId, payload.actorId, "Paid", `Paid via ${method.name}.`);
    });
    transaction();
    return { receiptNo: job.job_no, total: job.total_amount, paidAt, paymentCategory: method.payment_category, paymentReferenceCode: referenceCode };
}
function createSale(payload) {
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
        const reduceStock = database.prepare("UPDATE inventory SET stock = stock - ? WHERE id = ? AND stock >= ?");
        for (const item of payload.items) {
            insertItem.run(sale.lastInsertRowid, item.itemType, item.itemId, item.name, item.quantity, item.unitPrice, item.quantity * item.unitPrice);
            if (item.itemType === "part")
                reduceStock.run(item.quantity, item.itemId, item.quantity);
        }
        database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.cashierId, "Created", "Sale", `Receipt ${receiptNo} total ${total.toFixed(2)}`, createdAt);
        return { receiptNo, subtotal, discount: payload.discount, total, createdAt, paymentCategory: method.payment_category, paymentReferenceCode: referenceCode };
    });
    return transaction();
}
function voidOrRefundSale(payload) {
    const database = getDatabase();
    const sale = database.prepare("SELECT id, receipt_no, status FROM sales WHERE id = ?").get(payload.saleId);
    if (!sale)
        throw new Error("Transaction was not found.");
    if (sale.status === "Voided" || sale.status === "Refunded")
        throw new Error("This transaction has already been voided or refunded.");
    const actionType = payload.actionType === "Refund" ? "Refund" : "Void";
    const approval = requireSensitiveApproval(database, payload.actorId, payload, `${actionType} Sale`, "Sale", String(payload.saleId));
    const items = database.prepare("SELECT item_type, item_id, quantity FROM sale_items WHERE sale_id = ?").all(payload.saleId);
    const completedAt = now();
    const transaction = database.transaction(() => {
        const restoreStock = database.prepare("UPDATE inventory SET stock = stock + ? WHERE id = ?");
        for (const item of items) {
            if (item.item_type === "part")
                restoreStock.run(item.quantity, item.item_id);
        }
        database.prepare(`
      UPDATE sales
      SET status = ?, voided_at = ?, voided_by = ?, void_approved_by = ?, void_reason = ?
      WHERE id = ?
    `).run(actionType === "Refund" ? "Refunded" : "Voided", completedAt, payload.actorId, approval.id, approval.reason, payload.saleId);
        database.prepare("INSERT INTO audit_logs (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)").run(payload.actorId, actionType === "Refund" ? "Refunded" : "Voided", "Sale", `${actionType} ${sale.receipt_no}. Approved by ${approval.name}. Reason: ${approval.reason}`, completedAt);
    });
    transaction();
    return { ok: true };
}
function nextTransactionNumber(database) {
    const date = new Date();
    const year = String(date.getFullYear()).slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const prefix = `TRN-${year}${month}${day}`;
    const latest = database
        .prepare("SELECT receipt_no FROM sales WHERE receipt_no LIKE ? ORDER BY receipt_no DESC LIMIT 1")
        .get(`${prefix}-%`);
    const latestSequence = Number(latest?.receipt_no.match(/-(\d+)$/)?.[1] ?? 0);
    return `${prefix}-${String(latestSequence + 1).padStart(4, "0")}`;
}
function sanitizeUser(user) {
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
function hashPassword(password, salt = node_crypto_1.default.randomBytes(16).toString("hex")) {
    const hash = node_crypto_1.default.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash)
        return false;
    const candidate = hashPassword(password, salt).split(":")[1];
    return node_crypto_1.default.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}
function generateTemporaryPassword() {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%";
    const all = upper + lower + digits + symbols;
    const required = [
        upper[node_crypto_1.default.randomInt(upper.length)],
        lower[node_crypto_1.default.randomInt(lower.length)],
        digits[node_crypto_1.default.randomInt(digits.length)],
        symbols[node_crypto_1.default.randomInt(symbols.length)]
    ];
    while (required.length < 12)
        required.push(all[node_crypto_1.default.randomInt(all.length)]);
    return required.sort(() => node_crypto_1.default.randomInt(3) - 1).join("");
}
function validatePassword(password) {
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
        throw new Error("Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.");
    }
}
function validateUserPayload(payload) {
    if (!["Owner", "Admin", "Cashier"].includes(payload.role))
        throw new Error("Role is required.");
    if (!payload.name.trim())
        throw new Error("Full name is required.");
    if (!payload.contactNumber.trim() || !isValidContactNumber(payload.contactNumber))
        throw new Error("Contact number must contain 10 to 11 digits and may include spaces, parentheses, or dashes.");
    if (!payload.address.trim())
        throw new Error("Address is required.");
    if (!usernamePattern.test(payload.username))
        throw new Error("Username must be 3-32 characters and use only letters, numbers, dot, dash, or underscore.");
    if (payload.email && !emailPattern.test(payload.email))
        throw new Error("Email address must be valid.");
}
