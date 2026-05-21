import { useMemo, useState } from "react";
import { Badge } from "../../../components/Badge";
import { DataTable } from "../../../components/DataTable";
import type { AppData, Customer, JobOrder, Motorcycle, UserAccount } from "../../../types/global";
import { formatDateOnly, formatDateTime } from "../../lib/date";
import { money } from "../../lib/format";
import { valueMatchesSearch } from "../../lib/search";
import { normalizeJobStatusForUi } from "../shared/featureUtils";

function customerKey(customer: Customer) {
  return `${customer.name.trim().toLowerCase()}|${customer.phone.trim()}`;
}

function jobMatchesCustomer(job: JobOrder, customer: Customer) {
  return job.customer_name.trim().toLowerCase() === customer.name.trim().toLowerCase()
    && job.contact_number.trim() === customer.phone.trim();
}

export function Customers({ data, searchTerm = "" }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh?: () => Promise<void> }) {
  const customers = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const customer of data.customers) map.set(customerKey(customer), customer);
    for (const job of data.jobOrders) {
      const key = `${job.customer_name.trim().toLowerCase()}|${job.contact_number.trim()}`;
      if (!map.has(key)) {
        map.set(key, { id: -map.size - 1, name: job.customer_name, phone: job.contact_number, email: "", address: "", created_at: job.created_at });
      }
    }
    return Array.from(map.values())
      .filter((customer) => valueMatchesSearch(searchTerm, [customer.name, customer.phone, customer.email, customer.address]))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [data.customers, data.jobOrders, searchTerm]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(customers[0]?.id ?? null);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0];
  const customerJobs = selectedCustomer ? data.jobOrders.filter((job) => jobMatchesCustomer(job, selectedCustomer)) : [];
  const customerMotorcycles = selectedCustomer
    ? data.motorcycles.filter((motorcycle) => motorcycle.customer_id === selectedCustomer.id || customerJobs.some((job) => job.plate_no === motorcycle.plate_no))
    : [];
  const totalSpent = customerJobs.reduce((sum, job) => sum + Number(job.paid_at ? job.total_amount : 0), 0);
  const lastVisit = customerJobs.map((job) => job.paid_at || job.created_at)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

  return (
    <div className="content-grid">
      <section className="panel">
        <div className="panel-head">
          <h2>Customer History</h2>
          <Badge>{`${customers.length} customer(s)`}</Badge>
        </div>
        <div className="detail-grid">
          <span>Selected <b>{selectedCustomer?.name ?? "None"}</b></span>
          <span>Motorcycles <b>{customerMotorcycles.length}</b></span>
          <span>Repair jobs <b>{customerJobs.length}</b></span>
          <span>Total paid <b>{money.format(totalSpent)}</b></span>
          <span>Last visit <b>{lastVisit ? formatDateOnly(lastVisit) : "No visits yet"}</b></span>
        </div>
      </section>

      <DataTable<Customer>
        title="Customers"
        rows={customers}
        emptyMessage="No customer history yet. Customers appear here after job orders are created."
        columns={[
          { key: "name", label: "Customer", render: (row) => row.name },
          { key: "phone", label: "Contact", render: (row) => row.phone },
          { key: "visits", label: "Jobs", render: (row) => String(data.jobOrders.filter((job) => jobMatchesCustomer(job, row)).length) },
          { key: "last", label: "Last Visit", render: (row) => {
            const visits = data.jobOrders.filter((job) => jobMatchesCustomer(job, row)).map((job) => job.paid_at || job.created_at);
            const latest = visits.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
            return latest ? formatDateOnly(latest) : "None";
          } },
          { key: "actions", label: "Actions", render: (row) => (
            <button className="table-action" onClick={() => setSelectedCustomerId(row.id)}>View History</button>
          ) }
        ]}
      />

      <DataTable<Motorcycle>
        title="Motorcycles"
        rows={customerMotorcycles}
        emptyMessage="No motorcycles recorded for this customer yet."
        columns={[
          { key: "plate", label: "Plate No.", render: (row) => row.plate_no },
          { key: "brand", label: "Brand", render: (row) => row.brand },
          { key: "model", label: "Model", render: (row) => row.model || "Not specified" },
          { key: "year", label: "Year", render: (row) => row.year ? String(row.year) : "Not specified" },
          { key: "color", label: "Color", render: (row) => row.color || "Not specified" }
        ]}
      />

      <DataTable<JobOrder>
        title="Repair History"
        rows={customerJobs}
        emptyMessage="No repair jobs found for this customer."
        columns={[
          { key: "job", label: "Job No.", render: (row) => row.job_no },
          { key: "date", label: "Date", render: (row) => formatDateTime(row.created_at) },
          { key: "motorcycle", label: "Motorcycle", render: (row) => `${row.plate_no} ${row.motorcycle_type}` },
          { key: "service", label: "Service", render: (row) => row.service_name || row.concern },
          { key: "mechanic", label: "Mechanic", render: (row) => row.mechanic_name || "Unassigned" },
          { key: "status", label: "Status", render: (row) => <Badge tone={row.paid_at ? "good" : normalizeJobStatusForUi(row.status) === "Completed" ? "warn" : "neutral"}>{row.paid_at ? "Paid" : normalizeJobStatusForUi(row.status)}</Badge> },
          { key: "total", label: "Total", render: (row) => money.format(Number(row.total_amount || row.estimate || 0)) }
        ]}
      />
    </div>
  );
}
