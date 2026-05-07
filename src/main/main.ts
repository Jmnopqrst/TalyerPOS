import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import fs from "node:fs";
import path from "node:path";
import { adjustInventoryStock, backupDatabaseFile, changePassword, clearOldLogs, clearOperationalDatabase, closeDatabase, createExpense, createInventoryCategory, createInventoryItem, createJobOrder, createMechanic, createPaymentMethod, createSale, createService, createSupplier, createUser, databaseFilePath, deleteExpense, deleteInventoryCategory, deleteInventoryItem, deleteMechanic, deletePaymentMethod, deleteService, deleteSupplier, disableUser, enableUser, getSuperAdminConsoleData, getReceiptSettings, listAll, login, markBackupCreated, optimizeDatabase, payJobOrder, recordSystemLog, setMechanicStatus, setPaymentMethodStatus, stockInInventoryItem, updateExpense, updateInventoryItem, updateJobOrder, updateMechanic, updatePaymentMethod, updateReceiptPrinterSettings, updateReceiptSettings, updateService, updateSupplier, updateTrialSettings, verifySuperAdminPassword, voidOrRefundSale } from "./database";

const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    title: "TalyerPOS",
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
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  ipcMain.handle("auth:login", (_event, payload: { username: string; password: string }) => login(payload.username, payload.password));
  ipcMain.handle("auth:change-password", (_event, payload) => changePassword(payload));
  ipcMain.handle("users:create", (_event, payload) => createUser(payload));
  ipcMain.handle("users:disable", (_event, payload) => disableUser(payload));
  ipcMain.handle("users:enable", (_event, payload) => enableUser(payload));
  ipcMain.handle("jobs:create", (_event, payload) => createJobOrder(payload));
  ipcMain.handle("jobs:update", (_event, payload) => updateJobOrder(payload));
  ipcMain.handle("jobs:pay", (_event, payload) => payJobOrder(payload));
  ipcMain.handle("settings:receipt:update", (_event, payload) => updateReceiptSettings(payload));
  ipcMain.handle("settings:printer:update", async (_event, payload: { actorId: number; outputMode: "Printer" | "PDF"; printerName: string; approvalUsername: string; approvalPassword: string; approvalReason: string }) => {
    if (payload.outputMode === "Printer") {
      const printers = await listPrinters();
      if (!printers.some((printer) => printer.name === payload.printerName)) throw new Error("Selected printer is no longer available.");
    }
    return updateReceiptPrinterSettings(payload);
  });
  ipcMain.handle("settings:category:create", (_event, payload) => createInventoryCategory(payload));
  ipcMain.handle("settings:category:delete", (_event, payload) => deleteInventoryCategory(payload));
  ipcMain.handle("settings:payment:create", (_event, payload) => createPaymentMethod(payload));
  ipcMain.handle("settings:payment:update", (_event, payload) => updatePaymentMethod(payload));
  ipcMain.handle("settings:payment:status", (_event, payload) => setPaymentMethodStatus(payload));
  ipcMain.handle("settings:payment:delete", (_event, payload) => deletePaymentMethod(payload));
  ipcMain.handle("services:create", (_event, payload) => createService(payload));
  ipcMain.handle("services:update", (_event, payload) => updateService(payload));
  ipcMain.handle("services:delete", (_event, payload) => deleteService(payload));
  ipcMain.handle("mechanics:create", (_event, payload) => createMechanic(payload));
  ipcMain.handle("mechanics:update", (_event, payload) => updateMechanic(payload));
  ipcMain.handle("mechanics:status", (_event, payload) => setMechanicStatus(payload));
  ipcMain.handle("mechanics:delete", (_event, payload) => deleteMechanic(payload));
  ipcMain.handle("suppliers:create", (_event, payload) => createSupplier(payload));
  ipcMain.handle("suppliers:update", (_event, payload) => updateSupplier(payload));
  ipcMain.handle("suppliers:delete", (_event, payload) => deleteSupplier(payload));
  ipcMain.handle("expenses:create", (_event, payload) => createExpense(payload));
  ipcMain.handle("expenses:update", (_event, payload) => updateExpense(payload));
  ipcMain.handle("expenses:delete", (_event, payload) => deleteExpense(payload));
  ipcMain.handle("printers:list", async () => listPrinters());
  ipcMain.handle("data:list", () => listAll());
  ipcMain.handle("inventory:create", (_event, payload) => createInventoryItem(payload));
  ipcMain.handle("inventory:update", (_event, payload) => updateInventoryItem(payload));
  ipcMain.handle("inventory:delete", (_event, payload) => deleteInventoryItem(payload));
  ipcMain.handle("inventory:stock-in", (_event, payload) => stockInInventoryItem(payload));
  ipcMain.handle("inventory:adjust", (_event, payload) => adjustInventoryStock(payload));
  ipcMain.handle("sales:create", (_event, payload) => createSale(payload));
  ipcMain.handle("sales:void-refund", (_event, payload) => voidOrRefundSale(payload));
  ipcMain.handle("super-admin:data", () => getSuperAdminConsoleData());
  ipcMain.handle("super-admin:trial:update", (_event, payload) => updateTrialSettings(payload));
  ipcMain.handle("super-admin:database:optimize", (_event, payload) => optimizeDatabase(payload));
  ipcMain.handle("super-admin:logs:clear", (_event, payload) => clearOldLogs(payload));
  ipcMain.handle("super-admin:backup:create", async (event, payload: { superAdminId: number }) => createDatabaseBackup(event, payload.superAdminId));
  ipcMain.handle("super-admin:database:export", async (event, payload: { superAdminId: number }) => exportDatabaseFile(event, payload.superAdminId));
  ipcMain.handle("super-admin:database:restore", async (event, payload: { superAdminId: number; password: string }) => restoreDatabaseBackup(event, payload.superAdminId, payload.password));
  ipcMain.handle("super-admin:database:clear", async (event, payload: { superAdminId: number; password: string }) => clearDatabaseWithBackup(event, payload.superAdminId, payload.password));
  ipcMain.handle("print:receipt", async (_event, payload: { html: string }) => {
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
  ipcMain.handle("receipt:pdf", async (event, payload: { html: string; receiptNo?: string }) => {
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", () => {
  const existingWindow = BrowserWindow.getAllWindows()[0];
  if (!existingWindow) return;
  if (existingWindow.isMinimized()) existingWindow.restore();
  existingWindow.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function backupFilename(extension = "bak") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `talyer-pos-backup-${stamp}.${extension}`;
}

async function createDatabaseBackup(event: IpcMainInvokeEvent, superAdminId: number) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const defaultPath = path.join(app.getPath("documents"), backupFilename("bak"));
  const { canceled, filePath } = parentWindow ? await dialog.showSaveDialog(parentWindow, {
    title: "Create Database Backup",
    defaultPath,
    buttonLabel: "Create Backup",
    filters: [{ name: "Database Backup", extensions: ["bak", "sqlite", "db"] }],
    properties: ["showOverwriteConfirmation", "createDirectory"]
  }) : await dialog.showSaveDialog({
    title: "Create Database Backup",
    defaultPath,
    buttonLabel: "Create Backup",
    filters: [{ name: "Database Backup", extensions: ["bak", "sqlite", "db"] }],
    properties: ["showOverwriteConfirmation", "createDirectory"]
  });
  if (canceled || !filePath) return getSuperAdminConsoleData();
  fs.copyFileSync(databaseFilePath(), filePath);
  markBackupCreated(superAdminId, `Backup created at ${filePath}`);
  return getSuperAdminConsoleData();
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

async function restoreDatabaseBackup(event: IpcMainInvokeEvent, superAdminId: number, password: string) {
  if (!verifySuperAdminPassword(superAdminId, password)) throw new Error("Super Admin password confirmation is invalid.");
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const dialogOptions: OpenDialogOptions = {
    title: "Restore Database Backup",
    buttonLabel: "Restore Backup",
    filters: [{ name: "Database Backup", extensions: ["db", "sqlite", "bak"] }],
    properties: ["openFile"]
  };
  const { canceled, filePaths } = parentWindow ? await dialog.showOpenDialog(parentWindow, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
  if (canceled || !filePaths[0]) return getSuperAdminConsoleData();
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
  fs.copyFileSync(currentPath, restorePoint);
  closeDatabase();
  fs.copyFileSync(filePaths[0], currentPath);
  recordSystemLog({ superAdminId, action: "Database Restored", details: `Restored from ${filePaths[0]}. Restore point: ${restorePoint}` });
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
  const width = Number(html.match(/name="receipt-width-mm" content="(\d+)"/)?.[1]) || 58;
  const height = Number(html.match(/name="receipt-height-mm" content="(\d+)"/)?.[1]) || 160;
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
