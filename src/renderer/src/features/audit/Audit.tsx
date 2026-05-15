import { useMemo, useState } from "react";
import { Badge } from "../../../components/Badge";
import { DataTable } from "../../../components/DataTable";
import { PaginationControls } from "../../../components/PaginationControls";
import type { AppData, UserAccount } from "../../../types/global";
import { useFilteredPagination } from "../../hooks/useFilteredPagination";
import { formatDateTime, rowMatchesDateRange } from "../../lib/date";
import { valueMatchesSearch } from "../../lib/search";
import { RecordsToolbar } from "../shared/featureUtils";

// Feature: System audit trail.
export function Audit({ data, user, searchTerm = "" }: { data: AppData; user: UserAccount; searchTerm?: string }) {
  const [userFilter, setUserFilter] = useState("All");
  const [moduleFilter, setModuleFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [approvalOnly, setApprovalOnly] = useState(false);
  const canSeeSystemLogs = user.role === "Owner" || user.role === "SuperAdmin";

  const visibleLogs = useMemo(() => canSeeSystemLogs
    ? data.auditLogs
    : data.auditLogs.filter((row) => !/super admin|system/i.test(`${row.user_name ?? ""} ${row.entity} ${row.details}`)),
  [canSeeSystemLogs, data.auditLogs]);

  const userOptions = useMemo(() => Array.from(new Set(visibleLogs.map((row) => row.user_name || "System"))).sort(), [visibleLogs]);
  const moduleOptions = useMemo(() => Array.from(new Set(visibleLogs.map((row) => row.entity || "System"))).sort(), [visibleLogs]);
  const actionOptions = useMemo(() => Array.from(new Set(visibleLogs.map((row) => row.action))).sort(), [visibleLogs]);

  const auditRows = visibleLogs.filter((row) => {
    const approvalText = `${row.action} ${row.entity} ${row.details}`;
    return (userFilter === "All" || (row.user_name || "System") === userFilter)
      && (moduleFilter === "All" || row.entity === moduleFilter)
      && (actionFilter === "All" || row.action === actionFilter)
      && rowMatchesDateRange(row.created_at, startDate, endDate)
      && (!approvalOnly || /approval|approved|void|refund|delete|restore|reset/i.test(approvalText))
      && valueMatchesSearch(searchTerm, [
        formatDateTime(row.created_at),
        row.user_name ?? "System",
        row.action,
        row.entity,
        row.details
      ]);
  });
  const auditPage = useFilteredPagination(auditRows, [searchTerm, data.auditLogs.length, userFilter, moduleFilter, actionFilter, startDate, endDate, approvalOnly]);

  return (
    <section className="content-grid">
      {auditPage.isLoading && <div className="processing-banner">Updating records...</div>}
      <section className="panel">
        <div className="panel-head">
          <h2>Audit Visibility</h2>
          <Badge>{canSeeSystemLogs ? "Full access" : "Operational logs"}</Badge>
        </div>
        <RecordsToolbar
          showClear={userFilter !== "All" || moduleFilter !== "All" || actionFilter !== "All" || Boolean(startDate) || Boolean(endDate) || approvalOnly}
          onClear={() => {
            setUserFilter("All");
            setModuleFilter("All");
            setActionFilter("All");
            setStartDate("");
            setEndDate("");
            setApprovalOnly(false);
          }}
        >
          <label className="field compact-field">
            User
            <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
              <option>All</option>
              {userOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="field compact-field">
            Module
            <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              <option>All</option>
              {moduleOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="field compact-field">
            Action
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option>All</option>
              {actionOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="field compact-field">
            From
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field compact-field">
            To
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label className="check-field compact-check">
            <input type="checkbox" checked={approvalOnly} onChange={(event) => setApprovalOnly(event.target.checked)} />
            Approval required
          </label>
        </RecordsToolbar>
      </section>
      <DataTable
        title="Audit Logs"
        rows={auditPage.pagedRows}
        emptyMessage="No audit logs yet. User actions and approvals will appear here once activity is recorded."
        footer={<PaginationControls page={auditPage.page} pageCount={auditPage.pageCount} total={auditRows.length} onPageChange={auditPage.setPage} />}
        columns={[
          { key: "date", label: "Date & Time", render: (row) => formatDateTime(row.created_at) },
          { key: "user", label: "User", render: (row) => row.user_name ?? "System" },
          { key: "action", label: "Action", render: (row) => row.action },
          { key: "entity", label: "Entity", render: (row) => row.entity },
          { key: "details", label: "Details", render: (row) => row.details }
        ]}
      />
    </section>
  );
}
