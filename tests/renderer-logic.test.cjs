const assert = require("node:assert/strict");
const test = require("node:test");

const { calculateCartTotals } = require("../dist-tests/renderer/src/features/pos/cartTotals.js");
const { calculateInventoryForecast } = require("../dist-tests/renderer/src/features/inventory/inventoryForecast.js");
const { mechanicIdReceiptNo, payslipReceiptNo } = require("../dist-tests/renderer/src/features/payroll/payrollPresentation.js");
const { buildCustomerInsightRows, buildMotorcycleInsightRows, buildPurchasePlanningRows, buildSupplierPurchaseRows, csvSection } = require("../dist-tests/renderer/src/features/reports/reportMetrics.js");

test("cart totals include subtotal, discount, and floor total at zero", () => {
  const totals = calculateCartTotals([
    { itemType: "part", itemId: 1, name: "Oil", quantity: 2, unitPrice: 150 },
    { itemType: "service", itemId: 2, name: "Labor", quantity: 1, unitPrice: 500 }
  ], 1000);

  assert.equal(totals.subtotal, 800);
  assert.equal(totals.discount, 1000);
  assert.equal(totals.total, 0);
});

test("inventory forecast flags reorder, dead stock, and supplier history", () => {
  const data = {
    inventory: [
      { id: 1, product_code: "OIL-001", category_id: 1, name: "Oil", category: "Fluids", stock: 1, reorder_level: 3, unit_cost: 100, sell_price: 150 },
      { id: 2, product_code: "OLD-001", category_id: 1, name: "Old Part", category: "Parts", stock: 8, reorder_level: 2, unit_cost: 50, sell_price: 80 }
    ],
    sales: [{ id: 1, receipt_no: "TRN-1", cashier_name: "Cashier", subtotal: 150, discount: 0, total: 150, payment_method: "Cash", status: "Completed", created_at: "2026-05-10T00:00:00.000Z" }],
    saleItems: [{ id: 1, sale_id: 1, item_type: "part", item_id: 1, name: "Oil", quantity: 4, unit_price: 150, line_total: 600 }],
    jobOrders: [],
    inventoryAdjustments: [{ id: 1, item_id: 1, actor_id: 1, movement_type: "Stock In", quantity: 6, previous_stock: 0, new_stock: 6, supplier_id: 10, supplier_name: "Supplier A", reference_no: "DR-1", reason: "Stock", created_at: "2026-05-09T00:00:00.000Z", product_code: "OIL-001", item_name: "Oil", actor_name: "Owner" }]
  };

  const forecast = calculateInventoryForecast(data, 30, new Date("2026-05-14T00:00:00.000Z"));
  assert.equal(forecast.reorderRows[0].forecastStatus, "Reorder Now");
  assert.equal(forecast.reorderRows.find((row) => row.id === 2).forecastStatus, "Dead Stock");
  assert.equal(forecast.supplierRows[0].supplier, "Supplier A");
  assert.equal(forecast.stockValue, 500);
});

test("payroll presentation creates stable document receipt numbers", () => {
  assert.equal(payslipReceiptNo({ mechanic_id: 7, mechanic_code: "MECH-007", period_start: "2026-05-01" }), "payslip-MECH-007-2026-05-01");
  assert.equal(mechanicIdReceiptNo({ id: 7, mechanic_code: "MECH-007" }), "mechanic-id-MECH-007");
});

test("csvSection escapes quotes and keeps section title", () => {
  const csv = csvSection("Sales", ["Name", "Amount"], [["A \"quoted\" part", 120]]);
  assert.ok(csv.startsWith("\"Sales\""));
  assert.ok(csv.includes("\"A \"\"quoted\"\" part\""));
});

test("customer and motorcycle report metrics summarize visits and revenue", () => {
  const data = {
    customers: [{ id: 1, name: "Ana Cruz", phone: "09171234567", email: "", address: "", created_at: "2026-05-01T00:00:00.000Z" }],
    motorcycles: [{ id: 1, customer_id: 1, customer_name: "Ana Cruz", plate_no: "ABC123", brand: "Honda", model: "Click", year: 2021, color: "Black" }],
    jobOrders: [
      { id: 1, job_no: "JO-1", customer_name: "Ana Cruz", contact_number: "09171234567", plate_no: "ABC123", motorcycle_type: "Honda Click", mechanic_name: "Mechanic", status: "Completed", total_amount: 1000, paid_at: "2026-05-10T00:00:00.000Z", created_at: "2026-05-09T00:00:00.000Z" },
      { id: 2, job_no: "JO-2", customer_name: "Ana Cruz", contact_number: "09171234567", plate_no: "ABC123", motorcycle_type: "Honda Click", mechanic_name: "Mechanic", status: "In Progress", total_amount: 500, created_at: "2026-05-12T00:00:00.000Z" }
    ],
    sales: [{ id: 1, receipt_no: "TRN-1", customer_name: "Ana Cruz", cashier_name: "Cashier", subtotal: 250, discount: 0, total: 250, payment_method: "Cash", status: "Completed", created_at: "2026-05-11T00:00:00.000Z" }]
  };

  const customers = buildCustomerInsightRows(data);
  const motorcycles = buildMotorcycleInsightRows(data);
  assert.equal(customers[0].customer, "Ana Cruz");
  assert.equal(customers[0].jobCount, 2);
  assert.equal(customers[0].openJobs, 1);
  assert.equal(customers[0].posTransactions, 1);
  assert.equal(customers[0].totalRevenue, 1250);
  assert.equal(motorcycles[0].plateNo, "ABC123");
  assert.equal(motorcycles[0].serviceCount, 2);
});

test("purchase planning report metrics account for open purchase orders", () => {
  const data = {
    suppliers: [{ id: 10, name: "Supplier A", contact: "Nico", phone: "09170000000" }],
    inventory: [
      { id: 1, product_code: "OIL-001", name: "Oil", supplier_id: 10, supplier_name: "Supplier A", stock: 1, reorder_level: 4, unit_cost: 100, sell_price: 150 },
      { id: 2, product_code: "PLG-001", name: "Spark Plug", stock: 10, reorder_level: 3, unit_cost: 50, sell_price: 90 }
    ],
    purchaseOrders: [{ id: 100, order_no: "PO-1", supplier_id: 10, status: "Ordered", notes: "", created_by: 1, created_at: "2026-05-12T00:00:00.000Z", updated_at: "2026-05-12T00:00:00.000Z" }],
    purchaseOrderItems: [{ id: 1, purchase_order_id: 100, item_id: 1, product_code: "OIL-001", item_name: "Oil", quantity_ordered: 5, quantity_received: 2, unit_cost: 100 }]
  };

  const planning = buildPurchasePlanningRows(data);
  const suppliers = buildSupplierPurchaseRows(data);
  assert.equal(planning[0].productCode, "OIL-001");
  assert.equal(planning[0].onOrder, 3);
  assert.equal(planning[0].suggestedReorder, 7);
  assert.equal(planning[0].netNeed, 4);
  assert.equal(planning[0].status, "Covered by PO");
  assert.equal(suppliers[0].supplier, "Supplier A");
  assert.equal(suppliers[0].unitsOrdered, 5);
  assert.equal(suppliers[0].unitsReceived, 2);
});
