import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { AlertCircle, Boxes, BriefcaseBusiness, CheckCircle2, ClipboardList, Download, Gauge, KeyRound, LogOut, PackagePlus, Pencil, Printer, ReceiptText, Search, Settings, ShieldCheck, ShoppingCart, Trash2, UserCheck, UserMinus, UserPlus, Users, Wrench, X } from "lucide-react";
import { Badge } from "../components/Badge";
import { DataTable } from "../components/DataTable";
import { StatCard } from "../components/StatCard";
import { canAccess, modulesFor, type ModuleKey } from "../data/permissions";
import type { AppData, CartItem, CreateUserPayload, Expense, InventoryAdjustment, InventoryCategory, InventoryItem, JobOrder, JobProduct, JobStatusHistory, PaymentCategory, PaymentMethod, PrinterOption, ReceiptSettings, Role, Sale, SaleItem, Service, Supplier, SuperAdminData, SuperAdminSettings, SystemLog, UserAccount } from "../types/global";
import "./styles.css";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const REQUEST_TIMEOUT_MS = 12000;
const PAGE_SIZE = 10;

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function valueMatchesSearch(searchTerm: string, values: Array<string | number | null | undefined>) {
  const query = normalizeSearch(searchTerm);
  if (!query) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

function dateInputValue(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayInputValue() {
  return dateInputValue(new Date());
}

function rowMatchesDate(value: Date | string | undefined, dateFilter: string) {
  if (!dateFilter || !value) return true;
  return dateInputValue(value) === dateFilter;
}

function rowMatchesDateRange(value: Date | string | undefined, startDate: string, endDate: string) {
  if (!value) return false;
  const dateValue = dateInputValue(value);
  if (startDate && dateValue < startDate) return false;
  if (endDate && dateValue > endDate) return false;
  return true;
}

function escapeHtml(value: string | number | undefined | null) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] ?? char));
}

function useFilteredPagination<T>(rows: T[], dependencies: unknown[] = []) {
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  useEffect(() => {
    setPage(1);
    setIsLoading(true);
    const timeout = window.setTimeout(() => setIsLoading(false), 140);
    return () => window.clearTimeout(timeout);
  }, dependencies);

  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  return { page: currentPage, pageCount, pagedRows, setPage, isLoading };
}

function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatDateOnly(value: Date | string) {
  return formatDateTime(value).slice(0, 10);
}

function formatTimeOnly(value: Date | string) {
  return formatDateTime(value).slice(11);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

const emptyApproval = { approvalUsername: "", approvalPassword: "", approvalReason: "" };

async function withTimeout<T>(operation: Promise<T>, label = "request", timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function friendlyError(caught: unknown, fallback: string) {
  const message = caught instanceof Error ? caught.message : String(caught ?? "");
  const lower = message.toLowerCase();

  if (lower.includes("timed out")) return "This is taking longer than expected. Please try again.";
  if (lower.includes("invalid username") || lower.includes("inactive account")) return "The username or password is incorrect, or the account is disabled.";
  if (lower.includes("current password is incorrect")) return "The temporary or current password is incorrect.";
  if (lower.includes("username already exists")) return "That username is already taken. Please choose another one.";
  if (lower.includes("contact number")) return "Contact number must contain 10 to 11 digits. You may use spaces, parentheses, or dashes.";
  if (lower.includes("email address")) return "Please enter a valid email address.";
  if (lower.includes("required")) return message;
  if (lower.includes("only owner")) return "Only an Owner account can perform this action.";
  if (lower.includes("already disabled")) return "This account is already disabled.";
  if (lower.includes("already active")) return "This account is already active.";
  if (lower.includes("payment method name")) return "Payment method name is required and must be unique.";
  if (lower.includes("active payment method")) return "Please select an active payment method.";
  if (lower.includes("payment method is used")) return "This payment method is used in past transactions and cannot be deleted.";
  if (lower.includes("approval")) return "Owner or Admin approval is required. Please check the approver credentials and reason.";
  if (lower.includes("service management is not loaded")) return "Service management was updated. Please restart the app, then try again.";
  if (lower.includes("service is already used")) return "This service is already used in job orders and cannot be deleted.";
  if (lower.includes("service")) return message;
  if (lower.includes("mechanic management is not loaded")) return "Mechanics management was updated. Please restart the app, then try again.";
  if (lower.includes("mechanic is assigned")) return "This mechanic is assigned to job orders and cannot be deleted.";
  if (lower.includes("mechanic")) return message;
  if (lower.includes("supplier management is not loaded")) return "Supplier management was updated. Please restart the app, then try again.";
  if (lower.includes("supplier is linked")) return "This supplier is linked to inventory items and cannot be deleted.";
  if (lower.includes("supplier name")) return "Supplier name is required and must be unique.";
  if (lower.includes("contact person")) return "Contact person is required.";
  if (lower.includes("supplier")) return message;
  if (lower.includes("paid job orders")) return "This job order has already been paid and can no longer be edited.";
  if (lower.includes("already been paid")) return "This job order has already been paid.";
  if (lower.includes("out of stock")) return message;
  if (lower.includes("job order was not found")) return "We could not find that job order. Please refresh and try again.";
  if (lower.includes("save was canceled")) return "Receipt save was canceled. You can try again when ready.";
  if (lower.includes("printer") || lower.includes("pdf")) return "The receipt could not be printed. Please save it as PDF instead.";
  if (lower.includes("reference code")) return "Reference code is required for digital payments.";
  if (lower.includes("failed to fetch") || lower.includes("econn") || lower.includes("network")) return "The system could not complete the request. Please check the app connection and try again.";

  return fallback;
}

function contactDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidContactNumber(value: string) {
  const digits = contactDigits(value);
  return digits.length >= 10 && digits.length <= 11;
}

function confirmDiscardChanges(isDirty: boolean) {
  return !isDirty || window.confirm("You have unsaved changes. Close without saving?");
}

function approvalValidationError(approval: typeof emptyApproval) {
  if (!approval.approvalUsername.trim()) return "Approver username is required.";
  if (!approval.approvalPassword.trim()) return "Approver password is required.";
  if (!approval.approvalReason.trim()) return "Approval reason is required.";
  return "";
}

interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
}

interface ReceiptBreakdown {
  servicePrice: number;
  laborCost: number;
  additionalLaborCost: number;
  productsTotal: number;
}

interface ReceiptBuildInput {
  receiptNo: string;
  cashierName?: string;
  customerName?: string;
  transactionType: string;
  paymentMethod: string;
  paymentCategory?: string;
  paymentReferenceCode?: string;
  createdAt: Date;
  lines: ReceiptLine[];
  subtotal: number;
  total: number;
  breakdown?: ReceiptBreakdown;
}

type ToastTone = "success" | "error";

interface ToastNotice {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  notify: (tone: ToastTone, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const DirtyContext = createContext<{ isDirty: boolean; setDirty: (key: string, dirty: boolean) => void } | null>(null);

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((tone: ToastTone, message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current.slice(-3), { id, tone, message: trimmed }]);
    window.setTimeout(() => dismiss(id), tone === "error" ? 6200 : 4200);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function DirtyProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<string[]>([]);

  const setDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((current) => {
      const exists = current.includes(key);
      if (dirty && !exists) return [...current, key];
      if (!dirty && exists) return current.filter((item) => item !== key);
      return current;
    });
  }, []);

  const value = useMemo(() => ({ isDirty: dirtyKeys.length > 0, setDirty }), [dirtyKeys.length, setDirty]);

  useEffect(() => {
    if (dirtyKeys.length === 0) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirtyKeys.length]);

  return (
    <DirtyContext.Provider value={value}>
      {children}
    </DirtyContext.Provider>
  );
}

function useUnsavedChanges(key: string, dirty: boolean) {
  const context = useContext(DirtyContext);

  useEffect(() => {
    context?.setDirty(key, dirty);
    return () => context?.setDirty(key, false);
  }, [context, dirty, key]);
}

function useToast() {
  const context = useContext(ToastContext);
  if (!context) return { notify: (_tone: ToastTone, _message: string) => undefined };
  return context;
}

