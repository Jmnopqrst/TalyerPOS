"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const database_1 = require("./database");
const isDev = process.env.VITE_DEV_SERVER_URL || !electron_1.app.isPackaged;
const hasSingleInstanceLock = electron_1.app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    electron_1.app.quit();
}
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1180,
        minHeight: 720,
        title: "TalyerPOS",
        backgroundColor: "#f4f1ec",
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "../preload/preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    if (isDev) {
        win.loadURL("http://127.0.0.1:5173");
    }
    else {
        win.loadFile(node_path_1.default.join(__dirname, "../renderer/index.html"));
    }
}
if (hasSingleInstanceLock)
    electron_1.app.whenReady().then(() => {
        electron_1.ipcMain.handle("auth:login", (_event, payload) => (0, database_1.login)(payload.username, payload.password));
        electron_1.ipcMain.handle("auth:change-password", (_event, payload) => (0, database_1.changePassword)(payload));
        electron_1.ipcMain.handle("users:create", (_event, payload) => (0, database_1.createUser)(payload));
        electron_1.ipcMain.handle("users:disable", (_event, payload) => (0, database_1.disableUser)(payload));
        electron_1.ipcMain.handle("users:enable", (_event, payload) => (0, database_1.enableUser)(payload));
        electron_1.ipcMain.handle("jobs:create", (_event, payload) => (0, database_1.createJobOrder)(payload));
        electron_1.ipcMain.handle("jobs:update", (_event, payload) => (0, database_1.updateJobOrder)(payload));
        electron_1.ipcMain.handle("jobs:pay", (_event, payload) => (0, database_1.payJobOrder)(payload));
        electron_1.ipcMain.handle("settings:receipt:update", (_event, payload) => (0, database_1.updateReceiptSettings)(payload));
        electron_1.ipcMain.handle("settings:printer:update", async (_event, payload) => {
            if (payload.outputMode === "Printer") {
                const printers = await listPrinters();
                if (!printers.some((printer) => printer.name === payload.printerName))
                    throw new Error("Selected printer is no longer available.");
            }
            return (0, database_1.updateReceiptPrinterSettings)(payload);
        });
        electron_1.ipcMain.handle("settings:category:create", (_event, payload) => (0, database_1.createInventoryCategory)(payload));
        electron_1.ipcMain.handle("settings:category:delete", (_event, payload) => (0, database_1.deleteInventoryCategory)(payload));
        electron_1.ipcMain.handle("settings:payment:create", (_event, payload) => (0, database_1.createPaymentMethod)(payload));
        electron_1.ipcMain.handle("settings:payment:update", (_event, payload) => (0, database_1.updatePaymentMethod)(payload));
        electron_1.ipcMain.handle("settings:payment:status", (_event, payload) => (0, database_1.setPaymentMethodStatus)(payload));
        electron_1.ipcMain.handle("settings:payment:delete", (_event, payload) => (0, database_1.deletePaymentMethod)(payload));
        electron_1.ipcMain.handle("services:create", (_event, payload) => (0, database_1.createService)(payload));
        electron_1.ipcMain.handle("services:update", (_event, payload) => (0, database_1.updateService)(payload));
        electron_1.ipcMain.handle("services:delete", (_event, payload) => (0, database_1.deleteService)(payload));
        electron_1.ipcMain.handle("mechanics:create", (_event, payload) => (0, database_1.createMechanic)(payload));
        electron_1.ipcMain.handle("mechanics:update", (_event, payload) => (0, database_1.updateMechanic)(payload));
        electron_1.ipcMain.handle("mechanics:status", (_event, payload) => (0, database_1.setMechanicStatus)(payload));
        electron_1.ipcMain.handle("mechanics:delete", (_event, payload) => (0, database_1.deleteMechanic)(payload));
        electron_1.ipcMain.handle("suppliers:create", (_event, payload) => (0, database_1.createSupplier)(payload));
        electron_1.ipcMain.handle("suppliers:update", (_event, payload) => (0, database_1.updateSupplier)(payload));
        electron_1.ipcMain.handle("suppliers:delete", (_event, payload) => (0, database_1.deleteSupplier)(payload));
        electron_1.ipcMain.handle("expenses:create", (_event, payload) => (0, database_1.createExpense)(payload));
        electron_1.ipcMain.handle("expenses:update", (_event, payload) => (0, database_1.updateExpense)(payload));
        electron_1.ipcMain.handle("expenses:delete", (_event, payload) => (0, database_1.deleteExpense)(payload));
        electron_1.ipcMain.handle("printers:list", async () => listPrinters());
        electron_1.ipcMain.handle("data:list", () => (0, database_1.listAll)());
        electron_1.ipcMain.handle("inventory:create", (_event, payload) => (0, database_1.createInventoryItem)(payload));
        electron_1.ipcMain.handle("inventory:update", (_event, payload) => (0, database_1.updateInventoryItem)(payload));
        electron_1.ipcMain.handle("inventory:delete", (_event, payload) => (0, database_1.deleteInventoryItem)(payload));
        electron_1.ipcMain.handle("inventory:stock-in", (_event, payload) => (0, database_1.stockInInventoryItem)(payload));
        electron_1.ipcMain.handle("inventory:adjust", (_event, payload) => (0, database_1.adjustInventoryStock)(payload));
        electron_1.ipcMain.handle("sales:create", (_event, payload) => (0, database_1.createSale)(payload));
        electron_1.ipcMain.handle("sales:void-refund", (_event, payload) => (0, database_1.voidOrRefundSale)(payload));
        electron_1.ipcMain.handle("super-admin:data", () => (0, database_1.getSuperAdminConsoleData)());
        electron_1.ipcMain.handle("super-admin:trial:update", (_event, payload) => (0, database_1.updateTrialSettings)(payload));
        electron_1.ipcMain.handle("super-admin:database:optimize", (_event, payload) => (0, database_1.optimizeDatabase)(payload));
        electron_1.ipcMain.handle("super-admin:logs:clear", (_event, payload) => (0, database_1.clearOldLogs)(payload));
        electron_1.ipcMain.handle("super-admin:backup:create", async (event, payload) => createDatabaseBackup(event, payload.superAdminId));
        electron_1.ipcMain.handle("super-admin:database:export", async (event, payload) => exportDatabaseFile(event, payload.superAdminId));
        electron_1.ipcMain.handle("super-admin:database:restore", async (event, payload) => restoreDatabaseBackup(event, payload.superAdminId, payload.password));
        electron_1.ipcMain.handle("super-admin:database:clear", async (event, payload) => clearDatabaseWithBackup(event, payload.superAdminId, payload.password));
        electron_1.ipcMain.handle("print:receipt", async (_event, payload) => {
            let receiptWindow = null;
            try {
                const settings = (0, database_1.getReceiptSettings)();
                if (settings.receipt_output_mode !== "Printer" || !settings.receipt_printer_name)
                    return false;
                receiptWindow = await createReceiptWindow(payload.html);
                const printers = await listPrinters(receiptWindow);
                const targetPrinter = printers.find((printer) => printer.name === settings.receipt_printer_name);
                if (!targetPrinter)
                    return false;
                const pageSize = receiptPageSize(payload.html);
                return await new Promise((resolve) => {
                    receiptWindow?.webContents.print({ silent: true, printBackground: true, deviceName: targetPrinter.name, margins: { marginType: "printableArea" }, pageSize }, (success, failureReason) => {
                        if (!success && failureReason)
                            console.warn(`Receipt print failed: ${failureReason}`);
                        resolve(success);
                    });
                });
            }
            catch (caught) {
                console.warn("Receipt print failed:", caught);
                return false;
            }
            finally {
                receiptWindow?.close();
            }
        });
        electron_1.ipcMain.handle("receipt:pdf", async (event, payload) => {
            let receiptWindow = null;
            try {
                receiptWindow = await createReceiptWindow(payload.html);
                const pdf = await receiptWindow.webContents.printToPDF({
                    printBackground: true,
                    preferCSSPageSize: true,
                    margins: { marginType: "printableArea" }
                });
                if (pdf.length < 1000)
                    throw new Error("Generated receipt PDF was empty.");
                const parentWindow = electron_1.BrowserWindow.fromWebContents(event.sender) ?? undefined;
                const receiptNo = payload.receiptNo || `receipt-${Date.now()}`;
                const defaultPath = node_path_1.default.join(electron_1.app.getPath("downloads"), uniqueReceiptFilename(electron_1.app.getPath("downloads"), receiptNo));
                const saveOptions = {
                    title: "Save receipt as PDF",
                    defaultPath,
                    buttonLabel: "Save Receipt",
                    filters: [{ name: "PDF Receipt", extensions: ["pdf"] }],
                    properties: ["showOverwriteConfirmation", "createDirectory"]
                };
                const { canceled, filePath } = parentWindow ? await electron_1.dialog.showSaveDialog(parentWindow, saveOptions) : await electron_1.dialog.showSaveDialog(saveOptions);
                if (canceled || !filePath)
                    return false;
                const targetPath = node_path_1.default.extname(filePath).toLowerCase() === ".pdf" ? filePath : `${filePath}.pdf`;
                node_fs_1.default.writeFileSync(targetPath, pdf);
                return true;
            }
            finally {
                receiptWindow?.close();
            }
        });
        createWindow();
        electron_1.app.on("activate", () => {
            if (electron_1.BrowserWindow.getAllWindows().length === 0)
                createWindow();
        });
    });
