import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Worker } from "node:worker_threads";
import { clearOldLogs, recordSystemLog } from "./db/audit";
import { changePassword, createUser, disableUser, enableUser, login, verifySuperAdminPassword } from "./db/auth";
import { adjustInventoryStock, createInventoryCategory, createInventoryItem, createPurchaseOrder, createSupplier, deleteInventoryCategory, deleteInventoryItem, deleteSupplier, stockInInventoryItem, updateInventoryItem, updatePurchaseOrderStatus, updateSupplier } from "./db/inventory";
import { createJobOrder, payJobOrder, updateJobOrder } from "./db/jobs";
import { listAll, listDataScope, type DataScope } from "./db/migrations";
import { approvePayrollRun, cancelPayrollRun, createMechanic, createPayrollCutoff, deleteMechanic, generatePayroll, markPayrollPaid, recordMechanicAttendance, setMechanicStatus, submitPayrollForReview, updateMechanic, updateMechanicAttendance, updateMechanicPayroll, updatePayrollSettings, voidPayrollRun } from "./db/payroll";
import { createSale, voidOrRefundSale } from "./db/sales";
import { backupDatabaseFile, closeDatabase, databaseFilePath } from "./db/schema";
import { clearOperationalDatabase, createExpense, createPaymentMethod, createService, deleteExpense, deletePaymentMethod, deleteService, getAutomaticBackupSettings, getLatestBackupByType, getReceiptSettings, getSuperAdminConsoleData, markBackupCreated, markBackupFailed, optimizeDatabase, recordBackupHistory, setPaymentMethodStatus, updateAutomaticBackupSettings, updateExpense, updatePaymentMethod, updateReceiptPrinterSettings, updateReceiptSettings, updateService, updateTrialSettings } from "./db/settings";
import { validateIpcPayload, type IpcPayloadChannel } from "./ipcValidation";

const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
let backupTimer: NodeJS.Timeout | null = null;
let backupInProgress = false;
let backupQueue = Promise.resolve();
let mainWindow: BrowserWindow | null = null;

function checkedPayload<T>(channel: IpcPayloadChannel, payload: unknown) {
  return validateIpcPayload<T>(channel, payload);
}

app.commandLine.appendSwitch("disable-features", "MediaFoundationD3D11VideoCapture,MediaFoundationD3D11VideoCaptureZeroCopy");
app.commandLine.appendSwitch("disable-accelerated-video-decode");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("use-angle", "swiftshader");

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.setAppUserModelId("com.talyerpos.desktop");

