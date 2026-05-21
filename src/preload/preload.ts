import { contextBridge, ipcRenderer } from "electron";
import type * as RendererTypes from "../renderer/types/global";

type TalyerApi = {
  login(payload: RendererTypes.LoginPayload): Promise<unknown>;
  changePassword(payload: RendererTypes.ChangePasswordPayload): Promise<unknown>;
  createUser(payload: RendererTypes.CreateUserPayload): Promise<unknown>;
  disableUser(payload: RendererTypes.DisableUserPayload): Promise<unknown>;
  enableUser(payload: RendererTypes.EnableUserPayload): Promise<unknown>;
  createJobOrder(payload: RendererTypes.CreateJobOrderPayload): Promise<unknown>;
  updateJobOrder(payload: RendererTypes.UpdateJobOrderPayload): Promise<unknown>;
  payJobOrder(payload: RendererTypes.PayJobOrderPayload): Promise<unknown>;
  updateReceiptSettings(payload: RendererTypes.UpdateReceiptSettingsPayload): Promise<unknown>;
  updatePrinterSettings(payload: RendererTypes.UpdatePrinterSettingsPayload): Promise<unknown>;
  createInventoryCategory(payload: RendererTypes.CreateInventoryCategoryPayload): Promise<unknown>;
  deleteInventoryCategory(payload: RendererTypes.DeleteInventoryCategoryPayload): Promise<unknown>;
  createPaymentMethod(payload: RendererTypes.CreatePaymentMethodPayload): Promise<unknown>;
  updatePaymentMethod(payload: RendererTypes.UpdatePaymentMethodPayload): Promise<unknown>;
  setPaymentMethodStatus(payload: RendererTypes.SetPaymentMethodStatusPayload): Promise<unknown>;
  deletePaymentMethod(payload: RendererTypes.DeletePaymentMethodPayload): Promise<unknown>;
  createService(payload: RendererTypes.CreateServicePayload): Promise<unknown>;
  updateService(payload: RendererTypes.UpdateServicePayload): Promise<unknown>;
  deleteService(payload: RendererTypes.DeleteServicePayload): Promise<unknown>;
  createMechanic(payload: RendererTypes.CreateMechanicPayload): Promise<unknown>;
  updateMechanic(payload: RendererTypes.UpdateMechanicPayload): Promise<unknown>;
  setMechanicStatus(payload: RendererTypes.SetMechanicStatusPayload): Promise<unknown>;
  deleteMechanic(payload: RendererTypes.DeleteMechanicPayload): Promise<unknown>;
  updateMechanicPayroll(payload: RendererTypes.UpdateMechanicPayrollPayload): Promise<unknown>;
  recordMechanicAttendance(payload: RendererTypes.RecordMechanicAttendancePayload): Promise<unknown>;
  updateMechanicAttendance(payload: RendererTypes.UpdateMechanicAttendancePayload): Promise<unknown>;
  generatePayroll(payload: RendererTypes.GeneratePayrollPayload): Promise<unknown>;
  createPayrollCutoff(payload: RendererTypes.CreatePayrollCutoffPayload): Promise<unknown>;
  submitPayrollForReview(payload: RendererTypes.PayrollStatusPayload): Promise<unknown>;
  approvePayrollRun(payload: RendererTypes.PayrollStatusPayload): Promise<unknown>;
  markPayrollPaid(payload: RendererTypes.MarkPayrollPaidPayload): Promise<unknown>;
  cancelPayrollRun(payload: RendererTypes.PayrollReasonPayload): Promise<unknown>;
  voidPayrollRun(payload: RendererTypes.PayrollReasonPayload): Promise<unknown>;
  updatePayrollSettings(payload: RendererTypes.UpdatePayrollSettingsPayload): Promise<unknown>;
  createSupplier(payload: RendererTypes.CreateSupplierPayload): Promise<unknown>;
  updateSupplier(payload: RendererTypes.UpdateSupplierPayload): Promise<unknown>;
  deleteSupplier(payload: RendererTypes.DeleteSupplierPayload): Promise<unknown>;
  createPurchaseOrder(payload: RendererTypes.CreatePurchaseOrderPayload): Promise<unknown>;
  updatePurchaseOrderStatus(payload: RendererTypes.UpdatePurchaseOrderStatusPayload): Promise<unknown>;
  createExpense(payload: RendererTypes.CreateExpensePayload): Promise<unknown>;
  updateExpense(payload: RendererTypes.UpdateExpensePayload): Promise<unknown>;
  deleteExpense(payload: RendererTypes.DeleteExpensePayload): Promise<unknown>;
  listPrinters(): Promise<unknown>;
  listData(): Promise<unknown>;
  listDataScope(payload: RendererTypes.ListDataScopePayload): Promise<unknown>;
  createInventoryItem(payload: RendererTypes.CreateInventoryItemPayload): Promise<unknown>;
  updateInventoryItem(payload: RendererTypes.UpdateInventoryItemPayload): Promise<unknown>;
  deleteInventoryItem(payload: RendererTypes.DeleteInventoryItemPayload): Promise<unknown>;
  stockInInventoryItem(payload: RendererTypes.StockInInventoryPayload): Promise<unknown>;
  adjustInventoryStock(payload: RendererTypes.AdjustInventoryStockPayload): Promise<unknown>;
  createSale(payload: RendererTypes.CreateSalePayload): Promise<unknown>;
  voidOrRefundSale(payload: RendererTypes.VoidOrRefundSalePayload): Promise<unknown>;
  getSuperAdminData(): Promise<unknown>;
  updateTrialSettings(payload: RendererTypes.UpdateTrialSettingsPayload): Promise<unknown>;
  optimizeDatabase(payload: RendererTypes.SuperAdminActionPayload): Promise<unknown>;
  clearOldLogs(payload: RendererTypes.ClearOldLogsPayload): Promise<unknown>;
  createBackup(payload: RendererTypes.SuperAdminActionPayload): Promise<unknown>;
  updateAutomaticBackupSettings(payload: RendererTypes.UpdateAutomaticBackupSettingsPayload): Promise<unknown>;
  chooseBackupFolder(): Promise<unknown>;
  openBackupFolder(): Promise<unknown>;
  exportDatabase(payload: RendererTypes.SuperAdminActionPayload): Promise<unknown>;
  previewRestoreDatabase(payload: RendererTypes.RestoreDatabasePayload): Promise<unknown>;
  restoreDatabase(payload: RendererTypes.RestoreDatabasePayload): Promise<unknown>;
  clearDatabase(payload: RendererTypes.ClearDatabasePayload): Promise<unknown>;
  printReceipt(payload: RendererTypes.ReceiptDocumentPayload): Promise<unknown>;
  saveReceiptPdf(payload: RendererTypes.ReceiptDocumentPayload): Promise<unknown>;
};

