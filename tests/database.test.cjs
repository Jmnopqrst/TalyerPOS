const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");

const dbModule = require("../dist/main/database.js");

function tempDbPath(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `talyer-${name}-`));
  return path.join(dir, "talyer-pos.sqlite");
}

function useDatabase(name) {
  dbModule.closeDatabase();
  process.env.TALYER_POS_DB_PATH = tempDbPath(name);
  return process.env.TALYER_POS_DB_PATH;
}

function cleanupDatabase() {
  dbModule.closeDatabase();
  const dbPath = process.env.TALYER_POS_DB_PATH;
  delete process.env.TALYER_POS_DB_PATH;
  if (!dbPath) return;
  for (const filePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    fs.rmSync(filePath, { force: true });
  }
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
}

function seededData(name) {
  useDatabase(name);
  return dbModule.listAll();
}

test.afterEach(cleanupDatabase);

test("sale creation deducts part stock", () => {
  const data = seededData("sale-stock");
  const cashier = data.users.find((user) => user.username === "cashier");
  const item = data.inventory.find((part) => part.stock >= 2);
  assert.ok(cashier);
  assert.ok(item);

  const receipt = dbModule.createSale({
    cashierId: cashier.id,
    items: [{ itemType: "part", itemId: item.id, name: item.name, quantity: 2, unitPrice: item.sell_price }],
    discount: 0,
    paymentMethod: "Cash"
  });

  const nextItem = dbModule.listAll().inventory.find((part) => part.id === item.id);
  assert.match(receipt.receiptNo, /^TRN-/);
  assert.equal(nextItem.stock, item.stock - 2);
});

test("voiding a sale restores deducted stock", () => {
  const data = seededData("void-stock");
  const cashier = data.users.find((user) => user.username === "cashier");
  const item = data.inventory.find((part) => part.stock >= 1);
  assert.ok(cashier);
  assert.ok(item);

  const receipt = dbModule.createSale({
    cashierId: cashier.id,
    items: [{ itemType: "part", itemId: item.id, name: item.name, quantity: 1, unitPrice: item.sell_price }],
    discount: 0,
    paymentMethod: "Cash"
  });
  const sale = dbModule.listAll().sales.find((row) => row.receipt_no === receipt.receiptNo);
  assert.ok(sale);

  dbModule.voidOrRefundSale({
    actorId: cashier.id,
    saleId: sale.id,
    actionType: "Void",
    approvalUsername: "owner",
    approvalPassword: "0000",
    approvalReason: "Automated test void"
  });

  const restoredItem = dbModule.listAll().inventory.find((part) => part.id === item.id);
  const voidedSale = dbModule.listAll().sales.find((row) => row.id === sale.id);
  assert.equal(restoredItem.stock, item.stock);
  assert.equal(voidedSale.status, "Voided");
});

test("completed job payment deducts used products", () => {
  const data = seededData("job-payment");
  const owner = data.users.find((user) => user.username === "owner");
  const job = data.jobOrders.find((row) => row.job_no === "JO-1002");
  const item = data.inventory.find((part) => part.stock >= 1);
  assert.ok(owner);
  assert.ok(job);
  assert.ok(item);

  dbModule.updateJobOrder({
    actorId: owner.id,
    jobOrderId: job.id,
    status: "Completed",
    products: [{ itemId: item.id, name: item.name, quantity: 1, unitPrice: item.sell_price }],
    additionalLaborCost: 0
  });
  const payment = dbModule.payJobOrder({ actorId: owner.id, jobOrderId: job.id, paymentMethod: "Cash" });

  const paidJob = dbModule.listAll().jobOrders.find((row) => row.id === job.id);
  const nextItem = dbModule.listAll().inventory.find((part) => part.id === item.id);
  assert.equal(payment.receiptNo, job.job_no);
  assert.ok(paidJob.paid_at);
  assert.equal(nextItem.stock, item.stock - 1);
});