function getAppIconPath() {
  return isDev ? path.join(app.getAppPath(), "icon.ico") : path.join(process.resourcesPath, "icon.ico");
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return mainWindow;
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    fullscreen: true,
    autoHideMenuBar: true,
    title: "TalyerPOS",
    icon: getAppIconPath(),
    backgroundColor: "#f4f1ec",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL("http://127.0.0.1:5173");
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  mainWindow = win;

  return win;
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  ipcMain.handle("auth:login", (_event, payload) => {
    const next = checkedPayload<{ username: string; password: string }>("auth:login", payload);
    return login(next.username, next.password);
  });
  ipcMain.handle("auth:change-password", (_event, payload) => changePassword(checkedPayload<Parameters<typeof changePassword>[0]>("auth:change-password", payload)));
  ipcMain.handle("users:create", (_event, payload) => createUser(checkedPayload<Parameters<typeof createUser>[0]>("users:create", payload)));
  ipcMain.handle("users:disable", (_event, payload) => disableUser(checkedPayload<Parameters<typeof disableUser>[0]>("users:disable", payload)));
  ipcMain.handle("users:enable", (_event, payload) => enableUser(checkedPayload<Parameters<typeof enableUser>[0]>("users:enable", payload)));
  ipcMain.handle("jobs:create", (_event, payload) => createJobOrder(checkedPayload<Parameters<typeof createJobOrder>[0]>("jobs:create", payload)));
  ipcMain.handle("jobs:update", (_event, payload) => updateJobOrder(checkedPayload<Parameters<typeof updateJobOrder>[0]>("jobs:update", payload)));
  ipcMain.handle("jobs:pay", (_event, payload) => payJobOrder(checkedPayload<Parameters<typeof payJobOrder>[0]>("jobs:pay", payload)));
  ipcMain.handle("settings:receipt:update", (_event, payload) => updateReceiptSettings(checkedPayload<Parameters<typeof updateReceiptSettings>[0]>("settings:receipt:update", payload)));
  ipcMain.handle("settings:printer:update", async (_event, rawPayload) => {
    const payload = checkedPayload<Parameters<typeof updateReceiptPrinterSettings>[0]>("settings:printer:update", rawPayload);
    if (payload.outputMode === "Printer") {
      const printers = await listPrinters();
      if (!printers.some((printer) => printer.name === payload.printerName)) throw new Error("Selected printer is no longer available.");
    }
    return updateReceiptPrinterSettings(payload);
  });
  ipcMain.handle("settings:category:create", (_event, payload) => createInventoryCategory(checkedPayload<Parameters<typeof createInventoryCategory>[0]>("settings:category:create", payload)));
  ipcMain.handle("settings:category:delete", (_event, payload) => deleteInventoryCategory(checkedPayload<Parameters<typeof deleteInventoryCategory>[0]>("settings:category:delete", payload)));
  ipcMain.handle("settings:payment:create", (_event, payload) => createPaymentMethod(checkedPayload<Parameters<typeof createPaymentMethod>[0]>("settings:payment:create", payload)));
  ipcMain.handle("settings:payment:update", (_event, payload) => updatePaymentMethod(checkedPayload<Parameters<typeof updatePaymentMethod>[0]>("settings:payment:update", payload)));
  ipcMain.handle("settings:payment:status", (_event, payload) => setPaymentMethodStatus(checkedPayload<Parameters<typeof setPaymentMethodStatus>[0]>("settings:payment:status", payload)));
  ipcMain.handle("settings:payment:delete", (_event, payload) => deletePaymentMethod(checkedPayload<Parameters<typeof deletePaymentMethod>[0]>("settings:payment:delete", payload)));
  ipcMain.handle("services:create", (_event, payload) => createService(checkedPayload<Parameters<typeof createService>[0]>("services:create", payload)));
  ipcMain.handle("services:update", (_event, payload) => updateService(checkedPayload<Parameters<typeof updateService>[0]>("services:update", payload)));
  ipcMain.handle("services:delete", (_event, payload) => deleteService(checkedPayload<Parameters<typeof deleteService>[0]>("services:delete", payload)));
  ipcMain.handle("mechanics:create", (_event, payload) => createMechanic(checkedPayload<Parameters<typeof createMechanic>[0]>("mechanics:create", payload)));
  ipcMain.handle("mechanics:update", (_event, payload) => updateMechanic(checkedPayload<Parameters<typeof updateMechanic>[0]>("mechanics:update", payload)));
  ipcMain.handle("mechanics:status", (_event, payload) => setMechanicStatus(checkedPayload<Parameters<typeof setMechanicStatus>[0]>("mechanics:status", payload)));
  ipcMain.handle("mechanics:delete", (_event, payload) => deleteMechanic(checkedPayload<Parameters<typeof deleteMechanic>[0]>("mechanics:delete", payload)));
  ipcMain.handle("payroll:mechanic:update", (_event, payload) => updateMechanicPayroll(checkedPayload<Parameters<typeof updateMechanicPayroll>[0]>("payroll:mechanic:update", payload)));
  ipcMain.handle("payroll:attendance:record", (_event, payload) => recordMechanicAttendance(checkedPayload<Parameters<typeof recordMechanicAttendance>[0]>("payroll:attendance:record", payload)));
  ipcMain.handle("payroll:attendance:update", (_event, payload) => updateMechanicAttendance(checkedPayload<Parameters<typeof updateMechanicAttendance>[0]>("payroll:attendance:update", payload)));
  ipcMain.handle("payroll:generate", (_event, payload) => generatePayroll(checkedPayload<Parameters<typeof generatePayroll>[0]>("payroll:generate", payload)));
  ipcMain.handle("payroll:cutoff:create", (_event, payload) => createPayrollCutoff(checkedPayload<Parameters<typeof createPayrollCutoff>[0]>("payroll:cutoff:create", payload)));
  ipcMain.handle("payroll:review", (_event, payload) => submitPayrollForReview(checkedPayload<Parameters<typeof submitPayrollForReview>[0]>("payroll:review", payload)));
  ipcMain.handle("payroll:approve", (_event, payload) => approvePayrollRun(checkedPayload<Parameters<typeof approvePayrollRun>[0]>("payroll:approve", payload)));
  ipcMain.handle("payroll:paid", (_event, payload) => markPayrollPaid(checkedPayload<Parameters<typeof markPayrollPaid>[0]>("payroll:paid", payload)));
  ipcMain.handle("payroll:cancel", (_event, payload) => cancelPayrollRun(checkedPayload<Parameters<typeof cancelPayrollRun>[0]>("payroll:cancel", payload)));
  ipcMain.handle("payroll:void", (_event, payload) => voidPayrollRun(checkedPayload<Parameters<typeof voidPayrollRun>[0]>("payroll:void", payload)));
  ipcMain.handle("payroll:settings:update", (_event, payload) => updatePayrollSettings(checkedPayload<Parameters<typeof updatePayrollSettings>[0]>("payroll:settings:update", payload)));
  ipcMain.handle("suppliers:create", (_event, payload) => createSupplier(checkedPayload<Parameters<typeof createSupplier>[0]>("suppliers:create", payload)));
  ipcMain.handle("suppliers:update", (_event, payload) => updateSupplier(checkedPayload<Parameters<typeof updateSupplier>[0]>("suppliers:update", payload)));
  ipcMain.handle("suppliers:delete", (_event, payload) => deleteSupplier(checkedPayload<Parameters<typeof deleteSupplier>[0]>("suppliers:delete", payload)));
  ipcMain.handle("purchases:create", (_event, payload) => createPurchaseOrder(checkedPayload<Parameters<typeof createPurchaseOrder>[0]>("purchases:create", payload)));
  ipcMain.handle("purchases:status", (_event, payload) => updatePurchaseOrderStatus(checkedPayload<Parameters<typeof updatePurchaseOrderStatus>[0]>("purchases:status", payload)));
  ipcMain.handle("expenses:create", (_event, payload) => createExpense(checkedPayload<Parameters<typeof createExpense>[0]>("expenses:create", payload)));
  ipcMain.handle("expenses:update", (_event, payload) => updateExpense(checkedPayload<Parameters<typeof updateExpense>[0]>("expenses:update", payload)));
  ipcMain.handle("expenses:delete", (_event, payload) => deleteExpense(checkedPayload<Parameters<typeof deleteExpense>[0]>("expenses:delete", payload)));
  ipcMain.handle("printers:list", async () => listPrinters());
  ipcMain.handle("data:list", () => listAll());
  ipcMain.handle("data:list-scope", (_event, payload) => listDataScope(checkedPayload<{ scope: DataScope }>("data:list-scope", payload).scope));
  ipcMain.handle("inventory:create", (_event, payload) => createInventoryItem(checkedPayload<Parameters<typeof createInventoryItem>[0]>("inventory:create", payload)));
  ipcMain.handle("inventory:update", (_event, payload) => updateInventoryItem(checkedPayload<Parameters<typeof updateInventoryItem>[0]>("inventory:update", payload)));
  ipcMain.handle("inventory:delete", (_event, payload) => deleteInventoryItem(checkedPayload<Parameters<typeof deleteInventoryItem>[0]>("inventory:delete", payload)));
  ipcMain.handle("inventory:stock-in", (_event, payload) => stockInInventoryItem(checkedPayload<Parameters<typeof stockInInventoryItem>[0]>("inventory:stock-in", payload)));
  ipcMain.handle("inventory:adjust", (_event, payload) => adjustInventoryStock(checkedPayload<Parameters<typeof adjustInventoryStock>[0]>("inventory:adjust", payload)));
  ipcMain.handle("sales:create", (_event, payload) => createSale(checkedPayload<Parameters<typeof createSale>[0]>("sales:create", payload)));
  ipcMain.handle("sales:void-refund", (_event, payload) => voidOrRefundSale(checkedPayload<Parameters<typeof voidOrRefundSale>[0]>("sales:void-refund", payload)));
  ipcMain.handle("super-admin:data", () => getSuperAdminConsoleData());
  ipcMain.handle("super-admin:trial:update", (_event, payload) => updateTrialSettings(checkedPayload<Parameters<typeof updateTrialSettings>[0]>("super-admin:trial:update", payload)));
  ipcMain.handle("super-admin:database:optimize", (_event, payload) => optimizeDatabase(checkedPayload<Parameters<typeof optimizeDatabase>[0]>("super-admin:database:optimize", payload)));
  ipcMain.handle("super-admin:logs:clear", (_event, payload) => clearOldLogs(checkedPayload<Parameters<typeof clearOldLogs>[0]>("super-admin:logs:clear", payload)));
  ipcMain.handle("super-admin:backup:create", async (event, payload) => createDatabaseBackup(event, checkedPayload<{ superAdminId: number }>("super-admin:backup:create", payload).superAdminId));
  ipcMain.handle("super-admin:backup:settings", async (_event, payload) => {
    const next = updateAutomaticBackupSettings(checkedPayload<Parameters<typeof updateAutomaticBackupSettings>[0]>("super-admin:backup:settings", payload));
    restartBackupScheduler();
    return next;
  });
  ipcMain.handle("super-admin:backup:folder", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: OpenDialogOptions = { title: "Choose Automatic Backup Folder", properties: ["openDirectory", "createDirectory"] };
    const result = parentWindow ? await dialog.showOpenDialog(parentWindow, options) : await dialog.showOpenDialog(options);
    return result.canceled ? "" : result.filePaths[0] || "";
  });
  ipcMain.handle("super-admin:backup:open-folder", async () => {
    const settings = getAutomaticBackupSettings();
    const folder = backupRoot(settings);
    fs.mkdirSync(folder, { recursive: true });
    const result = await shell.openPath(folder);
    return !result;
  });
  ipcMain.handle("super-admin:database:export", async (event, payload) => exportDatabaseFile(event, checkedPayload<{ superAdminId: number }>("super-admin:database:export", payload).superAdminId));
  ipcMain.handle("super-admin:database:restore-preview", async (event, rawPayload) => {
    const payload = checkedPayload<{ superAdminId: number; password: string }>("super-admin:database:restore-preview", rawPayload);
    return previewRestoreBackup(event, payload.superAdminId, payload.password);
  });
  ipcMain.handle("super-admin:database:restore", async (event, rawPayload) => {
    const payload = checkedPayload<{ superAdminId: number; password: string; restorePath?: string }>("super-admin:database:restore", rawPayload);
    return restoreDatabaseBackup(event, payload.superAdminId, payload.password, payload.restorePath);
  });
  ipcMain.handle("super-admin:database:clear", async (event, rawPayload) => {
    const payload = checkedPayload<{ superAdminId: number; password: string }>("super-admin:database:clear", rawPayload);
    return clearDatabaseWithBackup(event, payload.superAdminId, payload.password);
  });
  ipcMain.handle("print:receipt", async (_event, rawPayload) => {
    const payload = checkedPayload<{ html: string }>("print:receipt", rawPayload);
    let receiptWindow: BrowserWindow | null = null;
    try {
      const settings = getReceiptSettings();
      if (settings.receipt_output_mode !== "Printer" || !settings.receipt_printer_name) return false;
      receiptWindow = await createReceiptWindow(payload.html);
      const printers = await listPrinters(receiptWindow);
      const targetPrinter = printers.find((printer) => printer.name === settings.receipt_printer_name);
      if (!targetPrinter) return false;
      const pageSize = receiptPageSize(payload.html);
      return await new Promise<boolean>((resolve) => {
        receiptWindow?.webContents.print(
          { silent: true, printBackground: true, deviceName: targetPrinter.name, margins: { marginType: "printableArea" }, pageSize },
          (success, failureReason) => {
            if (!success && failureReason) console.warn(`Receipt print failed: ${failureReason}`);
            resolve(success);
          }
        );
      });
    } catch (caught) {
      console.warn("Receipt print failed:", caught);
      return false;
    } finally {
      receiptWindow?.close();
    }
  });
  ipcMain.handle("receipt:pdf", async (event, rawPayload) => {
    const payload = checkedPayload<{ html: string; receiptNo?: string }>("receipt:pdf", rawPayload);
    let receiptWindow: BrowserWindow | null = null;
    try {
      receiptWindow = await createReceiptWindow(payload.html);
      const pdf = await receiptWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: "printableArea" }
      });
      if (pdf.length < 1000) throw new Error("Generated receipt PDF was empty.");
      const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const receiptNo = payload.receiptNo || `receipt-${Date.now()}`;
      const defaultPath = path.join(app.getPath("downloads"), uniqueReceiptFilename(app.getPath("downloads"), receiptNo));
      const saveOptions: SaveDialogOptions = {
        title: "Save receipt as PDF",
        defaultPath,
        buttonLabel: "Save Receipt",
        filters: [{ name: "PDF Receipt", extensions: ["pdf"] }],
        properties: ["showOverwriteConfirmation", "createDirectory"]
      };
      const { canceled, filePath } = parentWindow ? await dialog.showSaveDialog(parentWindow, saveOptions) : await dialog.showSaveDialog(saveOptions);
      if (canceled || !filePath) return false;
      const targetPath = path.extname(filePath).toLowerCase() === ".pdf" ? filePath : `${filePath}.pdf`;
      fs.writeFileSync(targetPath, pdf);
      return true;
    } finally {
      receiptWindow?.close();
    }
  });

  createWindow();
  restartBackupScheduler();

  app.on("activate", () => {
    createWindow();
  });
});

