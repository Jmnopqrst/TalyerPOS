import { useEffect, useState } from "react";
import { Boxes, ClipboardList, Gauge, LogOut, PackagePlus, ReceiptText, Settings } from "lucide-react";
import { Badge } from "../../../components/Badge";
import { Brand } from "../../../components/Brand";
import { PaginationControls } from "../../../components/PaginationControls";
import { StatCard } from "../../../components/StatCard";
import { ToastBridge } from "../../../components/Toast";
import type { BackupRestorePreview, ReceiptSettings, SuperAdminData, UserAccount } from "../../../types/global";
import { useFilteredPagination } from "../../hooks/useFilteredPagination";
import { friendlyError, withTimeout } from "../../lib/api";
import { formatDateOnly, formatDateTime } from "../../lib/date";
import { formatBytes, nextBackupText } from "../../lib/format";

// Feature: Super Admin system health, backup scheduling, restore/reset, and logs.
function safeBackupSchedule(value: string): "Disabled" | "Daily" | "Weekly" | "Monthly" {
  return ["Daily", "Weekly", "Monthly"].includes(value) ? value as "Daily" | "Weekly" | "Monthly" : "Disabled";
}

export function SuperAdminConsole({ user, settings, onSignOut }: { user: UserAccount; settings?: ReceiptSettings; onSignOut: () => void }) {
  const [consoleData, setConsoleData] = useState<SuperAdminData | null>(null);
  const [trialDays, setTrialDays] = useState(30);
  const [trialEnabled, setTrialEnabled] = useState(true);
  const [payrollModuleEnabled, setPayrollModuleEnabled] = useState(false);
  const [backupForm, setBackupForm] = useState({
    backupSchedule: "Disabled" as "Disabled" | "Daily" | "Weekly" | "Monthly",
    backupTime: "23:00",
    backupWeekday: 0,
    backupMonthDay: 1,
    backupFolder: "",
    backupRetentionCount: 10
  });
  const [licenseKey, setLicenseKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [restorePreview, setRestorePreview] = useState<BackupRestorePreview | null>(null);

  async function loadConsoleData() {
    try {
      const next = await withTimeout(window.talyer.getSuperAdminData(), "loading super admin console");
      setConsoleData(next);
      setTrialDays(next.settings.trial_days);
      setTrialEnabled(Boolean(next.settings.trial_enabled));
      setPayrollModuleEnabled(Boolean(next.settings.payroll_module_enabled));
      setBackupForm({
        backupSchedule: safeBackupSchedule(next.settings.backup_schedule),
        backupTime: next.settings.backup_time || "23:00",
        backupWeekday: Number(next.settings.backup_weekday || 0),
        backupMonthDay: Number(next.settings.backup_month_day || 1),
        backupFolder: next.settings.backup_folder || "",
                    backupRetentionCount: Math.max(7, Math.min(30, Number(next.settings.backup_retention_count || 10)))
      });
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
      return true;
    } catch (caught) {
      setError(friendlyError(caught, `${label} failed. Please try again.`));
      return false;
    } finally {
      setProcessing("");
    }
  }

  async function saveTrialSettings() {
    await runAction("Trial settings update", () => window.talyer.updateTrialSettings({
      superAdminId: user.id,
      trialEnabled,
      trialDays,
      licenseKey,
      payrollModuleEnabled
    }));
  }

  async function chooseBackupFolder() {
    try {
      const folder = await withTimeout(window.talyer.chooseBackupFolder(), "choosing backup folder");
      if (folder) setBackupForm((current) => ({ ...current, backupFolder: folder }));
    } catch (caught) {
      setError(friendlyError(caught, "Unable to choose backup folder."));
    }
  }

  async function saveBackupSettings() {
    await runAction("Automatic backup settings update", () => window.talyer.updateAutomaticBackupSettings({
      superAdminId: user.id,
      ...backupForm,
      backupSchedule: safeBackupSchedule(backupForm.backupSchedule)
    }));
  }

  async function openBackupFolder() {
    try {
      const opened = await withTimeout(window.talyer.openBackupFolder(), "opening backup folder");
      setMessage(opened ? "Backup folder opened." : "Unable to open backup folder.");
    } catch (caught) {
      setError(friendlyError(caught, "Unable to open backup folder."));
    }
  }

  async function clearDatabase() {
    if (!confirmPassword.trim()) {
      setError("Super Admin password confirmation is required before clearing the database.");
      return;
    }
    const completed = await runAction("Database reset", () => window.talyer.clearDatabase({ superAdminId: user.id, password: confirmPassword }));
    if (completed) {
      setConfirmPassword("");
      setMessage("Database and system settings successfully reset to default. Default Owner account has been recreated.");
    }
  }

  async function restoreDatabase() {
    if (!restorePassword.trim()) {
      setError("Super Admin password confirmation is required before restoring a backup.");
      return;
    }
    const completed = await runAction("Database restore", () => window.talyer.restoreDatabase({ superAdminId: user.id, password: restorePassword, restorePath: restorePreview?.filePath }));
    if (completed) {
      setRestorePassword("");
      setRestorePreview(null);
    }
  }

  async function previewRestoreDatabase() {
    if (!restorePassword.trim()) {
      setError("Super Admin password confirmation is required before previewing a backup.");
      return;
    }
    setProcessing("Restore preview");
    setMessage("");
    setError("");
    try {
      const preview = await withTimeout(window.talyer.previewRestoreDatabase({ superAdminId: user.id, password: restorePassword }), "previewing restore backup");
      setRestorePreview(preview);
      setMessage(preview ? "Backup preview completed successfully." : "Backup preview cancelled.");
      await loadConsoleData();
    } catch (caught) {
      setError(friendlyError(caught, "Backup preview failed. Please choose a valid backup file."));
    } finally {
      setProcessing("");
    }
  }

  const trial = consoleData?.settings.trial;
  const nextBackup = consoleData ? nextBackupText(consoleData.settings) : "Not scheduled";
  const backupUsage = consoleData ? formatBytes(consoleData.backupHistory.reduce((sum, backup) => sum + Number(backup.file_size || 0), 0)) : "0 B";
  const backupFolderUnavailable = consoleData ? consoleData.settings.backup_schedule !== "Disabled" && !consoleData.settings.backup_folder : false;
  const lastRestoreTest = consoleData?.systemLogs.find((log) => log.action === "Restore Test Passed");
  const systemLogPage = useFilteredPagination(consoleData?.systemLogs ?? [], [consoleData?.systemLogs.length ?? 0]);
  const backupEnabled = consoleData?.settings.backup_schedule !== "Disabled";
  const lastSuccessfulBackup = consoleData?.backupHistory.find((backup) => ["Success", "Successful"].includes(backup.status));

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
            {error && <span className="form-error">{error}</span>}
            <div className="stats-grid">
              <StatCard label="Database Size" value={formatBytes(consoleData.health.databaseSizeBytes)} detail="Current local SQLite file" icon={<Boxes />} />
              <StatCard label="Last Backup" value={consoleData.health.lastBackupAt ? formatDateOnly(consoleData.health.lastBackupAt) : "None"} detail={lastSuccessfulBackup?.status ?? "No backup yet"} icon={<ReceiptText />} />
              <StatCard label="Next Backup" value={nextBackup} detail={consoleData.settings.backup_folder || "No folder selected"} icon={<PackagePlus />} />
              <StatCard label="Failed Receipts" value={String(consoleData.health.failedReceipts)} detail="Logged receipt failures" icon={<ClipboardList />} />
              <StatCard label="DB Integrity" value={consoleData.health.integrityOk ? "OK" : "Check"} detail={consoleData.health.integrityStatus} icon={<Gauge />} />
            </div>
            {consoleData.settings.last_backup_error && <div className="trial-banner expired">Automatic backup failed. Please check storage location. {consoleData.settings.last_backup_error}</div>}
            {backupFolderUnavailable && <div className="trial-banner expired">Automatic backups are enabled, but no backup folder is selected.</div>}
            <section className="panel">
              <div className="panel-head">
                <h2>Database Health</h2>
                <Badge tone={consoleData.health.integrityOk && consoleData.health.indexesMissing.length === 0 ? "good" : "warn"}>
                  {consoleData.health.integrityOk ? "Integrity OK" : "Needs attention"}
                </Badge>
              </div>
              <div className="detail-grid backup-monitor-grid">
                <span>Last migration/check <b>{formatDateTime(consoleData.health.lastMigrationCheckAt)}</b></span>
                <span>SQLite pages <b>{consoleData.health.pageCount} x {formatBytes(consoleData.health.pageSize)}</b></span>
                <span>WAL size <b>{formatBytes(consoleData.health.walSizeBytes)}</b></span>
                <span>Indexes present <b>{consoleData.health.indexesPresent.length}</b></span>
                <span>Missing indexes <b>{consoleData.health.indexesMissing.length ? consoleData.health.indexesMissing.join(", ") : "None"}</b></span>
                <span>Failed backups <b>{consoleData.health.failedBackupCount}</b></span>
                <span>Approval-sensitive actions <b>{consoleData.health.pendingApprovalSensitiveActions}</b></span>
              </div>
            </section>
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
                <label className="check-field">
                  <input type="checkbox" checked={payrollModuleEnabled} onChange={(event) => setPayrollModuleEnabled(event.target.checked)} />
                  Show Payroll module for Owner
                </label>
                <label className="field">
                  Trial Duration
                  <input type="number" min={1} max={365} value={trialDays} onChange={(event) => setTrialDays(Math.max(1, Number(event.target.value) || 1))} />
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
                <h2>Automatic Backup Settings</h2>
                <Badge tone={backupEnabled ? "good" : "warn"}>{backupEnabled ? "Enabled" : "Disabled"}</Badge>
              </div>
              <div className="form-grid">
                <label className="field">
                  Auto Backup
                  <select value={backupForm.backupSchedule} onChange={(event) => setBackupForm({ ...backupForm, backupSchedule: event.target.value as typeof backupForm.backupSchedule })}>
                    <option>Disabled</option>
                    <option value="Daily">Enabled</option>
                  </select>
                </label>
                <label className="field">
                  Full Backup Time
                  <input type="time" value={backupForm.backupTime} onChange={(event) => setBackupForm({ ...backupForm, backupTime: event.target.value })} />
                </label>
                {backupForm.backupSchedule === "Weekly" && (
                  <label className="field">
                    Day of Week
                    <select value={backupForm.backupWeekday} onChange={(event) => setBackupForm({ ...backupForm, backupWeekday: Number(event.target.value) })}>
                      {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option value={index} key={day}>{day}</option>)}
                    </select>
                  </label>
                )}
                {backupForm.backupSchedule === "Monthly" && (
                  <label className="field">
                    Day of Month
                    <input type="number" min={1} max={31} value={backupForm.backupMonthDay} onChange={(event) => setBackupForm({ ...backupForm, backupMonthDay: Math.max(1, Math.min(31, Number(event.target.value) || 1)) })} />
                  </label>
                )}
                <label className="field">
                  Daily Backups to Keep
                  <input type="number" min={7} max={30} value={backupForm.backupRetentionCount} onChange={(event) => setBackupForm({ ...backupForm, backupRetentionCount: Math.max(7, Math.min(30, Number(event.target.value) || 7)) })} />
                </label>
                <label className="field form-wide">
                  Backup Folder
                  <input value={backupForm.backupFolder} onChange={(event) => setBackupForm({ ...backupForm, backupFolder: event.target.value })} placeholder="Choose a local backup folder" />
                </label>
              </div>
              <div className="super-admin-actions">
                <button className="secondary-button" disabled={Boolean(processing)} onClick={chooseBackupFolder}>Choose Folder</button>
                <button className="secondary-button" disabled={Boolean(processing)} onClick={openBackupFolder}>Open Backup Folder</button>
                <button className="primary-button" disabled={Boolean(processing)} onClick={saveBackupSettings}>Save Automatic Backup Settings</button>
              </div>
              <div className="detail-grid backup-monitor-grid">
                <span>Last successful backup <b>{consoleData.health.lastBackupAt ? formatDateTime(consoleData.health.lastBackupAt) : "None"}</b></span>
                <span>Next scheduled backup <b>{nextBackup}</b></span>
                <span>Backup storage usage <b>{backupUsage}</b></span>
                <span>Hourly backups <b>Kept for 48 hours</b></span>
                <span>Daily backups <b>Keep last {consoleData.settings.backup_retention_count} days</b></span>
                <span>Monthly archives <b>Kept for 12 months</b></span>
                <span>Last successful restore test <b>{lastRestoreTest ? formatDateTime(lastRestoreTest.created_at) : "Not tested"}</b></span>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>Backup & Restore</h2>
                <Badge>Fail-safe</Badge>
              </div>
              <div className="super-admin-actions">
                <button className="primary-button" disabled={Boolean(processing)} onClick={() => runAction("Manual backup", () => window.talyer.createBackup({ superAdminId: user.id }))}>Backup Now</button>
                <button className="secondary-button" disabled={Boolean(processing)} onClick={() => runAction("Database export", () => window.talyer.exportDatabase({ superAdminId: user.id }))}>Export Database File</button>
                <button className="secondary-button" disabled={Boolean(processing)} onClick={openBackupFolder}>Open Backup Folder</button>
              </div>
              <div className="approval-box">
                <strong>Restore approval</strong>
                <label className="field">
                  Confirm Super Admin Password
                  <input value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} placeholder="Enter Super Admin password" type="password" />
                </label>
                <div className="super-admin-actions">
                  <button className="secondary-button" disabled={Boolean(processing)} onClick={previewRestoreDatabase}>Preview Backup</button>
                  <button className="secondary-button danger-action" disabled={Boolean(processing) || Boolean(restorePreview && !restorePreview.integrityOk)} onClick={restoreDatabase}>Restore Database</button>
                </div>
                {restorePreview && (
                  <div className="detail-grid backup-monitor-grid">
                    <span>File <b>{restorePreview.filename}</b></span>
                    <span>Size <b>{formatBytes(restorePreview.fileSize)}</b></span>
                    <span>Modified <b>{formatDateTime(restorePreview.modifiedAt)}</b></span>
                    <span>Integrity <b>{restorePreview.integrityOk ? "Passed" : restorePreview.integrityDetail}</b></span>
                    <span>Users <b>{restorePreview.counts.users}</b></span>
                    <span>Sales <b>{restorePreview.counts.sales}</b></span>
                    <span>Jobs <b>{restorePreview.counts.jobs}</b></span>
                    <span>Inventory <b>{restorePreview.counts.inventory}</b></span>
                  </div>
                )}
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
            <section className="panel super-admin-table-panel">
              <div className="panel-head">
                <h2>Backup History</h2>
                <Badge>{`${consoleData.backupHistory.length} records`}</Badge>
              </div>
              <div className="super-admin-log-list">
                {consoleData.backupHistory.length === 0 && <p className="empty-state">No backup history yet. Create a manual backup or enable automatic backups.</p>}
                {consoleData.backupHistory.map((backup) => (
                  <article className="super-admin-log-card" key={backup.id}>
                    <div>
                      <strong>{backup.filename}</strong>
                      <span>{formatDateTime(backup.backup_date)}</span>
                    </div>
                    <div className="super-admin-log-meta">
                      <Badge tone={backup.backup_type === "Automatic" ? "good" : "neutral"}>{backup.backup_type}</Badge>
                      <Badge tone={["Success", "Successful"].includes(backup.status) ? "good" : backup.status === "Skipped" ? "neutral" : "danger"}>{backup.status === "Success" ? "Successful" : backup.status}</Badge>
                      <span>{formatBytes(backup.file_size)}</span>
                      <span>{backup.duration_ms ? `${(backup.duration_ms / 1000).toFixed(1)}s` : "Instant"}</span>
                    </div>
                    <p>{backup.details}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className="panel super-admin-table-panel">
              <div className="panel-head">
                <h2>System Logs</h2>
                <Badge>{`${consoleData.systemLogs.length} records`}</Badge>
              </div>
              <div className="super-admin-log-list">
                {systemLogPage.pagedRows.map((log) => (
                  <article className="super-admin-log-card" key={log.id}>
                    <div>
                      <strong>{log.action}</strong>
                      <span>{formatDateTime(log.created_at)}</span>
                    </div>
                    <p>{log.details}</p>
                  </article>
                ))}
              </div>
              <PaginationControls page={systemLogPage.page} pageCount={systemLogPage.pageCount} total={consoleData.systemLogs.length} onPageChange={systemLogPage.setPage} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

