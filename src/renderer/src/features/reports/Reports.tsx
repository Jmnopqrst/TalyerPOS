import { useMemo, useState } from 'react';
import { Boxes, ClipboardList, Download, Gauge, PackagePlus, Pencil, ReceiptText, ShoppingCart, Trash2, Wrench } from 'lucide-react';
import { Badge } from '../../../components/Badge';
import { DataTable } from '../../../components/DataTable';
import { PaginationControls } from '../../../components/PaginationControls';
import { StatCard } from '../../../components/StatCard';
import { ToastBridge } from '../../../components/Toast';
import type { AppData, Expense, JobOrder, Sale, UserAccount } from '../../../types/global';
import { buildReportHtml, costOfGoodsSold, expensesTotal, serviceLaborRevenue, suggestedReorderQuantity } from '../../documents/report';
import { useFilteredPagination } from '../../hooks/useFilteredPagination';
import { friendlyError, withTimeout } from '../../lib/api';
import { formatDateOnly, formatDateTime, rowMatchesDateRange, todayInputValue } from '../../lib/date';
import { confirmDiscardChanges, useUnsavedChanges } from '../../lib/dirty';
import { money } from '../../lib/format';
import { valueMatchesSearch } from '../../lib/search';
import { normalizeJobStatusForUi, parseJobProducts, RecordsToolbar, serviceNameForJob } from '../shared/featureUtils';
import { buildCustomerInsightRows, buildMotorcycleInsightRows, buildPurchasePlanningRows, buildSupplierPurchaseRows, csvSection, downloadCsv } from './reportMetrics';

function jobReportDate(job: JobOrder) {
  return normalizeJobStatusForUi(job.status) === "Completed" ? job.paid_at || job.created_at : job.created_at;
}

