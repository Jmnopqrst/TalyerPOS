import { Component, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ErrorInfo, ReactNode } from "react";
import QRCode from "qrcode";
import { AlertTriangle, Boxes, BriefcaseBusiness, CalendarClock, ClipboardList, Download, Gauge, HardDrive, KeyRound, LogOut, PackageCheck, PackagePlus, Pencil, Printer, ReceiptText, Search, Settings, ShieldCheck, ShoppingCart, Trash2, UserCheck, UserMinus, UserPlus, Users, Wrench } from "lucide-react";
import { Badge } from "../components/Badge";
import { Brand } from "../components/Brand";
import { DataTable } from "../components/DataTable";
import { PaginationControls } from "../components/PaginationControls";
import { StatCard } from "../components/StatCard";
import { ToastBridge, ToastProvider } from "../components/Toast";
import { canAccess, modulesFor, type ModuleKey } from "../data/permissions";
import type { AppData, CartItem, CompensationType, CreateUserPayload, DataScope, Expense, InventoryAdjustment, InventoryCategory, InventoryItem, JobOrder, JobProduct, JobStatusHistory, MechanicAttendance, PaymentCategory, PaymentMethod, PayrollRun, PayrollType, PrinterOption, ReceiptSettings, Role, Sale, SaleItem, Service, Supplier, SuperAdminSettings, UserAccount } from "../types/global";
import { Audit } from "./features/audit/Audit";
import { Customers } from "./features/customers/Customers";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Jobs } from "./features/jobs/Jobs";
import { Payroll } from "./features/payroll/Payroll";
import { Pos } from "./features/pos/Pos";
import { Purchases } from "./features/purchases/Purchases";
import { Reports } from "./features/reports/Reports";
import { SettingsModule } from "./features/settings/SettingsModule";
import { SetupWizard, buildSetupSteps } from "./features/setup/SetupWizard";
import { Services } from "./features/services/Services";
import { Staff } from "./features/staff/Staff";
import { Suppliers } from "./features/suppliers/Suppliers";
import { Inventory } from "./features/inventory/Inventory";
import { SuperAdminConsole } from "./features/super-admin/SuperAdminConsole";
import { UsersModule } from "./features/users/UsersModule";
import { suggestedReorderQuantity } from "./documents/report";
import { useFilteredPagination } from "./hooks/useFilteredPagination";
import { useGlobalQrAttendanceScanner } from "./hooks/useGlobalQrAttendanceScanner";
import { friendlyError, withTimeout } from "./lib/api";
import { normalizeAppData } from "./lib/appData";
import { approvalReady, approvalValidationError, emptyApproval } from "./lib/approval";
import { dateInputValue, formatDateOnly, formatDateTime, formatTimeOnly, rowMatchesDate, rowMatchesDateRange, todayInputValue } from "./lib/date";
import { confirmDiscardChanges, DirtyContext, DirtyProvider, useUnsavedChanges } from "./lib/dirty";
import { escapeHtml, formatBytes, money, nextBackupText } from "./lib/format";
import { normalizeSearch, valueMatchesSearch } from "./lib/search";
import { normalizeJobStatusForUi } from "./features/shared/featureUtils";
import "./styles.css";

function contactDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidContactNumber(value: string) {
  const digits = contactDigits(value);
  return digits.length >= 10 && digits.length <= 11;
}

function closeOnEscape(event: KeyboardEvent, close: () => void) {
  if (event.key === "Escape") close();
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Renderer crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="loading">
        <div className="load-error">
          <span className="form-error">The app hit an error after login: {this.state.error.message}</span>
          <button className="primary-button" onClick={() => window.location.reload()}>Reload App</button>
        </div>
      </main>
    );
  }
}