app.on("second-instance", () => {
  const existingWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  if (!existingWindow) return;
  if (existingWindow.isMinimized()) existingWindow.restore();
  existingWindow.show();
  existingWindow.focus();
});

app.on("window-all-closed", () => {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = null;
  if (process.platform !== "darwin") app.quit();
});

function backupFilename(extension = "bak") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `talyer-pos-backup-${stamp}.${extension}`;
}

function automaticBackupFilename(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.bak`;
}

function backupStamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function defaultBackupRoot() {
  return path.join(app.getPath("userData"), "backups");
}

function backupRoot(settings: ReturnType<typeof getAutomaticBackupSettings>) {
  return settings.backup_folder || defaultBackupRoot();
}

function backupWorkerPath() {
  return path.join(__dirname, "backupWorker.js");
}

function enqueueBackup(task: () => Promise<void>) {
  backupQueue = backupQueue.then(task, task);
  return backupQueue;
}

async function createDatabaseBackup(event: IpcMainInvokeEvent, superAdminId: number) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const defaultPath = path.join(app.getPath("documents"), backupFilename("backup"));
  const { canceled, filePath } = parentWindow ? await dialog.showSaveDialog(parentWindow, {
    title: "Create Database Backup",
    defaultPath,
    buttonLabel: "Create Backup",
    filters: [{ name: "Database Backup", extensions: ["backup"] }],
    properties: ["showOverwriteConfirmation", "createDirectory"]
  }) : await dialog.showSaveDialog({
    title: "Create Database Backup",
    defaultPath,
    buttonLabel: "Create Backup",
    filters: [{ name: "Database Backup", extensions: ["backup"] }],
    properties: ["showOverwriteConfirmation", "createDirectory"]
  });
  if (canceled || !filePath) return getSuperAdminConsoleData();
  const targetPath = path.extname(filePath).toLowerCase() === ".backup" ? filePath : `${filePath}.backup`;
  const started = Date.now();
  const result = await runBackupWorker({ kind: "full", dbPath: databaseFilePath(), targetPath });
  const durationMs = Date.now() - started;
  if (result.status === "Successful") {
    markBackupCreated(superAdminId, `Backup created at ${targetPath}`, { filePath: targetPath, filename: path.basename(targetPath), fileSize: result.fileSize, backupType: "Manual", durationMs });
  } else {
    markBackupFailed(result.details, targetPath, "Manual", result.status, durationMs);
  }
  return getSuperAdminConsoleData();
}

function restartBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = setInterval(() => {
    void runAutomaticBackupIfDue("scheduled");
  }, 60_000);
  void runAutomaticBackupIfDue("startup");
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasReachedDailyBackupTime(settings: ReturnType<typeof getAutomaticBackupSettings>, date = new Date()) {
  const [hour, minute] = String(settings.backup_time || "23:00").split(":").map(Number);
  return date.getHours() > hour || (date.getHours() === hour && date.getMinutes() >= minute);
}

function hoursSince(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(value).getTime()) / 36e5;
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function runBackupWorker(payload: { kind: "incremental" | "full"; dbPath: string; targetPath: string; since?: string; previousManifestPath?: string }) {
  return new Promise<{ status: "Successful" | "Failed" | "Corrupted" | "Partial" | "Skipped"; fileSize: number; changedRows: number; details: string }>((resolve, reject) => {
    const worker = new Worker(backupWorkerPath(), { workerData: payload });
    worker.once("message", (result) => resolve(result));
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Backup worker exited with code ${code}.`));
    });
  });
}

