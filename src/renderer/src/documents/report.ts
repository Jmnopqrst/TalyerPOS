import type { AppData, Expense, InventoryItem, JobOrder, Sale } from '../../types/global';
import { formatDateTime, rowMatchesDateRange } from '../lib/date';
import { escapeHtml, money } from '../lib/format';
import { normalizeJobStatusForUi, parseJobProducts, serviceNameForJob } from '../features/shared/featureUtils';

export function inventoryCostMap(inventory: InventoryItem[]) {
  return new Map(inventory.map((item) => [item.id, Number(item.unit_cost || 0)]));
}

export function costOfGoodsSold(data: AppData, sales: Sale[], jobs: JobOrder[]) {
  const costs = inventoryCostMap(data.inventory);
  const saleIds = new Set(sales.map((sale) => sale.id));
  const saleCogs = data.saleItems
    .filter((item) => saleIds.has(item.sale_id) && item.item_type === "part")
    .reduce((sum, item) => sum + (costs.get(item.item_id) ?? 0) * item.quantity, 0);
  const jobCogs = jobs.reduce((sum, job) => sum + parseJobProducts(job.products_json)
    .reduce((jobSum, product) => jobSum + (costs.get(product.itemId) ?? 0) * product.quantity, 0), 0);
  return saleCogs + jobCogs;
}

export function serviceLaborRevenue(jobs: JobOrder[]) {
  return jobs.reduce((sum, job) =>
    sum + Number(job.service_price || 0) + Number(job.labor_cost || 0) + Number(job.additional_labor_cost || 0), 0);
}

export function suggestedReorderQuantity(item: InventoryItem) {
  return Math.max(Number(item.reorder_level || 0) * 2 - Number(item.stock || 0), 1);
}