test("payroll computation creates a pending run", () => {
  const data = seededData("payroll");
  const owner = data.users.find((user) => user.username === "owner");
  const mechanic = data.users.find((user) => user.username === "mechanic");
  assert.ok(owner);
  assert.ok(mechanic);

  dbModule.updateMechanicPayroll({
    actorId: owner.id,
    mechanicId: mechanic.id,
    payrollType: "Per Day",
    salaryRate: 800,
    compensationType: "Fixed Salary",
    laborCommissionPercentage: 0
  });
  dbModule.updateMechanicAttendance({
    actorId: owner.id,
    mechanicId: mechanic.id,
    attendanceDate: "2026-05-13",
    timeIn: "2026-05-13T08:00:00.000Z",
    timeOut: "2026-05-13T17:00:00.000Z",
    status: "Present",
    notes: "Automated test attendance"
  });
  const payroll = dbModule.generatePayroll({
    actorId: owner.id,
    mechanicId: mechanic.id,
    periodStart: "2026-05-13",
    periodEnd: "2026-05-13",
    deductions: 50
  });

  assert.equal(payroll.status, "Draft");
  assert.equal(payroll.attendance_count, 1);
  assert.equal(payroll.net_pay, payroll.gross_pay - 50);
  assert.ok(payroll.attendance_snapshot_json);
  assert.ok(payroll.computed_totals_snapshot_json);
});

test("backup file can restore a previous database state", () => {
  const dbPath = useDatabase("backup-restore");
  const data = dbModule.listAll();
  const cashier = data.users.find((user) => user.username === "cashier");
  const item = data.inventory.find((part) => part.stock >= 2);
  const backupPath = path.join(path.dirname(dbPath), "backup.bak");
  assert.ok(cashier);
  assert.ok(item);

  const first = dbModule.createSale({
    cashierId: cashier.id,
    items: [{ itemType: "part", itemId: item.id, name: item.name, quantity: 1, unitPrice: item.sell_price }],
    discount: 0,
    paymentMethod: "Cash"
  });
  dbModule.backupDatabaseFile(backupPath);
  const second = dbModule.createSale({
    cashierId: cashier.id,
    items: [{ itemType: "part", itemId: item.id, name: item.name, quantity: 1, unitPrice: item.sell_price }],
    discount: 0,
    paymentMethod: "Cash"
  });

  dbModule.closeDatabase();
  fs.copyFileSync(backupPath, dbPath);
  const restoredReceipts = dbModule.listAll().sales.map((sale) => sale.receipt_no);
  assert.ok(restoredReceipts.includes(first.receiptNo));
  assert.equal(restoredReceipts.includes(second.receiptNo), false);
});

test("permission rules reject cashier inventory management", () => {
  const data = seededData("permissions");
  const cashier = data.users.find((user) => user.username === "cashier");
  const category = data.inventoryCategories[0];
  assert.ok(cashier);
  assert.ok(category);

  assert.throws(() => dbModule.createInventoryItem({
    actorId: cashier.id,
    categoryId: category.id,
    name: "Unauthorized Part",
    stock: 1,
    sellPrice: 99,
    supplierId: null
  }), /Only Owner and Admin accounts can manage inventory/);
});

test("inventory item create and update keep costing and reorder fields", () => {
  const data = seededData("inventory-costing");
  const owner = data.users.find((user) => user.username === "owner");
  const category = data.inventoryCategories[0];
  assert.ok(owner);
  assert.ok(category);

  const created = dbModule.createInventoryItem({
    actorId: owner.id,
    categoryId: category.id,
    name: "Costed Test Part",
    stock: 4,
    reorderLevel: 3,
    unitCost: 125,
    sellPrice: 220,
    supplierId: null
  });
  const createdItem = dbModule.listAll().inventory.find((item) => item.product_code === created.productCode);
  assert.equal(createdItem.reorder_level, 3);
  assert.equal(createdItem.unit_cost, 125);

  dbModule.updateInventoryItem({
    actorId: owner.id,
    itemId: createdItem.id,
    categoryId: category.id,
    name: createdItem.name,
    stock: createdItem.stock,
    reorderLevel: 5,
    unitCost: 140,
    sellPrice: createdItem.sell_price,
    supplierId: null
  });
  const updatedItem = dbModule.listAll().inventory.find((item) => item.id === createdItem.id);
  assert.equal(updatedItem.reorder_level, 5);
  assert.equal(updatedItem.unit_cost, 140);
});