// Feature: Owner/Admin reporting and PDF export.
export function Reports({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const canUseReports = ["Owner", "Admin"].includes(user.role);
  const [activeReport, setActiveReport] = useState<"overview" | "sales" | "jobs" | "customers" | "purchases" | "expenses">("overview");
  const [startDate, setStartDate] = useState(todayInputValue());
  const [endDate, setEndDate] = useState(todayInputValue());
  const [salesPaymentFilter, setSalesPaymentFilter] = useState("");
  const [salesCashierFilter, setSalesCashierFilter] = useState("");
  const [jobMechanicFilter, setJobMechanicFilter] = useState("");
  const [jobServiceFilter, setJobServiceFilter] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [reportPreviewHtml, setReportPreviewHtml] = useState("");
  const emptyExpenseForm = { expenseDate: todayInputValue(), category: "Utilities", description: "", amount: 0 };
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const salesRows = useMemo(() => data.sales.filter((sale) => {
    const items = data.saleItems.filter((item) => item.sale_id === sale.id);
    return sale.status === "Completed"
      && rowMatchesDateRange(sale.created_at, startDate, endDate)
      && (!salesPaymentFilter || sale.payment_method === salesPaymentFilter)
      && (!salesCashierFilter || sale.cashier_name === salesCashierFilter)
      && valueMatchesSearch(searchTerm, [
        sale.receipt_no,
        sale.cashier_name,
        sale.payment_method,
        sale.total,
        ...items.flatMap((item) => [item.name, item.quantity, item.unit_price, item.line_total])
      ]);
  }), [data.sales, data.saleItems, searchTerm, startDate, endDate, salesPaymentFilter, salesCashierFilter]);

  const jobRows = useMemo(() => data.jobOrders.filter((job) => rowMatchesDateRange(jobReportDate(job), startDate, endDate)
    && (!jobMechanicFilter || String(job.mechanic_id || "") === jobMechanicFilter)
    && (!jobServiceFilter || String(job.service_id || "") === jobServiceFilter)
    && (!jobStatusFilter || normalizeJobStatusForUi(job.status) === jobStatusFilter)
    && valueMatchesSearch(searchTerm, [job.job_no, job.customer_name, job.motorcycle_type, job.plate_no, job.mechanic_name, serviceNameForJob(job, data.services)])), [data.jobOrders, data.services, searchTerm, startDate, endDate, jobMechanicFilter, jobServiceFilter, jobStatusFilter]);

  const salesPage = useFilteredPagination(salesRows, [searchTerm, startDate, endDate, salesPaymentFilter, salesCashierFilter, data.sales.length]);
  const jobsPage = useFilteredPagination(jobRows, [searchTerm, startDate, endDate, jobMechanicFilter, jobServiceFilter, jobStatusFilter, data.jobOrders.length]);
  const dateRangeSales = data.sales.filter((sale) => sale.status === "Completed" && rowMatchesDateRange(sale.created_at, startDate, endDate));
  const dateRangeJobs = data.jobOrders.filter((job) => rowMatchesDateRange(jobReportDate(job), startDate, endDate) && normalizeJobStatusForUi(job.status) === "Completed");
  const completedJobRows = jobRows.filter((job) => normalizeJobStatusForUi(job.status) === "Completed");
  const dateRangeReportData = useMemo(() => ({
    ...data,
    jobOrders: data.jobOrders.filter((job) => rowMatchesDateRange(jobReportDate(job), startDate, endDate)),
    sales: data.sales.filter((sale) => sale.status === "Completed" && rowMatchesDateRange(sale.created_at, startDate, endDate)),
    purchaseOrders: data.purchaseOrders.filter((order) => rowMatchesDateRange(order.created_at, startDate, endDate))
  }), [data, startDate, endDate]);
  const posSalesTotal = salesRows.reduce((sum, sale) => sum + sale.total, 0);
  const completedJobTotal = completedJobRows.reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
  const reportCogs = costOfGoodsSold(data, salesRows, completedJobRows);
  const reportGrossProfit = posSalesTotal + completedJobTotal - reportCogs;
  const reportLaborRevenue = serviceLaborRevenue(completedJobRows);
  const reportExpensesTotal = expensesTotal(data.expenses, startDate, endDate);
  const reportNetEstimate = reportGrossProfit - reportExpensesTotal;
  const digitalTotal = salesRows.filter((sale) => sale.payment_category === "Digital").reduce((sum, sale) => sum + sale.total, 0)
    + completedJobRows.filter((job) => job.payment_category === "Digital").reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
  const cashTotal = salesRows.filter((sale) => sale.payment_category !== "Digital").reduce((sum, sale) => sum + sale.total, 0)
    + completedJobRows.filter((job) => job.payment_category !== "Digital").reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
  const isSummaryLoading = salesPage.isLoading || jobsPage.isLoading;
  const cashiers = Array.from(new Set(data.sales.map((sale) => sale.cashier_name).filter(Boolean)));
  const mechanics = data.users.filter((account) => account.is_mechanic && !["Owner", "Admin"].includes(account.role));
  const expenseRows = data.expenses.filter((expense) => rowMatchesDateRange(expense.expense_date, startDate, endDate)
    && valueMatchesSearch(searchTerm, [expense.category, expense.description, expense.recorded_by_name, expense.amount]));
  const expensePage = useFilteredPagination(expenseRows, [searchTerm, startDate, endDate, data.expenses.length]);
  const saleIdsForReport = new Set(salesRows.map((sale) => sale.id));
  const reportSaleItems = data.saleItems.filter((item) => saleIdsForReport.has(item.sale_id));
  const dailyClosingRows = Array.from([
    ...salesRows.map((sale) => ({
      date: formatDateOnly(sale.created_at),
      source: "POS",
      paymentCategory: sale.payment_category === "Digital" ? "Digital" : "Cash",
      amount: sale.total
    })),
    ...completedJobRows.map((job) => ({
      date: formatDateOnly(job.paid_at || job.created_at),
      source: "Job",
      paymentCategory: job.payment_category === "Digital" ? "Digital" : "Cash",
      amount: Number(job.total_amount || 0)
    }))
  ].reduce((map, row) => {
    const current = map.get(row.date) ?? { date: row.date, posTransactions: 0, jobPayments: 0, cashTotal: 0, digitalTotal: 0, total: 0 };
    if (row.source === "POS") current.posTransactions += 1;
    if (row.source === "Job") current.jobPayments += 1;
    if (row.paymentCategory === "Digital") current.digitalTotal += row.amount;
    else current.cashTotal += row.amount;
    current.total += row.amount;
    map.set(row.date, current);
    return map;
  }, new Map<string, { date: string; posTransactions: number; jobPayments: number; cashTotal: number; digitalTotal: number; total: number }>()).values()).sort((left, right) => right.date.localeCompare(left.date));
  const bestSellingParts = Array.from([
    ...reportSaleItems.filter((item) => item.item_type === "part").map((item) => ({ name: item.name, quantity: item.quantity, revenue: item.line_total })),
    ...completedJobRows.flatMap((job) => parseJobProducts(job.products_json).map((product) => ({ name: product.name, quantity: product.quantity, revenue: product.quantity * product.unitPrice })))
  ].reduce((map, item) => {
    const current = map.get(item.name) ?? { name: item.name, quantity: 0, revenue: 0 };
    current.quantity += item.quantity;
    current.revenue += item.revenue;
    map.set(item.name, current);
    return map;
  }, new Map<string, { name: string; quantity: number; revenue: number }>()).values()).sort((left, right) => right.quantity - left.quantity);
  const bestSellingServices = Array.from(completedJobRows.reduce((map, job) => {
    const serviceName = serviceNameForJob(job, data.services);
    const current = map.get(serviceName) ?? { name: serviceName, count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += Number(job.service_price || job.service_cost || 0) + Number(job.labor_cost || 0) + Number(job.additional_labor_cost || 0);
    map.set(serviceName, current);
    return map;
  }, new Map<string, { name: string; count: number; revenue: number }>()).values()).sort((left, right) => right.count - left.count);
  const mechanicPerformanceRows = Array.from(completedJobRows.reduce((map, job) => {
    const mechanicName = job.mechanic_name || "Unassigned";
    const current = map.get(mechanicName) ?? { mechanic: mechanicName, completedJobs: 0, laborRevenue: 0, partsRevenue: 0, totalRevenue: 0 };
    current.completedJobs += 1;
    current.laborRevenue += Number(job.service_price || job.service_cost || 0) + Number(job.labor_cost || 0) + Number(job.additional_labor_cost || 0);
    current.partsRevenue += Number(job.products_cost || 0);
    current.totalRevenue += Number(job.total_amount || 0);
    map.set(mechanicName, current);
    return map;
  }, new Map<string, { mechanic: string; completedJobs: number; laborRevenue: number; partsRevenue: number; totalRevenue: number }>()).values()).sort((left, right) => right.completedJobs - left.completedJobs);
  const inventoryValuationRows = data.inventory
    .filter((item) => valueMatchesSearch(searchTerm, [item.product_code, item.name, item.category_name, item.category]))
    .map((item) => ({
      productCode: item.product_code,
      name: item.name,
      category: item.category_name ?? item.category,
      stock: item.stock,
      costValue: Number(item.stock || 0) * Number(item.unit_cost || 0),
      retailValue: Number(item.stock || 0) * Number(item.sell_price || 0),
      potentialMargin: Number(item.stock || 0) * (Number(item.sell_price || 0) - Number(item.unit_cost || 0))
    }))
    .sort((left, right) => right.costValue - left.costValue);
  const inventoryCostValue = inventoryValuationRows.reduce((sum, item) => sum + item.costValue, 0);
  const inventoryRetailValue = inventoryValuationRows.reduce((sum, item) => sum + item.retailValue, 0);
  const inventoryPotentialMargin = inventoryValuationRows.reduce((sum, item) => sum + item.potentialMargin, 0);
  const expenseBreakdownRows = Array.from(expenseRows.reduce((map, expense) => {
    const current = map.get(expense.category) ?? { category: expense.category, count: 0, total: 0 };
    current.count += 1;
    current.total += Number(expense.amount || 0);
    map.set(expense.category, current);
    return map;
  }, new Map<string, { category: string; count: number; total: number }>()).values()).sort((left, right) => right.total - left.total);
  const voidRefundRows = data.sales
    .filter((sale) => sale.status !== "Completed" && rowMatchesDateRange(sale.voided_at || sale.created_at, startDate, endDate))
    .map((sale) => ({
      receiptNo: sale.receipt_no,
      status: sale.status,
      date: sale.voided_at || sale.created_at,
      cashier: sale.cashier_name,
      amount: Number(sale.total || 0),
      reason: sale.void_reason || "No reason recorded"
    }))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const voidRefundTotal = voidRefundRows.reduce((sum, sale) => sum + sale.amount, 0);
  const lowStockTrendRows = data.inventory
    .filter((item) => item.stock <= item.reorder_level)
    .map((item) => ({
      productCode: item.product_code,
      name: item.name,
      category: item.category_name ?? item.category,
      stock: item.stock,
      reorderLevel: item.reorder_level,
      reorderGap: Math.max(0, Number(item.reorder_level || 0) - Number(item.stock || 0)),
      suggestedReorder: suggestedReorderQuantity(item)
    }))
    .sort((left, right) => right.reorderGap - left.reorderGap || left.stock - right.stock);
  const customerInsightRows = buildCustomerInsightRows(dateRangeReportData).filter((row) => valueMatchesSearch(searchTerm, [row.customer, row.contact, row.totalRevenue, row.lastVisit]));
  const motorcycleInsightRows = buildMotorcycleInsightRows(dateRangeReportData).filter((row) => valueMatchesSearch(searchTerm, [row.plateNo, row.customer, row.motorcycle, row.totalRevenue, row.lastService]));
  const purchasePlanningRows = buildPurchasePlanningRows(data).filter((row) => valueMatchesSearch(searchTerm, [row.productCode, row.item, row.supplier, row.status]));
  const supplierPurchaseRows = buildSupplierPurchaseRows(dateRangeReportData).filter((row) => valueMatchesSearch(searchTerm, [row.supplier, row.openOrders, row.lastOrder]));
  const customerRevenueTotal = customerInsightRows.reduce((sum, row) => sum + row.totalRevenue, 0);
  const purchaseNetNeedTotal = purchasePlanningRows.reduce((sum, row) => sum + row.netNeed, 0);

  if (!canUseReports) {
    return (
      <section className="panel">
        <h2>Reports</h2>
        <span className="form-error">Only Owner and Admin accounts can view reports.</span>
      </section>
    );
  }

  async function exportReportPdf() {
    setError("");
    setMessage("");
    if (!startDate || !endDate) {
      setError("Start Date and End Date are required before export.");
      return;
    }
    if (startDate > endDate) {
      setError("Start Date cannot be later than End Date.");
      return;
    }
    if (dateRangeSales.length === 0 && dateRangeJobs.length === 0) {
      setError("No records found for selected date range.");
      return;
    }
    setIsExporting(true);
    try {
      const html = reportPreviewHtml || buildReportHtml(data, dateRangeSales, dateRangeJobs, startDate, endDate, user.name);
      const saved = await withTimeout(window.talyer.saveReceiptPdf({ html, receiptNo: `report-${startDate}-to-${endDate}` }), "exporting report PDF");
      if (saved) setMessage("Report exported successfully.");
      setReportPreviewHtml("");
    } catch (caught) {
      setError(friendlyError(caught, "Unable to export report. Please try again."));
    } finally {
      setIsExporting(false);
    }
  }

  function previewReportPdf() {
    setError("");
    setMessage("");
    if (!startDate || !endDate) {
      setError("Start Date and End Date are required before preview.");
      return;
    }
    if (startDate > endDate) {
      setError("Start Date cannot be later than End Date.");
      return;
    }
    setReportPreviewHtml(buildReportHtml(data, dateRangeSales, dateRangeJobs, startDate, endDate, user.name));
  }

  function exportReportCsv() {
    setError("");
    setMessage("");
    if (!startDate || !endDate) {
      setError("Start Date and End Date are required before export.");
      return;
    }
    if (startDate > endDate) {
      setError("Start Date cannot be later than End Date.");
      return;
    }
    const csv = [
      csvSection("Daily Sales Closing", ["Date", "POS Transactions", "Job Payments", "Cash Total", "Digital Total", "Grand Total"], dailyClosingRows.map((row) => [
        row.date,
        row.posTransactions,
        row.jobPayments,
        row.cashTotal.toFixed(2),
        row.digitalTotal.toFixed(2),
        row.total.toFixed(2)
      ])),
      csvSection("Mechanic Performance", ["Mechanic", "Completed Jobs", "Labor / Service Revenue", "Parts Revenue", "Total Revenue"], mechanicPerformanceRows.map((row) => [
        row.mechanic,
        row.completedJobs,
        row.laborRevenue.toFixed(2),
        row.partsRevenue.toFixed(2),
        row.totalRevenue.toFixed(2)
      ])),
      csvSection("Best-Selling Parts", ["Part", "Quantity Sold", "Revenue"], bestSellingParts.map((row) => [
        row.name,
        row.quantity,
        row.revenue.toFixed(2)
      ])),
      csvSection("Best-Selling Services", ["Service", "Times Rendered", "Revenue"], bestSellingServices.map((row) => [
        row.name,
        row.count,
        row.revenue.toFixed(2)
      ])),
      csvSection("Inventory Valuation", ["Product Code", "Item", "Category", "Stock", "Cost Value", "Retail Value", "Potential Margin"], inventoryValuationRows.map((row) => [
        row.productCode,
        row.name,
        row.category,
        row.stock,
        row.costValue.toFixed(2),
        row.retailValue.toFixed(2),
        row.potentialMargin.toFixed(2)
      ])),
      csvSection("Expense Breakdown", ["Category", "Entries", "Total"], expenseBreakdownRows.map((row) => [
        row.category,
        row.count,
        row.total.toFixed(2)
      ])),
      csvSection("Void / Refund Summary", ["Receipt No.", "Status", "Date", "Cashier", "Amount", "Reason"], voidRefundRows.map((row) => [
        row.receiptNo,
        row.status,
        formatDateTime(row.date),
        row.cashier,
        row.amount.toFixed(2),
        row.reason
      ])),
      csvSection("Low Stock Trend", ["Product Code", "Item", "Category", "Stock", "Reorder Level", "Gap", "Suggested Reorder"], lowStockTrendRows.map((row) => [
        row.productCode,
        row.name,
        row.category,
        row.stock,
        row.reorderLevel,
        row.reorderGap,
        row.suggestedReorder
      ])),
      csvSection("Customer Insights", ["Customer", "Contact", "Motorcycles", "Jobs", "Paid Jobs", "Open Jobs", "POS Transactions", "Total Revenue", "Last Visit"], customerInsightRows.map((row) => [
        row.customer,
        row.contact,
        row.motorcycleCount,
        row.jobCount,
        row.paidJobs,
        row.openJobs,
        row.posTransactions,
        row.totalRevenue.toFixed(2),
        row.lastVisit
      ])),
      csvSection("Motorcycle Service Frequency", ["Plate No.", "Customer", "Motorcycle", "Services", "Total Revenue", "Last Service"], motorcycleInsightRows.map((row) => [
        row.plateNo,
        row.customer,
        row.motorcycle,
        row.serviceCount,
        row.totalRevenue.toFixed(2),
        row.lastService
      ])),
      csvSection("Purchase Planning", ["Product Code", "Item", "Supplier", "Stock", "Reorder Level", "On Order", "Suggested Reorder", "Net Need", "Status"], purchasePlanningRows.map((row) => [
        row.productCode,
        row.item,
        row.supplier,
        row.stock,
        row.reorderLevel,
        row.onOrder,
        row.suggestedReorder,
        row.netNeed,
        row.status
      ])),
      csvSection("Supplier Purchase Performance", ["Supplier", "Orders", "Open Orders", "Received Orders", "Units Ordered", "Units Received", "Last Order"], supplierPurchaseRows.map((row) => [
        row.supplier,
        row.orders,
        row.openOrders,
        row.receivedOrders,
        row.unitsOrdered,
        row.unitsReceived,
        row.lastOrder
      ])),
      csvSection("Gross Profit Estimate", ["Metric", "Amount"], [
        ["POS Sales Total", posSalesTotal.toFixed(2)],
        ["Completed Job Orders Total", completedJobTotal.toFixed(2)],
        ["Cost of Goods Sold", reportCogs.toFixed(2)],
        ["Gross Profit", reportGrossProfit.toFixed(2)],
        ["Expenses", reportExpensesTotal.toFixed(2)],
        ["Net Estimate", reportNetEstimate.toFixed(2)]
      ])
    ].join("\r\n");
    downloadCsv(`talyer-report-${startDate}-to-${endDate}.csv`, csv);
    setMessage("CSV report exported successfully.");
  }

  async function saveExpense() {
    setError("");
    setMessage("");
    if (!expenseForm.expenseDate) {
      setError("Expense date is required.");
      return;
    }
    if (!expenseForm.description.trim()) {
      setError("Expense description is required.");
      return;
    }
    if (expenseForm.amount < 0) {
      setError("Expense amount cannot be negative.");
      return;
    }
    try {
      if (editingExpense) {
        await withTimeout(window.talyer.updateExpense({ actorId: user.id, expenseId: editingExpense.id, ...expenseForm }), "updating expense");
        setMessage("Expense updated successfully.");
      } else {
        await withTimeout(window.talyer.createExpense({ actorId: user.id, ...expenseForm }), "creating expense");
        setMessage("Expense recorded successfully.");
      }
      setEditingExpense(null);
      setExpenseForm(emptyExpenseForm);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save expense. Please check the fields and try again."));
    }
  }

  async function deleteExpense(expense: Expense) {
    const confirmed = window.confirm("Are you sure you want to delete this expense?");
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      await withTimeout(window.talyer.deleteExpense({ actorId: user.id, expenseId: expense.id }), "deleting expense");
      setMessage("Expense deleted successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to delete expense. Please try again."));
    }
  }

  return (
    <div className="content-grid reports-module">
      <ToastBridge success={message} error={error} />
      {isSummaryLoading && <div className="processing-banner">Loading sales summary...</div>}
      <div className="stats-grid">
        <StatCard label="POS Sales Total" value={money.format(posSalesTotal)} detail={`${salesRows.length} completed POS transactions`} icon={<ReceiptText />} />
        <StatCard label="Completed Job Orders Total" value={money.format(completedJobTotal)} detail={`${completedJobRows.length} completed job orders`} icon={<Wrench />} />
        <StatCard label="Digital Payments Total" value={money.format(digitalTotal)} detail="POS + completed job payments" icon={<ShoppingCart />} />
        <StatCard label="Cash Payments Total" value={money.format(cashTotal)} detail="Manual / cash payments" icon={<ReceiptText />} />
        <StatCard label="Gross Profit" value={money.format(reportGrossProfit)} detail={`COGS: ${money.format(reportCogs)}`} icon={<Gauge />} />
        <StatCard label="Service/Labor Revenue" value={money.format(reportLaborRevenue)} detail="Completed job service revenue" icon={<Wrench />} />
        <StatCard label="Expenses" value={money.format(reportExpensesTotal)} detail="Within selected date range" icon={<ClipboardList />} />
        <StatCard label="Net Estimate" value={money.format(reportNetEstimate)} detail="Gross profit less expenses" icon={<ReceiptText />} />
        <StatCard label="Voids / Refunds" value={money.format(voidRefundTotal)} detail={`${voidRefundRows.length} affected transaction(s)`} icon={<ClipboardList />} />
        <StatCard label="Customer Revenue" value={money.format(customerRevenueTotal)} detail={`${customerInsightRows.length} customer record(s)`} icon={<Gauge />} />
        <StatCard label="Purchase Need" value={String(purchaseNetNeedTotal)} detail={`${purchasePlanningRows.length} reorder watch item(s)`} icon={<PackagePlus />} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Reports</h2>
          <div className="inline-controls">
            <button className="secondary-button compact-button" disabled={isExporting} onClick={exportReportCsv}>{isExporting ? "Preparing..." : "Export CSV"}</button>
            <button className="primary-button compact-button" disabled={isExporting} onClick={previewReportPdf}>{isExporting ? "Preparing..." : "Preview PDF Report"}</button>
          </div>
        </div>
        <RecordsToolbar
          showClear={Boolean(startDate !== todayInputValue() || endDate !== todayInputValue() || salesPaymentFilter || salesCashierFilter || jobMechanicFilter || jobServiceFilter || jobStatusFilter)}
          onClear={() => {
            setStartDate(todayInputValue());
            setEndDate(todayInputValue());
            setSalesPaymentFilter("");
            setSalesCashierFilter("");
            setJobMechanicFilter("");
            setJobServiceFilter("");
            setJobStatusFilter("");
          }}
        >
          <label className="field compact-field">
            Start Date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field compact-field">
            End Date
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </RecordsToolbar>
        {isExporting && <div className="processing-banner">Generating report...</div>}
        {error && <span className="form-error">{error}</span>}
        <div className="report-tabs">
          <button className={activeReport === "overview" ? "category-pill active" : "category-pill"} onClick={() => setActiveReport("overview")}>Overview</button>
          <button className={activeReport === "sales" ? "category-pill active" : "category-pill"} onClick={() => setActiveReport("sales")}>Sales Reports</button>
          <button className={activeReport === "jobs" ? "category-pill active" : "category-pill"} onClick={() => setActiveReport("jobs")}>Job Order Reports</button>
          <button className={activeReport === "customers" ? "category-pill active" : "category-pill"} onClick={() => setActiveReport("customers")}>Customer Reports</button>
          <button className={activeReport === "purchases" ? "category-pill active" : "category-pill"} onClick={() => setActiveReport("purchases")}>Purchase Planning</button>
          <button className={activeReport === "expenses" ? "category-pill active" : "category-pill"} onClick={() => setActiveReport("expenses")}>Expenses</button>
        </div>
      </section>

      {activeReport === "overview" ? (
        <section className="content-grid">
          <div className="stats-grid">
            <StatCard label="Inventory Cost Value" value={money.format(inventoryCostValue)} detail={`${inventoryValuationRows.length} inventory items`} icon={<Boxes />} />
            <StatCard label="Inventory Retail Value" value={money.format(inventoryRetailValue)} detail={`Potential margin: ${money.format(inventoryPotentialMargin)}`} icon={<PackagePlus />} />
            <StatCard label="Best Part" value={bestSellingParts[0]?.name ?? "None"} detail={bestSellingParts[0] ? `${bestSellingParts[0].quantity} sold` : "No part sales yet"} icon={<ShoppingCart />} />
            <StatCard label="Top Mechanic" value={mechanicPerformanceRows[0]?.mechanic ?? "None"} detail={mechanicPerformanceRows[0] ? `${mechanicPerformanceRows[0].completedJobs} completed jobs` : "No completed jobs yet"} icon={<Wrench />} />
            <StatCard label="Low-Stock Items" value={String(lowStockTrendRows.length)} detail={lowStockTrendRows[0] ? `${lowStockTrendRows[0].name} needs ${lowStockTrendRows[0].suggestedReorder}` : "No current low-stock items"} icon={<Boxes />} />
          </div>
          <DataTable
            title="Daily Sales Closing"
            rows={dailyClosingRows}
            emptyMessage="No completed sales or paid jobs found for this date range."
            columns={[
              { key: "date", label: "Date", render: (row) => row.date },
              { key: "pos", label: "POS Transactions", render: (row) => String(row.posTransactions) },
              { key: "jobs", label: "Job Payments", render: (row) => String(row.jobPayments) },
              { key: "cash", label: "Cash Total", render: (row) => money.format(row.cashTotal) },
              { key: "digital", label: "Digital Total", render: (row) => money.format(row.digitalTotal) },
              { key: "total", label: "Grand Total", render: (row) => money.format(row.total) }
            ]}
          />
          <DataTable
            title="Mechanic Performance"
            rows={mechanicPerformanceRows}
            emptyMessage="No completed job orders found for this date range."
            columns={[
              { key: "mechanic", label: "Mechanic", render: (row) => row.mechanic },
              { key: "jobs", label: "Completed Jobs", render: (row) => String(row.completedJobs) },
              { key: "labor", label: "Labor / Service Revenue", render: (row) => money.format(row.laborRevenue) },
              { key: "parts", label: "Parts Revenue", render: (row) => money.format(row.partsRevenue) },
              { key: "total", label: "Total Revenue", render: (row) => money.format(row.totalRevenue) }
            ]}
          />
          <div className="report-two-column">
            <DataTable
              title="Best-Selling Parts"
              rows={bestSellingParts.slice(0, 10)}
              emptyMessage="No part sales found for this date range."
              columns={[
                { key: "part", label: "Part", render: (row) => row.name },
                { key: "qty", label: "Qty Sold", render: (row) => String(row.quantity) },
                { key: "revenue", label: "Revenue", render: (row) => money.format(row.revenue) }
              ]}
            />
            <DataTable
              title="Best-Selling Services"
              rows={bestSellingServices.slice(0, 10)}
              emptyMessage="No completed services found for this date range."
              columns={[
                { key: "service", label: "Service", render: (row) => row.name },
                { key: "count", label: "Times Rendered", render: (row) => String(row.count) },
                { key: "revenue", label: "Revenue", render: (row) => money.format(row.revenue) }
              ]}
            />
          </div>
          <div className="report-two-column">
            <DataTable
              title="Inventory Valuation"
              rows={inventoryValuationRows.slice(0, 12)}
              emptyMessage="No inventory items found."
              columns={[
                { key: "code", label: "Product Code", render: (row) => row.productCode },
                { key: "item", label: "Item", render: (row) => row.name },
                { key: "stock", label: "Stock", render: (row) => String(row.stock) },
                { key: "cost", label: "Cost Value", render: (row) => money.format(row.costValue) },
                { key: "retail", label: "Retail Value", render: (row) => money.format(row.retailValue) }
              ]}
            />
            <DataTable
              title="Expense Breakdown"
              rows={expenseBreakdownRows}
              emptyMessage="No expenses found for this date range."
              columns={[
                { key: "category", label: "Category", render: (row) => row.category },
                { key: "entries", label: "Entries", render: (row) => String(row.count) },
                { key: "total", label: "Total", render: (row) => money.format(row.total) }
              ]}
            />
          </div>
          <div className="report-two-column">
            <DataTable
              title="Low-Stock Trend"
              rows={lowStockTrendRows.slice(0, 10)}
              emptyMessage="No low-stock items found right now."
              columns={[
                { key: "code", label: "Product Code", render: (row) => row.productCode },
                { key: "item", label: "Item", render: (row) => row.name },
                { key: "stock", label: "Stock", render: (row) => String(row.stock) },
                { key: "gap", label: "Reorder Gap", render: (row) => String(row.reorderGap) },
                { key: "suggested", label: "Suggested Reorder", render: (row) => String(row.suggestedReorder) }
              ]}
            />
            <DataTable
              title="Void / Refund Summary"
              rows={voidRefundRows.slice(0, 10)}
              emptyMessage="No voided or refunded transactions found for this date range."
              columns={[
                { key: "receipt", label: "Receipt", render: (row) => row.receiptNo },
                { key: "status", label: "Status", render: (row) => <Badge tone="danger">{row.status}</Badge> },
                { key: "date", label: "Date", render: (row) => formatDateTime(row.date) },
                { key: "amount", label: "Amount", render: (row) => money.format(row.amount) },
                { key: "reason", label: "Reason", render: (row) => row.reason }
              ]}
            />
          </div>
        </section>
      ) : activeReport === "sales" ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Sales Reports</h2>
            <Badge>{`${salesRows.length} records`}</Badge>
          </div>
          <RecordsToolbar>
            <label className="field compact-field">
              Payment Method
              <select value={salesPaymentFilter} onChange={(event) => setSalesPaymentFilter(event.target.value)}>
                <option value="">All payments</option>
                {data.paymentMethods.map((method) => <option value={method.name} key={method.id}>{method.name}</option>)}
              </select>
            </label>
            <label className="field compact-field">
              Cashier
              <select value={salesCashierFilter} onChange={(event) => setSalesCashierFilter(event.target.value)}>
                <option value="">All cashiers</option>
                {cashiers.map((cashier) => <option value={cashier} key={cashier}>{cashier}</option>)}
              </select>
            </label>
            <label className="field compact-field">
              Status
              <select value="Completed" disabled><option>Completed</option></select>
            </label>
          </RecordsToolbar>
          {salesPage.isLoading && <div className="processing-banner">Updating records...</div>}
          <DataTable<Sale>
            title="Sales History"
            rows={salesPage.pagedRows}
            emptyMessage="No sales found. Complete a transaction from POS to build the sales report."
            footer={<PaginationControls page={salesPage.page} pageCount={salesPage.pageCount} total={salesRows.length} onPageChange={salesPage.setPage} />}
            columns={[
              { key: "receipt", label: "Transaction Number", render: (row) => row.receipt_no },
              { key: "date", label: "Date & Time", render: (row) => formatDateTime(row.created_at) },
              { key: "items", label: "Items Purchased", render: (row) => data.saleItems.filter((item) => item.sale_id === row.id).map((item) => `${item.name} x${item.quantity}`).join(", ") || "None" },
              { key: "cashier", label: "Cashier", render: (row) => row.cashier_name },
              { key: "payment", label: "Payment", render: (row) => row.payment_method },
              { key: "total", label: "Total Amount", render: (row) => money.format(row.total) },
              { key: "status", label: "Status", render: () => <Badge tone="good">Completed</Badge> }
            ]}
          />
        </section>
      ) : activeReport === "jobs" ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Job Order Reports</h2>
            <Badge>{`${jobRows.length} records`}</Badge>
          </div>
          <RecordsToolbar>
            <label className="field compact-field">
              Mechanic
              <select value={jobMechanicFilter} onChange={(event) => setJobMechanicFilter(event.target.value)}>
                <option value="">All mechanics</option>
                {mechanics.map((mechanic) => <option value={mechanic.id} key={mechanic.id}>{mechanic.name}</option>)}
              </select>
            </label>
            <label className="field compact-field">
              Service Availed
              <select value={jobServiceFilter} onChange={(event) => setJobServiceFilter(event.target.value)}>
                <option value="">All services</option>
                {data.services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}
              </select>
            </label>
            <label className="field compact-field">
              Status
              <select value={jobStatusFilter} onChange={(event) => setJobStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                <option>In Progress</option>
                <option>Completed</option>
              </select>
            </label>
          </RecordsToolbar>
          {jobsPage.isLoading && <div className="processing-banner">Updating records...</div>}
          <DataTable<JobOrder>
            title="Job Order History"
            rows={jobsPage.pagedRows}
            emptyMessage="No job orders found. Create a job order to start repair reporting."
            footer={<PaginationControls page={jobsPage.page} pageCount={jobsPage.pageCount} total={jobRows.length} onPageChange={jobsPage.setPage} />}
            columns={[
              { key: "job", label: "Job Order Number", render: (row) => row.job_no },
              { key: "date", label: "Date & Time", render: (row) => formatDateTime(row.created_at) },
              { key: "customer", label: "Customer", render: (row) => row.customer_name },
              { key: "motorcycle", label: "Motorcycle", render: (row) => row.motorcycle_type },
              { key: "plate", label: "Plate", render: (row) => row.plate_no },
              { key: "mechanic", label: "Mechanic", render: (row) => row.mechanic_name ?? "Unassigned" },
              { key: "service", label: "Service", render: (row) => serviceNameForJob(row, data.services) },
              { key: "total", label: "Total Amount", render: (row) => money.format(row.total_amount || row.estimate) },
              { key: "status", label: "Status", render: (row) => <Badge tone={normalizeJobStatusForUi(row.status) === "Completed" ? "good" : "neutral"}>{normalizeJobStatusForUi(row.status)}</Badge> }
            ]}
          />
        </section>
      ) : activeReport === "customers" ? (
        <section className="content-grid">
          <div className="stats-grid">
            <StatCard label="Customer Records" value={String(customerInsightRows.length)} detail="Customers with jobs or linked sales" icon={<Gauge />} />
            <StatCard label="Repeat Customers" value={String(customerInsightRows.filter((row) => row.jobCount + row.posTransactions > 1).length)} detail="More than one recorded visit" icon={<ReceiptText />} />
            <StatCard label="Open Customer Jobs" value={String(customerInsightRows.reduce((sum, row) => sum + row.openJobs, 0))} detail="Unpaid or active customer jobs" icon={<ClipboardList />} />
            <StatCard label="Tracked Motorcycles" value={String(motorcycleInsightRows.length)} detail="Motorcycles with service records" icon={<Wrench />} />
          </div>
          <DataTable
            title="Customer Revenue and Visit History"
            rows={customerInsightRows}
            emptyMessage="No customer activity found yet. Job orders and customer-linked POS sales will appear here."
            columns={[
              { key: "customer", label: "Customer", render: (row) => row.customer },
              { key: "contact", label: "Contact", render: (row) => row.contact },
              { key: "motorcycles", label: "Motorcycles", render: (row) => String(row.motorcycleCount) },
              { key: "jobs", label: "Jobs", render: (row) => String(row.jobCount) },
              { key: "paid", label: "Paid Jobs", render: (row) => String(row.paidJobs) },
              { key: "open", label: "Open Jobs", render: (row) => <Badge tone={row.openJobs > 0 ? "warn" : "good"}>{String(row.openJobs)}</Badge> },
              { key: "pos", label: "POS Txns", render: (row) => String(row.posTransactions) },
              { key: "revenue", label: "Total Revenue", render: (row) => money.format(row.totalRevenue) },
              { key: "last", label: "Last Visit", render: (row) => row.lastVisit ? formatDateTime(row.lastVisit) : "None" }
            ]}
          />
          <DataTable
            title="Motorcycle Service Frequency"
            rows={motorcycleInsightRows}
            emptyMessage="No motorcycle service history found yet."
            columns={[
              { key: "plate", label: "Plate No.", render: (row) => row.plateNo },
              { key: "customer", label: "Customer", render: (row) => row.customer },
              { key: "motorcycle", label: "Motorcycle", render: (row) => row.motorcycle },
              { key: "services", label: "Services", render: (row) => String(row.serviceCount) },
              { key: "revenue", label: "Total Revenue", render: (row) => money.format(row.totalRevenue) },
              { key: "last", label: "Last Service", render: (row) => row.lastService ? formatDateTime(row.lastService) : "None" }
            ]}
          />
        </section>
      ) : activeReport === "purchases" ? (
        <section className="content-grid">
          <div className="stats-grid">
            <StatCard label="Reorder Watch" value={String(purchasePlanningRows.length)} detail="Low-stock or on-order items" icon={<Boxes />} />
            <StatCard label="Net Units Needed" value={String(purchaseNetNeedTotal)} detail="Suggested reorder less open PO qty" icon={<PackagePlus />} />
            <StatCard label="Covered by PO" value={String(purchasePlanningRows.filter((row) => row.status === "Covered by PO" || row.status === "On Order").length)} detail="Items already on purchase orders" icon={<ClipboardList />} />
            <StatCard label="Supplier Orders" value={String(supplierPurchaseRows.reduce((sum, row) => sum + row.orders, 0))} detail={`${supplierPurchaseRows.length} supplier(s) with POs`} icon={<PackagePlus />} />
          </div>
          <DataTable
            title="Purchase Planning"
            rows={purchasePlanningRows}
            emptyMessage="No low-stock or on-order inventory items found."
            columns={[
              { key: "code", label: "Product Code", render: (row) => row.productCode },
              { key: "item", label: "Item", render: (row) => row.item },
              { key: "supplier", label: "Supplier", render: (row) => row.supplier },
              { key: "stock", label: "Stock", render: (row) => String(row.stock) },
              { key: "level", label: "Reorder Level", render: (row) => String(row.reorderLevel) },
              { key: "ordered", label: "On Order", render: (row) => String(row.onOrder) },
              { key: "need", label: "Net Need", render: (row) => <Badge tone={row.netNeed > 0 ? "warn" : "good"}>{String(row.netNeed)}</Badge> },
              { key: "status", label: "Status", render: (row) => <Badge tone={row.status === "Needs PO" ? "warn" : "good"}>{row.status}</Badge> }
            ]}
          />
          <DataTable
            title="Supplier Purchase Performance"
            rows={supplierPurchaseRows}
            emptyMessage="No purchase order history found yet."
            columns={[
              { key: "supplier", label: "Supplier", render: (row) => row.supplier },
              { key: "orders", label: "Orders", render: (row) => String(row.orders) },
              { key: "open", label: "Open Orders", render: (row) => String(row.openOrders) },
              { key: "received", label: "Received Orders", render: (row) => String(row.receivedOrders) },
              { key: "ordered", label: "Units Ordered", render: (row) => String(row.unitsOrdered) },
              { key: "units", label: "Units Received", render: (row) => String(row.unitsReceived) },
              { key: "last", label: "Last Order", render: (row) => row.lastOrder ? formatDateTime(row.lastOrder) : "None" }
            ]}
          />
        </section>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>Expense Tracking</h2>
            <Badge>{money.format(expenseRows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0))}</Badge>
          </div>
          <div className="form-grid expense-form-grid">
            <label className="field">
              Date
              <input type="date" value={expenseForm.expenseDate} onChange={(event) => setExpenseForm({ ...expenseForm, expenseDate: event.target.value })} />
            </label>
            <label className="field">
              Category
              <select value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}>
                <option>Rent</option>
                <option>Salary</option>
                <option>Tools</option>
                <option>Supplies</option>
                <option>Utilities</option>
                <option>Maintenance</option>
                <option>Other</option>
              </select>
            </label>
            <label className="field">
              Amount
              <input type="number" min={0} value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: Number(event.target.value) })} />
            </label>
            <label className="field form-wide expense-description-field">
              Description
              <textarea value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} placeholder="e.g. Monthly shop rent" rows={3} />
            </label>
          </div>
          <div className="inline-controls expense-form-actions">
            <button className="primary-button" onClick={saveExpense}>{editingExpense ? "Update Expense" : "Add Expense"}</button>
            {editingExpense && <button className="secondary-button compact-button" onClick={() => {
              setEditingExpense(null);
              setExpenseForm(emptyExpenseForm);
            }}>Cancel Edit</button>}
          </div>
          {expensePage.isLoading && <div className="processing-banner">Updating records...</div>}
          <DataTable<Expense>
            title="Expense History"
            rows={expensePage.pagedRows}
            emptyMessage="No expenses yet. Add rent, salary, tools, or utility costs to track net estimates."
            footer={<PaginationControls page={expensePage.page} pageCount={expensePage.pageCount} total={expenseRows.length} onPageChange={expensePage.setPage} />}
            columns={[
              { key: "date", label: "Date", render: (row) => row.expense_date },
              { key: "category", label: "Category", render: (row) => row.category },
              { key: "description", label: "Description", render: (row) => row.description },
              { key: "amount", label: "Amount", render: (row) => money.format(row.amount) },
              { key: "recorded", label: "Recorded By", render: (row) => row.recorded_by_name || "System" },
              {
                key: "actions",
                label: "Actions",
                render: (row) => (
                  <div className="inline-controls">
                    <button className="table-action" onClick={() => {
                      setEditingExpense(row);
                      setExpenseForm({ expenseDate: row.expense_date, category: row.category, description: row.description, amount: row.amount });
                    }}><Pencil size={15} /> Edit</button>
                    <button className="table-action danger-action" onClick={() => deleteExpense(row)}><Trash2 size={15} /> Delete</button>
                  </div>
                )
              }
            ]}
          />
        </section>
      )}
      {reportPreviewHtml && (
        <div className="modal-backdrop">
          <section className="modal-window report-preview-window">
            <div className="panel-head">
              <h2>Report Preview</h2>
              <button className="table-action" onClick={() => setReportPreviewHtml("")}>Close</button>
            </div>
            <iframe className="document-preview" title="Report preview" srcDoc={reportPreviewHtml} />
            <button className="primary-button" disabled={isExporting} onClick={exportReportPdf}>{isExporting ? "Saving PDF..." : "Save PDF Report"}</button>
          </section>
        </div>
      )}
    </div>
  );
}
