import { useState } from 'react';
import { AlertTriangle, Boxes, CalendarClock, ClipboardList, HardDrive, ReceiptText, ShieldCheck, ShoppingCart, UserCheck, Wrench } from 'lucide-react';
import { Badge } from '../../../components/Badge';
import { DataTable } from '../../../components/DataTable';
import { StatCard } from '../../../components/StatCard';
import { canAccess, modulesFor } from '../../../data/permissions';
import type { AppData, InventoryItem, JobOrder, JobProduct, Service, UserAccount } from '../../../types/global';
import { suggestedReorderQuantity } from '../../documents/report';
import { formatDateOnly, formatDateTime, rowMatchesDate, rowMatchesDateRange, todayInputValue } from '../../lib/date';
import { money } from '../../lib/format';
import { valueMatchesSearch } from '../../lib/search';
import { normalizeJobStatusForUi, RecordsToolbar } from '../shared/featureUtils';

function parseJobProducts(raw: string | undefined): JobProduct[] {
  try {
    return JSON.parse(raw || '[]') as JobProduct[];
  } catch {
    return [];
  }
}

function serviceNameForJob(job: JobOrder, services: Service[]) {
  return services.find((service) => service.id === job.service_id)?.name ?? 'Service not found';
}

// Feature: Dashboard overview, recent activity, and quick operational snapshots.
export function Dashboard({ data, user }: { data: AppData; user: UserAccount }) {
  const [startDate, setStartDate] = useState(todayInputValue());
  const [endDate, setEndDate] = useState(todayInputValue());
  const [paymentFilter, setPaymentFilter] = useState("");
  const [mechanicFilter, setMechanicFilter] = useState("");
  const [cashierFilter, setCashierFilter] = useState("");
  const completedJobs = data.jobOrders.filter((job) => Boolean(job.paid_at) || normalizeJobStatusForUi(job.status) === "Completed");
  const filteredSales = data.sales.filter((sale) =>
    sale.status === "Completed"
    && rowMatchesDateRange(sale.created_at, startDate, endDate)
    && (!paymentFilter || sale.payment_method === paymentFilter)
    && (!cashierFilter || sale.cashier_name === cashierFilter)
  );
  const filteredJobs = completedJobs.filter((job) =>
    rowMatchesDateRange(job.paid_at || job.created_at, startDate, endDate)
    && (!paymentFilter || job.payment_method === paymentFilter)
    && (!mechanicFilter || job.mechanic_name === mechanicFilter)
  );
  const salesTotal = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const jobRevenueTotal = filteredJobs.reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
  const revenueTotal = salesTotal + jobRevenueTotal;
  const digitalTotal = filteredSales
    .filter((sale) => sale.payment_category === "Digital")
    .reduce((sum, sale) => sum + sale.total, 0)
    + filteredJobs
      .filter((job) => job.payment_category === "Digital")
      .reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
  const cashTotal = revenueTotal - digitalTotal;
  const lowStockItems = data.inventory.filter((item) => item.stock <= item.reorder_level);
  const lowStock = lowStockItems.length;
  const activeJobs = data.jobOrders.filter((job) => !job.paid_at).length;
  const canViewInventory = canAccess(user.role, "inventory");
  const today = todayInputValue();
  const unpaidCompletedJobs = data.jobOrders.filter((job) => normalizeJobStatusForUi(job.status) === "Completed" && !job.paid_at);
  const todaysDueJobs = data.jobOrders.filter((job) => !job.paid_at && rowMatchesDate(job.due_at, today));
  const incompleteAttendance = data.mechanicAttendance.filter((attendance) =>
    attendance.status === "Incomplete Attendance" || Boolean(attendance.time_in && !attendance.time_out)
  );
  const failedBackup = data.superAdminSettings.last_backup_error?.trim() ?? "";
  const trialSettings = data.superAdminSettings;
  const trialNeedsAttention = trialSettings.license_status !== "Activated"
    && trialSettings.trial_enabled === 1
    && Boolean(trialSettings.trial)
    && (trialSettings.trial.expired || trialSettings.trial.daysRemaining <= 7);
  const dashboardAlerts = [
    ...(canViewInventory && lowStockItems.length > 0 ? [{
      key: "low-stock",
      title: "Low stock / reorder",
      detail: `${lowStockItems.length} item(s) at or below reorder level. ${lowStockItems.slice(0, 2).map((item) => `${item.product_code} needs ${suggestedReorderQuantity(item)}`).join(", ")}`,
      tone: "warn" as const,
      icon: <Boxes size={18} />
    }] : []),
    ...(unpaidCompletedJobs.length > 0 ? [{
      key: "unpaid-completed",
      title: "Unpaid completed jobs",
      detail: `${unpaidCompletedJobs.length} completed job(s) still need payment. ${unpaidCompletedJobs.slice(0, 2).map((job) => job.job_no).join(", ")}`,
      tone: "danger" as const,
      icon: <ReceiptText size={18} />
    }] : []),
    ...(todaysDueJobs.length > 0 ? [{
      key: "due-today",
      title: "Jobs due today",
      detail: `${todaysDueJobs.length} open job(s) due today. ${todaysDueJobs.slice(0, 2).map((job) => `${job.job_no} for ${job.customer_name}`).join(", ")}`,
      tone: "warn" as const,
      icon: <CalendarClock size={18} />
    }] : []),
    ...(incompleteAttendance.length > 0 ? [{
      key: "attendance",
      title: "Incomplete attendance",
      detail: `${incompleteAttendance.length} attendance record(s) need review. ${incompleteAttendance.slice(0, 2).map((attendance) => `${attendance.mechanic_name} on ${attendance.attendance_date}`).join(", ")}`,
      tone: "warn" as const,
      icon: <UserCheck size={18} />
    }] : []),
    ...(failedBackup ? [{
      key: "backup",
      title: "Failed backup",
      detail: failedBackup,
      tone: "danger" as const,
      icon: <HardDrive size={18} />
    }] : []),
    ...(trialNeedsAttention ? [{
      key: "trial",
      title: trialSettings.trial.expired ? "Trial expired" : "Trial/license warning",
      detail: trialSettings.trial.expired
        ? `Trial expired on ${formatDateOnly(trialSettings.trial.expiresAt)}. Activate a license to avoid access issues.`
        : `${trialSettings.trial.daysRemaining} day(s) remaining in the trial. Expires ${formatDateOnly(trialSettings.trial.expiresAt)}.`,
      tone: trialSettings.trial.expired ? "danger" as const : "warn" as const,
      icon: <AlertTriangle size={18} />
    }] : [])
  ];
  const saleIds = new Set(filteredSales.map((sale) => sale.id));
  const filteredSaleItems = data.saleItems.filter((item) => saleIds.has(item.sale_id));
  const itemAnalysis = Array.from(filteredSaleItems.reduce((map, item) => {
    const current = map.get(item.name) ?? { label: item.name, quantity: 0, revenue: 0 };
    current.quantity += item.quantity;
    current.revenue += item.line_total;
    map.set(item.name, current);
    return map;
  }, new Map<string, { label: string; quantity: number; revenue: number }>())
    .values()).sort((left, right) => right.quantity - left.quantity);
  const jobProductAnalysis = Array.from(filteredJobs.reduce((map, job) => {
    parseJobProducts(job.products_json).forEach((product) => {
      const current = map.get(product.name) ?? { label: product.name, quantity: 0, revenue: 0 };
      current.quantity += product.quantity;
      current.revenue += product.quantity * product.unitPrice;
      map.set(product.name, current);
    });
    return map;
  }, new Map<string, { label: string; quantity: number; revenue: number }>())
    .values());
  const purchasedItems = Array.from([...itemAnalysis, ...jobProductAnalysis].reduce((map, item) => {
    const current = map.get(item.label) ?? { label: item.label, quantity: 0, revenue: 0 };
    current.quantity += item.quantity;
    current.revenue += item.revenue;
    map.set(item.label, current);
    return map;
  }, new Map<string, { label: string; quantity: number; revenue: number }>())
    .values()).sort((left, right) => right.quantity - left.quantity).slice(0, 4);
  const servicesRendered = Array.from(filteredJobs.reduce((map, job) => {
    const serviceName = serviceNameForJob(job, data.services);
    const current = map.get(serviceName) ?? { label: serviceName, count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += Number(job.service_price || job.service_cost || 0) + Number(job.labor_cost || 0) + Number(job.additional_labor_cost || 0);
    map.set(serviceName, current);
    return map;
  }, new Map<string, { label: string; count: number; revenue: number }>())
    .values()).sort((left, right) => right.count - left.count).slice(0, 4);
  const mechanicPerformance = Array.from(filteredJobs.reduce((map, job) => {
    const mechanicName = job.mechanic_name || "Unassigned";
    const current = map.get(mechanicName) ?? { label: mechanicName, count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += Number(job.total_amount || 0);
    map.set(mechanicName, current);
    return map;
  }, new Map<string, { label: string; count: number; revenue: number }>())
    .values()).sort((left, right) => right.count - left.count).slice(0, 4);
  const cashierPerformance = Array.from(filteredSales.reduce((map, sale) => {
    const current = map.get(sale.cashier_name) ?? { label: sale.cashier_name, count: 0 };
    current.count += 1;
    map.set(sale.cashier_name, current);
    return map;
  }, new Map<string, { label: string; count: number }>())
    .values()).sort((left, right) => right.count - left.count).slice(0, 4);
  const paymentMethods = Array.from(new Set([...data.sales.map((sale) => sale.payment_method), ...data.jobOrders.map((job) => job.payment_method)].filter(Boolean)));
  const mechanics = Array.from(new Set(data.jobOrders.map((job) => job.mechanic_name).filter(Boolean)));
  const cashiers = Array.from(new Set(data.sales.map((sale) => sale.cashier_name).filter(Boolean)));
  const recentActivity = [
    ...data.sales.slice(-8).map((sale) => ({
      at: sale.voided_at || sale.created_at,
      label: sale.status === "Completed" ? "Sale completed" : `Transaction ${sale.status.toLowerCase()}`,
      detail: `${sale.receipt_no} - ${money.format(sale.total)}${sale.status !== "Completed" && sale.void_reason ? ` - ${sale.void_reason}` : ""}`
    })),
    ...data.jobOrders.filter((job) => job.paid_at).slice(-8).map((job) => ({
      at: job.paid_at || job.created_at,
      label: "Job order paid",
      detail: `${job.job_no} - ${job.customer_name} - ${money.format(job.total_amount || job.estimate)}`
    })),
    ...data.inventoryAdjustments.slice(-8).map((movement) => ({
      at: movement.created_at,
      label: movement.movement_type,
      detail: `${movement.product_code} ${movement.item_name}: ${movement.previous_stock} -> ${movement.new_stock}`
    })),
    ...data.auditLogs
      .filter((log) => /void|refund|setting|printer|payment|receipt/i.test(`${log.action} ${log.entity} ${log.details}`))
      .slice(-8)
      .map((log) => ({
        at: log.created_at,
        label: log.action,
        detail: `${log.entity}: ${log.details}`
      }))
  ].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()).slice(0, 8);

  function clearDashboardFilters() {
    setStartDate(todayInputValue());
    setEndDate(todayInputValue());
    setPaymentFilter("");
    setMechanicFilter("");
    setCashierFilter("");
  }

  return (
    <div className="content-grid">
      <section className="panel">
        <div className="panel-head">
          <h2>Dashboard Filters</h2>
          <Badge>{startDate === endDate ? startDate : `${startDate} to ${endDate}`}</Badge>
        </div>
        <RecordsToolbar showClear={Boolean(startDate !== todayInputValue() || endDate !== todayInputValue())} onClear={clearDashboardFilters}>
          <label className="field compact-field">
            Start Date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field compact-field">
            End Date
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </RecordsToolbar>
      </section>
      <div className="stats-grid">
        <StatCard label="Revenue" value={money.format(revenueTotal)} detail="POS sales + completed jobs" icon={<ReceiptText />} />
        <StatCard label="Active jobs" value={String(activeJobs)} detail="Open repair orders" icon={<ClipboardList />} />
        {canViewInventory && <StatCard label="Low stock" value={String(lowStock)} detail="Parts at reorder level" icon={<Boxes />} />}
        <StatCard label="Role scope" value={user.role} detail={`${modulesFor(user.role).length} modules available`} icon={<ShieldCheck />} />
      </div>
      <section className="panel dashboard-alerts-panel">
        <div className="panel-head">
          <h2>Shop Alerts</h2>
          <Badge tone={dashboardAlerts.length > 0 ? "warn" : "good"}>{dashboardAlerts.length > 0 ? `${dashboardAlerts.length} active` : "Clear"}</Badge>
        </div>
        {dashboardAlerts.length === 0 ? (
          <p className="empty-state">No shop alerts right now. Low stock, unpaid jobs, due jobs, attendance issues, backup failures, and trial warnings will appear here.</p>
        ) : (
          <div className="dashboard-alert-grid">
            {dashboardAlerts.map((alert) => (
              <div className={`dashboard-alert dashboard-alert-${alert.tone}`} key={alert.key}>
                <span className="dashboard-alert-icon">{alert.icon}</span>
                <div>
                  <strong>{alert.title}</strong>
                  <small>{alert.detail}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {canViewInventory && lowStockItems.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Low Stock Alerts</h2>
            <Badge tone="warn">{`${lowStockItems.length} parts need attention`}</Badge>
          </div>
          <DataTable<InventoryItem>
            title="Suggested Reorders"
            rows={lowStockItems.slice(0, 8)}
            columns={[
              { key: "code", label: "Product Code", render: (row) => row.product_code },
              { key: "part", label: "Item Name", render: (row) => row.name },
              { key: "stock", label: "Stock", render: (row) => <Badge tone="warn">{String(row.stock)}</Badge> },
              { key: "reorder", label: "Reorder Level", render: (row) => String(row.reorder_level) },
              { key: "suggested", label: "Suggested Qty", render: (row) => String(suggestedReorderQuantity(row)) }
            ]}
          />
        </section>
      )}
      <section className="panel activity-feed">
        <div className="panel-head">
          <h2>Recent Activity</h2>
          <Badge>{`${recentActivity.length} latest`}</Badge>
        </div>
        {recentActivity.length === 0 ? <p className="empty-state">No recent activity yet. Completed sales, paid jobs, stock changes, and settings updates will appear here.</p> : recentActivity.map((activity) => (
          <div className="activity-item" key={`${activity.label}-${activity.at}-${activity.detail}`}>
            <span>{formatDateTime(activity.at)}</span>
            <strong>{activity.label}</strong>
            <small>{activity.detail}</small>
          </div>
        ))}
      </section>
    </div>
  );
}
