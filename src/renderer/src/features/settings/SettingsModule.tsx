import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ApprovalFields } from "../../../components/ApprovalFields";
import { Badge } from "../../../components/Badge";
import { ToastBridge } from "../../../components/Toast";
import type { AppData, InventoryCategory, PaymentCategory, PaymentMethod, PrinterOption, ReceiptSettings, UserAccount } from "../../../types/global";
import { friendlyError, withTimeout } from "../../lib/api";
import { approvalReady, approvalValidationError, emptyApproval } from "../../lib/approval";
import { confirmDiscardChanges, useUnsavedChanges } from "../../lib/dirty";
import { buildReceiptHtml } from "../../documents/receipt";
import { isValidContactNumber, printOrSaveReceiptPdf } from "../shared/featureUtils";
import { downloadCsv, readCsvFile, rowsToCsv } from "./importExportTools";
// Feature: Receipt branding, payment methods, printer approval, and inventory categories.
export function SettingsModule({ data, user, onRefresh }: { data: AppData; user: UserAccount; onRefresh: () => Promise<void> }) {
  const canEditSystemSettings = user.role === "Owner";
  const settingsFromData = {
    systemName: data.receiptSettings.system_name,
    logoDataUrl: data.receiptSettings.logo_data_url,
    businessName: data.receiptSettings.business_name,
    address: data.receiptSettings.address,
    email: data.receiptSettings.email,
    contactNumber: data.receiptSettings.contact_number,
    taxId: data.receiptSettings.tax_id,
    footerMessage: data.receiptSettings.footer_message,
    showTaxId: Boolean(data.receiptSettings.show_tax_id),
    showCashier: Boolean(data.receiptSettings.show_cashier),
    paperWidth: data.receiptSettings.paper_width,
    receiptTemplate: data.receiptSettings.receipt_template,
    showLaborBreakdown: Boolean(data.receiptSettings.show_labor_breakdown),
    customHeader: data.receiptSettings.custom_header,
    customFooter: data.receiptSettings.custom_footer,
    logoSize: data.receiptSettings.logo_size,
    receiptOutputMode: data.receiptSettings.receipt_output_mode || "PDF",
    receiptPrinterName: data.receiptSettings.receipt_printer_name || ""
  };
  const [settings, setSettings] = useState(settingsFromData);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [printerOptions, setPrinterOptions] = useState<PrinterOption[]>([]);
  const [printerMessage, setPrinterMessage] = useState("");
  const [printerError, setPrinterError] = useState("");
  const [printerApproval, setPrinterApproval] = useState(emptyApproval);
  const [categoryForm, setCategoryForm] = useState({ name: "", code: "" });
  const [categoryMessage, setCategoryMessage] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const emptyPaymentForm = { name: "", paymentCategory: "Manual" as PaymentCategory, description: "" };
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<PaymentMethod | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const savedPaymentForm = editingPaymentMethod ? { name: editingPaymentMethod.name, paymentCategory: editingPaymentMethod.payment_category ?? "Manual", description: editingPaymentMethod.description } : emptyPaymentForm;
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(settingsFromData);
  const paymentFormDirty = showPaymentForm && JSON.stringify(paymentForm) !== JSON.stringify(savedPaymentForm);
  const categoryFormDirty = Boolean(categoryForm.name.trim() || categoryForm.code.trim());
  const printerReasonCount = printerApproval.approvalReason.trim().length;
  useUnsavedChanges("settings", settingsDirty || paymentFormDirty || categoryFormDirty);

  useEffect(() => {
    setSettings(settingsFromData);
  }, [
    data.receiptSettings.system_name,
    data.receiptSettings.logo_data_url,
    data.receiptSettings.business_name,
    data.receiptSettings.address,
    data.receiptSettings.email,
    data.receiptSettings.contact_number,
    data.receiptSettings.tax_id,
    data.receiptSettings.footer_message,
    data.receiptSettings.show_tax_id,
    data.receiptSettings.show_cashier,
    data.receiptSettings.paper_width,
    data.receiptSettings.receipt_template,
    data.receiptSettings.show_labor_breakdown,
    data.receiptSettings.custom_header,
    data.receiptSettings.custom_footer,
    data.receiptSettings.logo_size,
    data.receiptSettings.receipt_output_mode,
    data.receiptSettings.receipt_printer_name
  ]);

  useEffect(() => {
    void refreshPrinters();
  }, []);

  async function refreshPrinters() {
    try {
      const printers = await withTimeout(window.talyer.listPrinters(), "loading printers");
      setPrinterOptions(printers);
    } catch {
      setPrinterOptions([]);
    }
  }

  function exportCsvPackage(kind: "inventory" | "suppliers" | "services" | "history" | "daily") {
    if (kind === "inventory") {
      downloadCsv("talyer-inventory.csv", rowsToCsv(
        ["Product Code", "Name", "Category", "Stock", "Reorder Level", "Unit Cost", "Sell Price", "Supplier"],
        data.inventory.map((item) => [item.product_code, item.name, item.category_name ?? item.category, item.stock, item.reorder_level, item.unit_cost, item.sell_price, item.supplier_name ?? ""])
      ));
    } else if (kind === "suppliers") {
      downloadCsv("talyer-suppliers.csv", rowsToCsv(["Name", "Contact", "Phone"], data.suppliers.map((supplier) => [supplier.name, supplier.contact, supplier.phone])));
    } else if (kind === "services") {
      downloadCsv("talyer-services.csv", rowsToCsv(["Name", "Category", "Duration Minutes", "Price", "Labor Cost"], data.services.map((service) => [service.name, service.category, service.duration_minutes, service.price, service.labor_cost])));
    } else if (kind === "history") {
      downloadCsv("talyer-customer-job-history.csv", rowsToCsv(
        ["Job No", "Customer", "Contact", "Plate", "Motorcycle", "Service", "Mechanic", "Status", "Total", "Created", "Paid"],
        data.jobOrders.map((job) => [job.job_no, job.customer_name, job.contact_number, job.plate_no, job.motorcycle_type, job.service_name, job.mechanic_name, job.status, job.total_amount, job.created_at, job.paid_at ?? ""])
      ));
    } else {
      const salesRows = data.sales.filter((sale) => sale.status === "Completed").map((sale) => [sale.created_at.slice(0, 10), "POS", sale.receipt_no, sale.payment_method, sale.total]);
      const jobRows = data.jobOrders.filter((job) => job.paid_at).map((job) => [(job.paid_at ?? job.created_at).slice(0, 10), "Job", job.job_no, job.payment_method, job.total_amount]);
      downloadCsv("talyer-daily-closing-package.csv", rowsToCsv(["Date", "Source", "Reference", "Payment", "Amount"], [...salesRows, ...jobRows]));
    }
    setMessage("CSV export prepared successfully.");
  }

  async function importSuppliersCsv() {
    setError("");
    try {
      const rows = await readCsvFile();
      for (const row of rows) {
        if (!row.name) continue;
        await withTimeout(window.talyer.createSupplier({ actorId: user.id, name: row.name, contact: row.contact || row["contact person"] || "Imported", phone: row.phone || row["contact number"] || "09170000000" }), "importing suppliers");
      }
      setMessage(`Imported ${rows.length} supplier row(s).`);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to import suppliers CSV."));
    }
  }

  async function importServicesCsv() {
    setError("");
    try {
      const rows = await readCsvFile();
      for (const row of rows) {
        if (!row.name) continue;
        await withTimeout(window.talyer.createService({
          actorId: user.id,
          name: row.name,
          category: row.category || "Maintenance",
          durationMinutes: Number(row["duration minutes"] || row.duration || 30),
          price: Number(row.price || 0),
          laborCost: Number(row["labor cost"] || row.labor || 0)
        }), "importing services");
      }
      setMessage(`Imported ${rows.length} service row(s).`);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to import services CSV."));
    }
  }

  async function importInventoryCsv() {
    setError("");
    try {
      const rows = await readCsvFile();
      for (const row of rows) {
        if (!row.name) continue;
        const categoryName = row.category || "Engine";
        const category = data.inventoryCategories.find((entry) => entry.name.toLowerCase() === categoryName.toLowerCase() || entry.code.toLowerCase() === categoryName.toLowerCase()) ?? data.inventoryCategories[0];
        const supplierName = row.supplier || "";
        const supplier = data.suppliers.find((entry) => entry.name.toLowerCase() === supplierName.toLowerCase());
        if (!category) throw new Error("Create at least one inventory category before importing inventory.");
        await withTimeout(window.talyer.createInventoryItem({
          actorId: user.id,
          categoryId: category.id,
          name: row.name,
          stock: Number(row.stock || 0),
          reorderLevel: Number(row["reorder level"] || row.reorder || 0),
          unitCost: Number(row["unit cost"] || row.cost || 0),
          sellPrice: Number(row["sell price"] || row.price || 0),
          supplierId: supplier?.id ?? null
        }), "importing inventory");
      }
      setMessage(`Imported ${rows.length} inventory row(s).`);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to import inventory CSV."));
    }
  }

  function updateContactNumber(value: string) {
    setSettings({ ...settings, contactNumber: value.replace(/[^0-9()\-\s]/g, "").slice(0, 18) });
  }

  function updateLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose a valid image file for the logo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setSettings((current) => ({ ...current, logoDataUrl: dataUrl }));
      setError("");
    };
    reader.onerror = () => setError("Unable to load that logo file. Please try another image.");
    reader.readAsDataURL(file);
  }

  async function saveSettings() {
    setError("");
    setMessage("");
    if (!settings.systemName.trim()) {
      setError("System name is required.");
      return;
    }
    if (!settings.businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    if (!isValidContactNumber(settings.contactNumber)) {
      setError("Contact number must contain 10 to 11 digits.");
      return;
    }
    if (settings.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    try {
      await withTimeout(window.talyer.updateReceiptSettings({ ...settings, actorId: user.id }), "saving receipt settings");
      setMessage("Settings updated successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save receipt settings. Please check the fields and try again."));
    }
  }

  async function createCategory() {
    setCategoryError("");
    setCategoryMessage("");
    if (!categoryForm.name.trim()) {
      setCategoryError("Category name is required.");
      return;
    }
    if (!categoryForm.code.trim()) {
      setCategoryError("Category code is required.");
      return;
    }
    try {
      await withTimeout(window.talyer.createInventoryCategory({ actorId: user.id, name: categoryForm.name, code: categoryForm.code }), "creating category");
      setCategoryForm({ name: "", code: "" });
      setCategoryMessage("Category created successfully.");
      await onRefresh();
    } catch (caught) {
      setCategoryError(friendlyError(caught, "Unable to create category. Name and code must be unique."));
    }
  }

  async function savePrinterSettings() {
    setPrinterError("");
    setPrinterMessage("");
    const approvalError = approvalValidationError(printerApproval);
    if (approvalError) {
      setPrinterError(approvalError);
      return;
    }
    if (settings.receiptOutputMode === "Printer" && !printerOptions.some((printer) => printer.name === settings.receiptPrinterName)) {
      setPrinterError("Selected printer is unavailable. Choose another printer or Save as PDF.");
      return;
    }
    try {
      await withTimeout(window.talyer.updatePrinterSettings({
        actorId: user.id,
        outputMode: settings.receiptOutputMode,
        printerName: settings.receiptOutputMode === "Printer" ? settings.receiptPrinterName : "",
        ...printerApproval
      }), "saving printer settings");
      setPrinterMessage("Printer settings updated successfully.");
      setPrinterApproval(emptyApproval);
      await onRefresh();
    } catch (caught) {
      setPrinterError(friendlyError(caught, "Unable to save printer settings. Please choose a valid option."));
    }
  }

  async function deleteCategory(category: InventoryCategory) {
    const confirmed = window.confirm(`Delete category ${category.name} (${category.code})? This is allowed only when no inventory items use it.`);
    if (!confirmed) return;
    setCategoryError("");
    setCategoryMessage("");
    try {
      await withTimeout(window.talyer.deleteInventoryCategory({ actorId: user.id, categoryId: category.id }), "deleting category");
      setCategoryMessage("Category deleted successfully.");
      await onRefresh();
    } catch (caught) {
      setCategoryError(friendlyError(caught, "Unable to delete category. Remove or recategorize its inventory items first."));
    }
  }

  function openPaymentCreate() {
    setEditingPaymentMethod(null);
    setPaymentForm(emptyPaymentForm);
    setPaymentError("");
    setPaymentMessage("");
    setShowPaymentForm(true);
  }

  function openPaymentEdit(method: PaymentMethod) {
    setEditingPaymentMethod(method);
    setPaymentForm({ name: method.name, paymentCategory: method.payment_category ?? "Manual", description: method.description });
    setPaymentError("");
    setPaymentMessage("");
    setShowPaymentForm(true);
  }

  async function savePaymentMethod() {
    setPaymentError("");
    setPaymentMessage("");
    if (!paymentForm.name.trim()) {
      setPaymentError("Payment method name is required.");
      return;
    }
    if (!paymentForm.paymentCategory) {
      setPaymentError("Payment category is required.");
      return;
    }
    try {
      if (editingPaymentMethod) {
        await withTimeout(window.talyer.updatePaymentMethod({
          actorId: user.id,
          methodId: editingPaymentMethod.id,
          ...paymentForm
        }), "updating payment method");
        setPaymentMessage("Payment method updated successfully.");
      } else {
        await withTimeout(window.talyer.createPaymentMethod({ actorId: user.id, ...paymentForm }), "creating payment method");
        setPaymentMessage("Payment method added successfully.");
      }
      setShowPaymentForm(false);
      setPaymentForm(emptyPaymentForm);
      setEditingPaymentMethod(null);
      await onRefresh();
    } catch (caught) {
      setPaymentError(friendlyError(caught, "Unable to save payment method. Name must be unique and payment category is required."));
    }
  }

  async function togglePaymentMethod(method: PaymentMethod) {
    setPaymentError("");
    setPaymentMessage("");
    const nextStatus = method.status === "Active" ? "Inactive" : "Active";
    try {
      await withTimeout(window.talyer.setPaymentMethodStatus({ actorId: user.id, methodId: method.id, status: nextStatus }), "updating payment method status");
      setPaymentMessage(nextStatus === "Active" ? "Payment method enabled successfully." : "Payment method disabled successfully.");
      await onRefresh();
    } catch (caught) {
      setPaymentError(friendlyError(caught, "Unable to update payment method status."));
    }
  }

  async function deletePaymentMethod(method: PaymentMethod) {
    const confirmed = window.confirm(`Delete payment method ${method.name}? This is allowed only when it has not been used in transactions.`);
    if (!confirmed) return;
    setPaymentError("");
    setPaymentMessage("");
    try {
      await withTimeout(window.talyer.deletePaymentMethod({ actorId: user.id, methodId: method.id }), "deleting payment method");
      setPaymentMessage("Payment method deleted successfully.");
      await onRefresh();
    } catch (caught) {
      setPaymentError(friendlyError(caught, "Unable to delete payment method. It may already be used in past transactions."));
    }
  }

  const previewSettings: ReceiptSettings = {
    id: data.receiptSettings.id,
    system_name: settings.systemName,
    logo_data_url: settings.logoDataUrl,
    business_name: settings.businessName,
    address: settings.address,
    email: settings.email,
    contact_number: settings.contactNumber,
    tax_id: settings.taxId,
    footer_message: settings.footerMessage,
    show_tax_id: settings.showTaxId ? 1 : 0,
    show_cashier: settings.showCashier ? 1 : 0,
    paper_width: settings.paperWidth,
    receipt_template: settings.receiptTemplate,
    show_labor_breakdown: settings.showLaborBreakdown ? 1 : 0,
    custom_header: settings.customHeader,
    custom_footer: settings.customFooter,
    logo_size: settings.logoSize,
    receipt_output_mode: settings.receiptOutputMode,
    receipt_printer_name: settings.receiptPrinterName
  };

  const preview = buildReceiptHtml(previewSettings, {
    receiptNo: "SAMPLE-0001",
    cashierName: user.name,
    customerName: "Sample Customer",
    transactionType: "POS Sale",
    paymentMethod: "Cash",
    createdAt: new Date(),
    lines: [
      { name: "Engine Oil", quantity: 1, unitPrice: 320 },
      { name: "Brake Pad Set", quantity: 2, unitPrice: 480 }
    ],
    subtotal: 1280,
    total: 1280,
    breakdown: {
      servicePrice: 450,
      laborCost: 350,
      additionalLaborCost: 150,
      productsTotal: 1280
    }
  });

  return (
    <div className="settings-layout">
      <ToastBridge success={message || paymentMessage || printerMessage || categoryMessage} error={error || paymentError || printerError || categoryError} />
      <div className="settings-stack">
        {(user.role === "Owner" || user.role === "Admin") && (
          <section className="panel settings-panel import-export-panel">
            <div className="panel-head">
              <h2>Import / Export Tools</h2>
              <Badge>CSV</Badge>
            </div>
            <div className="detail-grid import-export-summary">
              <span>Inventory export <b>{data.inventory.length} items</b></span>
              <span>Suppliers export <b>{data.suppliers.length} records</b></span>
              <span>Service catalog <b>{data.services.length} services</b></span>
              <span>Customer/job history <b>{data.jobOrders.length} jobs</b></span>
            </div>
            <div className="import-export-actions export-actions">
              <button className="secondary-button compact-button" onClick={() => exportCsvPackage("inventory")}>Export Inventory</button>
              <button className="secondary-button compact-button" onClick={() => exportCsvPackage("suppliers")}>Export Suppliers</button>
              <button className="secondary-button compact-button" onClick={() => exportCsvPackage("services")}>Export Services</button>
              <button className="secondary-button compact-button" onClick={() => exportCsvPackage("history")}>Export Customer / Job History</button>
              <button className="secondary-button compact-button" onClick={() => exportCsvPackage("daily")}>Export Daily Closing Package</button>
            </div>
            <div className="import-export-actions import-actions">
              <button className="primary-button compact-button" onClick={importInventoryCsv}>Import Inventory CSV</button>
              <button className="primary-button compact-button" onClick={importSuppliersCsv}>Import Suppliers CSV</button>
              <button className="primary-button compact-button" onClick={importServicesCsv}>Import Services CSV</button>
            </div>
          </section>
        )}
        {canEditSystemSettings && (
          <>
            <section className="panel settings-panel">
              <div className="panel-head">
                <h2>System Settings</h2>
                <Badge>App Only</Badge>
              </div>
              <div className="form-grid">
                <label className="field">
                  System Name
                  <input value={settings.systemName} onChange={(event) => setSettings({ ...settings, systemName: event.target.value })} />
                </label>
                <label className="field">
                  System Logo
                  <input type="file" accept="image/*" onChange={updateLogo} />
                </label>
                {settings.logoDataUrl && (
                  <div className="logo-preview form-wide">
                    <img src={settings.logoDataUrl} alt="" />
                    <button className="table-action danger-action" onClick={() => setSettings({ ...settings, logoDataUrl: "" })}>Remove Logo</button>
                  </div>
                )}
              </div>
            </section>
            <section className="panel settings-panel">
              <div className="panel-head">
                <h2>Receipt Settings</h2>
                <Badge>Receipt Only</Badge>
              </div>
              <div className="form-grid">
                <label className="field">
                  Business Name
                  <input value={settings.businessName} onChange={(event) => setSettings({ ...settings, businessName: event.target.value })} />
                </label>
                <label className="field">
                  Contact Number
                  <input value={settings.contactNumber} onChange={(event) => updateContactNumber(event.target.value)} inputMode="tel" maxLength={18} placeholder="(02) 8123-4567" />
                </label>
                <label className="field">
                  Email Address
                  <input value={settings.email} onChange={(event) => setSettings({ ...settings, email: event.target.value })} placeholder="shop@example.com" />
                </label>
                <label className="field form-wide">
                  Address
                  <input value={settings.address} onChange={(event) => setSettings({ ...settings, address: event.target.value })} />
                </label>
                <label className="field">
                  Tax ID / TIN
                  <input value={settings.taxId} onChange={(event) => setSettings({ ...settings, taxId: event.target.value })} />
                </label>
                <label className="field form-wide">
                  Footer Message
                  <input value={settings.footerMessage} onChange={(event) => setSettings({ ...settings, footerMessage: event.target.value })} />
                </label>
                <label className="field">
                  Paper Size
                  <select value={settings.paperWidth} onChange={(event) => setSettings({ ...settings, paperWidth: Number(event.target.value) as 58 | 80 | 216 })}>
                    <option value={58}>58mm Thermal</option>
                    <option value={80}>80mm Thermal</option>
                    <option value={216}>Letter</option>
                  </select>
                </label>
                <label className="field">
                  Receipt Template
                  <select value={settings.receiptTemplate} onChange={(event) => setSettings({ ...settings, receiptTemplate: event.target.value as "Compact" | "Detailed" })}>
                    <option>Detailed</option>
                    <option>Compact</option>
                  </select>
                </label>
                <label className="field">
                  Logo Size
                  <select value={settings.logoSize} onChange={(event) => setSettings({ ...settings, logoSize: event.target.value as "Small" | "Medium" | "Large" })}>
                    <option>Small</option>
                    <option>Medium</option>
                    <option>Large</option>
                  </select>
                </label>
                <label className="field form-wide">
                  Custom Header
                  <input value={settings.customHeader} onChange={(event) => setSettings({ ...settings, customHeader: event.target.value })} placeholder="Optional header text under business name" />
                </label>
                <label className="field form-wide">
                  Custom Footer
                  <input value={settings.customFooter} onChange={(event) => setSettings({ ...settings, customFooter: event.target.value })} placeholder="Optional footer override" />
                </label>
                <label className="check-field">
                  <input type="checkbox" checked={settings.showTaxId} onChange={(event) => setSettings({ ...settings, showTaxId: event.target.checked })} />
                  Show Tax ID
                </label>
                <label className="check-field">
                  <input type="checkbox" checked={settings.showCashier} onChange={(event) => setSettings({ ...settings, showCashier: event.target.checked })} />
                  Show cashier name
                </label>
                <label className="check-field">
                  <input type="checkbox" checked={settings.showLaborBreakdown} onChange={(event) => setSettings({ ...settings, showLaborBreakdown: event.target.checked })} />
                  Show labor breakdown
                </label>
              </div>
            </section>
            <button className="primary-button" onClick={saveSettings}>Save Settings</button>
            {error && <span className="form-error">{error}</span>}
            <section className="panel settings-panel">
              <div className="panel-head">
                <h2>Payment Methods</h2>
                <button className="primary-button compact-button" onClick={openPaymentCreate}>Add Payment Method</button>
              </div>
              {paymentError && <span className="form-error">{paymentError}</span>}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Payment Method Name</th>
                      <th>Payment Category</th>
                      <th>Status</th>
                      <th>Description</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.paymentMethods.map((method) => (
                      <tr key={method.id}>
                        <td>{method.name}</td>
                        <td><Badge tone={method.payment_category === "Digital" ? "warn" : "good"}>{method.payment_category}</Badge></td>
                        <td><Badge tone={method.status === "Active" ? "good" : "danger"}>{method.status}</Badge></td>
                        <td>{method.description || "None"}</td>
                        <td>
                          <div className="table-actions">
                            <button className="table-action" onClick={() => openPaymentEdit(method)}><Pencil size={15} /> Edit</button>
                            <button className={method.status === "Active" ? "table-action danger-action" : "table-action success-action"} onClick={() => togglePaymentMethod(method)}>
                              {method.status === "Active" ? "Disable" : "Enable"}
                            </button>
                            <button className="table-action danger-action" onClick={() => deletePaymentMethod(method)}><Trash2 size={15} /> Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {data.paymentMethods.length === 0 && (
                      <tr>
                        <td colSpan={5}>No payment methods configured.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            {showPaymentForm && (
              <div className="modal-backdrop">
                <section className="modal-window">
                  <div className="panel-head">
                    <h2>{editingPaymentMethod ? "Edit Payment Method" : "Add Payment Method"}</h2>
                    <button className="table-action" onClick={() => {
                      if (confirmDiscardChanges(paymentFormDirty)) {
                        setShowPaymentForm(false);
                        setEditingPaymentMethod(null);
                        setPaymentForm(emptyPaymentForm);
                        setPaymentError("");
                      }
                    }}>Close</button>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      Payment Method Name
                      <input value={paymentForm.name} onChange={(event) => setPaymentForm({ ...paymentForm, name: event.target.value })} placeholder="GCash" autoFocus />
                    </label>
                    <label className="field">
                      Payment Category
                      <select value={paymentForm.paymentCategory} onChange={(event) => setPaymentForm({ ...paymentForm, paymentCategory: event.target.value as PaymentCategory })}>
                        <option>Manual</option>
                        <option>Digital</option>
                      </select>
                    </label>
                    <label className="field form-wide">
                      Description
                      <input value={paymentForm.description} onChange={(event) => setPaymentForm({ ...paymentForm, description: event.target.value })} placeholder="Optional" />
                    </label>
                  </div>
                  <button className="primary-button" onClick={savePaymentMethod}>{editingPaymentMethod ? "Save Payment Method" : "Add Payment Method"}</button>
                  {paymentError && <span className="form-error">{paymentError}</span>}
                </section>
              </div>
            )}
          </>
        )}
        <section className="panel settings-panel">
          <div className="panel-head">
            <h2>Printer Settings</h2>
            <button className="table-action" onClick={refreshPrinters}>Refresh Printers</button>
          </div>
          <label className="field">
            Receipt Output
            <select
              value={settings.receiptOutputMode === "Printer" ? settings.receiptPrinterName : "PDF"}
              onChange={(event) => {
                if (event.target.value === "PDF") {
                  setSettings({ ...settings, receiptOutputMode: "PDF", receiptPrinterName: "" });
                } else {
                  setSettings({ ...settings, receiptOutputMode: "Printer", receiptPrinterName: event.target.value });
                }
              }}
            >
              <option value="PDF">Save as PDF</option>
              {printerOptions.map((printer) => (
                <option value={printer.name} key={printer.name}>
                  {printer.name}{printer.isDefault ? " (Default)" : ""}
                </option>
              ))}
            </select>
          </label>
          {settings.receiptOutputMode === "Printer" && !printerOptions.some((printer) => printer.name === settings.receiptPrinterName) && (
            <span className="form-error">Selected printer is unavailable. Receipts will fall back to PDF until a valid printer is selected.</span>
          )}
          <div className="approval-box">
            <strong>Approval Required</strong>
            <div className="approval-summary">
              <span>Action <b>Update printer settings</b></span>
              <span>Output <b>{settings.receiptOutputMode}</b></span>
              <span>Printer <b>{settings.receiptOutputMode === "Printer" ? settings.receiptPrinterName || "None selected" : "Save as PDF"}</b></span>
            </div>
            <ApprovalFields value={printerApproval} onChange={setPrinterApproval} reasonHint={`${printerReasonCount}/10 minimum`} reasonPlaceholder="Reason for changing printer settings" />
          </div>
          <button className="primary-button" disabled={!approvalReady(printerApproval)} onClick={savePrinterSettings}>Save Printer Settings</button>
          {printerError && <span className="form-error">{printerError}</span>}
        </section>
        <section className="panel settings-panel">
          <div className="panel-head">
            <h2>Inventory Categories</h2>
            <Badge>Product Codes</Badge>
          </div>
          <div className="form-grid">
            <label className="field">
              Category Name
              <input value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="Engine" />
            </label>
            <label className="field">
              Category Code
              <input value={categoryForm.code} onChange={(event) => setCategoryForm({ ...categoryForm, code: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="ENG" />
            </label>
          </div>
          <button className="secondary-button" onClick={createCategory}>Add Category</button>
          {categoryError && <span className="form-error">{categoryError}</span>}
          <div className="category-list">
            {data.inventoryCategories.map((category) => (
              <div className="category-row" key={category.id}>
                <strong>{category.name}</strong>
                <div className="category-actions">
                  <Badge>{category.code}</Badge>
                  <button className="table-action danger-action" onClick={() => deleteCategory(category)}>
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel receipt-preview-panel">
        <div className="panel-head">
          <h2>Receipt Preview</h2>
          <button className="secondary-button" onClick={async () => {
            setError("");
            try {
              await printOrSaveReceiptPdf(preview, "sample-receipt");
            } catch (caught) {
              setError(friendlyError(caught, "Unable to print or save the sample receipt right now."));
            }
          }}>Test Print</button>
        </div>
        <iframe className="receipt-preview" title="Receipt preview" srcDoc={preview} />
      </section>
    </div>
  );
}