const talyerApi: TalyerApi = {
  login: (payload) => ipcRenderer.invoke("auth:login", payload),
  changePassword: (payload) => ipcRenderer.invoke("auth:change-password", payload),
  createUser: (payload) => ipcRenderer.invoke("users:create", payload),
  disableUser: (payload) => ipcRenderer.invoke("users:disable", payload),
  enableUser: (payload) => ipcRenderer.invoke("users:enable", payload),
  createJobOrder: (payload) => ipcRenderer.invoke("jobs:create", payload),
  updateJobOrder: (payload) => ipcRenderer.invoke("jobs:update", payload),
  payJobOrder: (payload) => ipcRenderer.invoke("jobs:pay", payload),
  updateReceiptSettings: (payload) => ipcRenderer.invoke("settings:receipt:update", payload),
  updatePrinterSettings: (payload) => ipcRenderer.invoke("settings:printer:update", payload),
  createInventoryCategory: (payload) => ipcRenderer.invoke("settings:category:create", payload),
  deleteInventoryCategory: (payload) => ipcRenderer.invoke("settings:category:delete", payload),
  createPaymentMethod: (payload) => ipcRenderer.invoke("settings:payment:create", payload),
  updatePaymentMethod: (payload) => ipcRenderer.invoke("settings:payment:update", payload),
  setPaymentMethodStatus: (payload) => ipcRenderer.invoke("settings:payment:status", payload),
  deletePaymentMethod: (payload) => ipcRenderer.invoke("settings:payment:delete", payload),
  createService: (payload) => ipcRenderer.invoke("services:create", payload),
  updateService: (payload) => ipcRenderer.invoke("services:update", payload),
  deleteService: (payload) => ipcRenderer.invoke("services:delete", payload),
  createMechanic: (payload) => ipcRenderer.invoke("mechanics:create", payload),
  updateMechanic: (payload) => ipcRenderer.invoke("mechanics:update", payload),
  setMechanicStatus: (payload) => ipcRenderer.invoke("mechanics:status", payload),
  deleteMechanic: (payload) => ipcRenderer.invoke("mechanics:delete", payload),
  updateMechanicPayroll: (payload) => ipcRenderer.invoke("payroll:mechanic:update", payload),
  recordMechanicAttendance: (payload) => ipcRenderer.invoke("payroll:attendance:record", payload),
  updateMechanicAttendance: (payload) => ipcRenderer.invoke("payroll:attendance:update", payload),
  generatePayroll: (payload) => ipcRenderer.invoke("payroll:generate", payload),
  createPayrollCutoff: (payload) => ipcRenderer.invoke("payroll:cutoff:create", payload),
  submitPayrollForReview: (payload) => ipcRenderer.invoke("payroll:review", payload),
  approvePayrollRun: (payload) => ipcRenderer.invoke("payroll:approve", payload),
  markPayrollPaid: (payload) => ipcRenderer.invoke("payroll:paid", payload),
  cancelPayrollRun: (payload) => ipcRenderer.invoke("payroll:cancel", payload),
  voidPayrollRun: (payload) => ipcRenderer.invoke("payroll:void", payload),
  updatePayrollSettings: (payload) => ipcRenderer.invoke("payroll:settings:update", payload),
  createSupplier: (payload) => ipcRenderer.invoke("suppliers:create", payload),
  updateSupplier: (payload) => ipcRenderer.invoke("suppliers:update", payload),
  deleteSupplier: (payload) => ipcRenderer.invoke("suppliers:delete", payload),
  createPurchaseOrder: (payload) => ipcRenderer.invoke("purchases:create", payload),
  updatePurchaseOrderStatus: (payload) => ipcRenderer.invoke("purchases:status", payload),
  createExpense: (payload) => ipcRenderer.invoke("expenses:create", payload),
  updateExpense: (payload) => ipcRenderer.invoke("expenses:update", payload),
  deleteExpense: (payload) => ipcRenderer.invoke("expenses:delete", payload),
  listPrinters: () => ipcRenderer.invoke("printers:list"),
  listData: () => ipcRenderer.invoke("data:list"),
  listDataScope: (payload) => ipcRenderer.invoke("data:list-scope", payload),
  createInventoryItem: (payload) => ipcRenderer.invoke("inventory:create", payload),
  updateInventoryItem: (payload) => ipcRenderer.invoke("inventory:update", payload),
  deleteInventoryItem: (payload) => ipcRenderer.invoke("inventory:delete", payload),
  stockInInventoryItem: (payload) => ipcRenderer.invoke("inventory:stock-in", payload),
  adjustInventoryStock: (payload) => ipcRenderer.invoke("inventory:adjust", payload),
  createSale: (payload) => ipcRenderer.invoke("sales:create", payload),
  voidOrRefundSale: (payload) => ipcRenderer.invoke("sales:void-refund", payload),
  getSuperAdminData: () => ipcRenderer.invoke("super-admin:data"),
  updateTrialSettings: (payload) => ipcRenderer.invoke("super-admin:trial:update", payload),
  optimizeDatabase: (payload) => ipcRenderer.invoke("super-admin:database:optimize", payload),
  clearOldLogs: (payload) => ipcRenderer.invoke("super-admin:logs:clear", payload),
  createBackup: (payload) => ipcRenderer.invoke("super-admin:backup:create", payload),
  updateAutomaticBackupSettings: (payload) => ipcRenderer.invoke("super-admin:backup:settings", payload),
  chooseBackupFolder: () => ipcRenderer.invoke("super-admin:backup:folder"),
  openBackupFolder: () => ipcRenderer.invoke("super-admin:backup:open-folder"),
  exportDatabase: (payload) => ipcRenderer.invoke("super-admin:database:export", payload),
  previewRestoreDatabase: (payload) => ipcRenderer.invoke("super-admin:database:restore-preview", payload),
  restoreDatabase: (payload) => ipcRenderer.invoke("super-admin:database:restore", payload),
  clearDatabase: (payload) => ipcRenderer.invoke("super-admin:database:clear", payload),
  printReceipt: (payload) => ipcRenderer.invoke("print:receipt", payload),
  saveReceiptPdf: (payload) => ipcRenderer.invoke("receipt:pdf", payload)
};

contextBridge.exposeInMainWorld("talyer", talyerApi);