export function expensesTotal(expenses: Expense[], startDate: string, endDate: string) {
  return expenses
    .filter((expense) => rowMatchesDateRange(expense.expense_date, startDate, endDate))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

export function buildReportHtml(data: AppData, sales: Sale[], jobs: JobOrder[], startDate: string, endDate: string, exportedBy: string) {
  const saleIds = new Set(sales.map((sale) => sale.id));
  const saleItems = data.saleItems.filter((item) => saleIds.has(item.sale_id));
  const posSalesTotal = sales.reduce((sum, sale) => sum + sale.total, 0);
  const jobOrderTotal = jobs.reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
  const digitalTotal = sales.filter((sale) => sale.payment_category === "Digital").reduce((sum, sale) => sum + sale.total, 0)
    + jobs.filter((job) => job.payment_category === "Digital").reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
  const cashTotal = sales.filter((sale) => sale.payment_category !== "Digital").reduce((sum, sale) => sum + sale.total, 0)
    + jobs.filter((job) => job.payment_category !== "Digital").reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
  const totalRevenue = posSalesTotal + jobOrderTotal;
  const cogs = costOfGoodsSold(data, sales, jobs);
  const grossProfit = totalRevenue - cogs;
  const laborRevenue = serviceLaborRevenue(jobs);
  const expenses = data.expenses.filter((expense) => rowMatchesDateRange(expense.expense_date, startDate, endDate));
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const netEstimate = grossProfit - expenseTotal;
  const lowStock = data.inventory.filter((item) => item.stock <= item.reorder_level);
  const itemAnalysis = Array.from(saleItems.reduce((map, item) => {
    const current = map.get(item.name) ?? { name: item.name, quantity: 0, revenue: 0 };
    current.quantity += item.quantity;
    current.revenue += item.line_total;
    map.set(item.name, current);
    return map;
  }, new Map<string, { name: string; quantity: number; revenue: number }>()).values()).sort((left, right) => right.quantity - left.quantity);
  const serviceAnalysis = Array.from(jobs.reduce((map, job) => {
    const serviceName = serviceNameForJob(job, data.services);
    const current = map.get(serviceName) ?? { name: serviceName, count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += Number(job.service_price || job.service_cost || 0) + Number(job.labor_cost || 0) + Number(job.additional_labor_cost || 0);
    map.set(serviceName, current);
    return map;
  }, new Map<string, { name: string; count: number; revenue: number }>()).values()).sort((left, right) => right.count - left.count);
  const mechanicAnalysis = Array.from(jobs.reduce((map, job) => {
    const mechanicName = job.mechanic_name || "Unassigned";
    const current = map.get(mechanicName) ?? { name: mechanicName, count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += Number(job.total_amount || 0);
    map.set(mechanicName, current);
    return map;
  }, new Map<string, { name: string; count: number; revenue: number }>()).values()).sort((left, right) => right.count - left.count);
  const cashierAnalysis = Array.from(sales.reduce((map, sale) => {
    const current = map.get(sale.cashier_name) ?? { name: sale.cashier_name, count: 0 };
    current.count += 1;
    map.set(sale.cashier_name, current);
    return map;
  }, new Map<string, { name: string; count: number }>()).values()).sort((left, right) => right.count - left.count);
  const rows = (values: string[][]) => values.length
    ? values.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="8">No records found for selected date range.</td></tr>`;
  const salesRows = rows(sales.map((sale) => {
    const items = data.saleItems.filter((item) => item.sale_id === sale.id);
    return [
      escapeHtml(sale.receipt_no),
      escapeHtml(formatDateTime(sale.created_at)),
      escapeHtml(items.map((item) => `${item.name} x${item.quantity}`).join(", ") || "None"),
      escapeHtml(items.reduce((sum, item) => sum + item.quantity, 0)),
      escapeHtml(sale.payment_method),
      escapeHtml(sale.cashier_name),
      escapeHtml(money.format(sale.total))
    ];
  }));
  const jobRows = rows(jobs.map((job) => {
    const products = parseJobProducts(job.products_json);
    return [
      escapeHtml(job.job_no),
      escapeHtml(job.customer_name),
      escapeHtml(job.mechanic_name || "Unassigned"),
      escapeHtml(serviceNameForJob(job, data.services)),
      escapeHtml(products.map((product) => `${product.name} x${product.quantity}`).join(", ") || "None"),
      escapeHtml(money.format(job.labor_cost || 0)),
      escapeHtml(money.format(job.additional_labor_cost || 0)),
      escapeHtml(money.format(job.total_amount || 0))
    ];
  }));
  const expenseRows = rows(expenses.map((expense) => [
    escapeHtml(expense.expense_date),
    escapeHtml(expense.category),
    escapeHtml(expense.description),
    escapeHtml(expense.recorded_by_name || "System"),
    escapeHtml(money.format(expense.amount))
  ]));

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Sales and Job Order Report ${escapeHtml(startDate)} to ${escapeHtml(endDate)}</title>
        <style>
          @page { size: letter; margin: 12mm; }
          body { color: #171512; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
          h1 { margin: 0; color: #dc382a; font-size: 24px; }
          h2 { margin: 22px 0 8px; font-size: 16px; }
          p { margin: 3px 0; }
          table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
          tr { page-break-inside: avoid; }
          th { background: #211f1b; color: #fff; text-align: left; }
          th, td { border-bottom: 1px solid #ded5c9; padding: 7px; vertical-align: top; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
          .summary div { border: 1px solid #ded5c9; padding: 10px; }
          .summary strong { display: block; color: #dc382a; font-size: 16px; }
        </style>
      </head>
      <body>
        <main id="print-document">
        <h1>${escapeHtml(data.receiptSettings.business_name || data.receiptSettings.system_name)} Operations Report</h1>
        <p>Period: ${escapeHtml(startDate)} to ${escapeHtml(endDate)}</p>
        <p>Exported by: ${escapeHtml(exportedBy)} on ${escapeHtml(formatDateTime(new Date()))}</p>
        <div class="summary">
          <div>POS Sales Total<strong>${escapeHtml(money.format(posSalesTotal))}</strong></div>
          <div>Job Order Total<strong>${escapeHtml(money.format(jobOrderTotal))}</strong></div>
          <div>Digital Payments<strong>${escapeHtml(money.format(digitalTotal))}</strong></div>
          <div>Cash Payments<strong>${escapeHtml(money.format(cashTotal))}</strong></div>
        </div>
        <div class="summary">
          <div>Total Revenue<strong>${escapeHtml(money.format(totalRevenue))}</strong></div>
          <div>POS Transactions<strong>${escapeHtml(String(sales.length))}</strong></div>
          <div>Completed Job Orders<strong>${escapeHtml(String(jobs.length))}</strong></div>
          <div>Report Range<strong>${escapeHtml(startDate)} to ${escapeHtml(endDate)}</strong></div>
        </div>
        <div class="summary">
          <div>Cost of Goods Sold<strong>${escapeHtml(money.format(cogs))}</strong></div>
          <div>Gross Profit<strong>${escapeHtml(money.format(grossProfit))}</strong></div>
          <div>Service/Labor Revenue<strong>${escapeHtml(money.format(laborRevenue))}</strong></div>
          <div>Net Estimate<strong>${escapeHtml(money.format(netEstimate))}</strong></div>
        </div>
        <h2>Sales Transactions</h2>
        <table><thead><tr><th>Transaction No.</th><th>Date & Time</th><th>Items Purchased</th><th>Qty</th><th>Payment</th><th>Cashier</th><th>Total</th></tr></thead><tbody>${salesRows}</tbody></table>
        <h2>Job Order Transactions</h2>
        <table><thead><tr><th>Job Order No.</th><th>Customer</th><th>Mechanic</th><th>Service</th><th>Products Used</th><th>Labor Cost</th><th>Additional Labor</th><th>Total</th></tr></thead><tbody>${jobRows}</tbody></table>
        <h2>Low Stock Inventory</h2>
        <table><thead><tr><th>Product Code</th><th>Item Name</th><th>Category</th><th>Remaining Stock</th><th>Suggested Reorder</th></tr></thead><tbody>${rows(lowStock.map((item) => [escapeHtml(item.product_code), escapeHtml(item.name), escapeHtml(item.category_name || item.category), escapeHtml(item.stock), escapeHtml(suggestedReorderQuantity(item))]))}</tbody></table>
        <h2>Expenses</h2>
        <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Recorded By</th><th>Amount</th></tr></thead><tbody>${expenseRows}</tbody></table>
        <h2>Analysis of Items Purchased</h2>
        <table><thead><tr><th>Item</th><th>Quantity Sold</th><th>Revenue</th></tr></thead><tbody>${rows(itemAnalysis.map((item) => [escapeHtml(item.name), escapeHtml(item.quantity), escapeHtml(money.format(item.revenue))]))}</tbody></table>
        <h2>Analysis of Services Rendered</h2>
        <table><thead><tr><th>Service</th><th>Times Rendered</th><th>Revenue</th></tr></thead><tbody>${rows(serviceAnalysis.map((service) => [escapeHtml(service.name), escapeHtml(service.count), escapeHtml(money.format(service.revenue))]))}</tbody></table>
        <h2>Service Rendered Per Mechanic</h2>
        <table><thead><tr><th>Mechanic</th><th>Services Completed</th><th>Total Revenue Handled</th></tr></thead><tbody>${rows(mechanicAnalysis.map((mechanic) => [escapeHtml(mechanic.name), escapeHtml(mechanic.count), escapeHtml(money.format(mechanic.revenue))]))}</tbody></table>
        <h2>Number of Transactions Per Cashier</h2>
        <table><thead><tr><th>Cashier</th><th>Transactions Processed</th></tr></thead><tbody>${rows(cashierAnalysis.map((cashier) => [escapeHtml(cashier.name), escapeHtml(cashier.count)]))}</tbody></table>
        </main>
      </body>
    </html>`;
}

function csvCell(value: string | number | undefined | null) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}

function csvSection(title: string, headers: string[], rows: Array<Array<string | number | undefined | null>>) {
  return [
    title,
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
    ""
  ].join("\r\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