test("purchase order receiving updates inventory and order status", () => {
  const data = seededData("purchase-receive");
  const owner = data.users.find((user) => user.username === "owner");
  const item = data.inventory.find((part) => part.stock >= 1);
  const supplier = data.suppliers[0];
  assert.ok(owner);
  assert.ok(item);
  assert.ok(supplier);

  const purchase = dbModule.createPurchaseOrder({
    actorId: owner.id,
    supplierId: supplier.id,
    notes: "Automated reorder",
    items: [{ itemId: item.id, quantityOrdered: 5, unitCost: item.unit_cost }]
  });

  dbModule.updatePurchaseOrderStatus({
    actorId: owner.id,
    purchaseOrderId: purchase.id,
    status: "Partially Received",
    receivedItems: [{ itemId: item.id, quantityReceived: 2 }]
  });
  const partial = dbModule.listAll();
  const partialItem = partial.inventory.find((part) => part.id === item.id);
  const partialOrder = partial.purchaseOrders.find((order) => order.id === purchase.id);
  const partialLine = partial.purchaseOrderItems.find((line) => line.purchase_order_id === purchase.id && line.item_id === item.id);
  assert.equal(partialItem.stock, item.stock + 2);
  assert.equal(partialOrder.status, "Partially Received");
  assert.equal(partialLine.quantity_received, 2);

  dbModule.updatePurchaseOrderStatus({
    actorId: owner.id,
    purchaseOrderId: purchase.id,
    status: "Received"
  });
  const received = dbModule.listAll();
  const receivedItem = received.inventory.find((part) => part.id === item.id);
  const receivedOrder = received.purchaseOrders.find((order) => order.id === purchase.id);
  const receivedLine = received.purchaseOrderItems.find((line) => line.purchase_order_id === purchase.id && line.item_id === item.id);
  assert.equal(receivedItem.stock, item.stock + 5);
  assert.equal(receivedOrder.status, "Received");
  assert.ok(receivedOrder.received_at);
  assert.equal(receivedLine.quantity_received, 5);
  assert.ok(received.inventoryAdjustments.some((movement) => movement.reference_no === purchase.orderNo && movement.quantity === 3));
});

test("purchase order rejects duplicate item lines", () => {
  const data = seededData("purchase-duplicates");
  const owner = data.users.find((user) => user.username === "owner");
  const item = data.inventory[0];
  assert.ok(owner);
  assert.ok(item);

  assert.throws(() => dbModule.createPurchaseOrder({
    actorId: owner.id,
    items: [
      { itemId: item.id, quantityOrdered: 2, unitCost: item.unit_cost },
      { itemId: item.id, quantityOrdered: 3, unitCost: item.unit_cost }
    ]
  }), /can only appear once/);
});

test("clear database removes purchase orders before referenced inventory and suppliers", () => {
  const data = seededData("clear-with-purchase-orders");
  const owner = data.users.find((user) => user.username === "owner");
  const service = data.services[0];
  const item = data.inventory[0];
  const supplier = data.suppliers[0];
  assert.ok(owner);
  assert.ok(service);
  assert.ok(item);
  assert.ok(supplier);

  dbModule.createPurchaseOrder({
    actorId: owner.id,
    supplierId: supplier.id,
    notes: "Clear database regression",
    items: [{ itemId: item.id, quantityOrdered: 3, unitCost: item.unit_cost }]
  });
  const createdJob = dbModule.createJobOrder({
    actorId: owner.id,
    customerName: "Reset Customer",
    contactNumber: "09171234567",
    motorcycleType: "Honda Click",
    plateNumber: "RST123",
    serviceId: service.id,
    mechanicId: dbModule.createMechanic({
      actorId: owner.id,
      name: "Reset Mechanic",
      contactNumber: "09175551234",
      address: "Service bay",
      status: "Active"
    }).id
  });
  const job = dbModule.listAll().jobOrders.find((row) => row.id === createdJob.id);
  assert.ok(job);
  assert.ok(dbModule.listAll().jobPayrollAllocations.some((allocation) => allocation.job_order_id === job.id));

  dbModule.clearOperationalDatabase({ superAdminId: 1, backupPath: "test-backup-before-reset.bak" });
  const cleared = dbModule.listAll();
  assert.equal(cleared.purchaseOrders.length, 0);
  assert.equal(cleared.purchaseOrderItems.length, 0);
  assert.equal(cleared.jobPayrollAllocations.length, 0);
  assert.equal(cleared.payrollCutoffs.length, 0);
  assert.equal(cleared.jobOrders.length, 0);
  assert.equal(cleared.inventory.length, 0);
  assert.equal(cleared.suppliers.length, 0);
  assert.ok(cleared.users.some((user) => user.username === "Owner"));
});

test("cashier cannot create purchase orders", () => {
  const data = seededData("purchase-permission");
  const cashier = data.users.find((user) => user.username === "cashier");
  const item = data.inventory[0];
  assert.ok(cashier);
  assert.ok(item);

  assert.throws(() => dbModule.createPurchaseOrder({
    actorId: cashier.id,
    items: [{ itemId: item.id, quantityOrdered: 1, unitCost: item.unit_cost }]
  }), /Only Owner and Admin accounts can manage inventory/);
});