electron_1.app.on("second-instance", () => {
    const existingWindow = electron_1.BrowserWindow.getAllWindows()[0];
    if (!existingWindow)
        return;
    if (existingWindow.isMinimized())
        existingWindow.restore();
    existingWindow.focus();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
function backupFilename(extension = "bak") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `talyer-pos-backup-${stamp}.${extension}`;
}
async function createDatabaseBackup(event, superAdminId) {
    const parentWindow = electron_1.BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const defaultPath = node_path_1.default.join(electron_1.app.getPath("documents"), backupFilename("bak"));
    const { canceled, filePath } = parentWindow ? await electron_1.dialog.showSaveDialog(parentWindow, {
        title: "Create Database Backup",
        defaultPath,
        buttonLabel: "Create Backup",
        filters: [{ name: "Database Backup", extensions: ["bak", "sqlite", "db"] }],
        properties: ["showOverwriteConfirmation", "createDirectory"]
    }) : await electron_1.dialog.showSaveDialog({
        title: "Create Database Backup",
        defaultPath,
        buttonLabel: "Create Backup",
        filters: [{ name: "Database Backup", extensions: ["bak", "sqlite", "db"] }],
        properties: ["showOverwriteConfirmation", "createDirectory"]
    });
    if (canceled || !filePath)
        return (0, database_1.getSuperAdminConsoleData)();
    node_fs_1.default.copyFileSync((0, database_1.databaseFilePath)(), filePath);
    (0, database_1.markBackupCreated)(superAdminId, `Backup created at ${filePath}`);
    return (0, database_1.getSuperAdminConsoleData)();
}
async function exportDatabaseFile(event, superAdminId) {
    const parentWindow = electron_1.BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const defaultPath = node_path_1.default.join(electron_1.app.getPath("documents"), backupFilename("sqlite"));
    const options = {
        title: "Export Database File",
        defaultPath,
        buttonLabel: "Export Database",
        filters: [{ name: "SQLite Database", extensions: ["sqlite", "db", "bak"] }],
        properties: ["showOverwriteConfirmation", "createDirectory"]
    };
    const { canceled, filePath } = parentWindow ? await electron_1.dialog.showSaveDialog(parentWindow, options) : await electron_1.dialog.showSaveDialog(options);
    if (canceled || !filePath)
        return (0, database_1.getSuperAdminConsoleData)();
    node_fs_1.default.copyFileSync((0, database_1.databaseFilePath)(), filePath);
    (0, database_1.recordSystemLog)({ superAdminId, action: "Database Exported", details: `Database exported to ${filePath}` });
    return (0, database_1.getSuperAdminConsoleData)();
}
async function restoreDatabaseBackup(event, superAdminId, password) {
    if (!(0, database_1.verifySuperAdminPassword)(superAdminId, password))
        throw new Error("Super Admin password confirmation is invalid.");
    const parentWindow = electron_1.BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const dialogOptions = {
        title: "Restore Database Backup",
        buttonLabel: "Restore Backup",
        filters: [{ name: "Database Backup", extensions: ["db", "sqlite", "bak"] }],
        properties: ["openFile"]
    };
    const { canceled, filePaths } = parentWindow ? await electron_1.dialog.showOpenDialog(parentWindow, dialogOptions) : await electron_1.dialog.showOpenDialog(dialogOptions);
    if (canceled || !filePaths[0])
        return (0, database_1.getSuperAdminConsoleData)();
    const confirmed = parentWindow ? await electron_1.dialog.showMessageBox(parentWindow, {
        type: "warning",
        buttons: ["Cancel", "Restore"],
        defaultId: 0,
        cancelId: 0,
        title: "Confirm Database Restore",
        message: "Restoring backup will overwrite current data.",
        detail: "A restore point will be created first. Do you want to continue?"
    }) : await electron_1.dialog.showMessageBox({
        type: "warning",
        buttons: ["Cancel", "Restore"],
        defaultId: 0,
        cancelId: 0,
        title: "Confirm Database Restore",
        message: "Restoring backup will overwrite current data.",
        detail: "A restore point will be created first. Do you want to continue?"
    });
    if (confirmed.response !== 1)
        return (0, database_1.getSuperAdminConsoleData)();
    const currentPath = (0, database_1.databaseFilePath)();
    const restorePoint = node_path_1.default.join(electron_1.app.getPath("documents"), backupFilename("restore-point.bak"));
    node_fs_1.default.copyFileSync(currentPath, restorePoint);
    (0, database_1.closeDatabase)();
    node_fs_1.default.copyFileSync(filePaths[0], currentPath);
    (0, database_1.recordSystemLog)({ superAdminId, action: "Database Restored", details: `Restored from ${filePaths[0]}. Restore point: ${restorePoint}` });
    return (0, database_1.getSuperAdminConsoleData)();
}
async function clearDatabaseWithBackup(event, superAdminId, password) {
    const parentWindow = electron_1.BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const firstConfirm = parentWindow ? await electron_1.dialog.showMessageBox(parentWindow, {
        type: "warning",
        buttons: ["Cancel", "Continue"],
        defaultId: 0,
        cancelId: 0,
        title: "Clear Operational Database",
        message: "This action will permanently reset the system and delete operational data.",
        detail: "POS transactions, job orders, inventory, suppliers, mechanics, services, operational users, reports, audit logs, branding, receipt settings, printer selection, categories, and payment settings will be reset. Super Admin access will be preserved."
    }) : await electron_1.dialog.showMessageBox({
        type: "warning",
        buttons: ["Cancel", "Continue"],
        defaultId: 0,
        cancelId: 0,
        title: "Clear Operational Database",
        message: "This action will permanently reset the system and delete operational data.",
        detail: "POS transactions, job orders, inventory, suppliers, mechanics, services, operational users, reports, audit logs, branding, receipt settings, printer selection, categories, and payment settings will be reset. Super Admin access will be preserved."
    });
    if (firstConfirm.response !== 1)
        return (0, database_1.getSuperAdminConsoleData)();
    if (!(0, database_1.verifySuperAdminPassword)(superAdminId, password))
        throw new Error("Super Admin password confirmation is incorrect.");
    const backupDirectory = node_path_1.default.join(electron_1.app.getPath("documents"), "TalyerPOS Backups");
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const backupPath = node_path_1.default.join(backupDirectory, `backup-before-reset-${datePart}.bak`);
    (0, database_1.backupDatabaseFile)(backupPath);
    const next = (0, database_1.clearOperationalDatabase)({ superAdminId, backupPath });
    return next;
}
async function createReceiptWindow(html, requireReceiptContent = true) {
    const receiptPath = node_path_1.default.join(electron_1.app.getPath("temp"), `talyer-receipt-${Date.now()}-${Math.random().toString(16).slice(2)}.html`);
    node_fs_1.default.writeFileSync(receiptPath, html, "utf8");
    const receiptWindow = new electron_1.BrowserWindow({
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
        node_fs_1.default.rm(receiptPath, { force: true }, () => undefined);
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
    if (!isReady)
        throw new Error("Receipt content was empty before printing.");
    await new Promise((resolve) => setTimeout(resolve, 300));
    return receiptWindow;
}
function uniqueReceiptFilename(directory, receiptNo) {
    const baseName = receiptNo.replace(/[^a-zA-Z0-9._-]/g, "-") || `receipt-${Date.now()}`;
    let filename = `${baseName}.pdf`;
    let counter = 1;
    while (node_fs_1.default.existsSync(node_path_1.default.join(directory, filename))) {
        filename = `${baseName}-${counter}.pdf`;
        counter += 1;
    }
    return filename;
}
function receiptPageSize(html) {
    const width = Number(html.match(/name="receipt-width-mm" content="(\d+)"/)?.[1]) || 58;
    const height = Number(html.match(/name="receipt-height-mm" content="(\d+)"/)?.[1]) || 160;
    return {
        width: Math.round(width * 1000),
        height: Math.round(height * 1000)
    };
}
async function listPrinters(window) {
    const sourceWindow = window ?? electron_1.BrowserWindow.getFocusedWindow() ?? electron_1.BrowserWindow.getAllWindows()[0] ?? (await createReceiptWindow("<!doctype html><html><body></body></html>", false));
    const shouldClose = !window && !electron_1.BrowserWindow.getFocusedWindow() && electron_1.BrowserWindow.getAllWindows().length === 0;
    try {
        const printers = await sourceWindow.webContents.getPrintersAsync();
        return printers
            .filter((printer) => !/pdf|xps|onenote|fax/i.test(printer.name))
            .map((printer) => ({ name: printer.name, isDefault: Boolean(printer.isDefault) }));
    }
    finally {
        if (shouldClose)
            sourceWindow.close();
    }
}