async function runAutomaticBackupIfDue(reason: "startup" | "scheduled") {
  await enqueueBackup(async () => {
    if (backupInProgress) return;
    const settings = getAutomaticBackupSettings();
    if (settings.backup_schedule === "Disabled") return;
    const root = backupRoot(settings);
    fs.mkdirSync(root, { recursive: true });
    fs.accessSync(root, fs.constants.W_OK);

    const latestIncremental = getLatestBackupByType("Hourly Incremental");
    const latestFull = getLatestBackupByType("Daily Full");
    const nowDate = new Date();
    const shouldRunIncremental = hoursSince(latestIncremental?.backup_date) >= 1;
    const shouldRunFull = hasReachedDailyBackupTime(settings, nowDate) && (!latestFull || dateKey(new Date(latestFull.backup_date)) !== dateKey(nowDate));
    const shouldRunMonthly = nowDate.getDate() === Math.min(Number(settings.backup_month_day || 1), daysInMonth(nowDate));

    if (!shouldRunIncremental && !shouldRunFull && !shouldRunMonthly) return;

    backupInProgress = true;
    try {
      if (shouldRunIncremental) {
        await runBackgroundBackup({
          kind: "incremental",
          backupType: "Hourly Incremental",
          targetPath: path.join(root, "hourly", `incremental_${backupStamp(nowDate)}.backup`),
          since: latestIncremental?.backup_date,
          previousManifestPath: latestIncremental?.file_path,
          recoveredMissedBackup: reason === "startup" && Boolean(latestIncremental)
        });
      }
      if (shouldRunFull) {
        await runBackgroundBackup({
          kind: "full",
          backupType: "Daily Full",
          targetPath: path.join(root, "daily", `full_${dateKey(nowDate)}.backup`),
          recoveredMissedBackup: reason === "startup" && Boolean(latestFull)
        });
      }
      if (shouldRunMonthly) {
        const latestMonthly = getLatestBackupByType("Monthly Archive");
        const monthKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`;
        const alreadyArchived = latestMonthly && `${new Date(latestMonthly.backup_date).getFullYear()}-${String(new Date(latestMonthly.backup_date).getMonth() + 1).padStart(2, "0")}` === monthKey;
        if (!alreadyArchived) {
          await runBackgroundBackup({
            kind: "full",
            backupType: "Monthly Archive",
            targetPath: path.join(root, "monthly", `monthly_${monthKey}.backup`)
          });
        }
      }
      enforceBackupRetention(root, Number(settings.backup_retention_count || 30));
    } catch (caught) {
      markBackupFailed(caught instanceof Error ? caught.message : "Automatic backup failed. Please check storage location.", "", "Automatic");
    } finally {
      backupInProgress = false;
    }
  });
}

async function runBackgroundBackup(payload: { kind: "incremental" | "full"; backupType: "Hourly Incremental" | "Daily Full" | "Monthly Archive"; targetPath: string; since?: string; previousManifestPath?: string; recoveredMissedBackup?: boolean }) {
  const started = Date.now();
  const result = await runBackupWorker({ kind: payload.kind, dbPath: databaseFilePath(), targetPath: payload.targetPath, since: payload.since, previousManifestPath: payload.previousManifestPath });
  const durationMs = Date.now() - started;
  const details = payload.recoveredMissedBackup ? `Missed backup recovered. ${result.details}` : result.details;

  if (result.status === "Successful") {
    markBackupCreated(undefined, details, {
      filePath: payload.targetPath,
      filename: path.basename(payload.targetPath),
      fileSize: result.fileSize,
      backupType: payload.backupType,
      durationMs
    });
    return;
  }

  if (result.status === "Skipped") {
    recordBackupHistory({
      filename: path.basename(payload.targetPath),
      filePath: payload.targetPath,
      fileSize: 0,
      backupType: payload.backupType,
      status: "Skipped",
      durationMs,
      details
    });
    return;
  }

  markBackupFailed(details, payload.targetPath, payload.backupType, result.status, durationMs);
}

function enforceBackupRetention(root: string, dailyRetentionDays: number) {
  const dailyDays = Math.max(7, Math.min(30, dailyRetentionDays));
  const rules = [
    { folder: path.join(root, "hourly"), maxAgeMs: 48 * 60 * 60 * 1000, keepMin: 1 },
    { folder: path.join(root, "daily"), maxAgeMs: dailyDays * 24 * 60 * 60 * 1000, keepMin: 1 },
    { folder: path.join(root, "monthly"), maxAgeMs: 12 * 31 * 24 * 60 * 60 * 1000, keepMin: 1 }
  ];

  for (const rule of rules) {
    if (!fs.existsSync(rule.folder)) continue;
    const backups = fs.readdirSync(rule.folder)
      .filter((filename) => filename.endsWith(".backup"))
      .map((filename) => {
        const filePath = path.join(rule.folder, filename);
        return { filePath, mtime: fs.statSync(filePath).mtimeMs, size: fs.statSync(filePath).size };
      })
      .filter((backup) => backup.size > 0)
      .sort((left, right) => right.mtime - left.mtime);
    const latestValid = new Set(backups.slice(0, rule.keepMin).map((backup) => backup.filePath));
    for (const backup of backups) {
      if (latestValid.has(backup.filePath)) continue;
      if (Date.now() - backup.mtime > rule.maxAgeMs) fs.unlinkSync(backup.filePath);
    }
  }
}

async function exportDatabaseFile(event: IpcMainInvokeEvent, superAdminId: number) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const defaultPath = path.join(app.getPath("documents"), backupFilename("sqlite"));
  const options: SaveDialogOptions = {
    title: "Export Database File",
    defaultPath,
    buttonLabel: "Export Database",
    filters: [{ name: "SQLite Database", extensions: ["sqlite", "db", "bak"] }],
    properties: ["showOverwriteConfirmation", "createDirectory"]
  };
  const { canceled, filePath } = parentWindow ? await dialog.showSaveDialog(parentWindow, options) : await dialog.showSaveDialog(options);
  if (canceled || !filePath) return getSuperAdminConsoleData();
  fs.copyFileSync(databaseFilePath(), filePath);
  recordSystemLog({ superAdminId, action: "Database Exported", details: `Database exported to ${filePath}` });
  return getSuperAdminConsoleData();
}

function inspectBackupFile(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error("Selected backup file does not exist.");
  const stats = fs.statSync(filePath);
  if (path.extname(filePath).toLowerCase() === ".backup" && (/(?:^|[\\/])hourly[\\/]/i.test(filePath) || path.basename(filePath).startsWith("incremental_"))) {
    throw new Error("Incremental backups are recovery logs. Please choose a daily full or monthly archive backup for restore.");
  }
  const isCompressedBackup = path.extname(filePath).toLowerCase() === ".backup";
  const previewPath = isCompressedBackup ? inflateFullBackupToTemp(filePath) : filePath;
  const previewDb = new Database(previewPath, { readonly: true, fileMustExist: true });
  try {
    const integrity = previewDb.prepare("PRAGMA integrity_check").pluck().get() as string;
    const tableNames = (previewDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name);
    const tableSet = new Set(tableNames);
    const expectedTables = ["users", "sales", "sale_items", "job_orders", "inventory", "audit_logs"];
    const missingTables = expectedTables.filter((table) => !tableSet.has(table));
    const countTable = (table: string) => tableSet.has(table) ? Number((previewDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count || 0) : 0;
    return {
      filePath,
      filename: path.basename(filePath),
      fileSize: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      integrityOk: integrity === "ok" && missingTables.length === 0,
      integrityDetail: missingTables.length ? `Missing tables: ${missingTables.join(", ")}` : integrity,
      counts: {
        users: countTable("users"),
        sales: countTable("sales"),
        jobs: countTable("job_orders"),
        inventory: countTable("inventory"),
        auditLogs: countTable("audit_logs")
      }
    };
  } finally {
    previewDb.close();
    if (previewPath !== filePath) fs.rmSync(previewPath, { force: true });
  }
}

function inflateFullBackupToTemp(filePath: string) {
  const tempPath = path.join(app.getPath("temp"), `talyer-restore-preview-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  fs.writeFileSync(tempPath, zlib.gunzipSync(fs.readFileSync(filePath)));
  return tempPath;
}

function materializeRestoreSource(filePath: string) {
  if (path.extname(filePath).toLowerCase() !== ".backup") return filePath;
  if (/(?:^|[\\/])hourly[\\/]/i.test(filePath) || path.basename(filePath).startsWith("incremental_")) {
    throw new Error("Incremental backups are audit/recovery logs. Please restore from a daily full or monthly archive backup.");
  }
  return inflateFullBackupToTemp(filePath);
}

async function chooseRestoreBackupFile(event: IpcMainInvokeEvent, buttonLabel: string) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const dialogOptions: OpenDialogOptions = {
    title: "Restore Database Backup",
    buttonLabel,
    filters: [{ name: "Database Backup", extensions: ["backup", "db", "sqlite", "bak"] }],
    properties: ["openFile"]
  };
  const result = parentWindow ? await dialog.showOpenDialog(parentWindow, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  return result.canceled ? "" : result.filePaths[0] || "";
}

async function previewRestoreBackup(event: IpcMainInvokeEvent, superAdminId: number, password: string) {
  if (!verifySuperAdminPassword(superAdminId, password)) throw new Error("Super Admin password confirmation is invalid.");
  const filePath = await chooseRestoreBackupFile(event, "Preview Backup");
  if (!filePath) return null;
  const preview = inspectBackupFile(filePath);
  recordSystemLog({ superAdminId, action: preview.integrityOk ? "Restore Test Passed" : "Restore Test Failed", details: `${preview.filename}: ${preview.integrityDetail}` });
  return preview;
}

async function restoreDatabaseBackup(event: IpcMainInvokeEvent, superAdminId: number, password: string, restorePath?: string) {
  if (!verifySuperAdminPassword(superAdminId, password)) throw new Error("Super Admin password confirmation is invalid.");
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const selectedPath = restorePath?.trim() || await chooseRestoreBackupFile(event, "Restore Backup");
  if (!selectedPath) return getSuperAdminConsoleData();
  const preview = inspectBackupFile(selectedPath);
  if (!preview.integrityOk) throw new Error(`Backup integrity check failed. ${preview.integrityDetail}`);
  const confirmed = parentWindow ? await dialog.showMessageBox(parentWindow, {
    type: "warning",
    buttons: ["Cancel", "Restore"],
    defaultId: 0,
    cancelId: 0,
    title: "Confirm Database Restore",
    message: "Restoring backup will overwrite current data.",
    detail: "A restore point will be created first. Do you want to continue?"
  }) : await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancel", "Restore"],
    defaultId: 0,
    cancelId: 0,
    title: "Confirm Database Restore",
    message: "Restoring backup will overwrite current data.",
    detail: "A restore point will be created first. Do you want to continue?"
  });
  if (confirmed.response !== 1) return getSuperAdminConsoleData();

  const currentPath = databaseFilePath();
  const restorePoint = path.join(app.getPath("documents"), backupFilename("restore-point.bak"));
  const restoreSource = materializeRestoreSource(selectedPath);
  fs.copyFileSync(currentPath, restorePoint);
  closeDatabase();
  fs.copyFileSync(restoreSource, currentPath);
  if (restoreSource !== selectedPath) fs.rmSync(restoreSource, { force: true });
  recordSystemLog({ superAdminId, action: "Database Restored", details: `Restored from ${selectedPath}. Restore point: ${restorePoint}` });
  return getSuperAdminConsoleData();
}

async function clearDatabaseWithBackup(event: IpcMainInvokeEvent, superAdminId: number, password: string) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const firstConfirm = parentWindow ? await dialog.showMessageBox(parentWindow, {
    type: "warning",
    buttons: ["Cancel", "Continue"],
    defaultId: 0,
    cancelId: 0,
    title: "Clear Operational Database",
    message: "This action will permanently reset the system and delete operational data.",
    detail: "POS transactions, job orders, inventory, suppliers, mechanics, services, operational users, reports, audit logs, branding, receipt settings, printer selection, categories, and payment settings will be reset. Super Admin access will be preserved."
  }) : await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancel", "Continue"],
    defaultId: 0,
    cancelId: 0,
    title: "Clear Operational Database",
    message: "This action will permanently reset the system and delete operational data.",
    detail: "POS transactions, job orders, inventory, suppliers, mechanics, services, operational users, reports, audit logs, branding, receipt settings, printer selection, categories, and payment settings will be reset. Super Admin access will be preserved."
  });
  if (firstConfirm.response !== 1) return getSuperAdminConsoleData();
  if (!verifySuperAdminPassword(superAdminId, password)) throw new Error("Super Admin password confirmation is incorrect.");

  const backupDirectory = path.join(app.getPath("documents"), "TalyerPOS Backups");
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const backupPath = path.join(backupDirectory, `backup-before-reset-${datePart}.bak`);
  backupDatabaseFile(backupPath);
  const next = clearOperationalDatabase({ superAdminId, backupPath });
  return next;
}