test("migration upgrades an old database shape without losing rows", () => {
  const dbPath = useDatabase("migration");
  const oldDb = new Database(dbPath);
  oldDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Owner','Admin','Cashier')),
      pin TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active'
    );
    CREATE TABLE inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      stock INTEGER NOT NULL,
      reorder_level INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      sell_price REAL NOT NULL
    );
    INSERT INTO users (name, role, pin, status) VALUES ('Legacy Owner', 'Owner', '1234', 'Active');
    INSERT INTO inventory (name, category, stock, reorder_level, unit_cost, sell_price)
      VALUES ('Legacy Spark Plug', 'Legacy Parts', 7, 3, 50, 90);
  `);
  oldDb.close();

  const migrated = dbModule.listAll();
  const owner = migrated.users.find((user) => user.name === "Legacy Owner");
  const legacyItem = migrated.inventory.find((item) => item.name === "Legacy Spark Plug");
  const columns = dbModule.getDatabase().prepare("PRAGMA table_info(inventory)").all().map((column) => column.name);

  assert.ok(owner);
  assert.equal(owner.username, "owner");
  assert.ok(legacyItem);
  assert.equal(legacyItem.stock, 7);
  assert.ok(legacyItem.product_code);
  assert.ok(columns.includes("supplier_id"));
  assert.ok(migrated.paymentMethods.some((method) => method.name === "Cash"));
});

test("sale with insufficient stock rolls back sale and sale item records", () => {
  const data = seededData("sale-rollback");
  const cashier = data.users.find((user) => user.username === "cashier");
  const item = data.inventory[0];
  const saleCountBefore = data.sales.length;
  const saleItemCountBefore = data.saleItems.length;
  assert.ok(cashier);
  assert.ok(item);

  assert.throws(() => dbModule.createSale({
    cashierId: cashier.id,
    items: [{ itemType: "part", itemId: item.id, name: item.name, quantity: item.stock + 100, unitPrice: item.sell_price }],
    discount: 0,
    paymentMethod: "Cash"
  }), /Insufficient stock/);

  const next = dbModule.listAll();
  assert.equal(next.sales.length, saleCountBefore);
  assert.equal(next.saleItems.length, saleItemCountBefore);
  assert.equal(next.inventory.find((part) => part.id === item.id).stock, item.stock);
});

test("job payment with insufficient product stock does not mark job paid", () => {
  const data = seededData("job-payment-rollback");
  const owner = data.users.find((user) => user.username === "owner");
  const job = data.jobOrders.find((row) => row.job_no === "JO-1002");
  const item = data.inventory[0];
  assert.ok(owner);
  assert.ok(job);
  assert.ok(item);

  dbModule.updateJobOrder({
    actorId: owner.id,
    jobOrderId: job.id,
    status: "Completed",
    products: [{ itemId: item.id, name: item.name, quantity: item.stock + 100, unitPrice: item.sell_price }],
    additionalLaborCost: 0
  });
  assert.throws(() => dbModule.payJobOrder({ actorId: owner.id, jobOrderId: job.id, paymentMethod: "Cash" }), /Insufficient stock/);

  const nextJob = dbModule.listAll().jobOrders.find((row) => row.id === job.id);
  const nextItem = dbModule.listAll().inventory.find((part) => part.id === item.id);
  assert.equal(nextJob.paid_at || "", "");
  assert.equal(nextItem.stock, item.stock);
});

test("duplicate payroll generation is rejected without creating another run", () => {
  const data = seededData("payroll-duplicate");
  const owner = data.users.find((user) => user.username === "owner");
  const mechanic = data.users.find((user) => user.username === "mechanic");
  assert.ok(owner);
  assert.ok(mechanic);

  const payload = { actorId: owner.id, mechanicId: mechanic.id, periodStart: "2026-05-01", periodEnd: "2026-05-15", deductions: 0 };
  dbModule.generatePayroll(payload);
  assert.throws(() => dbModule.generatePayroll(payload), /Payroll already exists/);

  const runs = dbModule.listAll().payrollRuns.filter((run) => run.mechanic_id === mechanic.id && run.period_start === payload.periodStart && run.period_end === payload.periodEnd);
  assert.equal(runs.length, 1);
});

test("payroll cutoffs prevent overlap and duplicate active runs", () => {
  const data = seededData("payroll-cutoff");
  const owner = data.users.find((user) => user.username === "owner");
  const mechanic = data.users.find((user) => user.username === "mechanic");
  assert.ok(owner);
  assert.ok(mechanic);

  const cutoff = dbModule.createPayrollCutoff({
    actorId: owner.id,
    name: "1st Half May",
    periodStart: "2026-05-01",
    periodEnd: "2026-05-15",
    payDate: "2026-05-16"
  });
  assert.equal(cutoff.status, "Open");
  assert.throws(() => dbModule.createPayrollCutoff({
    actorId: owner.id,
    name: "Overlapping May",
    periodStart: "2026-05-10",
    periodEnd: "2026-05-20",
    payDate: "2026-05-21"
  }), /overlaps/);

  dbModule.generatePayroll({ actorId: owner.id, mechanicId: mechanic.id, cutoffId: cutoff.id, deductions: 0 });
  assert.throws(() => dbModule.generatePayroll({ actorId: owner.id, mechanicId: mechanic.id, cutoffId: cutoff.id, deductions: 0 }), /Payroll already exists/);
});

test("payroll workflow requires approval before paid and locks approved snapshots", () => {
  const data = seededData("payroll-workflow");
  const owner = data.users.find((user) => user.username === "owner");
  const mechanic = data.users.find((user) => user.username === "mechanic");
  assert.ok(owner);
  assert.ok(mechanic);

  const payroll = dbModule.generatePayroll({
    actorId: owner.id,
    mechanicId: mechanic.id,
    periodStart: "2026-05-01",
    periodEnd: "2026-05-15",
    deductions: 0
  });
  assert.throws(() => dbModule.markPayrollPaid({ actorId: owner.id, payrollId: payroll.id, paymentMethod: "Cash" }), /must be approved/);
  const review = dbModule.submitPayrollForReview({ actorId: owner.id, payrollId: payroll.id });
  assert.equal(review.status, "Pending Review");
  const approved = dbModule.approvePayrollRun({ actorId: owner.id, payrollId: payroll.id });
  assert.equal(approved.status, "Approved");
  assert.ok(approved.locked_at);

  dbModule.updateMechanicPayroll({
    actorId: owner.id,
    mechanicId: mechanic.id,
    payrollType: "Per Day",
    salaryRate: 9999,
    compensationType: "Fixed Salary",
    laborCommissionPercentage: 0
  });
  const stored = dbModule.listAll().payrollRuns.find((run) => run.id === payroll.id);
  const snapshot = JSON.parse(stored.mechanic_rate_snapshot_json);
  assert.notEqual(snapshot.salaryRate, 9999);

  const paid = dbModule.markPayrollPaid({ actorId: owner.id, payrollId: payroll.id, paymentMethod: "Cash" });
  assert.equal(paid.ok, true);
});

test("shared job payroll allocations split commission across mechanics", () => {
  const data = seededData("payroll-allocations");
  const owner = data.users.find((user) => user.username === "owner");
  const lead = data.users.find((user) => user.username === "mechanic");
  const job = data.jobOrders.find((row) => row.job_no === "JO-1002");
  assert.ok(owner);
  assert.ok(lead);
  assert.ok(job);

  const helper = dbModule.createMechanic({
    actorId: owner.id,
    name: "Helper Mechanic",
    contactNumber: "09175559999",
    address: "Service bay",
    status: "Active"
  });
  for (const mechanic of [lead, helper]) {
    dbModule.updateMechanicPayroll({
      actorId: owner.id,
      mechanicId: mechanic.id,
      payrollType: "Per Day",
      salaryRate: 0,
      compensationType: "Commission",
      laborCommissionPercentage: 10
    });
  }
  dbModule.updateJobOrder({
    actorId: owner.id,
    jobOrderId: job.id,
    status: "Completed",
    products: [],
    additionalLaborCost: 300,
    payrollAllocations: [
      { mechanicId: lead.id, allocationRole: "Lead", allocationType: "Percent", percentage: 70, isLead: true },
      { mechanicId: helper.id, allocationRole: "Helper", allocationType: "Percent", percentage: 30, isLead: false }
    ]
  });

  const periodStart = new Date().toISOString().slice(0, 10);
  const leadRun = dbModule.generatePayroll({ actorId: owner.id, mechanicId: lead.id, periodStart, periodEnd: periodStart, deductions: 0 });
  const helperRun = dbModule.generatePayroll({ actorId: owner.id, mechanicId: helper.id, periodStart, periodEnd: periodStart, deductions: 0 });

  assert.ok(leadRun.labor_commission > helperRun.labor_commission);
  assert.equal(Number((leadRun.labor_commission / helperRun.labor_commission).toFixed(2)), Number((70 / 30).toFixed(2)));
  const allocations = dbModule.listAll().jobPayrollAllocations.filter((allocation) => allocation.job_order_id === job.id);
  assert.equal(allocations.length, 2);
});

test("invalid backup inspection fails and current database stays unchanged", () => {
  const dbPath = useDatabase("backup-failure");
  const data = dbModule.listAll();
  const cashier = data.users.find((user) => user.username === "cashier");
  const item = data.inventory.find((part) => part.stock >= 1);
  const badBackupPath = path.join(path.dirname(dbPath), "bad-backup.bak");
  assert.ok(cashier);
  assert.ok(item);

  const receipt = dbModule.createSale({
    cashierId: cashier.id,
    items: [{ itemType: "part", itemId: item.id, name: item.name, quantity: 1, unitPrice: item.sell_price }],
    discount: 0,
    paymentMethod: "Cash"
  });
  fs.writeFileSync(badBackupPath, "not sqlite");

  assert.throws(() => dbModule.inspectDatabaseFile(badBackupPath));
  const receipts = dbModule.listAll().sales.map((sale) => sale.receipt_no);
  assert.ok(receipts.includes(receipt.receiptNo));
});

test("audit coverage records sale, approval, void, job payment, status history, and settings approval", () => {
  const data = seededData("audit-coverage");
  const owner = data.users.find((user) => user.username === "owner");
  const cashier = data.users.find((user) => user.username === "cashier");
  const item = data.inventory.find((part) => part.stock >= 2);
  const job = data.jobOrders.find((row) => row.job_no === "JO-1002");
  assert.ok(owner);
  assert.ok(cashier);
  assert.ok(item);
  assert.ok(job);

  const receipt = dbModule.createSale({
    cashierId: cashier.id,
    items: [{ itemType: "part", itemId: item.id, name: item.name, quantity: 1, unitPrice: item.sell_price }],
    discount: 0,
    paymentMethod: "Cash"
  });
  const sale = dbModule.listAll().sales.find((row) => row.receipt_no === receipt.receiptNo);
  dbModule.voidOrRefundSale({
    actorId: cashier.id,
    saleId: sale.id,
    actionType: "Refund",
    approvalUsername: "owner",
    approvalPassword: "0000",
    approvalReason: "Audit coverage refund"
  });
  dbModule.updateJobOrder({
    actorId: owner.id,
    jobOrderId: job.id,
    status: "Completed",
    products: [],
    additionalLaborCost: 0
  });
  dbModule.payJobOrder({ actorId: owner.id, jobOrderId: job.id, paymentMethod: "Cash" });
  dbModule.updateReceiptPrinterSettings({
    actorId: owner.id,
    outputMode: "PDF",
    printerName: "",
    approvalUsername: "owner",
    approvalPassword: "0000",
    approvalReason: "Audit coverage printer setting"
  });
  dbModule.recordSystemLog({ superAdminId: 1, action: "Restore Test Passed", details: "Audit coverage restore preview log" });

  const db = dbModule.getDatabase();
  const auditLogs = db.prepare("SELECT action, entity, details FROM audit_logs").all();
  const approvalLogs = db.prepare("SELECT action, entity, reason FROM approval_logs").all();
  const jobHistory = db.prepare("SELECT status, details FROM job_status_history WHERE job_order_id = ?").all(job.id);
  const systemLogs = db.prepare("SELECT action, details FROM system_logs WHERE action = 'Restore Test Passed'").all();

  assert.ok(auditLogs.some((log) => log.action === "Created" && log.entity === "Sale"));
  assert.ok(auditLogs.some((log) => log.action === "Refunded" && log.entity === "Sale"));
  assert.ok(auditLogs.some((log) => log.action === "Paid" && log.entity === "Job Order"));
  assert.ok(auditLogs.some((log) => log.entity === "Printer Settings" && log.details.includes("Audit coverage printer setting")));
  assert.ok(approvalLogs.some((log) => log.action === "Refund Sale" && log.reason === "Audit coverage refund"));
  assert.ok(approvalLogs.some((log) => log.action === "Changed Printer Settings" && log.reason === "Audit coverage printer setting"));
  assert.ok(jobHistory.some((row) => row.status === "Paid"));
  assert.ok(systemLogs.some((row) => row.details.includes("restore preview")));
});