function ToastBridge({ success, error }: { success?: string; error?: string }) {
  const { notify } = useToast();

  useEffect(() => {
    if (success) notify("success", success);
  }, [notify, success]);

  useEffect(() => {
    if (error) notify("error", error);
  }, [notify, error]);

  return null;
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastNotice[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id}>
          {toast.tone === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{toast.message}</span>
          <button className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function buildReceiptHtml(settings: ReceiptSettings, receipt: ReceiptBuildInput) {
  const widthMm = 216;
  const heightMm = 279;
  const safe = (value: string | number | undefined) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] ?? char));
  const rows = receipt.lines.map((line, index) => `
    <tr>
      <td class="muted">${index + 1}</td>
      <td>${safe(line.name)}</td>
      <td class="right">${safe(String(line.quantity))}</td>
      <td class="right">${safe(money.format(line.unitPrice))}</td>
      <td class="right">${safe(money.format(line.quantity * line.unitPrice))}</td>
    </tr>
  `).join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${safe(receipt.receiptNo)}</title>
        <meta name="receipt-width-mm" content="${widthMm}" />
        <meta name="receipt-height-mm" content="${heightMm}" />
        <style>
          @page { size: letter; margin: 0; }
          * { box-sizing: border-box; }
          html, body { min-height: ${heightMm}mm; }
          body {
            width: ${widthMm}mm;
            margin: 0;
            color: #171512;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
          }
          .page {
            display: grid;
            min-height: ${heightMm}mm;
            grid-template-rows: auto auto 1fr auto;
            padding: 18mm;
          }
          .topbar {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 3px solid #dc382a;
            padding-bottom: 18px;
          }
          .brand h1 {
            margin: 0 0 8px;
            color: #171512;
            font-size: 28px;
            letter-spacing: 0;
            text-transform: uppercase;
          }
          .brand p,
          .meta p,
          .party p,
          .footer p {
            margin: 3px 0;
          }
          .receipt-title {
            min-width: 210px;
            text-align: right;
          }
          .receipt-title h2 {
            margin: 0 0 8px;
            color: #dc382a;
            font-size: 30px;
            text-transform: uppercase;
          }
          .receipt-title strong {
            display: block;
            font-size: 16px;
          }
          .muted {
            color: #706a61;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 18px;
            margin: 24px 0;
          }
          .box {
            border: 1px solid #ded5c9;
            border-radius: 6px;
            padding: 14px;
          }
          .box h3 {
            margin: 0 0 10px;
            color: #dc382a;
            font-size: 13px;
            text-transform: uppercase;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            border-bottom: 1px solid #eee5d8;
            padding: 5px 0;
          }
          .meta-row:last-child {
            border-bottom: 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            background: #211f1b;
            color: #fff;
            font-size: 12px;
            text-align: left;
            text-transform: uppercase;
          }
          th,
          td {
            padding: 11px 10px;
            border-bottom: 1px solid #eee5d8;
            vertical-align: top;
          }
          .right {
            text-align: right;
          }
          .totals {
            display: grid;
            justify-content: end;
            margin-top: 20px;
          }
          .totals table {
            width: 270px;
          }
          .totals td {
            padding: 8px 10px;
          }
          .grand-total td {
            border-top: 2px solid #211f1b;
            border-bottom: 0;
            color: #dc382a;
            font-size: 18px;
            font-weight: 800;
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 42px;
            margin-top: 38px;
          }
          .signature-line {
            border-top: 1px solid #211f1b;
            padding-top: 8px;
            text-align: center;
          }
          .footer {
            border-top: 1px solid #ded5c9;
            margin-top: 26px;
            padding-top: 12px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <main id="print-receipt" class="page">
          <section class="topbar">
            <div class="brand">
              <h1>${safe(settings.business_name)}</h1>
              <p>${safe(settings.address)}</p>
              ${settings.email ? `<p>${safe(settings.email)}</p>` : ""}
              <p>${safe(settings.contact_number)}</p>
              ${settings.show_tax_id ? `<p>${safe(settings.tax_id)}</p>` : ""}
            </div>
            <div class="receipt-title">
              <h2>Receipt</h2>
              <strong>${safe(receipt.receiptNo)}</strong>
              <p class="muted">${safe(receipt.transactionType)}</p>
            </div>
          </section>

          <section class="info-grid">
            <div class="box party">
              <h3>Customer / Job Details</h3>
              <p><strong>${safe(receipt.customerName || "Walk-in Customer")}</strong></p>
              <p class="muted">Transaction Type: ${safe(receipt.transactionType)}</p>
            </div>
            <div class="box meta">
              <h3>Transaction Information</h3>
              <div class="meta-row"><span>Receipt No.</span><strong>${safe(receipt.receiptNo)}</strong></div>
              <div class="meta-row"><span>Date</span><strong>${safe(formatDateOnly(receipt.createdAt))}</strong></div>
              <div class="meta-row"><span>Time</span><strong>${safe(formatTimeOnly(receipt.createdAt))}</strong></div>
              ${settings.show_cashier ? `<div class="meta-row"><span>Cashier</span><strong>${safe(receipt.cashierName)}</strong></div>` : ""}
              <div class="meta-row"><span>Payment Method</span><strong>${safe(receipt.paymentMethod)}</strong></div>
              ${receipt.paymentCategory === "Digital" && receipt.paymentReferenceCode ? `<div class="meta-row"><span>Reference Code</span><strong>${safe(receipt.paymentReferenceCode)}</strong></div>` : ""}
            </div>
          </section>

          <section>
            <table>
              <thead>
                <tr>
                  <th style="width: 52px;">No.</th>
                  <th>Description</th>
                  <th class="right" style="width: 86px;">Qty</th>
                  <th class="right" style="width: 130px;">Unit Price</th>
                  <th class="right" style="width: 130px;">Amount</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            ${receipt.breakdown ? `
              <div class="totals">
                <table>
                  <tr><td>Service Cost</td><td class="right">${safe(money.format(receipt.breakdown.servicePrice))}</td></tr>
                  <tr><td>Labor Cost</td><td class="right">${safe(money.format(receipt.breakdown.laborCost))}</td></tr>
                  <tr><td>Additional Labor Cost</td><td class="right">${safe(money.format(receipt.breakdown.additionalLaborCost))}</td></tr>
                  <tr><td>Products Total</td><td class="right">${safe(money.format(receipt.breakdown.productsTotal))}</td></tr>
                </table>
              </div>
            ` : ""}
            <div class="totals">
              <table>
                <tr><td>Subtotal</td><td class="right">${safe(money.format(receipt.subtotal))}</td></tr>
                <tr><td>Payment</td><td class="right">${safe(receipt.paymentMethod)}</td></tr>
                ${receipt.paymentCategory === "Digital" && receipt.paymentReferenceCode ? `<tr><td>Reference</td><td class="right">${safe(receipt.paymentReferenceCode)}</td></tr>` : ""}
                <tr class="grand-total"><td>Total</td><td class="right">${safe(money.format(receipt.total))}</td></tr>
              </table>
          </section>

          <section class="footer">
            <p>${safe(settings.footer_message || "Thank you for your business.")}</p>
          </section>
        </main>
      </body>
    </html>`;
}

async function printOrSaveReceiptPdf(html: string, receiptNo: string) {
  const printed = await withTimeout(window.talyer.printReceipt({ html }), "printing receipt");
  if (printed) return;
  const saved = await withTimeout(window.talyer.saveReceiptPdf({ html, receiptNo }), "saving receipt PDF");
  if (!saved) throw new Error("Receipt PDF save was canceled.");
}

const moduleLabels: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  pos: "POS",
  inventory: "Inventory",
  jobs: "Job Orders",
  services: "Services",
  staff: "Mechanics",
  suppliers: "Suppliers",
  reports: "Reports",
  users: "Users",
  settings: "Settings",
  audit: "Audit Logs"
};

const moduleIcons: Record<ModuleKey, ReactNode> = {
  dashboard: <Gauge size={18} />,
  pos: <ShoppingCart size={18} />,
  inventory: <Boxes size={18} />,
  jobs: <ClipboardList size={18} />,
  services: <Wrench size={18} />,
  staff: <BriefcaseBusiness size={18} />,
  suppliers: <PackagePlus size={18} />,
  reports: <ReceiptText size={18} />,
  users: <ShieldCheck size={18} />,
  settings: <Settings size={18} />,
  audit: <ClipboardList size={18} />
};

function appInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "TP";
}

function Brand({ settings, subtitle, large = false }: { settings?: ReceiptSettings; subtitle: string; large?: boolean }) {
  const systemName = settings?.system_name || "TalyerPOS";
  return (
    <div className={large ? "brand large" : "brand"}>
      <div className={settings?.logo_data_url ? "brand-mark logo-mark" : "brand-mark"}>
        {settings?.logo_data_url ? <img src={settings.logo_data_url} alt="" /> : appInitials(systemName)}
      </div>
      <div>
        <strong>{systemName}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

function AppContent() {
  const dirtyContext = useContext(DirtyContext);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pendingPasswordUser, setPendingPasswordUser] = useState<UserAccount | null>(null);
  const [loginError, setLoginError] = useState("");
  const [dataError, setDataError] = useState("");
  const [data, setData] = useState<AppData | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [globalSearch, setGlobalSearch] = useState("");

  async function refresh() {
    try {
      const next = await withTimeout(window.talyer.listData(), "loading shop data");
      setData(next);
      setDataError("");
    } catch (caught) {
      setDataError(friendlyError(caught, "Unable to load records. Please try again."));
    }
  }

  useEffect(() => {
    if (user) void refresh();
  }, [user]);

  useEffect(() => {
    if (!data) void refresh();
  }, []);

  useEffect(() => {
    if (data?.receiptSettings.system_name) document.title = data.receiptSettings.system_name;
  }, [data?.receiptSettings.system_name]);

  async function handleLogin(demo?: { username: string; password: string }) {
    try {
      const account = await withTimeout(window.talyer.login(demo ?? { username, password }), "login");
      if (!account) {
        setLoginError("The username or password is incorrect, or the account is disabled.");
        return;
      }
      if (account.must_change_password) {
        setPendingPasswordUser(account);
        setLoginError("");
        return;
      }
      setUser(account);
      setActiveModule("dashboard");
      setUsername("");
      setPassword("");
      setLoginError("");
    } catch (caught) {
      setLoginError(friendlyError(caught, "Unable to sign in right now. Please try again."));
    }
  }

  if (!user) {
    if (pendingPasswordUser) {
      return (
        <PasswordChangeScreen
          settings={data?.receiptSettings}
          user={pendingPasswordUser}
          onCancel={() => setPendingPasswordUser(null)}
          onChanged={(updatedUser) => {
            setUser(updatedUser);
            setPendingPasswordUser(null);
            setActiveModule("dashboard");
          }}
        />
      );
    }
    return <LoginScreen settings={data?.receiptSettings} trialSettings={data?.superAdminSettings} username={username} password={password} setUsername={setUsername} setPassword={setPassword} loginError={loginError} onLogin={handleLogin} />;
  }

  if (!data) {
    return (
      <div className="loading">
        <ToastBridge error={dataError} />
        {dataError ? (
          <div className="load-error">
            <span className="form-error">{dataError}</span>
            <button className="primary-button" onClick={() => void refresh()}>Try Again</button>
          </div>
        ) : "Loading local shop data..."}
      </div>
    );
  }

  if (user.role === "SuperAdmin") {
    return <SuperAdminConsole user={user} settings={data.receiptSettings} onSignOut={() => setUser(null)} />;
  }

  const allowedModules = modulesFor(user.role);
  const visibleModule = canAccess(user.role, activeModule) ? activeModule : allowedModules[0];
  function changeModule(module: ModuleKey) {
    if (module === visibleModule) return;
    if (confirmDiscardChanges(Boolean(dirtyContext?.isDirty))) setActiveModule(module);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand settings={data.receiptSettings} subtitle="Repair Shop POS + IMS" />
        <nav>
          {allowedModules.map((module) => (
            <button className={visibleModule === module ? "active" : ""} key={module} onClick={() => changeModule(module)}>
              {moduleIcons[module]}
              {moduleLabels[module]}
            </button>
          ))}
        </nav>
        <div className="session-card">
          <span>Signed in</span>
          <strong>{user.name}</strong>
          <Badge tone={roleTone(user.role)}>{user.role}</Badge>
          <button className="ghost-button" onClick={() => {
            if (confirmDiscardChanges(Boolean(dirtyContext?.isDirty))) setUser(null);
          }}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span>{user.role} workspace</span>
            <h1>{moduleLabels[visibleModule]}</h1>
          </div>
          <div className="search-box">
            <Search size={18} />
            <input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder={`Search ${moduleLabels[visibleModule].toLowerCase()}`} />
          </div>
        </header>
        <ModuleView module={visibleModule} data={data} user={user} searchTerm={globalSearch} onRefresh={refresh} />
      </main>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <DirtyProvider>
        <AppContent />
      </DirtyProvider>
    </ToastProvider>
  );
}

function LoginScreen({
  settings,
  trialSettings,
  username,
  password,
  setUsername,
  setPassword,
  loginError,
  onLogin
}: {
  settings?: ReceiptSettings;
  trialSettings?: SuperAdminSettings;
  username: string;
  password: string;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  loginError: string;
  onLogin: (demo?: { username: string; password: string }) => void;
}) {
  return (
    <main className="login-screen">
      <ToastBridge error={loginError} />
      <section className="login-hero">
        <Brand settings={settings} large subtitle="Motorcycle repair shop desktop system" />
        <h1>Point of sale, repairs, and inventory in one local-first workstation.</h1>
      </section>
      <section className="login-panel">
        <h2>Sign in</h2>
        <p>Enter your username and password to continue.</p>
        {trialSettings?.trial_enabled === 1 ? (
          <div className={trialSettings.trial.expired ? "trial-banner expired" : "trial-banner"}>
            <strong>{trialSettings.trial.expired ? "Trial period has expired." : "Trial Version"}</strong>
            <span>
              {trialSettings.trial.expired
                ? "Please contact your system provider."
                : `${trialSettings.trial.daysRemaining} days remaining`}
            </span>
          </div>
        ) : null}
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" autoFocus />
        <input value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onLogin()} placeholder="Password" type="password" />
        {loginError && <span className="form-error">{loginError}</span>}
        <button className="primary-button" onClick={() => onLogin()}>Login</button>
      </section>
    </main>
  );
}

function PasswordChangeScreen({ settings, user, onChanged, onCancel }: { settings?: ReceiptSettings; user: UserAccount; onChanged: (user: UserAccount) => void; onCancel: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation must match.");
      return;
    }
    try {
      const updatedUser = await withTimeout(window.talyer.changePassword({ userId: user.id, currentPassword, newPassword }), "changing password");
      onChanged(updatedUser);
    } catch (caught) {
      setError(friendlyError(caught, "Unable to change password. Please check the fields and try again."));
    }
  }

  return (
    <main className="login-screen">
      <ToastBridge error={error} />
      <section className="login-hero">
        <Brand settings={settings} large subtitle="First login security" />
        <h1>Set a new password before entering the system.</h1>
      </section>
      <section className="login-panel">
        <KeyRound size={34} />
        <h2>Password required</h2>
        <p>{user.name}, enter the temporary password, then choose a new password.</p>
        <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Temporary password" type="password" autoFocus />
        <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" type="password" />
        <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" type="password" />
        <small className="password-rule">Minimum 10 characters with uppercase, lowercase, number, and symbol.</small>
        {error && <span className="form-error">{error}</span>}
        <button className="primary-button" onClick={submit}>Set password and continue</button>
        <button className="secondary-button" onClick={onCancel}>Back to sign in</button>
      </section>
    </main>
  );
}

function SuperAdminConsole({ user, settings, onSignOut }: { user: UserAccount; settings?: ReceiptSettings; onSignOut: () => void }) {
  const [consoleData, setConsoleData] = useState<SuperAdminData | null>(null);
  const [trialDays, setTrialDays] = useState(30);
  const [trialEnabled, setTrialEnabled] = useState(true);
  const [backupSchedule, setBackupSchedule] = useState<"Manual" | "Daily" | "Weekly">("Manual");
  const [licenseKey, setLicenseKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");

  async function loadConsoleData() {
    try {
      const next = await withTimeout(window.talyer.getSuperAdminData(), "loading super admin console");
      setConsoleData(next);
      setTrialDays(next.settings.trial_days);
      setTrialEnabled(Boolean(next.settings.trial_enabled));
      setBackupSchedule(next.settings.backup_schedule);
      setLicenseKey(next.settings.license_key || "");
      setError("");
    } catch (caught) {
      setError(friendlyError(caught, "Unable to load Super Admin console."));
    }
  }

  useEffect(() => {
    void loadConsoleData();
  }, []);

  async function runAction(label: string, action: () => Promise<SuperAdminData>) {
    setProcessing(label);
    setMessage("");
    setError("");
    try {
      const next = await withTimeout(action(), label.toLowerCase());
      setConsoleData(next);
      setMessage(`${label} completed successfully.`);
    } catch (caught) {
      setError(friendlyError(caught, `${label} failed. Please try again.`));
    } finally {
      setProcessing("");
    }
  }

  async function saveTrialSettings() {
    await runAction("Trial settings update", () => window.talyer.updateTrialSettings({
      superAdminId: user.id,
      trialEnabled,
      trialDays,
      backupSchedule,
      licenseKey
    }));
  }

  async function clearDatabase() {
    if (!confirmPassword.trim()) {
      setError("Super Admin password confirmation is required before clearing the database.");
      return;
    }
    await runAction("Database reset", () => window.talyer.clearDatabase({ superAdminId: user.id, password: confirmPassword }));
    setConfirmPassword("");
    setMessage("Database and system settings successfully reset to default. Default Owner account has been recreated.");
  }

  async function restoreDatabase() {
    if (!restorePassword.trim()) {
      setError("Super Admin password confirmation is required before restoring a backup.");
      return;
    }
    await runAction("Database restore", () => window.talyer.restoreDatabase({ superAdminId: user.id, password: restorePassword }));
    setRestorePassword("");
  }

  const trial = consoleData?.settings.trial;

  return (
    <div className="app-shell super-admin-shell">
      <ToastBridge success={message} error={error} />
      <aside className="sidebar super-admin-sidebar">
        <Brand settings={settings} subtitle="Super Admin Console" />
        <nav>
          <button className="active"><Gauge size={18} /> System Health</button>
          <button><ReceiptText size={18} /> Backup & Restore</button>
          <button><Settings size={18} /> Trial & License</button>
          <button><ClipboardList size={18} /> System Logs</button>
        </nav>
        <div className="session-card">
          <span>Signed in</span>
          <strong>{user.name}</strong>
          <Badge tone="danger">Super Admin</Badge>
          <button className="ghost-button" onClick={onSignOut}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <span>System management only</span>
            <h1>Super Admin Console</h1>
          </div>
        </header>
        {!consoleData ? (
          <div className="loading">{error || "Loading Super Admin console..."}</div>
        ) : (
          <div className="content-grid">
            {processing && <div className="processing-banner">{processing}...</div>}
            {message && <span className="form-success">{message}</span>}
            {error && <span className="form-error">{error}</span>}
            <div className="stats-grid">
              <StatCard label="Database Size" value={formatBytes(consoleData.health.databaseSizeBytes)} detail="Current local SQLite file" icon={<Boxes />} />
              <StatCard label="Last Backup" value={consoleData.health.lastBackupAt ? formatDateOnly(consoleData.health.lastBackupAt) : "None"} detail={consoleData.settings.backup_schedule} icon={<ReceiptText />} />
              <StatCard label="Storage Usage" value="Local Disk" detail="Backups use the selected folder" icon={<PackagePlus />} />
              <StatCard label="Failed Receipts" value={String(consoleData.health.failedReceipts)} detail="Logged receipt failures" icon={<ClipboardList />} />
            </div>
            <section className="panel">
              <div className="panel-head">
                <h2>Trial Mode</h2>
                <Badge tone={trial?.expired ? "danger" : consoleData.settings.license_status === "Activated" ? "good" : "warn"}>
                  {consoleData.settings.license_status === "Activated" ? "Activated" : trial?.expired ? "Expired" : `${trial?.daysRemaining ?? 0} days left`}
                </Badge>
              </div>
              <div className="form-grid">
                <label className="check-field">
                  <input type="checkbox" checked={trialEnabled} onChange={(event) => setTrialEnabled(event.target.checked)} />
                  Enable Trial Mode
                </label>
                <label className="field">
                  Trial Duration
                  <input type="number" min={1} max={365} value={trialDays} onChange={(event) => setTrialDays(Math.max(1, Number(event.target.value) || 1))} />
                </label>
                <label className="field">
                  Automatic Backup
                  <select value={backupSchedule} onChange={(event) => setBackupSchedule(event.target.value as "Manual" | "Daily" | "Weekly")}>
                    <option>Manual</option>
                    <option>Daily</option>
                    <option>Weekly</option>
                  </select>
                </label>
                <label className="field">
                  License Key
                  <input value={licenseKey} onChange={(event) => setLicenseKey(event.target.value)} placeholder="Optional activation key" />
                </label>
              </div>
              <button className="primary-button" disabled={Boolean(processing)} onClick={saveTrialSettings}>Save Trial Settings</button>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Backup & Restore</h2>
                <Badge>Fail-safe</Badge>
              </div>
              <div className="super-admin-actions">
                <button className="primary-button" disabled={Boolean(processing)} onClick={() => runAction("Manual backup", () => window.talyer.createBackup({ superAdminId: user.id }))}>Create Backup</button>
                <button className="secondary-button" disabled={Boolean(processing)} onClick={() => runAction("Database export", () => window.talyer.exportDatabase({ superAdminId: user.id }))}>Export Database File</button>
              </div>
              <div className="approval-box">
                <strong>Restore approval</strong>
                <label className="field">
                  Confirm Super Admin Password
                  <input value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} placeholder="Enter Super Admin password" type="password" />
                </label>
                <button className="secondary-button danger-action" disabled={Boolean(processing)} onClick={restoreDatabase}>Restore Database</button>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Database Maintenance</h2>
                <Badge>{formatBytes(consoleData.health.databaseSizeBytes)}</Badge>
              </div>
              <div className="super-admin-actions">
                <button className="primary-button" disabled={Boolean(processing)} onClick={() => runAction("Database optimization", () => window.talyer.optimizeDatabase({ superAdminId: user.id }))}>Optimize Database</button>
                <button className="secondary-button" disabled={Boolean(processing)} onClick={() => runAction("Log cleanup", () => window.talyer.clearOldLogs({ superAdminId: user.id, daysToKeep: 30 }))}>Clear Logs Older Than 30 Days</button>
              </div>
            </section>
            <section className="panel danger-zone">
              <div className="panel-head">
                <h2>Clear Database</h2>
                <Badge tone="danger">Destructive</Badge>
              </div>
              <p className="empty-state">This permanently removes operational data and resets branding, receipt settings, printer selection, categories, payment methods, trial settings, and backup preferences. Super Admin access is preserved and a backup is created automatically.</p>
              <label className="field">
                Confirm Super Admin Password
                <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter Super Admin password" type="password" />
              </label>
              <button className="primary-button danger-button" disabled={Boolean(processing)} onClick={clearDatabase}>Clear Database</button>
            </section>
            <DataTable<SystemLog>
              title="Backup History"
              rows={consoleData.backupHistory}
              columns={[
                { key: "date", label: "Date", render: (row) => formatDateTime(row.created_at) },
                { key: "action", label: "Action", render: (row) => row.action },
                { key: "details", label: "Details", render: (row) => row.details }
              ]}
            />
            <DataTable<SystemLog>
              title="System Logs"
              rows={consoleData.systemLogs}
              columns={[
                { key: "date", label: "Date", render: (row) => formatDateTime(row.created_at) },
                { key: "action", label: "Action", render: (row) => row.action },
                { key: "details", label: "Details", render: (row) => row.details }
              ]}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function ModuleView({ module, data, user, searchTerm, onRefresh }: { module: ModuleKey; data: AppData; user: UserAccount; searchTerm: string; onRefresh: () => Promise<void> }) {
  if (module === "dashboard") return <Dashboard data={data} user={user} />;
  if (module === "pos") return <Pos data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "inventory") return <Inventory data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "jobs") return <Jobs data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "services") return <Services data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "staff") return <Staff data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "suppliers") return <Suppliers data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "reports") return <Reports data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "users") return <UsersModule data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "audit") return <Audit data={data} searchTerm={searchTerm} />;
  return <SettingsModule data={data} user={user} onRefresh={onRefresh} />;
}

function Dashboard({ data, user }: { data: AppData; user: UserAccount }) {
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
        <RecordsToolbar showClear={Boolean(paymentFilter || mechanicFilter || cashierFilter || startDate !== todayInputValue() || endDate !== todayInputValue())} onClear={clearDashboardFilters}>
          <label className="field compact-field">
            Start Date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field compact-field">
            End Date
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label className="field compact-field">
            Payment
            <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
              <option value="">All Payments</option>
              {paymentMethods.map((method) => <option value={method} key={method}>{method}</option>)}
            </select>
          </label>
          <label className="field compact-field">
            Mechanic
            <select value={mechanicFilter} onChange={(event) => setMechanicFilter(event.target.value)}>
              <option value="">All Mechanics</option>
              {mechanics.map((mechanic) => <option value={mechanic} key={mechanic}>{mechanic}</option>)}
            </select>
          </label>
          <label className="field compact-field">
            Cashier
            <select value={cashierFilter} onChange={(event) => setCashierFilter(event.target.value)}>
              <option value="">All Cashiers</option>
              {cashiers.map((cashier) => <option value={cashier} key={cashier}>{cashier}</option>)}
            </select>
          </label>
        </RecordsToolbar>
      </section>
      <div className="stats-grid">
        <StatCard label="Revenue" value={money.format(revenueTotal)} detail="POS sales + completed jobs" icon={<ReceiptText />} />
        <StatCard label="Active jobs" value={String(activeJobs)} detail="Open repair orders" icon={<ClipboardList />} />
        {canViewInventory && <StatCard label="Low stock" value={String(lowStock)} detail="Parts at reorder level" icon={<Boxes />} />}
        <StatCard label="Role scope" value={user.role} detail={`${modulesFor(user.role).length} modules available`} icon={<ShieldCheck />} />
      </div>
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
      <section className="dashboard-stat-section">
        <h2>Payment Breakdown</h2>
        <div className="stats-grid">
          <StatCard label="Digital Payments" value={money.format(digitalTotal)} detail="Configured digital methods" icon={<ReceiptText />} />
          <StatCard label="Cash Payments" value={money.format(cashTotal)} detail="Manual cash payments" icon={<ReceiptText />} />
        </div>
      </section>
      <section className="dashboard-stat-section">
        <h2>Items Purchased</h2>
        <div className="stats-grid">
          {purchasedItems.length === 0 && <div className="panel empty-analytics">No item purchases found for selected filters.</div>}
          {purchasedItems.map((item) => (
            <StatCard key={item.label} label={item.label} value={`${item.quantity} sold`} detail={`Revenue: ${money.format(item.revenue)}`} icon={<Boxes />} />
          ))}
        </div>
      </section>
      <section className="dashboard-stat-section">
        <h2>Services Rendered</h2>
        <div className="stats-grid">
          {servicesRendered.length === 0 && <div className="panel empty-analytics">No rendered services found for selected filters.</div>}
          {servicesRendered.map((service) => (
            <StatCard key={service.label} label={service.label} value={`${service.count} rendered`} detail={`Revenue: ${money.format(service.revenue)}`} icon={<Wrench />} />
          ))}
        </div>
      </section>
      <section className="dashboard-stat-section">
        <h2>Service Rendered Per Mechanic</h2>
        <div className="stats-grid">
          {mechanicPerformance.length === 0 && <div className="panel empty-analytics">No mechanic service records found for selected filters.</div>}
          {mechanicPerformance.map((mechanic) => (
            <StatCard key={mechanic.label} label={mechanic.label} value={`${mechanic.count} services`} detail={`Revenue handled: ${money.format(mechanic.revenue)}`} icon={<BriefcaseBusiness />} />
          ))}
        </div>
      </section>
      <section className="dashboard-stat-section">
        <h2>Transactions Per Cashier</h2>
        <div className="stats-grid">
          {cashierPerformance.length === 0 && <div className="panel empty-analytics">No cashier transactions found for selected filters.</div>}
          {cashierPerformance.map((cashier) => (
            <StatCard key={cashier.label} label={cashier.label} value={`${cashier.count} transactions`} detail="POS transactions processed" icon={<UserCheck />} />
          ))}
        </div>
      </section>
      <Jobs data={data} user={user} compact />
      {canViewInventory && <Inventory data={data} user={user} compact />}
    </div>
  );
}

function Pos({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState(data.paymentMethods.find((method) => method.status === "Active")?.name ?? "");
  const [paymentReferenceCode, setPaymentReferenceCode] = useState("");
  const [lastReceipt, setLastReceipt] = useState<{ receiptNo: string; html: string } | null>(null);
  const [posError, setPosError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<(typeof catalog)[number] | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [processingState, setProcessingState] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedReceiptNo, setSelectedReceiptNo] = useState(data.sales[0]?.receipt_no ?? "");
  const [activeCategory, setActiveCategory] = useState("All Categories");
  const [transactionDateFilter, setTransactionDateFilter] = useState(todayInputValue());
  const [transactionPaymentFilter, setTransactionPaymentFilter] = useState("");
  const [voidSale, setVoidSale] = useState<Sale | null>(null);
  const [voidAction, setVoidAction] = useState<"Void" | "Refund">("Void");
  const [voidApproval, setVoidApproval] = useState(emptyApproval);
  const [receiptPreview, setReceiptPreview] = useState<{ receiptNo: string; html: string } | null>(null);

  const catalog = useMemo(
    () => [
      ...data.inventory.map((item) => ({
        itemType: "part" as const,
        itemId: item.id,
        name: item.name,
        price: item.sell_price,
        stock: item.stock,
        categoryName: item.category_name ?? item.category,
        meta: `${item.stock} in stock`,
        disabled: item.stock <= 0
      }))
    ],
    [data]
  );
  const categoryOptions = ["All Categories", ...data.inventoryCategories.map((category) => category.name)];
  const filteredCatalog = (activeCategory === "All Categories" ? catalog : catalog.filter((item) => item.categoryName === activeCategory))
    .filter((item) => valueMatchesSearch(searchTerm, [item.name, item.price, item.stock, item.price * item.stock]));
  const activePaymentMethods = useMemo(() => data.paymentMethods.filter((method) => method.status === "Active"), [data.paymentMethods]);
  const selectedPaymentMethod = activePaymentMethods.find((method) => method.name === paymentMethod);
  const requiresReferenceCode = selectedPaymentMethod?.payment_category === "Digital";
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const total = subtotal;
  const isProcessing = Boolean(processingState);
  const transactionRows = useMemo(() => data.sales.filter((sale) => {
    const items = data.saleItems.filter((item) => item.sale_id === sale.id);
    return rowMatchesDate(sale.created_at, transactionDateFilter)
      && (!transactionPaymentFilter || sale.payment_method === transactionPaymentFilter)
      && valueMatchesSearch(searchTerm, [
        sale.receipt_no,
        sale.total,
        sale.subtotal,
        sale.payment_method,
        sale.status,
        ...items.flatMap((item) => [item.name, item.quantity, item.unit_price, item.line_total])
      ]);
  }), [data.sales, data.saleItems, searchTerm, transactionDateFilter, transactionPaymentFilter]);
  const transactionPage = useFilteredPagination(transactionRows, [searchTerm, transactionDateFilter, transactionPaymentFilter, data.sales.length, data.saleItems.length]);
  const selectedSale = transactionRows.find((sale) => sale.receipt_no === selectedReceiptNo) ?? transactionRows[0];
  const selectedSaleItems = selectedSale ? data.saleItems.filter((item) => item.sale_id === selectedSale.id) : [];

  useEffect(() => {
    if (transactionRows.length === 0) {
      setSelectedReceiptNo("");
      return;
    }
    if (!transactionRows.some((sale) => sale.receipt_no === selectedReceiptNo)) {
      setSelectedReceiptNo(transactionRows[0].receipt_no);
    }
  }, [transactionRows, selectedReceiptNo]);

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

  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(""), 3500);
  }

  function openQuantityPrompt(item: (typeof catalog)[number]) {
    if (item.disabled) return;
    setSelectedProduct(item);
    setSelectedQuantity(1);
    setPosError("");
  }

  function addSelectedProduct() {
    if (!selectedProduct) return;
    const quantity = Math.max(1, Math.min(selectedQuantity, selectedProduct.stock));
    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.itemType === selectedProduct.itemType && cartItem.itemId === selectedProduct.itemId);
      if (existing) {
        const nextQuantity = Math.min(existing.quantity + quantity, selectedProduct.stock);
        return current.map((cartItem) => cartItem === existing ? { ...cartItem, quantity: nextQuantity } : cartItem);
      }
      return [...current, { itemType: selectedProduct.itemType, itemId: selectedProduct.itemId, name: selectedProduct.name, quantity, unitPrice: selectedProduct.price }];
    });
    setSelectedProduct(null);
  }

  function reduceCartItem(item: CartItem) {
    setCart((current) => current.flatMap((cartItem) => {
      if (cartItem.itemId !== item.itemId || cartItem.itemType !== item.itemType) return [cartItem];
      if (cartItem.quantity <= 1) return [];
      return [{ ...cartItem, quantity: cartItem.quantity - 1 }];
    }));
  }

  function removeCartItem(item: CartItem) {
    setCart((current) => current.filter((cartItem) => cartItem.itemId !== item.itemId || cartItem.itemType !== item.itemType));
  }

  async function checkout() {
    if (cart.length === 0 || isProcessing || !paymentMethod) return;
    setPosError("");
    setSuccessMessage("");
    if (requiresReferenceCode && !paymentReferenceCode.trim()) {
      setPosError("Reference code is required for digital payments.");
      return;
    }
    setProcessingState("Processing transaction...");
    try {
      const referenceCode = requiresReferenceCode ? paymentReferenceCode.trim() : "";
      const receipt = await withTimeout(window.talyer.createSale({ cashierId: user.id, items: cart, discount: 0, paymentMethod, paymentReferenceCode: referenceCode }), "creating sale");
      const receiptHtml = buildReceiptHtml(data.receiptSettings, {
        receiptNo: receipt.receiptNo,
        cashierName: user.name,
        transactionType: "POS Sale",
        paymentMethod,
        paymentCategory: receipt.paymentCategory ?? selectedPaymentMethod?.payment_category,
        paymentReferenceCode: receipt.paymentReferenceCode ?? referenceCode,
        createdAt: new Date(receipt.createdAt),
        lines: cart.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice })),
        subtotal: receipt.subtotal,
        total: receipt.total
      });
      setLastReceipt({ receiptNo: receipt.receiptNo, html: receiptHtml });
      setProcessingState("Generating receipt...");
      try {
        await printOrSaveReceiptPdf(receiptHtml, receipt.receiptNo);
      } catch (caught) {
        setPosError(friendlyError(caught, "Transaction was saved, but the receipt could not be printed or saved."));
      }
      setCart([]);
      setPaymentReferenceCode("");
      setShowPayment(false);
      setSelectedReceiptNo(receipt.receiptNo);
      await onRefresh();
      showSuccess("Transaction completed successfully.");
    } catch (caught) {
      setPosError(friendlyError(caught, "Unable to complete the sale. Please try again."));
    } finally {
      setProcessingState("");
    }
  }

  function buildSaleReceipt(sale: Sale, items: SaleItem[]) {
    return buildReceiptHtml(data.receiptSettings, {
      receiptNo: sale.receipt_no,
      cashierName: sale.cashier_name,
      customerName: sale.customer_name,
      transactionType: "POS Sale",
      paymentMethod: sale.payment_method,
      paymentCategory: sale.payment_category,
      paymentReferenceCode: sale.payment_reference_code,
      createdAt: new Date(sale.created_at),
      lines: items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unit_price })),
      subtotal: sale.subtotal,
      total: sale.total
    });
  }

  async function reprintSale(sale: Sale, items: SaleItem[]) {
    setPosError("");
    setSuccessMessage("");
    setProcessingState("Generating receipt...");
    try {
      await printOrSaveReceiptPdf(buildSaleReceipt(sale, items), sale.receipt_no);
      showSuccess("Receipt generated successfully.");
    } catch (caught) {
      setPosError(friendlyError(caught, "Unable to print or save the receipt right now."));
    } finally {
      setProcessingState("");
    }
  }

  function previewSaleReceipt(sale: Sale, items: SaleItem[]) {
    setReceiptPreview({ receiptNo: sale.receipt_no, html: buildSaleReceipt(sale, items) });
  }

  async function printPreviewReceipt() {
    if (!receiptPreview) return;
    setPosError("");
    setSuccessMessage("");
    setProcessingState("Generating receipt...");
    try {
      await printOrSaveReceiptPdf(receiptPreview.html, receiptPreview.receiptNo);
      setReceiptPreview(null);
      showSuccess("Receipt generated successfully.");
    } catch (caught) {
      setPosError(friendlyError(caught, "Unable to print or save the receipt right now."));
    } finally {
      setProcessingState("");
    }
  }

  async function saveVoidOrRefund() {
    if (!voidSale) return;
    setPosError("");
    setSuccessMessage("");
    const approvalError = approvalValidationError(voidApproval);
    if (approvalError) {
      setPosError(approvalError);
      return;
    }
    setProcessingState(`${voidAction === "Refund" ? "Refunding" : "Voiding"} transaction...`);
    try {
      await withTimeout(window.talyer.voidOrRefundSale({
        actorId: user.id,
        saleId: voidSale.id,
        actionType: voidAction,
        ...voidApproval
      }), `${voidAction.toLowerCase()} transaction`);
      setVoidSale(null);
      setVoidApproval(emptyApproval);
      await onRefresh();
      showSuccess(`Transaction ${voidAction === "Refund" ? "refunded" : "voided"} successfully.`);
    } catch (caught) {
      setPosError(friendlyError(caught, `Unable to ${voidAction.toLowerCase()} transaction. Approval may be invalid.`));
    } finally {
      setProcessingState("");
    }
  }

  return (
    <div className="pos-layout pos-shop-layout">
      <ToastBridge success={successMessage} error={posError} />
      <section className="pos-products">
        <div className="category-pills">
          {categoryOptions.map((category) => (
            <button className={activeCategory === category ? "category-pill active" : "category-pill"} disabled={isProcessing} key={category} onClick={() => setActiveCategory(category)}>
              {category}
            </button>
          ))}
        </div>
        <div className="catalog-grid">
          {filteredCatalog.map((item) => (
            <button className="catalog-item" disabled={item.disabled || isProcessing} key={`${item.itemType}-${item.itemId}`} onClick={() => openQuantityPrompt(item)}>
              <strong>{item.name}</strong>
              <span>Price: <b>{money.format(item.price)}</b></span>
              <span>Stocks: <b>{item.stock}</b></span>
              <em>Add to cart</em>
            </button>
          ))}
          {filteredCatalog.length === 0 && <p className="empty-state">No parts found in this category.</p>}
        </div>
      </section>

      <section className="panel cart-panel pos-checkout-panel">
        <div className="pos-checkout-brand">
          <h2>{data.receiptSettings.system_name || "TalyerPOS"}</h2>
          <ShoppingCart size={22} />
        </div>
        <div className="cart-lines">
          {cart.length === 0 && <p className="empty-state">Add motorcycle parts to begin checkout.</p>}
          {cart.map((item) => (
            <div className="cart-line" key={`${item.itemType}-${item.itemId}`}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.quantity} x {money.format(item.unitPrice)}</span>
              </div>
              <b>{money.format(item.quantity * item.unitPrice)}</b>
              <div className="cart-actions">
                <button className="table-action" disabled={isProcessing} onClick={() => reduceCartItem(item)}>-</button>
                <button className="table-action danger-action" disabled={isProcessing} onClick={() => removeCartItem(item)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <div className="totals">
          <span>Subtotal <b>{money.format(subtotal)}</b></span>
          <strong>Total <b>{money.format(total)}</b></strong>
        </div>
        {processingState && <div className="processing-banner">{processingState}</div>}
        {successMessage && <span className="form-success success-prompt">{successMessage}</span>}
        <button className="primary-button pos-next-button" disabled={cart.length === 0 || isProcessing || activePaymentMethods.length === 0} onClick={() => setShowPayment(true)}>Proceed to Payment</button>
        <button className="secondary-button" disabled={!lastReceipt || isProcessing} onClick={async () => {
          setPosError("");
          if (!lastReceipt) return;
          setProcessingState("Generating receipt...");
          try {
            await printOrSaveReceiptPdf(lastReceipt.html, lastReceipt.receiptNo);
            showSuccess("Receipt generated successfully.");
          } catch (caught) {
            setPosError(friendlyError(caught, "Unable to print or save the receipt right now."));
          } finally {
            setProcessingState("");
          }
        }}>
          <Printer size={16} />
          Print last receipt {lastReceipt?.receiptNo}
        </button>
        {posError && <span className="form-error">{posError}</span>}
      </section>
      <section className="panel transaction-panel">
        <div className="panel-head">
          <h2>Transactions</h2>
          <Badge>{`${data.sales.length} completed`}</Badge>
        </div>
        <RecordsToolbar
          showClear={Boolean(transactionDateFilter !== todayInputValue() || transactionPaymentFilter)}
          onClear={() => {
            setTransactionDateFilter(todayInputValue());
            setTransactionPaymentFilter("");
          }}
        >
          <label className="field compact-field">
            Transaction Date
            <input type="date" value={transactionDateFilter} onChange={(event) => setTransactionDateFilter(event.target.value)} />
          </label>
          <label className="field compact-field">
            Payment Method
            <select value={transactionPaymentFilter} onChange={(event) => setTransactionPaymentFilter(event.target.value)}>
              <option value="">All payments</option>
              {data.paymentMethods.map((method) => <option value={method.name} key={method.id}>{method.name}</option>)}
            </select>
          </label>
          <label className="field compact-field">
            Status
            <select value="Completed" disabled>
              <option>Completed</option>
            </select>
          </label>
        </RecordsToolbar>
        {transactionPage.isLoading && <div className="processing-banner">Updating records...</div>}
        <div className="transaction-layout">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Transaction No.</th>
                  <th>Date & Time</th>
                  <th>Total Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {transactionPage.pagedRows.map((sale) => (
                  <tr className={selectedSale?.id === sale.id ? "selected-table-row clickable-table-row" : "clickable-table-row"} key={sale.id} onClick={() => setSelectedReceiptNo(sale.receipt_no)}>
                    <td>{sale.receipt_no}</td>
                    <td>{formatDateTime(sale.created_at)}</td>
                    <td>{money.format(sale.total)}</td>
                    <td>{sale.payment_method}</td>
                    <td><Badge tone={sale.status === "Completed" ? "good" : "danger"}>{sale.status}</Badge></td>
                  </tr>
                ))}
                {transactionRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <span className="table-empty-copy">No transactions yet. Complete a sale from POS to start the transaction history.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls page={transactionPage.page} pageCount={transactionPage.pageCount} total={transactionRows.length} onPageChange={transactionPage.setPage} />
          <div className="transaction-detail">
            {selectedSale ? (
              <>
                <div className="panel-head">
                  <h3>{selectedSale.receipt_no}</h3>
                  <Badge tone={selectedSale.status === "Completed" ? "good" : "danger"}>{selectedSale.status}</Badge>
                </div>
                <div className="detail-grid">
                  <span>Transaction Date & Time <b>{formatDateTime(selectedSale.created_at)}</b></span>
                  <span>Payment <b>{selectedSale.payment_method}</b></span>
                  {selectedSale.payment_category === "Digital" && selectedSale.payment_reference_code && <span>Reference Code <b>{selectedSale.payment_reference_code}</b></span>}
                  <span>Cashier <b>{selectedSale.cashier_name}</b></span>
                  <span>Total <b>{money.format(selectedSale.total)}</b></span>
                  {selectedSale.status !== "Completed" && <span>Reason <b>{selectedSale.void_reason || "No reason recorded"}</b></span>}
                </div>
                <div className="transaction-lines">
                  {selectedSaleItems.map((item) => (
                    <div className="cart-line" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.quantity} x {money.format(item.unit_price)}</span>
                      </div>
                      <b>{money.format(item.line_total)}</b>
                    </div>
                  ))}
                </div>
                <button className="secondary-button" disabled={isProcessing} onClick={() => reprintSale(selectedSale, selectedSaleItems)}>
                  <Printer size={16} />
                  Reprint Receipt
                </button>
                <button className="secondary-button" disabled={isProcessing} onClick={() => previewSaleReceipt(selectedSale, selectedSaleItems)}>
                  <ReceiptText size={16} />
                  Preview Receipt
                </button>
                {selectedSale.status === "Completed" && (
                  <button className="table-action danger-action" disabled={isProcessing} onClick={() => {
                    setVoidSale(selectedSale);
                    setVoidAction("Void");
                    setVoidApproval({ ...emptyApproval, approvalReason: `Void ${selectedSale.receipt_no}` });
                  }}>
                    Void / Refund
                  </button>
                )}
              </>
            ) : (
              <p className="empty-state">Select a transaction to view the receipt details.</p>
            )}
          </div>
        </div>
      </section>
      {selectedProduct && (
        <div className="modal-backdrop">
          <section className="modal-window pos-modal">
            <div className="panel-head">
              <h2>Select Quantity</h2>
              <button className="table-action" disabled={isProcessing} onClick={() => setSelectedProduct(null)}>Close</button>
            </div>
            <div className="detail-grid">
              <span>Part <b>{selectedProduct.name}</b></span>
              <span>Available <b>{selectedProduct.stock}</b></span>
              <span>Price <b>{money.format(selectedProduct.price)}</b></span>
              <span>Total <b>{money.format(selectedQuantity * selectedProduct.price)}</b></span>
            </div>
            <label className="field">
              Quantity
              <input type="number" min={1} max={selectedProduct.stock} disabled={isProcessing} value={selectedQuantity} onChange={(event) => setSelectedQuantity(Math.max(1, Math.min(selectedProduct.stock, Number(event.target.value) || 1)))} autoFocus />
            </label>
            <button className="primary-button" disabled={isProcessing} onClick={addSelectedProduct}>Add to Cart</button>
          </section>
        </div>
      )}
      {voidSale && (
        <div className="modal-backdrop">
          <section className="modal-window pos-modal">
            <div className="panel-head">
              <h2>Void / Refund {voidSale.receipt_no}</h2>
              <button className="table-action" onClick={() => setVoidSale(null)}>Close</button>
            </div>
            <div className="form-grid">
              <label className="field">
                Action
                <select value={voidAction} onChange={(event) => setVoidAction(event.target.value as "Void" | "Refund")}>
                  <option>Void</option>
                  <option>Refund</option>
                </select>
              </label>
              <label className="field">
                Approver Username
                <input value={voidApproval.approvalUsername} onChange={(event) => setVoidApproval({ ...voidApproval, approvalUsername: event.target.value })} />
              </label>
              <label className="field">
                Approver Password
                <input type="password" value={voidApproval.approvalPassword} onChange={(event) => setVoidApproval({ ...voidApproval, approvalPassword: event.target.value })} />
              </label>
              <label className="field form-wide">
                Reason
                <input value={voidApproval.approvalReason} onChange={(event) => setVoidApproval({ ...voidApproval, approvalReason: event.target.value })} />
              </label>
            </div>
            <button className="primary-button danger-button" disabled={isProcessing} onClick={saveVoidOrRefund}>Confirm {voidAction}</button>
            {posError && <span className="form-error">{posError}</span>}
          </section>
        </div>
      )}
      {receiptPreview && (
        <div className="modal-backdrop">
          <section className="modal-window report-preview-window">
            <div className="panel-head">
              <h2>Receipt Preview</h2>
              <button className="table-action" onClick={() => setReceiptPreview(null)}>Close</button>
            </div>
            <iframe className="document-preview" title="Receipt preview" srcDoc={receiptPreview.html} />
            <button className="primary-button" disabled={isProcessing} onClick={printPreviewReceipt}>Print / Save Receipt</button>
          </section>
        </div>
      )}
      {showPayment && (
        <div className="modal-backdrop">
          <section className="modal-window pos-modal">
            <div className="panel-head">
              <h2>Payment</h2>
              <button className="table-action" disabled={isProcessing} onClick={() => setShowPayment(false)}>Close</button>
            </div>
            <div className="totals">
              <span>Subtotal <b>{money.format(subtotal)}</b></span>
              <strong>Total <b>{money.format(total)}</b></strong>
            </div>
            <label className="field">
              Payment Method
              <select value={paymentMethod} disabled={isProcessing || activePaymentMethods.length === 0} onChange={(event) => setPaymentMethod(event.target.value)}>
                {activePaymentMethods.map((method) => <option value={method.name} key={method.id}>{method.name}</option>)}
              </select>
            </label>
            {requiresReferenceCode && (
              <label className="field">
                Reference Code
                <input value={paymentReferenceCode} disabled={isProcessing} onChange={(event) => setPaymentReferenceCode(event.target.value)} placeholder="Enter Reference Code" autoFocus />
              </label>
            )}
            {activePaymentMethods.length === 0 && <span className="form-error">No active payment methods are configured.</span>}
            {processingState && <div className="processing-banner">{processingState}</div>}
            <button className="primary-button" disabled={isProcessing || !paymentMethod} onClick={checkout}>Complete</button>
            {posError && <span className="form-error">{posError}</span>}
          </section>
        </div>
      )}
    </div>
  );
}

function Inventory({ data, user, searchTerm = "", onRefresh, compact = false }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh?: () => Promise<void>; compact?: boolean }) {
  const rows = compact
    ? data.inventory.filter((item) => item.stock <= item.reorder_level)
    : data.inventory.filter((item) => valueMatchesSearch(searchTerm, [item.product_code, item.name, item.category_name, item.category]));
  const inventoryPage = useFilteredPagination(rows, [searchTerm, data.inventory.length, compact]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({
    categoryId: data.inventoryCategories[0]?.id ?? 0,
    name: "",
    stock: 0,
    sellPrice: 0,
    supplierId: 0
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementMode, setMovementMode] = useState<"Stock In" | "Adjustment">("Stock In");
  const [movementForm, setMovementForm] = useState({ quantity: 1, newStock: 0, supplierId: 0, referenceNo: "", reason: "" });
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [deleteApproval, setDeleteApproval] = useState(emptyApproval);
  const canManage = user.role === "Owner" || user.role === "Admin";
  const selectedCategory = data.inventoryCategories.find((category) => category.id === form.categoryId);
  const generatedCode = selectedCategory ? nextProductCodePreview(selectedCategory, data.inventory) : "Select category";
  const recentAdjustments = data.inventoryAdjustments.slice(0, 10);
  const savedItemForm = editingItem ? {
    categoryId: editingItem.category_id || data.inventoryCategories[0]?.id || 0,
    name: editingItem.name,
    stock: editingItem.stock,
    sellPrice: editingItem.sell_price,
    supplierId: editingItem.supplier_id ?? 0
  } : { categoryId: data.inventoryCategories[0]?.id ?? 0, name: "", stock: 0, sellPrice: 0, supplierId: 0 };
  const inventoryFormDirty = showForm && JSON.stringify(form) !== JSON.stringify(savedItemForm);
  useUnsavedChanges("inventory-item", inventoryFormDirty);

  function openCreate() {
    setEditingItem(null);
    setForm({ categoryId: data.inventoryCategories[0]?.id ?? 0, name: "", stock: 0, sellPrice: 0, supplierId: 0 });
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function openEdit(item: InventoryItem) {
    setEditingItem(item);
    setForm({
      categoryId: item.category_id || data.inventoryCategories[0]?.id || 0,
      name: item.name,
      stock: item.stock,
      sellPrice: item.sell_price,
      supplierId: item.supplier_id ?? 0
    });
    setError("");
    setMessage("");
    setShowForm(true);
  }

  async function saveItem() {
    setError("");
    setMessage("");
    if (!form.categoryId) {
      setError("Category is required.");
      return;
    }
    if (!form.name.trim()) {
      setError("Item name is required.");
      return;
    }
    if (form.stock < 0) {
      setError("Stock count cannot be negative.");
      return;
    }
    if (form.sellPrice < 0) {
      setError("Sell price cannot be negative.");
      return;
    }
    try {
      if (editingItem && editingItem.category_id !== form.categoryId) {
        const confirmed = window.confirm("Changing category will not change the existing Product Code. Continue?");
        if (!confirmed) return;
      }
      if (editingItem) {
        await withTimeout(window.talyer.updateInventoryItem({
          actorId: user.id,
          itemId: editingItem.id,
          categoryId: form.categoryId,
          name: form.name,
          stock: form.stock,
          sellPrice: form.sellPrice,
          supplierId: form.supplierId || null
        }), "updating inventory item");
        setMessage("Inventory item updated successfully.");
      } else {
        await withTimeout(window.talyer.createInventoryItem({
          actorId: user.id,
          categoryId: form.categoryId,
          name: form.name,
          stock: form.stock,
          sellPrice: form.sellPrice,
          supplierId: form.supplierId || null
        }), "creating inventory item");
        setMessage("Inventory item created successfully.");
      }
      setShowForm(false);
      await onRefresh?.();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save inventory item. Please check the fields and try again."));
    }
  }

  async function deleteItem() {
    if (!deleteTarget) return;
    setError("");
    setMessage("");
    const approvalError = approvalValidationError(deleteApproval);
    if (approvalError) {
      setError(approvalError);
      return;
    }
    try {
      await withTimeout(window.talyer.deleteInventoryItem({ actorId: user.id, itemId: deleteTarget.id, ...deleteApproval }), "deleting inventory item");
      setMessage("Inventory item deleted successfully.");
      setDeleteTarget(null);
      setDeleteApproval(emptyApproval);
      await onRefresh?.();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to delete inventory item. It may already be used in a transaction."));
    }
  }

  function openMovement(item: InventoryItem, mode: "Stock In" | "Adjustment") {
    setMovementItem(item);
    setMovementMode(mode);
    setMovementForm({ quantity: 1, newStock: item.stock, supplierId: item.supplier_id ?? 0, referenceNo: "", reason: mode === "Stock In" ? "Stock replenishment" : "" });
    setError("");
    setMessage("");
  }

  async function saveMovement() {
    if (!movementItem) return;
    setError("");
    setMessage("");
    if (movementMode === "Stock In" && movementForm.quantity <= 0) {
      setError("Stock in quantity must be greater than zero.");
      return;
    }
    if (movementMode === "Adjustment" && movementForm.newStock < 0) {
      setError("New stock count cannot be negative.");
      return;
    }
    if (!movementForm.reason.trim()) {
      setError("Reason is required for stock movements.");
      return;
    }
    try {
      const result = movementMode === "Stock In"
        ? await withTimeout(window.talyer.stockInInventoryItem({
          actorId: user.id,
          itemId: movementItem.id,
          quantity: movementForm.quantity,
          supplierId: movementForm.supplierId || null,
          referenceNo: movementForm.referenceNo,
          reason: movementForm.reason
        }), "saving stock in")
        : await withTimeout(window.talyer.adjustInventoryStock({
          actorId: user.id,
          itemId: movementItem.id,
          newStock: movementForm.newStock,
          referenceNo: movementForm.referenceNo,
          reason: movementForm.reason
        }), "saving stock adjustment");
      setMessage(`${movementMode} saved successfully. Stock ${result.previousStock} -> ${result.newStock}.`);
      setMovementItem(null);
      await onRefresh?.();
    } catch (caught) {
      setError(friendlyError(caught, `Unable to save ${movementMode.toLowerCase()}. Please check the fields and try again.`));
    }
  }

  return (
    <div className="inventory-module">
      <ToastBridge success={message} error={error} />
      {!compact && (
        <section className="panel inventory-actions-panel">
          <div className="panel-head">
            <h2>Inventory Items</h2>
            {canManage && <button className="primary-button compact-button" onClick={openCreate}>New Item</button>}
          </div>
          {message && <span className="form-success">{message}</span>}
          {error && <span className="form-error">{error}</span>}
        </section>
      )}
      {!compact && inventoryPage.isLoading && <div className="processing-banner">Updating records...</div>}
      <DataTable<InventoryItem>
        title={compact ? "Reorder Watch" : "Inventory / Parts"}
        rows={compact ? rows : inventoryPage.pagedRows}
        emptyMessage={compact ? "No low-stock items right now. Reorder watch will show parts at or below reorder level." : "No inventory items yet. Add your first item from Inventory."}
        footer={!compact && <PaginationControls page={inventoryPage.page} pageCount={inventoryPage.pageCount} total={rows.length} onPageChange={inventoryPage.setPage} />}
        columns={[
          { key: "product_code", label: "Product Code", render: (row) => row.product_code },
          { key: "name", label: "Item Name", render: (row) => row.name },
          { key: "category", label: "Category", render: (row) => row.category_name ?? row.category },
          { key: "stock", label: "Stock", render: (row) => <Badge tone={row.stock <= row.reorder_level ? "warn" : "good"}>{String(row.stock)}</Badge> },
          { key: "price", label: "Sell Price", render: (row) => money.format(row.sell_price) },
          { key: "supplier", label: "Supplier", render: (row) => row.supplier_name ?? "Unassigned" },
          ...(!compact && canManage ? [{
            key: "actions",
            label: "Actions",
            render: (row: InventoryItem) => (
              <div className="table-actions">
                <button className="table-action" onClick={() => openEdit(row)}><Pencil size={15} /> Edit</button>
                <button className="table-action success-action" onClick={() => openMovement(row, "Stock In")}>Stock In</button>
                <button className="table-action" onClick={() => openMovement(row, "Adjustment")}>Adjust</button>
                <button className="table-action danger-action" onClick={() => {
                  setDeleteTarget(row);
                  setDeleteApproval({ ...emptyApproval, approvalReason: `Delete ${row.product_code} ${row.name}` });
                }}><Trash2 size={15} /> Delete</button>
              </div>
            )
          }] : [])
        ]}
      />
      {showForm && (
        <div className="modal-backdrop">
          <section className="modal-window inventory-window">
            <div className="panel-head">
              <h2>{editingItem ? "Update Inventory Item" : "Create Inventory Item"}</h2>
              <button className="table-action" onClick={() => {
                if (confirmDiscardChanges(inventoryFormDirty)) setShowForm(false);
              }}>Close</button>
            </div>
            <div className="form-grid">
              <label className="field">
                Product Code
                <input value={editingItem?.product_code ?? generatedCode} readOnly />
              </label>
              <label className="field">
                Category
                <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: Number(event.target.value) })}>
                  {data.inventoryCategories.map((category) => <option value={category.id} key={category.id}>{category.name} ({category.code})</option>)}
                </select>
              </label>
              <label className="field form-wide">
                Item Name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className="field">
                Stock Count
                <input type="number" min={0} value={form.stock} onChange={(event) => setForm({ ...form, stock: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
              <label className="field">
                Sell Price
                <input type="number" min={0} value={form.sellPrice} onChange={(event) => setForm({ ...form, sellPrice: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
              <label className="field form-wide">
                Supplier
                <select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: Number(event.target.value) })}>
                  <option value={0}>Unassigned</option>
                  {data.suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
            </div>
            <button className="primary-button" onClick={saveItem}>{editingItem ? "Save Changes" : "Create Inventory Item"}</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
      {!compact && (
        <DataTable<InventoryAdjustment>
          title="Recent Stock Movements"
          rows={recentAdjustments}
          emptyMessage="No stock movements yet. Use Stock In or Adjust from Inventory to record changes."
          columns={[
            { key: "date", label: "Date & Time", render: (row) => formatDateTime(row.created_at) },
            { key: "product", label: "Product Code", render: (row) => row.product_code },
            { key: "item", label: "Item", render: (row) => row.item_name },
            { key: "type", label: "Type", render: (row) => <Badge tone={row.movement_type === "Stock In" ? "good" : "warn"}>{row.movement_type}</Badge> },
            { key: "quantity", label: "Qty / Delta", render: (row) => row.quantity > 0 ? `+${row.quantity}` : String(row.quantity) },
            { key: "stock", label: "Stock", render: (row) => `${row.previous_stock} -> ${row.new_stock}` },
            { key: "reference", label: "Reference", render: (row) => row.reference_no || "None" },
            { key: "reason", label: "Reason", render: (row) => row.reason },
            { key: "actor", label: "By", render: (row) => row.actor_name }
          ]}
        />
      )}
      {movementItem && (
        <div className="modal-backdrop">
          <section className="modal-window inventory-window">
            <div className="panel-head">
              <h2>{movementMode}: {movementItem.product_code}</h2>
              <button className="table-action" onClick={() => {
                const dirty = movementMode === "Stock In"
                  ? movementForm.quantity !== 1 || Boolean(movementForm.referenceNo.trim()) || movementForm.reason !== "Stock replenishment" || movementForm.supplierId !== (movementItem.supplier_id ?? 0)
                  : movementForm.newStock !== movementItem.stock || Boolean(movementForm.referenceNo.trim()) || Boolean(movementForm.reason.trim());
                if (confirmDiscardChanges(dirty)) setMovementItem(null);
              }}>Close</button>
            </div>
            <div className="detail-grid">
              <span>Item <b>{movementItem.name}</b></span>
              <span>Current Stock <b>{movementItem.stock}</b></span>
            </div>
            <div className="form-grid">
              {movementMode === "Stock In" ? (
                <>
                  <label className="field">
                    Quantity to Add
                    <input type="number" min={1} value={movementForm.quantity} onChange={(event) => setMovementForm({ ...movementForm, quantity: Math.max(1, Number(event.target.value) || 1) })} />
                  </label>
                  <label className="field">
                    Supplier
                    <select value={movementForm.supplierId} onChange={(event) => setMovementForm({ ...movementForm, supplierId: Number(event.target.value) })}>
                      <option value={0}>Unassigned</option>
                      {data.suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </label>
                </>
              ) : (
                <label className="field">
                  New Stock Count
                  <input type="number" min={0} value={movementForm.newStock} onChange={(event) => setMovementForm({ ...movementForm, newStock: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
              )}
              <label className="field">
                Reference No.
                <input value={movementForm.referenceNo} onChange={(event) => setMovementForm({ ...movementForm, referenceNo: event.target.value })} placeholder="Invoice, delivery receipt, or memo no." />
              </label>
              <label className="field form-wide">
                Reason
                <input value={movementForm.reason} onChange={(event) => setMovementForm({ ...movementForm, reason: event.target.value })} placeholder="Reason for stock movement" />
              </label>
            </div>
            <button className="primary-button" onClick={saveMovement}>Save {movementMode}</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop">
          <section className="modal-window inventory-window">
            <div className="panel-head">
              <h2>Approve Inventory Delete</h2>
              <button className="table-action" onClick={() => setDeleteTarget(null)}>Close</button>
            </div>
            <p className="empty-state">Deleting {deleteTarget.product_code} {deleteTarget.name} requires Owner/Admin approval.</p>
            <div className="form-grid">
              <label className="field">
                Approver Username
                <input value={deleteApproval.approvalUsername} onChange={(event) => setDeleteApproval({ ...deleteApproval, approvalUsername: event.target.value })} />
              </label>
              <label className="field">
                Approver Password
                <input type="password" value={deleteApproval.approvalPassword} onChange={(event) => setDeleteApproval({ ...deleteApproval, approvalPassword: event.target.value })} />
              </label>
              <label className="field form-wide">
                Reason
                <input value={deleteApproval.approvalReason} onChange={(event) => setDeleteApproval({ ...deleteApproval, approvalReason: event.target.value })} />
              </label>
            </div>
            <button className="primary-button danger-button" onClick={deleteItem}>Delete Inventory Item</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
    </div>
  );
}

function Jobs({ data, user, searchTerm = "", onRefresh, compact = false }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh?: () => Promise<void>; compact?: boolean }) {
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
  const selectedJobHistory = selectedJob ? data.jobStatusHistory.filter((entry) => entry.job_order_id === selectedJob.id) : [];
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
  }, [selectedJob?.id]);

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

  async function saveJob() {
    if (!selectedJob) return;
    setError("");
    setMessage("");
    try {
      const result = await withTimeout(window.talyer.updateJobOrder({ actorId: user.id, jobOrderId: selectedJob.id, status: statusDraft, products, additionalLaborCost }), "saving job order");
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
    setPaymentProcessingState("Processing transaction...");
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
        {message && <span className="form-success">{message}</span>}
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
          {jobRows.length === 0 && <p className="empty-state">No job orders yet. Create a new job order to start tracking repairs.</p>}
        </div>
        <PaginationControls page={jobPage.page} pageCount={jobPage.pageCount} total={jobRows.length} onPageChange={jobPage.setPage} />
      </section>

      {selectedJob && (
        <section className="panel job-detail">
          <div className="panel-head">
            <h2>{selectedJob.job_no}</h2>
            <Badge>{serviceNameForJob(selectedJob, data.services)}</Badge>
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
          <button className="primary-button" disabled={Boolean(selectedJob.paid_at) || isPaymentProcessing} onClick={saveJob}>Save</button>
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
                        <input value={paymentReferenceCode} disabled={isPaymentProcessing} onChange={(event) => setPaymentReferenceCode(event.target.value)} placeholder="Enter Reference Code" autoFocus />
                      </label>
                    )}
                    <button className="primary-button" disabled={isPaymentProcessing || !paymentMethod} onClick={completePayment}>Complete</button>
                    {activePaymentMethods.length === 0 && <span className="form-error form-wide">No active payment methods are configured.</span>}
                    {paymentProcessingState && <div className="processing-banner form-wide">{paymentProcessingState}</div>}
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

function parseJobProducts(raw: string | undefined): JobProduct[] {
  try {
    return JSON.parse(raw || "[]") as JobProduct[];
  } catch {
    return [];
  }
}

function serviceNameForJob(job: JobOrder, services: Service[]) {
  return services.find((service) => service.id === job.service_id)?.name ?? "Service not found";
}

function serviceTotal(service: Service) {
  return Number(service.price) + Number(service.labor_cost || 0);
}

function inventoryCostMap(inventory: InventoryItem[]) {
  return new Map(inventory.map((item) => [item.id, Number(item.unit_cost || 0)]));
}

function costOfGoodsSold(data: AppData, sales: Sale[], jobs: JobOrder[]) {
  const costs = inventoryCostMap(data.inventory);
  const saleIds = new Set(sales.map((sale) => sale.id));
  const saleCogs = data.saleItems
    .filter((item) => saleIds.has(item.sale_id) && item.item_type === "part")
    .reduce((sum, item) => sum + (costs.get(item.item_id) ?? 0) * item.quantity, 0);
  const jobCogs = jobs.reduce((sum, job) => sum + parseJobProducts(job.products_json)
    .reduce((jobSum, product) => jobSum + (costs.get(product.itemId) ?? 0) * product.quantity, 0), 0);
  return saleCogs + jobCogs;
}

function serviceLaborRevenue(jobs: JobOrder[]) {
  return jobs.reduce((sum, job) =>
    sum + Number(job.service_price || 0) + Number(job.labor_cost || 0) + Number(job.additional_labor_cost || 0), 0);
}

function suggestedReorderQuantity(item: InventoryItem) {
  return Math.max(Number(item.reorder_level || 0) * 2 - Number(item.stock || 0), 1);
}

function expensesTotal(expenses: Expense[], startDate: string, endDate: string) {
  return expenses
    .filter((expense) => rowMatchesDateRange(expense.expense_date, startDate, endDate))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function buildReportHtml(data: AppData, sales: Sale[], jobs: JobOrder[], startDate: string, endDate: string, exportedBy: string) {
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

function nextProductCodePreview(category: InventoryCategory, inventory: InventoryItem[]) {
  const maxSequence = inventory
    .filter((item) => item.category_id === category.id && item.product_code?.startsWith(`${category.code}-`))
    .reduce((max, item) => {
      const match = item.product_code.match(/-(\d+)$/);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
  return `${category.code}-${String(maxSequence + 1).padStart(3, "0")}`;
}

function normalizeJobStatusForUi(status: string) {
  if (status === "Ready" || status === "Released") return "Completed";
  return status;
}

function fallbackJobTimeline(job: JobOrder): Array<Pick<JobStatusHistory, "status" | "details" | "created_at" | "actor_name">> {
  const timeline = [
    { status: "Created", details: `Job order ${job.job_no} created.`, created_at: job.created_at, actor_name: "System" },
    { status: normalizeJobStatusForUi(job.status), details: "Current job status.", created_at: job.created_at, actor_name: "System" }
  ];
  if (job.paid_at) timeline.push({ status: "Paid", details: `Paid via ${job.payment_method || "payment method"}.`, created_at: job.paid_at, actor_name: "System" });
  return timeline;
}

function Customers({ data }: { data: AppData }) {
  return <DataTable title="Customers" rows={data.customers} columns={[
    { key: "name", label: "Name", render: (row) => row.name },
    { key: "phone", label: "Phone", render: (row) => row.phone },
    { key: "email", label: "Email", render: (row) => row.email || "None" },
    { key: "address", label: "Address", render: (row) => row.address }
  ]} />;
}

function Motorcycles({ data }: { data: AppData }) {
  return <DataTable title="Motorcycles" rows={data.motorcycles} columns={[
    { key: "plate", label: "Plate", render: (row) => row.plate_no },
    { key: "unit", label: "Unit", render: (row) => `${row.brand} ${row.model}` },
    { key: "year", label: "Year", render: (row) => row.year },
    { key: "owner", label: "Owner", render: (row) => row.customer_name },
    { key: "color", label: "Color", render: (row) => row.color }
  ]} />;
}

function Services({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const emptyForm = { name: "", category: "Maintenance", durationMinutes: 30, price: 0, laborCost: 0 };
  const [form, setForm] = useState(emptyForm);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canManageServices = ["Owner", "Admin"].includes(user.role);
  const categories = ["Engine", "Electrical", "Brake", "Suspension", "Maintenance", "Diagnostics", "Repair"];
  const serviceRows = data.services.filter((service) => valueMatchesSearch(searchTerm, [service.name, service.category]));
  const servicePage = useFilteredPagination(serviceRows, [searchTerm, data.services.length]);
  const savedServiceForm = editingService ? {
    name: editingService.name,
    category: editingService.category,
    durationMinutes: editingService.duration_minutes,
    price: editingService.price,
    laborCost: editingService.labor_cost || 0
  } : emptyForm;
  const serviceFormDirty = showForm && JSON.stringify(form) !== JSON.stringify(savedServiceForm);
  useUnsavedChanges("service-form", serviceFormDirty);

  function openCreate() {
    setEditingService(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEdit(service: Service) {
    setEditingService(service);
    setForm({
      name: service.name,
      category: service.category,
      durationMinutes: service.duration_minutes,
      price: service.price,
      laborCost: service.labor_cost || 0
    });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function saveService() {
    if (!canManageServices) return;
    setError("");
    setMessage("");
    if (!form.name.trim()) {
      setError("Service name is required.");
      return;
    }
    if (form.durationMinutes <= 0) {
      setError("Duration must be greater than zero.");
      return;
    }
    if (form.price < 0) {
      setError("Service price cannot be negative.");
      return;
    }
    if (form.laborCost < 0) {
      setError("Labor cost cannot be negative.");
      return;
    }
    try {
      if (typeof window.talyer.createService !== "function" || typeof window.talyer.updateService !== "function") {
        throw new Error("Service management is not loaded yet. Please restart the app.");
      }
      if (editingService) {
        await withTimeout(window.talyer.updateService({ actorId: user.id, serviceId: editingService.id, ...form }), "updating service");
        setMessage("Service updated successfully.");
      } else {
        await withTimeout(window.talyer.createService({ actorId: user.id, ...form }), "creating service");
        setMessage("Service added successfully.");
      }
      setShowForm(false);
      setEditingService(null);
      setForm(emptyForm);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save service. Please check the fields and try again."));
    }
  }

  async function deleteService(service: Service) {
    if (!canManageServices) return;
    const confirmed = window.confirm("Are you sure you want to delete this service?");
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      if (typeof window.talyer.deleteService !== "function") {
        throw new Error("Service management is not loaded yet. Please restart the app.");
      }
      await withTimeout(window.talyer.deleteService({ actorId: user.id, serviceId: service.id }), "deleting service");
      setMessage("Service deleted successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to delete service. It may already be used in existing job orders."));
    }
  }

  return (
    <section className="panel">
      <ToastBridge success={message} error={error} />
      <div className="panel-head">
        <h2>Services</h2>
        {canManageServices && <button className="primary-button compact-button" onClick={openCreate}>Add Service</button>}
      </div>
      {message && <span className="form-success">{message}</span>}
      {error && <span className="form-error">{error}</span>}
      {servicePage.isLoading && <div className="processing-banner">Updating records...</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Service Name</th>
              <th>Category</th>
              <th>Duration</th>
              <th>Price</th>
              <th>Labor Cost</th>
              <th>Total Quote</th>
              {canManageServices && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {servicePage.pagedRows.map((service) => (
              <tr key={service.id}>
                <td>{service.name}</td>
                <td>{service.category}</td>
                <td>{service.duration_minutes} min</td>
                <td>{money.format(service.price)}</td>
                <td>{money.format(service.labor_cost || 0)}</td>
                <td>{money.format(serviceTotal(service))}</td>
                {canManageServices && (
                  <td>
                    <div className="table-actions">
                      <button className="table-action" onClick={() => openEdit(service)}><Pencil size={15} /> Edit</button>
                      <button className="table-action danger-action" onClick={() => deleteService(service)}><Trash2 size={15} /> Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {serviceRows.length === 0 && (
              <tr>
                <td colSpan={canManageServices ? 7 : 6}>
                  <span className="table-empty-copy">No services yet. Add your first repair service from Services.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls page={servicePage.page} pageCount={servicePage.pageCount} total={serviceRows.length} onPageChange={servicePage.setPage} />
      {showForm && (
        <div className="modal-backdrop">
          <section className="modal-window">
            <div className="panel-head">
              <h2>{editingService ? "Edit Service" : "Add Service"}</h2>
              <button className="table-action" onClick={() => {
                if (confirmDiscardChanges(serviceFormDirty)) setShowForm(false);
              }}>Close</button>
            </div>
            <div className="form-grid">
              <label className="field">
                Service Name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Oil Change" autoFocus />
              </label>
              <label className="field">
                Category
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  {categories.map((category) => <option value={category} key={category}>{category}</option>)}
                </select>
              </label>
              <label className="field">
                Duration
                <input type="number" min={1} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Math.max(1, Number(event.target.value) || 1) })} />
              </label>
              <label className="field">
                Price
                <input type="number" min={0} value={form.price} onChange={(event) => setForm({ ...form, price: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
              <label className="field">
                Labor Cost
                <input type="number" min={0} value={form.laborCost} onChange={(event) => setForm({ ...form, laborCost: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
              <div className="credential-card">
                <span>Quotation Total</span>
                <strong>{money.format(Number(form.price) + Number(form.laborCost))}</strong>
                <small>Price plus labor cost will be used in job orders and receipts.</small>
              </div>
            </div>
            <button className="primary-button" onClick={saveService}>{editingService ? "Save Service" : "Create Service"}</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
    </section>
  );
}

function Staff({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const emptyForm = { name: "", contactNumber: "", address: "", status: "Active" as "Active" | "Disabled" };
  const [form, setForm] = useState(emptyForm);
  const [editingMechanic, setEditingMechanic] = useState<UserAccount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const mechanics = data.users
    .filter((account) => account.is_mechanic && !["Owner", "Admin"].includes(account.role))
    .filter((mechanic) => valueMatchesSearch(searchTerm, [mechanic.name, mechanic.address, mechanic.contact_number]));
  const mechanicPage = useFilteredPagination(mechanics, [searchTerm, data.users.length]);
  const canManageMechanics = ["Owner", "Admin"].includes(user.role);
  const savedMechanicForm = editingMechanic ? {
    name: editingMechanic.name,
    contactNumber: editingMechanic.contact_number || "",
    address: editingMechanic.address || "",
    status: editingMechanic.status === "Active" ? "Active" : "Disabled"
  } : emptyForm;
  const mechanicFormDirty = showForm && JSON.stringify(form) !== JSON.stringify(savedMechanicForm);
  useUnsavedChanges("mechanic-form", mechanicFormDirty);

  function updateContactNumber(value: string) {
    setForm({ ...form, contactNumber: value.replace(/[^0-9()\-\s]/g, "").slice(0, 18) });
  }

  function openCreate() {
    setEditingMechanic(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEdit(mechanic: UserAccount) {
    setEditingMechanic(mechanic);
    setForm({
      name: mechanic.name,
      contactNumber: mechanic.contact_number || "",
      address: mechanic.address || "",
      status: mechanic.status === "Active" ? "Active" : "Disabled"
    });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function saveMechanic() {
    if (!canManageMechanics) return;
    setError("");
    setMessage("");
    if (!form.name.trim()) {
      setError("Mechanic name is required.");
      return;
    }
    if (!isValidContactNumber(form.contactNumber)) {
      setError("Contact number must contain 10 to 11 digits.");
      return;
    }
    if (!form.address.trim()) {
      setError("Address is required.");
      return;
    }
    try {
      if (typeof window.talyer.createMechanic !== "function" || typeof window.talyer.updateMechanic !== "function") {
        throw new Error("Mechanic management is not loaded yet. Please restart the app.");
      }
      if (editingMechanic) {
        await withTimeout(window.talyer.updateMechanic({ actorId: user.id, mechanicId: editingMechanic.id, ...form }), "updating mechanic");
        setMessage("Mechanic updated successfully.");
      } else {
        await withTimeout(window.talyer.createMechanic({ actorId: user.id, ...form }), "creating mechanic");
        setMessage("Mechanic added successfully.");
      }
      setShowForm(false);
      setEditingMechanic(null);
      setForm(emptyForm);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save mechanic. Please check the fields and try again."));
    }
  }

  async function disableMechanic(mechanic: UserAccount) {
    if (!canManageMechanics) return;
    const confirmed = window.confirm("Are you sure you want to disable this mechanic?");
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      await withTimeout(window.talyer.setMechanicStatus({ actorId: user.id, mechanicId: mechanic.id, status: "Disabled" }), "disabling mechanic");
      setMessage("Mechanic disabled successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to disable mechanic. Please try again."));
    }
  }

  async function deleteMechanic(mechanic: UserAccount) {
    if (!canManageMechanics) return;
    const confirmed = window.confirm("Are you sure you want to delete this mechanic?");
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      await withTimeout(window.talyer.deleteMechanic({ actorId: user.id, mechanicId: mechanic.id }), "deleting mechanic");
      setMessage("Mechanic deleted successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to delete mechanic. It may already be assigned to job orders."));
    }
  }

  return (
    <section className="panel">
      <ToastBridge success={message} error={error} />
      <div className="panel-head">
        <h2>Mechanics</h2>
        {canManageMechanics && <button className="primary-button compact-button" onClick={openCreate}>Add Mechanic</button>}
      </div>
      {message && <span className="form-success">{message}</span>}
      {error && <span className="form-error">{error}</span>}
      {mechanicPage.isLoading && <div className="processing-banner">Updating records...</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact Number</th>
              <th>Address</th>
              <th>Status</th>
              {canManageMechanics && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {mechanicPage.pagedRows.map((mechanic) => (
              <tr key={mechanic.id}>
                <td>{mechanic.name}</td>
                <td>{mechanic.contact_number || "None"}</td>
                <td>{mechanic.address || "None"}</td>
                <td><Badge tone={mechanic.status === "Active" ? "good" : "danger"}>{mechanic.status === "Active" ? "Active" : "Inactive"}</Badge></td>
                {canManageMechanics && (
                  <td>
                    <div className="table-actions">
                      <button className="table-action" onClick={() => openEdit(mechanic)}><Pencil size={15} /> Edit</button>
                      <button className="table-action danger-action" disabled={mechanic.status !== "Active"} onClick={() => disableMechanic(mechanic)}>Disable</button>
                      <button className="table-action danger-action" onClick={() => deleteMechanic(mechanic)}><Trash2 size={15} /> Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {mechanics.length === 0 && (
              <tr>
                <td colSpan={canManageMechanics ? 5 : 4}>
                  <span className="table-empty-copy">No mechanics yet. Add your first mechanic from Mechanics.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls page={mechanicPage.page} pageCount={mechanicPage.pageCount} total={mechanics.length} onPageChange={mechanicPage.setPage} />
      {showForm && (
        <div className="modal-backdrop">
          <section className="modal-window">
            <div className="panel-head">
              <h2>{editingMechanic ? "Edit Mechanic" : "Add Mechanic"}</h2>
              <button className="table-action" onClick={() => {
                if (confirmDiscardChanges(mechanicFormDirty)) setShowForm(false);
              }}>Close</button>
            </div>
            <div className="form-grid">
              <label className="field">
                Name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Mechanic name" autoFocus />
              </label>
              <label className="field">
                Contact Number
                <input value={form.contactNumber} onChange={(event) => updateContactNumber(event.target.value)} inputMode="tel" maxLength={18} placeholder="0917-123-4567" />
              </label>
              <label className="field form-wide">
                Address
                <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Complete address" />
              </label>
              <label className="field">
                Status
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "Active" | "Disabled" })}>
                  <option value="Active">Active</option>
                  <option value="Disabled">Inactive</option>
                </select>
              </label>
            </div>
            <button className="primary-button" onClick={saveMechanic}>{editingMechanic ? "Save Mechanic" : "Create Mechanic"}</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
    </section>
  );
}

function Suppliers({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const emptyForm = { name: "", contact: "", phone: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canManageSuppliers = ["Owner", "Admin"].includes(user.role);
  const supplierRows = data.suppliers.filter((supplier) => valueMatchesSearch(searchTerm, [supplier.name, supplier.contact, supplier.phone]));
  const supplierPage = useFilteredPagination(supplierRows, [searchTerm, data.suppliers.length]);
  const savedSupplierForm = editingSupplier ? { name: editingSupplier.name, contact: editingSupplier.contact, phone: editingSupplier.phone } : emptyForm;
  const supplierFormDirty = showForm && JSON.stringify(form) !== JSON.stringify(savedSupplierForm);
  useUnsavedChanges("supplier-form", supplierFormDirty);

  function updateContactNumber(value: string) {
    setForm({ ...form, phone: value.replace(/[^0-9()\-\s]/g, "").slice(0, 18) });
  }

  function openCreate() {
    setEditingSupplier(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEdit(supplier: Supplier) {
    setEditingSupplier(supplier);
    setForm({ name: supplier.name, contact: supplier.contact, phone: supplier.phone });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  async function saveSupplier() {
    if (!canManageSuppliers) return;
    setError("");
    setMessage("");
    if (!form.name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    if (!form.contact.trim()) {
      setError("Contact person is required.");
      return;
    }
    if (!isValidContactNumber(form.phone)) {
      setError("Contact number must contain 10 to 11 digits.");
      return;
    }
    try {
      if (typeof window.talyer.createSupplier !== "function" || typeof window.talyer.updateSupplier !== "function") {
        throw new Error("Supplier management is not loaded yet. Please restart the app.");
      }
      if (editingSupplier) {
        await withTimeout(window.talyer.updateSupplier({ actorId: user.id, supplierId: editingSupplier.id, ...form }), "updating supplier");
        setMessage("Supplier updated successfully.");
      } else {
        await withTimeout(window.talyer.createSupplier({ actorId: user.id, ...form }), "creating supplier");
        setMessage("Supplier added successfully.");
      }
      setShowForm(false);
      setEditingSupplier(null);
      setForm(emptyForm);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save supplier. Please check the fields and try again."));
    }
  }

  async function deleteSupplier(supplier: Supplier) {
    if (!canManageSuppliers) return;
    const confirmed = window.confirm("Are you sure you want to delete this supplier?");
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      await withTimeout(window.talyer.deleteSupplier({ actorId: user.id, supplierId: supplier.id }), "deleting supplier");
      setMessage("Supplier deleted successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to delete supplier. It may already be linked to inventory items."));
    }
  }

  return (
    <section className="panel">
      <ToastBridge success={message} error={error} />
      <div className="panel-head">
        <h2>Suppliers</h2>
        {canManageSuppliers && <button className="primary-button compact-button" onClick={openCreate}>Add Supplier</button>}
      </div>
      {message && <span className="form-success">{message}</span>}
      {error && <span className="form-error">{error}</span>}
      {supplierPage.isLoading && <div className="processing-banner">Updating records...</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Supplier Name</th>
              <th>Contact Person</th>
              <th>Contact Number</th>
              {canManageSuppliers && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {supplierPage.pagedRows.map((supplier) => (
              <tr key={supplier.id}>
                <td>{supplier.name}</td>
                <td>{supplier.contact}</td>
                <td>{supplier.phone}</td>
                {canManageSuppliers && (
                  <td>
                    <div className="table-actions">
                      <button className="table-action" onClick={() => openEdit(supplier)}><Pencil size={15} /> Edit</button>
                      <button className="table-action danger-action" onClick={() => deleteSupplier(supplier)}><Trash2 size={15} /> Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {supplierRows.length === 0 && (
              <tr>
                <td colSpan={canManageSuppliers ? 4 : 3}>
                  <span className="table-empty-copy">No suppliers yet. Add your first supplier from Suppliers.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls page={supplierPage.page} pageCount={supplierPage.pageCount} total={supplierRows.length} onPageChange={supplierPage.setPage} />
      {showForm && (
        <div className="modal-backdrop">
          <section className="modal-window">
            <div className="panel-head">
              <h2>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</h2>
              <button className="table-action" onClick={() => {
                if (confirmDiscardChanges(supplierFormDirty)) setShowForm(false);
              }}>Close</button>
            </div>
            <div className="form-grid">
              <label className="field">
                Supplier Name
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Supplier name" autoFocus />
              </label>
              <label className="field">
                Contact Person
                <input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} placeholder="Contact person" />
              </label>
              <label className="field">
                Contact Number
                <input value={form.phone} onChange={(event) => updateContactNumber(event.target.value)} inputMode="tel" maxLength={18} placeholder="0917-123-4567" />
              </label>
            </div>
            <button className="primary-button" onClick={saveSupplier}>{editingSupplier ? "Save Supplier" : "Create Supplier"}</button>
            {error && <span className="form-error">{error}</span>}
          </section>
        </div>
      )}
    </section>
  );
}

function Reports({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const canUseReports = ["Owner", "Admin"].includes(user.role);
  const [activeReport, setActiveReport] = useState<"sales" | "jobs" | "expenses">("sales");
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

  const jobRows = useMemo(() => data.jobOrders.filter((job) => rowMatchesDateRange(job.created_at, startDate, endDate)
    && (!jobMechanicFilter || String(job.mechanic_id || "") === jobMechanicFilter)
    && (!jobServiceFilter || String(job.service_id || "") === jobServiceFilter)
    && (!jobStatusFilter || normalizeJobStatusForUi(job.status) === jobStatusFilter)
    && valueMatchesSearch(searchTerm, [job.job_no, job.customer_name, job.motorcycle_type, job.plate_no, job.mechanic_name, serviceNameForJob(job, data.services)])), [data.jobOrders, data.services, searchTerm, startDate, endDate, jobMechanicFilter, jobServiceFilter, jobStatusFilter]);

  const salesPage = useFilteredPagination(salesRows, [searchTerm, startDate, endDate, salesPaymentFilter, salesCashierFilter, data.sales.length]);
  const jobsPage = useFilteredPagination(jobRows, [searchTerm, startDate, endDate, jobMechanicFilter, jobServiceFilter, jobStatusFilter, data.jobOrders.length]);
  const dateRangeSales = data.sales.filter((sale) => sale.status === "Completed" && rowMatchesDateRange(sale.created_at, startDate, endDate));
  const dateRangeJobs = data.jobOrders.filter((job) => rowMatchesDateRange(job.created_at, startDate, endDate) && normalizeJobStatusForUi(job.status) === "Completed");
  const completedJobRows = jobRows.filter((job) => normalizeJobStatusForUi(job.status) === "Completed");
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
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Reports</h2>
          <button className="primary-button compact-button" disabled={isExporting} onClick={previewReportPdf}>Preview PDF Report</button>
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
        {message && <span className="form-success">{message}</span>}
        {error && <span className="form-error">{error}</span>}
        <div className="report-tabs">
          <button className={activeReport === "sales" ? "category-pill active" : "category-pill"} onClick={() => setActiveReport("sales")}>Sales Reports</button>
          <button className={activeReport === "jobs" ? "category-pill active" : "category-pill"} onClick={() => setActiveReport("jobs")}>Job Order Reports</button>
          <button className={activeReport === "expenses" ? "category-pill active" : "category-pill"} onClick={() => setActiveReport("expenses")}>Expenses</button>
        </div>
      </section>

      {activeReport === "sales" ? (
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
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>Expense Tracking</h2>
            <Badge>{money.format(expenseRows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0))}</Badge>
          </div>
          <div className="form-grid">
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
            <label className="field form-wide">
              Description
              <input value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} placeholder="e.g. Monthly shop rent" />
            </label>
          </div>
          <div className="inline-controls">
            <button className="primary-button compact-button" onClick={saveExpense}>{editingExpense ? "Update Expense" : "Add Expense"}</button>
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
            <button className="primary-button" disabled={isExporting} onClick={exportReportPdf}>Save PDF Report</button>
          </section>
        </div>
      )}
    </div>
  );
}

function UsersModule({ data, user, searchTerm = "", onRefresh }: { data: AppData; user: UserAccount; searchTerm?: string; onRefresh: () => Promise<void> }) {
  const emptyForm: Omit<CreateUserPayload, "creatorId"> = {
    role: "Cashier",
    name: "",
    contactNumber: "",
    address: "",
    email: "",
    username: ""
  };
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string; emailSent: boolean } | null>(null);
  const [showCreateWindow, setShowCreateWindow] = useState(false);
  const userRows = data.users
    .filter((account) => !account.is_mechanic)
    .filter((account) => valueMatchesSearch(searchTerm, [
      account.name,
      account.username,
      account.role,
      account.contact_number,
      account.email,
      account.address,
      account.status,
      account.must_change_password ? "must change password" : "ready"
    ]));
  const userPage = useFilteredPagination(userRows, [searchTerm, data.users.length]);
  const userFormDirty = showCreateWindow && JSON.stringify(form) !== JSON.stringify(emptyForm);
  useUnsavedChanges("user-form", userFormDirty);

  function updateContactNumber(value: string) {
    setForm({ ...form, contactNumber: value.replace(/[^0-9()\-\s]/g, "").slice(0, 18) });
  }

  async function submit() {
    setError("");
    setMessage("");
    setCredentials(null);
    if (!form.username.trim()) {
      setError("Username is required.");
      return;
    }
    if (!form.name.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!isValidContactNumber(form.contactNumber)) {
      setError("Contact number must contain 10 to 11 digits.");
      return;
    }
    if (!form.address.trim()) {
      setError("Address is required.");
      return;
    }
    if (form.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    try {
      const result = await withTimeout(window.talyer.createUser({ ...form, creatorId: user.id }), "creating user");
      setCredentials(result.credentials);
      setMessage(result.credentials.emailSent ? "User created. Credentials are shown below and marked for email delivery." : "User created. Share the temporary password securely.");
      setForm(emptyForm);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to create user. Please check the fields and try again."));
    }
  }

  async function disableAccount(targetUser: UserAccount) {
    const confirmed = window.confirm("Are you sure you want to disable this account? The user will no longer be able to log in.");
    if (!confirmed) return;
    setError("");
    setMessage("");
    setCredentials(null);
    try {
      await withTimeout(window.talyer.disableUser({ ownerId: user.id, targetUserId: targetUser.id }), "disabling user");
      setMessage(`${targetUser.username} has been disabled.`);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to disable this user. Please try again."));
    }
  }

  async function enableAccount(targetUser: UserAccount) {
    setError("");
    setMessage("");
    setCredentials(null);
    try {
      await withTimeout(window.talyer.enableUser({ ownerId: user.id, targetUserId: targetUser.id }), "enabling user");
      setMessage(`${targetUser.username} has been re-enabled.`);
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to re-enable this user. Please try again."));
    }
  }

  return (
    <div className="user-management">
      <ToastBridge success={message} error={error} />
      <section className="panel user-form-panel">
        <div className="panel-head">
          <h2>User Management</h2>
          <button className="primary-button compact-button" onClick={() => {
            setError("");
            setMessage("");
            setCredentials(null);
            setShowCreateWindow(true);
          }}>
            <UserPlus size={16} />
            New User
          </button>
        </div>
        <p className="empty-state">Create and manage user accounts. New user creation opens in a separate window.</p>
        {message && !showCreateWindow && <span className="form-success">{message}</span>}
        {error && !showCreateWindow && <span className="form-error">{error}</span>}
        {showCreateWindow && (
          <div className="modal-backdrop">
            <section className="modal-window user-create-window">
              <div className="panel-head">
                <h2>Create User</h2>
                <button className="table-action" onClick={() => {
                  if (confirmDiscardChanges(userFormDirty)) {
                    setError("");
                    setMessage("");
                    setCredentials(null);
                    setShowCreateWindow(false);
                  }
                }}>Close</button>
              </div>
              <div className="form-grid">
                <label className="field">
                  Role
                  <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
                    <option>Owner</option>
                    <option>Admin</option>
                    <option>Cashier</option>
                  </select>
                </label>
                <label className="field">
                  Username
                  <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="e.g. maria.admin" autoFocus />
                </label>
                <label className="field">
                  Full Name
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Full name" />
                </label>
                <label className="field">
                  Contact Number
                  <input value={form.contactNumber} onChange={(event) => updateContactNumber(event.target.value)} inputMode="tel" maxLength={18} placeholder="0917-123-4567" />
                </label>
                <label className="field form-wide">
                  Address
                  <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Complete address" />
                </label>
                <label className="field form-wide">
                  Email Address
                  <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Optional" />
                </label>
              </div>
              <button className="primary-button" onClick={submit}>Create user and generate password</button>
              {error && <span className="form-error">{error}</span>}
              {message && <span className="form-success">{message}</span>}
              {credentials && (
                <div className="credential-card">
                  <span>Generated Credentials</span>
                  <strong>Username: {credentials.username}</strong>
                  <strong>Temporary Password: {credentials.temporaryPassword}</strong>
                  <small>The user must change this password on first login before accessing the system.</small>
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {userPage.isLoading && <div className="processing-banner">Updating records...</div>}
      <DataTable<UserAccount>
        title="User Accounts"
        rows={userPage.pagedRows}
        emptyMessage="No user accounts found. Create a new user to grant system access."
        footer={<PaginationControls page={userPage.page} pageCount={userPage.pageCount} total={userRows.length} onPageChange={userPage.setPage} />}
        columns={[
          { key: "name", label: "Name", render: (row) => row.name },
          { key: "username", label: "Username", render: (row) => row.username },
          { key: "role", label: "Role", render: (row) => <Badge tone={roleTone(row.role)}>{row.role}</Badge> },
          { key: "contact", label: "Contact", render: (row) => row.contact_number || "None" },
          { key: "email", label: "Email", render: (row) => row.email || "None" },
          { key: "security", label: "Security", render: (row) => row.must_change_password ? <Badge tone="warn">Must change</Badge> : <Badge tone="good">Ready</Badge> },
          { key: "status", label: "Status", render: (row) => <Badge tone={row.status === "Active" ? "good" : "danger"}>{row.status}</Badge> },
          {
            key: "actions",
            label: "Actions",
            render: (row) =>
              row.status === "Active" ? (
                <button className="table-action danger-action" disabled={row.id === user.id} onClick={() => disableAccount(row)}>
                  <UserMinus size={15} />
                  Disable
                </button>
              ) : (
                <button className="table-action success-action" onClick={() => enableAccount(row)}>
                  <UserCheck size={15} />
                  Enable
                </button>
              )
          }
        ]}
      />
    </div>
  );
}

function Audit({ data, searchTerm = "" }: { data: AppData; searchTerm?: string }) {
  const auditRows = data.auditLogs.filter((row) => valueMatchesSearch(searchTerm, [
    formatDateTime(row.created_at),
    row.user_name ?? "System",
    row.action,
    row.entity,
    row.details
  ]));
  const auditPage = useFilteredPagination(auditRows, [searchTerm, data.auditLogs.length]);

  return (
    <section className="content-grid">
      {auditPage.isLoading && <div className="processing-banner">Updating records...</div>}
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

function SettingsModule({ data, user, onRefresh }: { data: AppData; user: UserAccount; onRefresh: () => Promise<void> }) {
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
    paperWidth: 58,
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
    paper_width: 58,
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
    total: 1280
  });

  return (
    <div className="settings-layout">
      <ToastBridge success={message || paymentMessage || printerMessage || categoryMessage} error={error || paymentError || printerError || categoryError} />
      <div className="settings-stack">
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
                <label className="check-field">
                  <input type="checkbox" checked={settings.showTaxId} onChange={(event) => setSettings({ ...settings, showTaxId: event.target.checked })} />
                  Show Tax ID
                </label>
                <label className="check-field">
                  <input type="checkbox" checked={settings.showCashier} onChange={(event) => setSettings({ ...settings, showCashier: event.target.checked })} />
                  Show cashier name
                </label>
              </div>
            </section>
            <button className="primary-button" onClick={saveSettings}>Save Settings</button>
            {message && <span className="form-success">{message}</span>}
            {error && <span className="form-error">{error}</span>}
            <section className="panel settings-panel">
              <div className="panel-head">
                <h2>Payment Methods</h2>
                <button className="primary-button compact-button" onClick={openPaymentCreate}>Add Payment Method</button>
              </div>
              {paymentMessage && <span className="form-success">{paymentMessage}</span>}
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
            <div className="form-grid">
              <label className="field">
                Approver Username
                <input value={printerApproval.approvalUsername} onChange={(event) => setPrinterApproval({ ...printerApproval, approvalUsername: event.target.value })} />
              </label>
              <label className="field">
                Approver Password
                <input type="password" value={printerApproval.approvalPassword} onChange={(event) => setPrinterApproval({ ...printerApproval, approvalPassword: event.target.value })} />
              </label>
              <label className="field form-wide">
                Reason
                <input value={printerApproval.approvalReason} onChange={(event) => setPrinterApproval({ ...printerApproval, approvalReason: event.target.value })} placeholder="Reason for changing printer settings" />
              </label>
            </div>
          </div>
          <button className="primary-button" onClick={savePrinterSettings}>Save Printer Settings</button>
          {printerMessage && <span className="form-success">{printerMessage}</span>}
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
          {categoryMessage && <span className="form-success">{categoryMessage}</span>}
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

function roleTone(role: Role) {
  if (role === "SuperAdmin") return "danger";
  if (role === "Owner") return "danger";
  if (role === "Admin") return "warn";
  return "good";
}

function RecordsToolbar({
  children,
  onClear,
  showClear
}: {
  children?: ReactNode;
  onClear?: () => void;
  showClear?: boolean;
}) {
  return (
    <div className="records-toolbar">
      <div className="records-filters">{children}</div>
      {showClear && <button className="secondary-button compact-button" onClick={onClear}>Clear Filters</button>}
    </div>
  );
}

function PaginationControls({ page, pageCount, total, onPageChange }: { page: number; pageCount: number; total: number; onPageChange: (page: number) => void }) {
  return (
    <div className="pagination-bar">
      <span>{total === 0 ? "No records" : `Page ${page} of ${pageCount}`}</span>
      <div className="pagination-controls">
        <button className="table-action" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
          <button className={pageNumber === page ? "table-action active-page" : "table-action"} key={pageNumber} onClick={() => onPageChange(pageNumber)}>
            {pageNumber}
          </button>
        ))}
        <button className="table-action" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export default App;
