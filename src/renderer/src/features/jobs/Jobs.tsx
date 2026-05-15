import { useEffect, useMemo, useState } from "react";
import { Download, ReceiptText } from "lucide-react";
import { Badge } from "../../../components/Badge";
import { DataTable } from "../../../components/DataTable";
import { PaginationControls } from "../../../components/PaginationControls";
import { ToastBridge } from "../../../components/Toast";
import type { AppData, JobOrder, JobProduct, UserAccount } from "../../../types/global";
import { useFilteredPagination } from "../../hooks/useFilteredPagination";
import { friendlyError, withTimeout } from "../../lib/api";
import { formatDateOnly, formatDateTime, rowMatchesDate, todayInputValue } from "../../lib/date";
import { confirmDiscardChanges, useUnsavedChanges } from "../../lib/dirty";
import { money } from "../../lib/format";
import { valueMatchesSearch } from "../../lib/search";
import { buildReceiptHtml } from "../../documents/receipt";
import { fallbackJobTimeline, isValidContactNumber, normalizeJobStatusForUi, parseJobProducts, printOrSaveReceiptPdf, ReceiptStatusTimeline, RecordsToolbar, serviceNameForJob, serviceTotal } from "../shared/featureUtils";
// Feature: Inventory catalog, stock movement, categories, and item maintenance.
// Feature: Job order intake, service/product usage, completion, payment, and receipts.
export function Jobs({ data, user, searchTerm = "", onRefresh, compact = false }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh?: () => Promise<void>; compact?: boolean }) {
  const emptyForm = {
    customerName: "",
    contactNumber: "",
    motorcycleType: "",
    plateNumber: "",
    serviceId: data.services[0]?.id ?? 0,
    mechanicId: data.users.find((account) => account.status === "Active" && account.is_mechanic && !["Owner", "Admin"].includes(account.role))?.id ?? 0
  };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(data.jobOrders[0]?.id ?? null);
  const [statusDraft, setStatusDraft] = useState("In Progress");
  const [products, setProducts] = useState<JobProduct[]>([]);
  const [payrollAllocations, setPayrollAllocations] = useState<Array<{ mechanicId: number; allocationRole: string; allocationType: "Percent" | "Fixed"; percentage: number; fixedAmount: number; isLead: boolean }>>([]);
  const [selectedProductId, setSelectedProductId] = useState(data.inventory[0]?.id ?? 0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [completion, setCompletion] = useState<{ servicePrice: number; laborCost: number; additionalLaborCost: number; serviceCost: number; productsCost: number; totalAmount: number } | null>(null);
  const [showCompletionWindow, setShowCompletionWindow] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(data.paymentMethods.find((method) => method.status === "Active")?.name ?? "");
  const [paymentReferenceCode, setPaymentReferenceCode] = useState("");
  const [paidReceipt, setPaidReceipt] = useState<{ receiptNo: string; total: number; paymentMethod: string } | null>(null);
  const [productQuantity, setProductQuantity] = useState(1);
  const [additionalLaborCost, setAdditionalLaborCost] = useState(0);
  const [paymentProcessingState, setPaymentProcessingState] = useState("");
  const [jobDateFilter, setJobDateFilter] = useState(todayInputValue());
  const [jobMechanicFilter, setJobMechanicFilter] = useState("");
  const [jobServiceFilter, setJobServiceFilter] = useState("");
  const [jobReceiptPreview, setJobReceiptPreview] = useState<{ receiptNo: string; html: string } | null>(null);

  const selectedJob = data.jobOrders.find((job) => job.id === selectedJobId) ?? data.jobOrders[0];
  const selectedJobAllocations = selectedJob ? data.jobPayrollAllocations.filter((allocation) => allocation.job_order_id === selectedJob.id) : [];
  const selectedJobHistory = selectedJob ? data.jobStatusHistory.filter((entry) => entry.job_order_id === selectedJob.id) : [];
  const selectedJobPaid = Boolean(selectedJob?.paid_at);
  const selectedJobCompleted = normalizeJobStatusForUi(selectedJob?.status || "") === "Completed";
  const jobNextStep = !selectedJob
    ? "Create a job order to start tracking repairs."
    : selectedJobPaid
      ? "Job paid. Receipt actions are available below."
      : selectedJobCompleted
        ? "Job completed. Collect payment to finish."
        : "Update parts, labor, or status, then save the job.";
  const mechanics = data.users.filter((account) => account.status === "Active" && account.is_mechanic && !["Owner", "Admin"].includes(account.role));
  const isPaymentProcessing = Boolean(paymentProcessingState);
  const activePaymentMethods = useMemo(() => data.paymentMethods.filter((method) => method.status === "Active"), [data.paymentMethods]);
  const selectedPaymentMethod = activePaymentMethods.find((method) => method.name === paymentMethod);
  const requiresReferenceCode = selectedPaymentMethod?.payment_category === "Digital";
  const jobFormDirty = showForm && JSON.stringify(form) !== JSON.stringify(emptyForm);
  useUnsavedChanges("job-order-form", jobFormDirty);
  const customerHistory = useMemo(() => {
    const contactDigits = form.contactNumber.replace(/\D/g, "");
    const plate = form.plateNumber.trim().toUpperCase();
    if (contactDigits.length < 4 && plate.length < 2) return [];
    return data.jobOrders
      .filter((job) => {
        const jobContact = (job.contact_number || "").replace(/\D/g, "");
        const contactMatches = contactDigits.length >= 4 && jobContact.includes(contactDigits);
        const plateMatches = plate.length >= 2 && (job.plate_no || "").toUpperCase().includes(plate);
        return contactMatches || plateMatches;
      })
      .slice(0, 6);
  }, [data.jobOrders, form.contactNumber, form.plateNumber]);
  const customerProducts = customerHistory.flatMap((job) => parseJobProducts(job.products_json));
  const unpaidJobs = customerHistory.filter((job) => normalizeJobStatusForUi(job.status) === "Completed" && !job.paid_at);
  const jobRows = useMemo(() => data.jobOrders.filter((job) => rowMatchesDate(job.created_at, jobDateFilter)
    && (!jobMechanicFilter || String(job.mechanic_id || "") === jobMechanicFilter)
    && (!jobServiceFilter || String(job.service_id || "") === jobServiceFilter)
    && valueMatchesSearch(searchTerm, [job.customer_name, job.motorcycle_type, job.plate_no, job.job_no])), [data.jobOrders, searchTerm, jobDateFilter, jobMechanicFilter, jobServiceFilter]);
  const jobPage = useFilteredPagination(jobRows, [searchTerm, jobDateFilter, jobMechanicFilter, jobServiceFilter, data.jobOrders.length]);

  useEffect(() => {
    if (!selectedProductId && data.inventory[0]) setSelectedProductId(data.inventory[0].id);
  }, [data.inventory, selectedProductId]);

  useEffect(() => {
    if (!selectedJob) return;
    setStatusDraft(normalizeJobStatusForUi(selectedJob.status));
    setProducts(parseJobProducts(selectedJob.products_json));
    setCompletion(null);
    setShowCompletionWindow(false);
    setPaymentReady(false);
    setPaidReceipt(null);
    setPaymentProcessingState("");
    setPaymentReferenceCode("");
    setAdditionalLaborCost(Number(selectedJob.additional_labor_cost || 0));
    setPayrollAllocations(selectedJobAllocations.length
      ? selectedJobAllocations.map((allocation) => ({
        mechanicId: allocation.mechanic_id,
        allocationRole: allocation.allocation_role,
        allocationType: allocation.allocation_type,
        percentage: Number(allocation.percentage || 0),
        fixedAmount: Number(allocation.fixed_amount || 0),
        isLead: Boolean(allocation.is_lead)
      }))
      : selectedJob.mechanic_id ? [{ mechanicId: selectedJob.mechanic_id, allocationRole: "Lead", allocationType: "Percent", percentage: 100, fixedAmount: 0, isLead: true }] : []);
  }, [selectedJob?.id, data.jobPayrollAllocations.length]);

  useEffect(() => {
    if (activePaymentMethods.length === 0) {
      setPaymentMethod("");
      return;
    }
    if (!activePaymentMethods.some((method) => method.name === paymentMethod)) {
      setPaymentMethod(activePaymentMethods[0].name);
    }
  }, [activePaymentMethods, paymentMethod]);

  useEffect(() => {
    if (!requiresReferenceCode) setPaymentReferenceCode("");
  }, [requiresReferenceCode]);

  if (compact) {
    return (
      <DataTable<JobOrder>
        title="Repair Queue"
        rows={data.jobOrders.slice(0, 5)}
        columns={[
          { key: "job", label: "Job No.", render: (row) => row.job_no },
          { key: "customer", label: "Customer", render: (row) => row.customer_name },
          { key: "service", label: "Service", render: (row) => serviceNameForJob(row, data.services) },
          { key: "mechanic", label: "Mechanic", render: (row) => row.mechanic_name ?? "Unassigned" },
          { key: "status", label: "Status", render: (row) => <Badge tone={row.status === "Completed" ? "good" : "neutral"}>{row.status}</Badge> }
        ]}
      />
    );
  }

  function updateContactNumber(value: string) {
    setForm({ ...form, contactNumber: value.replace(/[^0-9()\-\s]/g, "").slice(0, 18) });
  }

  async function createJob() {
    setFormError("");
    setMessage("");
    if (!form.customerName.trim()) {
      setFormError("Customer name is required.");
      return;
    }
    if (!isValidContactNumber(form.contactNumber)) {
      setFormError("Contact number must contain 10 to 11 digits.");
      return;
    }
    if (!form.motorcycleType.trim()) {
      setFormError("Motorcycle type is required.");
      return;
    }
    if (!form.plateNumber.trim()) {
      setFormError("Plate number is required.");
      return;
    }
    if (!form.serviceId) {
      setFormError("Service to avail is required.");
      return;
    }
    if (!form.mechanicId) {
      setFormError("Mechanic is required.");
      return;
    }
    try {
      const result = await withTimeout(window.talyer.createJobOrder({ ...form, actorId: user.id }), "creating job order");
      setMessage(`Job order ${result.jobNo} created successfully.`);
      setForm(emptyForm);
      setFormError("");
      setShowForm(false);
      await onRefresh?.();
      setSelectedJobId(result.id);
    } catch (caught) {
      setFormError(friendlyError(caught, "Unable to create job order. Please check the form and try again."));
    }
  }

  function addProduct() {
    const item = data.inventory.find((inventoryItem) => inventoryItem.id === selectedProductId);
    if (!item) return;
    const quantity = Math.max(1, Math.min(productQuantity, item.stock));
    if (item.stock <= 0) {
      setError(`${item.name} is out of stock.`);
      return;
    }
    setProducts((current) => {
      const existing = current.find((product) => product.itemId === item.id);
      if (existing) {
        return current.map((product) => product.itemId === item.id ? { ...product, quantity: product.quantity + quantity } : product);
      }
      return [...current, { itemId: item.id, name: item.name, quantity, unitPrice: item.sell_price }];
    });
    setProductQuantity(1);
    setError("");
  }

  function updateProductQuantity(itemId: number, quantity: number) {
    setProducts((current) => current.map((product) => product.itemId === itemId ? { ...product, quantity: Math.max(1, quantity || 1) } : product));
  }

  function removeProduct(itemId: number) {
    setProducts((current) => current.filter((product) => product.itemId !== itemId));
  }

  function updateAllocation(index: number, field: "mechanicId" | "allocationRole" | "allocationType" | "percentage" | "fixedAmount" | "isLead", value: string | number | boolean) {
    setPayrollAllocations((current) => current.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, [field]: value } : allocation));
  }

  function addAllocation() {
    const helper = mechanics.find((mechanic) => !payrollAllocations.some((allocation) => allocation.mechanicId === mechanic.id));
    if (!helper) return;
    setPayrollAllocations((current) => [...current, { mechanicId: helper.id, allocationRole: "Helper", allocationType: "Percent", percentage: 0, fixedAmount: 0, isLead: false }]);
  }

  function removeAllocation(index: number) {
    setPayrollAllocations((current) => current.filter((_, allocationIndex) => allocationIndex !== index));
  }

  async function saveJob() {
    if (!selectedJob) return;
    setError("");
    setMessage("");
    try {
      const result = await withTimeout(window.talyer.updateJobOrder({ actorId: user.id, jobOrderId: selectedJob.id, status: statusDraft, products, additionalLaborCost, payrollAllocations }), "saving job order");
      await onRefresh?.();
      if (statusDraft === "Completed") {
        setCompletion(result);
        setShowCompletionWindow(true);
        setPaymentReady(false);
        setMessage("Job Order completed successfully.");
      } else {
        setCompletion(null);
        setShowCompletionWindow(false);
        setPaymentReady(false);
        setMessage(`${selectedJob.job_no} saved.`);
      }
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save job order. Please try again."));
    }
  }

  async function completePayment() {
    if (!selectedJob || isPaymentProcessing || !paymentMethod) return;
    setError("");
    setMessage("");
    if (requiresReferenceCode && !paymentReferenceCode.trim()) {
      setError("Reference code is required for digital payments.");
      return;
    }
    setPaymentProcessingState("Saving transaction...");
    try {
      const referenceCode = requiresReferenceCode ? paymentReferenceCode.trim() : "";
      const receipt = await withTimeout(window.talyer.payJobOrder({ actorId: user.id, jobOrderId: selectedJob.id, paymentMethod, paymentReferenceCode: referenceCode }), "completing payment");
      setPaidReceipt({ receiptNo: receipt.receiptNo, total: receipt.total, paymentMethod });
      const receiptHtml = buildReceiptHtml(data.receiptSettings, {
        receiptNo: receipt.receiptNo,
        cashierName: user.name,
        customerName: selectedJob.customer_name,
        transactionType: "Job Order",
        paymentMethod,
        paymentCategory: receipt.paymentCategory ?? selectedPaymentMethod?.payment_category,
        paymentReferenceCode: receipt.paymentReferenceCode ?? referenceCode,
        createdAt: new Date(receipt.paidAt),
        lines: [
          { name: `Service Cost - ${serviceNameForJob(selectedJob, data.services)}`, quantity: 1, unitPrice: completion?.servicePrice ?? Number(selectedJob.service_price || selectedJob.service_cost || selectedJob.estimate || 0) },
          { name: "Labor Cost", quantity: 1, unitPrice: completion?.laborCost ?? Number(selectedJob.labor_cost || 0) },
          ...(Number(completion?.additionalLaborCost ?? additionalLaborCost) > 0 ? [{ name: "Additional Labor Cost", quantity: 1, unitPrice: Number(completion?.additionalLaborCost ?? additionalLaborCost) }] : []),
          ...products.map((product) => ({ name: product.name, quantity: product.quantity, unitPrice: product.unitPrice }))
        ],
        subtotal: receipt.total,
        total: receipt.total,
        breakdown: completion ? {
          servicePrice: completion.servicePrice,
          laborCost: completion.laborCost,
          additionalLaborCost: completion.additionalLaborCost,
          productsTotal: completion.productsCost
        } : undefined
      });
      setPaymentProcessingState("Generating receipt...");
      try {
        setPaymentProcessingState("Printing / Saving PDF...");
        await printOrSaveReceiptPdf(receiptHtml, receipt.receiptNo);
      } catch (caught) {
        setError(friendlyError(caught, "Payment was saved, but the receipt could not be printed or saved."));
      }
      await onRefresh?.();
      setCompletion(null);
      setShowCompletionWindow(false);
      setPaymentReady(false);
      setPaymentReferenceCode("");
      setMessage("Job Order payment completed successfully.");
    } catch (caught) {
      setError(friendlyError(caught, "Unable to complete payment. Please try again."));
    } finally {
      setPaymentProcessingState("");
    }
  }

  function buildJobReceipt(job: JobOrder) {
    const jobProducts = parseJobProducts(job.products_json);
    const servicePrice = Number(job.service_price || job.service_cost || job.estimate || 0);
    const laborCost = Number(job.labor_cost || 0);
    const additionalLabor = Number(job.additional_labor_cost || 0);
    const productsCost = jobProducts.reduce((sum, product) => sum + product.quantity * product.unitPrice, 0);
    const totalAmount = Number(job.total_amount || servicePrice + laborCost + additionalLabor + productsCost);

    return buildReceiptHtml(data.receiptSettings, {
      receiptNo: job.job_no,
      cashierName: user.name,
      customerName: job.customer_name,
      transactionType: "Job Order",
      paymentMethod: job.payment_method || paymentMethod,
      paymentCategory: job.payment_category,
      paymentReferenceCode: job.payment_reference_code,
      createdAt: job.paid_at ? new Date(job.paid_at) : new Date(),
      lines: [
        { name: `Service Cost - ${serviceNameForJob(job, data.services)}`, quantity: 1, unitPrice: servicePrice },
        { name: "Labor Cost", quantity: 1, unitPrice: laborCost },
        ...(additionalLabor > 0 ? [{ name: "Additional Labor Cost", quantity: 1, unitPrice: additionalLabor }] : []),
        ...jobProducts.map((product) => ({ name: product.name, quantity: product.quantity, unitPrice: product.unitPrice }))
      ],
      subtotal: totalAmount,
      total: totalAmount,
      breakdown: { servicePrice, laborCost, additionalLaborCost: additionalLabor, productsTotal: productsCost }
    });
  }

  async function downloadJobReceipt(job: JobOrder) {
    setError("");
    setMessage("");
    try {
      const html = buildJobReceipt(job);
      const saved = await withTimeout(window.talyer.saveReceiptPdf({ html, receiptNo: job.job_no }), "saving receipt PDF");
      if (saved) setMessage(`${job.job_no} receipt saved.`);
    } catch (caught) {
      setError(friendlyError(caught, "Unable to download the receipt right now."));
    }
  }

  function previewJobReceipt(job: JobOrder) {
    setJobReceiptPreview({ receiptNo: job.job_no, html: buildJobReceipt(job) });
  }

  async function savePreviewedJobReceipt() {
    if (!jobReceiptPreview) return;
    setError("");
    setMessage("");
    try {
      const saved = await withTimeout(window.talyer.saveReceiptPdf({ html: jobReceiptPreview.html, receiptNo: jobReceiptPreview.receiptNo }), "saving receipt PDF");
      if (saved) {
        setMessage(`${jobReceiptPreview.receiptNo} receipt saved.`);
        setJobReceiptPreview(null);
      }
    } catch (caught) {
      setError(friendlyError(caught, "Unable to download the receipt right now."));
    }
  }

  return (
    <div className="job-workspace">
      <ToastBridge success={message} error={error} />
      <section className="panel">
        <div className="panel-head">
          <h2>Job Orders</h2>
          <button className="primary-button compact-button" onClick={() => {
            setFormError("");
            setShowForm(true);
          }}>New Job Order</button>
        </div>
        {showForm && (
          <div className="modal-backdrop">
            <section className="modal-window">
              <div className="panel-head">
                <h2>New Job Order</h2>
                <button className="table-action" onClick={() => {
                  if (confirmDiscardChanges(jobFormDirty)) {
                    setFormError("");
                    setShowForm(false);
                  }
                }}>Close</button>
              </div>
              <div className="job-form">
            <label className="field">
              Customer Name
              <input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} />
            </label>
            <label className="field">
              Contact Number
              <input value={form.contactNumber} onChange={(event) => updateContactNumber(event.target.value)} inputMode="tel" maxLength={18} placeholder="0917-123-4567" />
            </label>
            <label className="field">
              Motorcycle Type
              <input value={form.motorcycleType} onChange={(event) => setForm({ ...form, motorcycleType: event.target.value })} placeholder="Honda Click 125i" />
            </label>
            <label className="field">
              Plate Number
              <input value={form.plateNumber} onChange={(event) => setForm({ ...form, plateNumber: event.target.value.toUpperCase() })} />
            </label>
            <label className="field">
              Service to Avail
              <select value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: Number(event.target.value) })}>
                {data.services.map((service) => <option value={service.id} key={service.id}>{service.name} - {money.format(serviceTotal(service))}</option>)}
              </select>
            </label>
            <label className="field">
              Select Mechanic
              <select value={form.mechanicId} onChange={(event) => setForm({ ...form, mechanicId: Number(event.target.value) })}>
                {mechanics.map((mechanic) => <option value={mechanic.id} key={mechanic.id}>{mechanic.name}</option>)}
              </select>
            </label>
            <div className="job-auto">
              <span>Date: {new Date().toLocaleDateString()}</span>
              <span>Transaction No.: Auto-generated on create</span>
            </div>
            {(customerHistory.length > 0 || unpaidJobs.length > 0) && (
              <div className="customer-history form-wide">
                <div className="panel-head">
                  <h3>Customer History</h3>
                  {unpaidJobs.length > 0 ? <Badge tone="warn">{`${unpaidJobs.length} unpaid job(s)`}</Badge> : <Badge tone="good">No unpaid jobs</Badge>}
                </div>
                <div className="history-grid">
                  <div>
                    <strong>Previous Visits</strong>
                    {customerHistory.map((job) => (
                      <span key={job.id}>{job.job_no} - {serviceNameForJob(job, data.services)} - {formatDateOnly(job.created_at)}</span>
                    ))}
                  </div>
                  <div>
                    <strong>Parts Bought / Used</strong>
                    {customerProducts.length === 0 ? <span>No parts recorded from job history.</span> : customerProducts.slice(0, 5).map((product, index) => (
                      <span key={`${product.itemId}-${index}`}>{product.name} x{product.quantity}</span>
                    ))}
                  </div>
                  <div>
                    <strong>Unpaid Jobs</strong>
                    {unpaidJobs.length === 0 ? <span>None</span> : unpaidJobs.map((job) => (
                      <span key={job.id}>{job.job_no} - {money.format(job.total_amount || job.estimate)}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {formError && <span className="form-error form-wide">{formError}</span>}
            <button className="primary-button" onClick={createJob}>Create Job Order</button>
              </div>
            </section>
          </div>
        )}
        {error && <span className="form-error">{error}</span>}
        <RecordsToolbar
          showClear={Boolean(jobDateFilter !== todayInputValue() || jobMechanicFilter || jobServiceFilter)}
          onClear={() => {
            setJobDateFilter(todayInputValue());
            setJobMechanicFilter("");
            setJobServiceFilter("");
          }}
        >
          <label className="field compact-field">
            Transaction Date
            <input type="date" value={jobDateFilter} onChange={(event) => setJobDateFilter(event.target.value)} />
          </label>
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
        </RecordsToolbar>
        {jobPage.isLoading && <div className="processing-banner">Updating records...</div>}
        <div className="job-list">
          {jobPage.pagedRows.map((job) => (
            <button className={selectedJob?.id === job.id ? "job-row selected" : "job-row"} key={job.id} onClick={() => setSelectedJobId(job.id)}>
              <strong>{job.job_no}</strong>
              <span>{job.customer_name}</span>
              <Badge tone={job.status === "Completed" ? "good" : "neutral"}>{job.status}</Badge>
            </button>
          ))}
          {jobRows.length === 0 && (
            <div className="empty-state action-empty-state">
              <span>No job orders yet. Create a new job order to start tracking repairs.</span>
              <button className="secondary-button compact-button" onClick={() => {
                setFormError("");
                setShowForm(true);
              }}>Create job order</button>
            </div>
          )}
        </div>
        <PaginationControls page={jobPage.page} pageCount={jobPage.pageCount} total={jobRows.length} onPageChange={jobPage.setPage} />
      </section>

      {selectedJob && (
        <section className="panel job-detail">
          <div className="panel-head">
            <h2>{selectedJob.job_no}</h2>
            <Badge>{serviceNameForJob(selectedJob, data.services)}</Badge>
          </div>
          <div className="next-step-banner">
            <span>Next Step</span>
            <strong>{jobNextStep}</strong>
          </div>
          <div className="detail-grid">
            <span>Customer <b>{selectedJob.customer_name}</b></span>
            <span>Contact <b>{selectedJob.contact_number}</b></span>
            <span>Motorcycle <b>{selectedJob.motorcycle_type}</b></span>
            <span>Plate <b>{selectedJob.plate_no}</b></span>
            <span>Service Availed <b>{serviceNameForJob(selectedJob, data.services)}</b></span>
            <span>Service Price <b>{money.format(selectedJob.service_price || selectedJob.service_cost || selectedJob.estimate)}</b></span>
            <span>Labor Cost <b>{money.format(selectedJob.labor_cost || 0)}</b></span>
            <span>Additional Labor Cost <b>{money.format(additionalLaborCost)}</b></span>
            <span>Mechanic <b>{selectedJob.mechanic_name ?? "Unassigned"}</b></span>
            <span>Date <b>{new Date(selectedJob.created_at).toLocaleDateString()}</b></span>
          </div>
          <div className="status-timeline">
            <h3>Status Timeline</h3>
            {(selectedJobHistory.length > 0 ? selectedJobHistory : fallbackJobTimeline(selectedJob)).map((entry) => (
              <div className="timeline-item" key={`${entry.status}-${entry.created_at}-${entry.details}`}>
                <span>{formatDateTime(entry.created_at)}</span>
                <strong>{entry.status}</strong>
                <small>{entry.details || entry.actor_name || "System update"}</small>
              </div>
            ))}
          </div>
          <label className="field">
            Status
            <select value={statusDraft} disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} onChange={(event) => setStatusDraft(event.target.value)}>
              <option>In Progress</option>
              <option>Completed</option>
            </select>
          </label>
          <div className="product-usage">
            <div className="panel-head">
              <h3>Products Used</h3>
              <div className="inline-controls">
                <select value={selectedProductId} disabled={isPaymentProcessing} onChange={(event) => setSelectedProductId(Number(event.target.value))}>
                  {data.inventory.map((item) => <option value={item.id} key={item.id}>{item.name} ({item.stock})</option>)}
                </select>
                <input className="qty-input" type="number" min={1} disabled={isPaymentProcessing} value={productQuantity} onChange={(event) => setProductQuantity(Math.max(1, Number(event.target.value) || 1))} />
                <button className="secondary-button" disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} onClick={addProduct}>Add Product</button>
              </div>
            </div>
            {products.length === 0 && <p className="empty-state">No products used yet.</p>}
            {products.map((product) => (
              <div className="cart-line" key={product.itemId}>
                <div>
                  <strong>{product.name}</strong>
                  <span>{money.format(product.unitPrice)} each</span>
                </div>
                <input className="qty-input" type="number" min={1} disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} value={product.quantity} onChange={(event) => updateProductQuantity(product.itemId, Number(event.target.value))} />
                <b>{money.format(product.quantity * product.unitPrice)}</b>
                <button className="table-action danger-action" disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} onClick={() => removeProduct(product.itemId)}>Remove</button>
              </div>
            ))}
          </div>
          <label className="field">
            Additional Labor Cost
            <input type="number" min={0} disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} value={additionalLaborCost} onChange={(event) => setAdditionalLaborCost(Math.max(0, Number(event.target.value) || 0))} />
          </label>
          <div className="product-usage">
            <div className="panel-head">
              <h3>Payroll Allocation</h3>
              <button className="secondary-button compact-button" disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} onClick={addAllocation}>Add Mechanic</button>
            </div>
            {payrollAllocations.map((allocation, index) => (
              <div className="cart-line" key={`${allocation.mechanicId}-${index}`}>
                <select disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} value={allocation.mechanicId} onChange={(event) => updateAllocation(index, "mechanicId", Number(event.target.value))}>
                  {mechanics.map((mechanic) => <option value={mechanic.id} key={mechanic.id}>{mechanic.name}</option>)}
                </select>
                <select disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} value={allocation.allocationRole} onChange={(event) => updateAllocation(index, "allocationRole", event.target.value)}>
                  <option>Lead</option>
                  <option>Helper</option>
                  <option>Specialist</option>
                </select>
                <select disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} value={allocation.allocationType} onChange={(event) => updateAllocation(index, "allocationType", event.target.value as "Percent" | "Fixed")}>
                  <option>Percent</option>
                  <option>Fixed</option>
                </select>
                {allocation.allocationType === "Percent"
                  ? <input className="qty-input" type="number" min={0} max={100} disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} value={allocation.percentage} onChange={(event) => updateAllocation(index, "percentage", Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />
                  : <input className="qty-input" type="number" min={0} disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} value={allocation.fixedAmount} onChange={(event) => updateAllocation(index, "fixedAmount", Math.max(0, Number(event.target.value) || 0))} />}
                <label className="check-field compact-check"><input type="checkbox" disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} checked={allocation.isLead} onChange={(event) => updateAllocation(index, "isLead", event.target.checked)} /> Lead</label>
                <button className="table-action danger-action" disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing || payrollAllocations.length === 1} onClick={() => removeAllocation(index)}>Remove</button>
              </div>
            ))}
          </div>
          <button className="primary-button" disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} onClick={saveJob}>
            {isPaymentProcessing ? paymentProcessingState : statusDraft === "Completed" && !selectedJobCompleted ? "Complete Job" : "Save Job"}
          </button>
          {selectedJob.status === "Completed" && selectedJob.paid_at && (
            <div className="inline-controls">
              <button className="secondary-button receipt-download-button" disabled={isPaymentProcessing} onClick={() => previewJobReceipt(selectedJob)}>
                <ReceiptText size={16} />
                Preview receipt
              </button>
              <button className="secondary-button receipt-download-button" disabled={isPaymentProcessing} onClick={() => downloadJobReceipt(selectedJob)}>
                <Download size={16} />
                Download receipt
              </button>
            </div>
          )}

          {completion && showCompletionWindow && (
            <div className="modal-backdrop">
              <section className="modal-window completion-window">
                <div className="panel-head">
                  <h2>Completion Summary</h2>
                  <button className="table-action" disabled={isPaymentProcessing} onClick={() => setShowCompletionWindow(false)}>Close</button>
                </div>
                <div className="detail-grid">
                  <span>Job Order <b>{selectedJob.job_no}</b></span>
                  <span>Customer <b>{selectedJob.customer_name}</b></span>
                  <span>Services Availed <b>{serviceNameForJob(selectedJob, data.services)}</b></span>
                  <span>Products Purchased <b>{products.length ? products.map((product) => `${product.name} x${product.quantity}`).join(", ") : "None"}</b></span>
                  <span>Service Price <b>{money.format(completion.servicePrice)}</b></span>
                  <span>Labor Cost <b>{money.format(completion.laborCost)}</b></span>
                  <span>Additional Labor Cost <b>{money.format(completion.additionalLaborCost)}</b></span>
                  <span>Products Total <b>{money.format(completion.productsCost)}</b></span>
                  <span>Grand Total <b>{money.format(completion.totalAmount)}</b></span>
                </div>
                <button className="primary-button" disabled={isPaymentProcessing} onClick={() => setPaymentReady(true)}>Confirm Completion</button>
                {paymentReady && (
                  <div className="payment-box">
                    <label className="field">
                      Payment Method
                      <select value={paymentMethod} disabled={isPaymentProcessing || activePaymentMethods.length === 0} onChange={(event) => setPaymentMethod(event.target.value)}>
                        {activePaymentMethods.map((method) => <option value={method.name} key={method.id}>{method.name}</option>)}
                      </select>
                    </label>
                    {requiresReferenceCode && (
                      <label className="field form-wide">
                        Reference Code
                        <input value={paymentReferenceCode} disabled={isPaymentProcessing} onChange={(event) => setPaymentReferenceCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && completePayment()} placeholder="Enter Reference Code" autoFocus />
                      </label>
                    )}
                    <button className="primary-button" disabled={isPaymentProcessing || !paymentMethod} onClick={completePayment}>
                      {isPaymentProcessing ? paymentProcessingState : "Complete"}
                    </button>
                    {activePaymentMethods.length === 0 && <span className="form-error form-wide">No active payment methods are configured.</span>}
                    {paymentProcessingState && <div className="processing-banner form-wide">{paymentProcessingState}</div>}
                    <ReceiptStatusTimeline current={paymentProcessingState} done={message.includes("payment completed")} />
                  </div>
                )}
              </section>
            </div>
          )}
          {paidReceipt && (
            <div className="credential-card">
              <span>Receipt</span>
              <strong>{paidReceipt.receiptNo}</strong>
              <strong>Total: {money.format(paidReceipt.total)}</strong>
              <small>Payment: {paidReceipt.paymentMethod}. If printing is unavailable, the app will offer a PDF receipt.</small>
            </div>
          )}
          {jobReceiptPreview && (
            <div className="modal-backdrop">
              <section className="modal-window report-preview-window">
                <div className="panel-head">
                  <h2>Receipt Preview</h2>
                  <button className="table-action" onClick={() => setJobReceiptPreview(null)}>Close</button>
                </div>
                <iframe className="document-preview" title="Job receipt preview" srcDoc={jobReceiptPreview.html} />
                <button className="primary-button" onClick={savePreviewedJobReceipt}>Save PDF Receipt</button>
              </section>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