async function createReceiptWindow(html: string, requireReceiptContent = true) {
  const receiptPath = path.join(app.getPath("temp"), `talyer-receipt-${Date.now()}-${Math.random().toString(16).slice(2)}.html`);
  fs.writeFileSync(receiptPath, html, "utf8");
  const receiptWindow = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  receiptWindow.on("closed", () => {
    fs.rm(receiptPath, { force: true }, () => undefined);
  });
  await receiptWindow.loadFile(receiptPath);
  const isReady = await receiptWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const settle = () => requestAnimationFrame(() => requestAnimationFrame(() => {
        const printable = document.querySelector("#print-receipt") || document.querySelector("#print-document") || document.body;
        const text = printable?.innerText?.trim() || "";
        const hasMeaningfulText = text.length > 20;
        const hasTableRows = document.querySelectorAll("tbody tr").length > 0;
        const rect = printable?.getBoundingClientRect();
        const hasVisibleArea = Boolean(rect && rect.width > 0 && rect.height > 0);
        const hasLayoutArea = Boolean(printable && (printable.scrollWidth > 0 || printable.scrollHeight > 0));
        resolve(${requireReceiptContent ? "hasMeaningfulText && (hasTableRows || Boolean(document.querySelector('#print-document'))) && (hasVisibleArea || hasLayoutArea)" : "true"});
      }));
      if (document.fonts?.ready) {
        document.fonts.ready.then(settle);
      } else {
        settle();
      }
    })
  `);
  if (!isReady) throw new Error("Receipt content was empty before printing.");
  await new Promise((resolve) => setTimeout(resolve, 300));
  return receiptWindow;
}

function uniqueReceiptFilename(directory: string, receiptNo: string) {
  const baseName = receiptNo.replace(/[^a-zA-Z0-9._-]/g, "-") || `receipt-${Date.now()}`;
  let filename = `${baseName}.pdf`;
  let counter = 1;
  while (fs.existsSync(path.join(directory, filename))) {
    filename = `${baseName}-${counter}.pdf`;
    counter += 1;
  }
  return filename;
}

function receiptPageSize(html: string) {
  const width = Number(html.match(/name="receipt-width-mm" content="([\d.]+)"/)?.[1]) || 58;
  const height = Number(html.match(/name="receipt-height-mm" content="([\d.]+)"/)?.[1]) || 160;
  return {
    width: Math.round(width * 1000),
    height: Math.round(height * 1000)
  };
}

async function listPrinters(window?: BrowserWindow) {
  const sourceWindow = window ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? (await createReceiptWindow("<!doctype html><html><body></body></html>", false));
  const shouldClose = !window && !BrowserWindow.getFocusedWindow() && BrowserWindow.getAllWindows().length === 0;
  try {
    const printers = await sourceWindow.webContents.getPrintersAsync();
    return printers
      .filter((printer) => !/pdf|xps|onenote|fax/i.test(printer.name))
      .map((printer) => ({ name: printer.name, isDefault: Boolean(printer.isDefault) }));
  } finally {
    if (shouldClose) sourceWindow.close();
  }
}