function ReceiptStatusTimeline({ current, done = false }: { current: string; done?: boolean }) {
  if (!current && !done) return null;
  const steps = ["Saving transaction", "Generating receipt", "Printing / Saving PDF", "Done"];
  const activeIndex = done ? steps.length - 1 : Math.max(0, steps.findIndex((step) => current.toLowerCase().includes(step.toLowerCase().split(" / ")[0])));

  return (
    <div className="receipt-status-timeline">
      {steps.map((step, index) => (
        <span className={index < activeIndex || done ? "done" : index === activeIndex ? "active" : ""} key={step}>
          {step}
        </span>
      ))}
    </div>
  );
}

function buildReceiptHtml(settings: ReceiptSettings, receipt: ReceiptBuildInput) {
  const isLetter = Number(settings.paper_width) === 216;
  const widthMm = isLetter ? 216 : Number(settings.paper_width) === 80 ? 80 : 58;
  const heightMm = isLetter ? 279 : 160;
  const compact = settings.receipt_template === "Compact";
  const logoPx = settings.logo_size === "Large" ? 92 : settings.logo_size === "Small" ? 48 : 68;
  const paddingMm = isLetter ? 18 : widthMm === 80 ? 5 : 4;
  const fontSize = isLetter ? 13 : compact ? 10 : 11;
  const safe = (value: string | number | undefined) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] ?? char));
  const rows = receipt.lines.map((line, index) => `
    <tr>
      ${compact ? "" : `<td class="muted">${index + 1}</td>`}
      <td>${safe(line.name)}</td>
      <td class="right">${safe(String(line.quantity))}</td>
      ${compact ? "" : `<td class="right">${safe(money.format(line.unitPrice))}</td>`}
      <td class="right">${safe(money.format(line.quantity * line.unitPrice))}</td>
    </tr>
  `).join("");
  const footerCopy = settings.custom_footer || settings.footer_message || "Thank you for your business.";
  const headerCopy = settings.custom_header;
  const breakdown = receipt.breakdown;
  const showBreakdown = Boolean(breakdown && settings.show_labor_breakdown === 1 && !compact);

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${safe(receipt.receiptNo)}</title>
        <meta name="receipt-width-mm" content="${widthMm}" />
        <meta name="receipt-height-mm" content="${heightMm}" />
        <style>
          @page { size: ${isLetter ? "letter" : `${widthMm}mm auto`}; margin: 0; }
          * { box-sizing: border-box; }
          html, body { min-height: ${isLetter ? `${heightMm}mm` : "auto"}; }
          body {
            width: ${widthMm}mm;
            margin: 0;
            color: #171512;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${fontSize}px;
          }
          .page {
            display: grid;
            min-height: ${isLetter ? `${heightMm}mm` : "auto"};
            grid-template-rows: auto auto 1fr auto;
            padding: ${paddingMm}mm;
          }
          .topbar {
            display: ${isLetter ? "flex" : "grid"};
            align-items: flex-start;
            justify-content: space-between;
            gap: ${isLetter ? "24px" : "8px"};
            border-bottom: 3px solid #dc382a;
            padding-bottom: ${isLetter ? "18px" : "10px"};
            text-align: ${isLetter ? "left" : "center"};
          }
          .logo {
            width: ${logoPx}px;
            height: ${logoPx}px;
            object-fit: contain;
            margin: ${isLetter ? "0 0 10px" : "0 auto 8px"};
          }
          .brand h1 {
            margin: 0 0 8px;
            color: #171512;
            font-size: ${isLetter ? "28px" : compact ? "16px" : "18px"};
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
            min-width: ${isLetter ? "210px" : "0"};
            text-align: ${isLetter ? "right" : "center"};
          }
          .receipt-title h2 {
            margin: 0 0 8px;
            color: #dc382a;
            font-size: ${isLetter ? "30px" : compact ? "17px" : "20px"};
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
            grid-template-columns: ${isLetter ? "1fr 1fr" : "1fr"};
            gap: ${isLetter ? "18px" : "8px"};
            margin: ${isLetter ? "24px 0" : "10px 0"};
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
            font-size: ${isLetter ? "12px" : "10px"};
            text-align: left;
            text-transform: uppercase;
          }
          th,
          td {
            padding: ${isLetter ? "11px 10px" : "6px 3px"};
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
            width: ${isLetter ? "270px" : "100%"};
          }
          .totals td {
            padding: 8px 10px;
          }
          .grand-total td {
            border-top: 2px solid #211f1b;
            border-bottom: 0;
            color: #dc382a;
            font-size: ${isLetter ? "18px" : "14px"};
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
              ${settings.logo_data_url ? `<img class="logo" src="${safe(settings.logo_data_url)}" alt="" />` : ""}
              <h1>${safe(settings.business_name)}</h1>
              ${headerCopy ? `<p><strong>${safe(headerCopy)}</strong></p>` : ""}
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

          ${compact ? "" : `<section class="info-grid">
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
          </section>`}

          <section>
            <table>
              <thead>
                <tr>
                  ${compact ? "" : `<th style="width: 52px;">No.</th>`}
                  <th>Description</th>
                  <th class="right" style="width: 86px;">Qty</th>
                  ${compact ? "" : `<th class="right" style="width: 130px;">Unit Price</th>`}
                  <th class="right" style="width: 130px;">Amount</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            ${showBreakdown ? `
              <div class="totals">
                <table>
                  <tr><td>Service Cost</td><td class="right">${safe(money.format(breakdown?.servicePrice ?? 0))}</td></tr>
                  <tr><td>Labor Cost</td><td class="right">${safe(money.format(breakdown?.laborCost ?? 0))}</td></tr>
                  <tr><td>Additional Labor Cost</td><td class="right">${safe(money.format(breakdown?.additionalLaborCost ?? 0))}</td></tr>
                  <tr><td>Products Total</td><td class="right">${safe(money.format(breakdown?.productsTotal ?? 0))}</td></tr>
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
            <p>${safe(footerCopy)}</p>
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
  customers: "Customers",
  services: "Services",
  staff: "Mechanics",
  suppliers: "Suppliers",
  purchases: "Purchases",
  reports: "Reports",
  payroll: "Payroll",
  users: "Users",
  settings: "Settings",
  audit: "Audit Logs"
};

const moduleIcons: Record<ModuleKey, ReactNode> = {
  dashboard: <Gauge size={18} />,
  pos: <ShoppingCart size={18} />,
  inventory: <Boxes size={18} />,
  jobs: <ClipboardList size={18} />,
  customers: <Users size={18} />,
  services: <Wrench size={18} />,
  staff: <BriefcaseBusiness size={18} />,
  suppliers: <PackagePlus size={18} />,
  purchases: <PackageCheck size={18} />,
  reports: <ReceiptText size={18} />,
  payroll: <BriefcaseBusiness size={18} />,
  users: <ShieldCheck size={18} />,
  settings: <Settings size={18} />,
  audit: <ClipboardList size={18} />
};

const moduleDataScopes: Record<ModuleKey, DataScope> = {
  dashboard: "all",
  pos: "sales",
  inventory: "inventory",
  jobs: "jobs",
  customers: "customers",
  services: "all",
  staff: "staff",
  suppliers: "suppliers",
  purchases: "purchases",
  reports: "reports",
  payroll: "payroll",
  users: "users",
  settings: "settings",
  audit: "audit"
};

function AppContent() {
  const dirtyContext = useContext(DirtyContext);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pendingPasswordUser, setPendingPasswordUser] = useState<UserAccount | null>(null);
  const [loginError, setLoginError] = useState("");
  const [dataError, setDataError] = useState("");
  const [data, setData] = useState<AppData | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [globalSearch, setGlobalSearch] = useState("");
  const [setupDismissed, setSetupDismissed] = useState(() => window.localStorage.getItem("talyerpos.setup.dismissed") === "1");

  async function refresh(scope: DataScope = "all") {
    try {
      if (!data || scope === "all") {
        const next = await withTimeout(window.talyer.listData(), "loading shop data");
        setData(normalizeAppData(next));
      } else {
        const next = await withTimeout(window.talyer.listDataScope({ scope }), `loading ${scope} data`);
        setData((current) => normalizeAppData({ ...(current ?? {}), ...next }));
      }
      setDataError("");
    } catch (caught) {
      setDataError(friendlyError(caught, "Unable to load records. Please try again."));
    }
  }

  const refreshPayrollAfterScan = useCallback(() => refresh("payroll"), [data]);
  useGlobalQrAttendanceScanner({ user, enabled: Boolean(user && data), onRecorded: refreshPayrollAfterScan });

  useEffect(() => {
    if (user) void refresh();
  }, [user]);

  useEffect(() => {
    if (!data) void refresh();
  }, []);

  useEffect(() => {
    if (data?.receiptSettings.system_name) document.title = data.receiptSettings.system_name;
  }, [data?.receiptSettings.system_name]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const closeFromBackdrop = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.classList.contains("modal-backdrop")) return;
      const closeButton = Array.from(target.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim().toLowerCase() === "close");
      closeButton?.click();
    };
    document.addEventListener("mousedown", closeFromBackdrop);
    return () => document.removeEventListener("mousedown", closeFromBackdrop);
  }, []);

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

  const allowedModules = modulesFor(user.role).filter((module) => module !== "payroll" || Boolean(data?.superAdminSettings.payroll_module_enabled));
  const visibleModule = canAccess(user.role, activeModule) ? activeModule : allowedModules[0];
  const setupSteps = buildSetupSteps(data);
  const showSetupWizard = user.role === "Owner" && !setupDismissed && setupSteps.some((step) => !step.done);
  const refreshVisibleModule = () => refresh(moduleDataScopes[visibleModule]);
  function changeModule(module: ModuleKey) {
    if (module === visibleModule) return;
    if (confirmDiscardChanges(Boolean(dirtyContext?.isDirty))) setActiveModule(module);
  }
  function dismissSetupWizard() {
    window.localStorage.setItem("talyerpos.setup.dismissed", "1");
    setSetupDismissed(true);
  }

  return (
    <div className="app-shell">
      <input className="global-scanner-input" tabIndex={-1} aria-hidden="true" inputMode="none" />
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
            <input ref={searchInputRef} value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder={`Search ${moduleLabels[visibleModule].toLowerCase()}`} />
          </div>
        </header>
        {showSetupWizard && (
          <SetupWizard
            data={data}
            onDismiss={dismissSetupWizard}
            onOpenModule={(module) => {
              if (confirmDiscardChanges(Boolean(dirtyContext?.isDirty))) setActiveModule(module);
            }}
          />
        )}
        <ModuleView module={visibleModule} data={data} user={user} searchTerm={globalSearch} onRefresh={refreshVisibleModule} />
      </main>
    </div>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <ToastProvider>
        <DirtyProvider>
          <AppContent />
        </DirtyProvider>
      </ToastProvider>
    </AppErrorBoundary>
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

function ModuleView({ module, data, user, searchTerm, onRefresh }: { module: ModuleKey; data: AppData; user: UserAccount; searchTerm: string; onRefresh: () => Promise<void> }) {
  if (module === "dashboard") return <Dashboard data={data} user={user} />;
  if (module === "pos") return <Pos data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "inventory") return <Inventory data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "jobs") return <Jobs data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "customers") return <Customers data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "services") return <Services data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "staff") return <Staff data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "suppliers") return <Suppliers data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "purchases") return <Purchases data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "reports") return <Reports data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "payroll") return <Payroll data={data} user={user} onRefresh={onRefresh} />;
  if (module === "users") return <UsersModule data={data} user={user} searchTerm={searchTerm} onRefresh={onRefresh} />;
  if (module === "audit") return <Audit data={data} user={user} searchTerm={searchTerm} />;
  return <SettingsModule data={data} user={user} onRefresh={onRefresh} />;
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

function hoursDisplay(start: string, end: string) {
  return (Math.max(0, new Date(end).getTime() - new Date(start).getTime()) / 36e5).toFixed(2);
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

export default App;



