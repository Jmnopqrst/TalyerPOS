export {};

declare global {
  interface Window {
    talyer: {
      login(payload: LoginPayload): Promise<UserAccount | null>;
      changePassword(payload: ChangePasswordPayload): Promise<UserAccount>;
      createUser(payload: CreateUserPayload): Promise<CreateUserResult>;
      disableUser(payload: DisableUserPayload): Promise<{ ok: boolean }>;
      enableUser(payload: EnableUserPayload): Promise<{ ok: boolean }>;
      createJobOrder(payload: CreateJobOrderPayload): Promise<{ id: number; jobNo: string }>;
      updateJobOrder(payload: UpdateJobOrderPayload): Promise<JobCompletionSummary>;
      payJobOrder(payload: PayJobOrderPayload): Promise<{ receiptNo: string; total: number; paidAt: string; paymentCategory?: PaymentCategory; paymentReferenceCode?: string }>;
      updateReceiptSettings(payload: UpdateReceiptSettingsPayload): Promise<ReceiptSettings>;
      updatePrinterSettings(payload: UpdatePrinterSettingsPayload): Promise<ReceiptSettings>;
      createInventoryCategory(payload: CreateInventoryCategoryPayload): Promise<InventoryCategory>;
      deleteInventoryCategory(payload: DeleteInventoryCategoryPayload): Promise<{ ok: boolean }>;
      createPaymentMethod(payload: CreatePaymentMethodPayload): Promise<PaymentMethod>;
      updatePaymentMethod(payload: UpdatePaymentMethodPayload): Promise<PaymentMethod>;
      setPaymentMethodStatus(payload: SetPaymentMethodStatusPayload): Promise<{ ok: boolean }>;
      deletePaymentMethod(payload: DeletePaymentMethodPayload): Promise<{ ok: boolean }>;
      createService(payload: CreateServicePayload): Promise<Service>;
      updateService(payload: UpdateServicePayload): Promise<Service>;
      deleteService(payload: DeleteServicePayload): Promise<{ ok: boolean }>;
      createMechanic(payload: CreateMechanicPayload): Promise<UserAccount>;
      updateMechanic(payload: UpdateMechanicPayload): Promise<UserAccount>;
      setMechanicStatus(payload: SetMechanicStatusPayload): Promise<{ ok: boolean }>;
      deleteMechanic(payload: DeleteMechanicPayload): Promise<{ ok: boolean }>;
      updateMechanicPayroll(payload: UpdateMechanicPayrollPayload): Promise<UserAccount>;
      recordMechanicAttendance(payload: RecordMechanicAttendancePayload): Promise<{ action: "Time In" | "Time Out"; mechanicName: string; recordedAt: string }>;
      updateMechanicAttendance(payload: UpdateMechanicAttendancePayload): Promise<{ ok: boolean }>;
      generatePayroll(payload: GeneratePayrollPayload): Promise<PayrollRun>;
      createPayrollCutoff(payload: CreatePayrollCutoffPayload): Promise<PayrollCutoff>;
      submitPayrollForReview(payload: PayrollStatusPayload): Promise<PayrollRun>;
      approvePayrollRun(payload: PayrollStatusPayload): Promise<PayrollRun>;
      markPayrollPaid(payload: MarkPayrollPaidPayload): Promise<{ ok: boolean; paidAt: string }>;
      cancelPayrollRun(payload: PayrollReasonPayload): Promise<PayrollRun>;
      voidPayrollRun(payload: PayrollReasonPayload): Promise<PayrollRun>;
      updatePayrollSettings(payload: UpdatePayrollSettingsPayload): Promise<PayrollSettings>;
      createSupplier(payload: CreateSupplierPayload): Promise<Supplier>;
      updateSupplier(payload: UpdateSupplierPayload): Promise<Supplier>;
      deleteSupplier(payload: DeleteSupplierPayload): Promise<{ ok: boolean }>;
      createPurchaseOrder(payload: CreatePurchaseOrderPayload): Promise<{ id: number; orderNo: string }>;
      updatePurchaseOrderStatus(payload: UpdatePurchaseOrderStatusPayload): Promise<{ ok: boolean }>;
      createExpense(payload: CreateExpensePayload): Promise<{ id: number }>;
      updateExpense(payload: UpdateExpensePayload): Promise<{ ok: boolean }>;
      deleteExpense(payload: DeleteExpensePayload): Promise<{ ok: boolean }>;
      listPrinters(): Promise<PrinterOption[]>;
      listData(): Promise<AppData>;
      listDataScope(payload: ListDataScopePayload): Promise<Partial<AppData>>;
      createInventoryItem(payload: CreateInventoryItemPayload): Promise<{ productCode: string }>;
      updateInventoryItem(payload: UpdateInventoryItemPayload): Promise<{ ok: boolean }>;
      deleteInventoryItem(payload: DeleteInventoryItemPayload): Promise<{ ok: boolean }>;
      stockInInventoryItem(payload: StockInInventoryPayload): Promise<{ ok: boolean; previousStock: number; newStock: number }>;
      adjustInventoryStock(payload: AdjustInventoryStockPayload): Promise<{ ok: boolean; previousStock: number; newStock: number }>;
      createSale(payload: CreateSalePayload): Promise<SaleReceipt>;
      voidOrRefundSale(payload: VoidOrRefundSalePayload): Promise<{ ok: boolean }>;
      getSuperAdminData(): Promise<SuperAdminData>;
      updateTrialSettings(payload: UpdateTrialSettingsPayload): Promise<SuperAdminData>;
      optimizeDatabase(payload: SuperAdminActionPayload): Promise<SuperAdminData>;
      clearOldLogs(payload: ClearOldLogsPayload): Promise<SuperAdminData>;
      createBackup(payload: SuperAdminActionPayload): Promise<SuperAdminData>;
      updateAutomaticBackupSettings(payload: UpdateAutomaticBackupSettingsPayload): Promise<SuperAdminData>;
      chooseBackupFolder(): Promise<string>;
      openBackupFolder(): Promise<boolean>;
      exportDatabase(payload: SuperAdminActionPayload): Promise<SuperAdminData>;
      previewRestoreDatabase(payload: RestoreDatabasePayload): Promise<BackupRestorePreview | null>;
      restoreDatabase(payload: RestoreDatabasePayload): Promise<SuperAdminData>;
      clearDatabase(payload: ClearDatabasePayload): Promise<SuperAdminData>;
      printReceipt(payload: ReceiptDocumentPayload): Promise<boolean>;
      saveReceiptPdf(payload: ReceiptDocumentPayload): Promise<boolean>;
    };
  }
}

export type Role = "Owner" | "Admin" | "Cashier" | "SuperAdmin";
export type PayrollType = "Per Hour" | "Per Day" | "Per Week" | "Per Month";
export type CompensationType = "Fixed Salary" | "Commission" | "Hybrid";
export type PayrollStatus = "Draft" | "Pending Review" | "Approved" | "Paid" | "Cancelled" | "Void";
export type AttendanceStatus = "Present" | "Absent" | "Late" | "Half Day" | "Sick Leave" | "Vacation Leave" | "Holiday" | "Rest Day" | "Incomplete Attendance";
export type DataScope = "all" | "core" | "sales" | "inventory" | "jobs" | "customers" | "payroll" | "reports" | "settings" | "users" | "staff" | "suppliers" | "purchases" | "audit";

export interface ListDataScopePayload {
  scope: DataScope;
}

export interface PayrollSettings {
  id: number;
  required_hours_per_day: number;
  required_hours_per_week: number;
  required_hours_per_month: number;
  working_days: string;
  consider_holidays_paid: 0 | 1;
  holiday_dates: string;
  updated_at: string;
}

export interface UserAccount {
  id: number;
  name: string;
  role: Role;
  username: string;
  contact_number: string;
  address: string;
  email: string;
  is_mechanic: 0 | 1;
  branch_id?: number | null;
  must_change_password: 0 | 1;
  status: "Active" | "Disabled";
  created_at?: string;
  created_by_name?: string;
  mechanic_code?: string;
  qr_code?: string;
  payroll_type?: PayrollType;
  salary_rate?: number;
  compensation_type?: CompensationType;
  labor_commission_percentage?: number;
}

export interface ReceiptSettings {
  id: number;
  system_name: string;
  logo_data_url: string;
  business_name: string;
  address: string;
  email: string;
  contact_number: string;
  tax_id: string;
  footer_message: string;
  show_tax_id: 0 | 1;
  show_cashier: 0 | 1;
  paper_width: 58 | 80 | 216;
  receipt_template: "Compact" | "Detailed";
  show_labor_breakdown: 0 | 1;
  custom_header: string;
  custom_footer: string;
  logo_size: "Small" | "Medium" | "Large";
  receipt_output_mode: "Printer" | "PDF";
  receipt_printer_name: string;
}

export interface TrialStatus {
  active: boolean;
  expired: boolean;
  daysRemaining: number;
  expiresAt: string;
}

export interface SuperAdminSettings {
  id: number;
  trial_enabled: 0 | 1;
  trial_started_at: string;
  trial_days: number;
  license_key: string;
  license_status: "Trial" | "Activated";
  last_backup_at: string;
  backup_schedule: "Disabled" | "Daily" | "Weekly" | "Monthly";
  backup_time: string;
  backup_weekday: number;
  backup_month_day: number;
  backup_folder: string;
  backup_retention_count: number;
  last_auto_backup_at: string;
  last_backup_error: string;
  payroll_module_enabled: 0 | 1;
  updated_at: string;
  trial: TrialStatus;
}

export interface SystemLog {
  id: number;
  super_admin_id?: number;
  action: string;
  details: string;
  created_at: string;
}

export interface SuperAdminData {
  settings: SuperAdminSettings;
  health: {
    databaseSizeBytes: number;
    lastBackupAt: string;
    failedTransactions: number;
    failedReceipts: number;
    integrityStatus: string;
    integrityOk: boolean;
    lastMigrationCheckAt: string;
    pageCount: number;
    pageSize: number;
    walSizeBytes: number;
    indexesPresent: string[];
    indexesMissing: string[];
    failedBackupCount: number;
    pendingApprovalSensitiveActions: number;
  };
  backupHistory: BackupHistory[];
  systemLogs: SystemLog[];
}

export interface SuperAdminActionPayload {
  superAdminId: number;
}

export interface ClearOldLogsPayload extends SuperAdminActionPayload {
  daysToKeep: number;
}

export interface ClearDatabasePayload extends SuperAdminActionPayload {
  password: string;
}

export interface RestoreDatabasePayload extends SuperAdminActionPayload {
  password: string;
  restorePath?: string;
}

export interface BackupRestorePreview {
  filePath: string;
  filename: string;
  fileSize: number;
  modifiedAt: string;
  integrityOk: boolean;
  integrityDetail: string;
  counts: {
    users: number;
    sales: number;
    jobs: number;
    inventory: number;
    auditLogs: number;
  };
}

export interface UpdateTrialSettingsPayload extends SuperAdminActionPayload {
  trialEnabled: boolean;
  trialDays: number;
  licenseKey?: string;
  payrollModuleEnabled?: boolean;
}

export interface UpdateAutomaticBackupSettingsPayload extends SuperAdminActionPayload {
  backupSchedule: "Disabled" | "Daily" | "Weekly" | "Monthly";
  backupTime: string;
  backupWeekday: number;
  backupMonthDay: number;
  backupFolder: string;
  backupRetentionCount: number;
}

export interface BackupHistory {
  id: number;
  filename: string;
  file_path: string;
  backup_date: string;
  file_size: number;
  backup_type: "Manual" | "Automatic" | "Hourly Incremental" | "Daily Full" | "Monthly Archive";
  status: "Success" | "Successful" | "Failed" | "Corrupted" | "Partial" | "Skipped";
  duration_ms: number;
  details: string;
  created_at: string;
}

export interface UpdateReceiptSettingsPayload {
  actorId: number;
  systemName: string;
  logoDataUrl: string;
  businessName: string;
  address: string;
  email: string;
  contactNumber: string;
  taxId: string;
  footerMessage: string;
  showTaxId: boolean;
  showCashier: boolean;
  paperWidth: number;
  receiptTemplate: "Compact" | "Detailed";
  showLaborBreakdown: boolean;
  customHeader: string;
  customFooter: string;
  logoSize: "Small" | "Medium" | "Large";
}

export interface PrinterOption {
  name: string;
  isDefault: boolean;
}

export interface UpdatePrinterSettingsPayload {
  actorId: number;
  outputMode: "Printer" | "PDF";
  printerName: string;
  approvalUsername: string;
  approvalPassword: string;
  approvalReason: string;
}

export interface ReceiptDocumentPayload {
  html: string;
  receiptNo?: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface ChangePasswordPayload {
  userId: number;
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserPayload {
  creatorId: number;
  role: Role;
  name: string;
  contactNumber: string;
  address: string;
  email?: string;
  username: string;
}

export interface CreateUserResult {
  user: UserAccount;
  credentials: {
    username: string;
    temporaryPassword: string;
    emailSent: boolean;
  };
}

export interface DisableUserPayload {
  ownerId: number;
  targetUserId: number;
}

export interface EnableUserPayload {
  ownerId: number;
  targetUserId: number;
}

export interface InventoryItem {
  id: number;
  product_code: string;
  category_id: number;
  category_name?: string;
  category_code?: string;
  name: string;
  category: string;
  supplier_id?: number;
  supplier_name?: string;
  stock: number;
  reorder_level: number;
  unit_cost: number;
  sell_price: number;
}

export interface InventoryCategory {
  id: number;
  name: string;
  code: string;
  created_at: string;
}

export interface CreateInventoryCategoryPayload {
  actorId: number;
  name: string;
  code: string;
}

export interface DeleteInventoryCategoryPayload {
  actorId: number;
  categoryId: number;
}

export interface PaymentMethod {
  id: number;
  name: string;
  type: string;
  payment_category: PaymentCategory;
  description: string;
  status: "Active" | "Inactive";
  created_at: string;
  updated_at: string;
}

export type PaymentCategory = "Manual" | "Digital";

export interface CreatePaymentMethodPayload {
  actorId: number;
  name: string;
  paymentCategory: PaymentCategory;
  description?: string;
}

export interface UpdatePaymentMethodPayload extends CreatePaymentMethodPayload {
  methodId: number;
}

export interface SetPaymentMethodStatusPayload {
  actorId: number;
  methodId: number;
  status: "Active" | "Inactive";
}

export interface DeletePaymentMethodPayload {
  actorId: number;
  methodId: number;
}

export interface CreateInventoryItemPayload {
  actorId: number;
  categoryId: number;
  name: string;
  stock: number;
  reorderLevel?: number;
  unitCost?: number;
  sellPrice: number;
  supplierId?: number | null;
}

export interface UpdateInventoryItemPayload extends CreateInventoryItemPayload {
  itemId: number;
}

export interface DeleteInventoryItemPayload {
  actorId: number;
  itemId: number;
  approvalUsername: string;
  approvalPassword: string;
  approvalReason: string;
}

export interface ApprovalPayload {
  approvalUsername: string;
  approvalPassword: string;
  approvalReason: string;
}

export interface StockInInventoryPayload {
  actorId: number;
  itemId: number;
  quantity: number;
  supplierId?: number | null;
  referenceNo?: string;
  reason: string;
}

export interface AdjustInventoryStockPayload {
  actorId: number;
  itemId: number;
  newStock: number;
  referenceNo?: string;
  reason: string;
}

export interface InventoryAdjustment {
  id: number;
  item_id: number;
  actor_id: number;
  movement_type: "Stock In" | "Adjustment";
  quantity: number;
  previous_stock: number;
  new_stock: number;
  supplier_id?: number;
  reference_no: string;
  reason: string;
  created_at: string;
  product_code: string;
  item_name: string;
  actor_name: string;
  supplier_name?: string;
}

export interface Service {
  id: number;
  name: string;
  category: string;
  price: number;
  labor_cost: number;
  duration_minutes: number;
}

export interface CreateServicePayload {
  actorId: number;
  name: string;
  category: string;
  durationMinutes: number;
  price: number;
  laborCost: number;
}

export interface UpdateServicePayload extends CreateServicePayload {
  serviceId: number;
}

export interface DeleteServicePayload {
  actorId: number;
  serviceId: number;
}

export interface CreateMechanicPayload {
  actorId: number;
  name: string;
  contactNumber: string;
  address: string;
  status: "Active" | "Disabled" | "Inactive";
}

export interface UpdateMechanicPayload extends CreateMechanicPayload {
  mechanicId: number;
}

export interface SetMechanicStatusPayload {
  actorId: number;
  mechanicId: number;
  status: "Active" | "Disabled" | "Inactive";
}

export interface DeleteMechanicPayload {
  actorId: number;
  mechanicId: number;
}

export type PurchaseOrderStatus = "Draft" | "Ordered" | "Partially Received" | "Received" | "Cancelled";

export interface PurchaseOrder {
  id: number;
  order_no: string;
  supplier_id?: number | null;
  supplier_name?: string;
  status: PurchaseOrderStatus;
  notes: string;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  received_at?: string;
}

export interface PurchaseOrderItem {
  id: number;
  purchase_order_id: number;
  item_id: number;
  product_code: string;
  item_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
}

export interface CreatePurchaseOrderPayload {
  actorId: number;
  supplierId?: number | null;
  notes?: string;
  items: Array<{
    itemId: number;
    quantityOrdered: number;
    unitCost?: number;
  }>;
}

export interface UpdatePurchaseOrderStatusPayload {
  actorId: number;
  purchaseOrderId: number;
  status: PurchaseOrderStatus;
  receivedItems?: Array<{
    itemId: number;
    quantityReceived: number;
  }>;
}

export interface UpdateMechanicPayrollPayload {
  actorId: number;
  mechanicId: number;
  payrollType: PayrollType;
  salaryRate: number;
  compensationType: CompensationType;
  laborCommissionPercentage: number;
}

export interface RecordMechanicAttendancePayload {
  actorId?: number;
  qrCode: string;
}

export interface UpdateMechanicAttendancePayload {
  actorId: number;
  attendanceId?: number;
  mechanicId: number;
  attendanceDate: string;
  timeIn?: string;
  timeOut?: string;
  status: AttendanceStatus;
  notes?: string;
}

export interface GeneratePayrollPayload {
  actorId: number;
  mechanicId: number;
  periodStart?: string;
  periodEnd?: string;
  cutoffId?: number;
  deductions?: number;
}

export interface CreatePayrollCutoffPayload {
  actorId: number;
  name: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  branchId?: number;
}

export interface PayrollStatusPayload {
  actorId: number;
  payrollId: number;
}

export interface PayrollReasonPayload extends PayrollStatusPayload {
  reason: string;
}

export interface MarkPayrollPaidPayload {
  actorId: number;
  payrollId: number;
  paymentMethod?: string;
}

export interface UpdatePayrollSettingsPayload {
  actorId: number;
  requiredHoursPerDay: number;
  requiredHoursPerWeek: number;
  requiredHoursPerMonth: number;
  workingDays: number[];
  considerHolidaysPaid: boolean;
  holidayDates: string[];
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  created_at?: string;
}

export interface Motorcycle {
  id: number;
  customer_id: number;
  customer_name: string;
  plate_no: string;
  brand: string;
  model: string;
  year: number;
  color: string;
}

export interface JobOrder {
  id: number;
  job_no: string;
  customer_name: string;
  contact_number: string;
  plate_no: string;
  motorcycle_type: string;
  brand: string;
  model: string;
  service_id?: number;
  service_name?: string;
  service_price: number;
  labor_cost: number;
  additional_labor_cost: number;
  service_cost: number;
  products_json: string;
  products_cost: number;
  total_amount: number;
  payment_method: string;
  payment_category?: PaymentCategory;
  payment_reference_code?: string;
  paid_at?: string;
  mechanic_name: string;
  mechanic_id?: number;
  branch_id?: number | null;
  status: string;
  concern: string;
  estimate: number;
  created_at: string;
  due_at: string;
}

export interface Branch {
  id: number;
  name: string;
  code: string;
  status: "Active" | "Inactive";
  created_at: string;
  updated_at: string;
}

export interface PayrollPermission {
  id: number;
  role_name: string;
  permission_key: string;
  enabled: 0 | 1;
  updated_at: string;
}

export interface JobPayrollAllocation {
  id: number;
  job_order_id: number;
  mechanic_id: number;
  mechanic_name?: string;
  mechanic_code?: string;
  allocation_role: string;
  allocation_type: "Percent" | "Fixed";
  percentage: number;
  fixed_amount: number;
  is_lead: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface JobStatusHistory {
  id: number;
  job_order_id: number;
  actor_id?: number;
  actor_name?: string;
  status: string;
  details: string;
  created_at: string;
}

export interface JobProduct {
  itemId: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateJobOrderPayload {
  actorId: number;
  customerName: string;
  contactNumber: string;
  motorcycleType: string;
  plateNumber: string;
  serviceId: number;
  mechanicId: number;
  branchId?: number;
}

export interface UpdateJobOrderPayload {
  actorId: number;
  jobOrderId: number;
  status: string;
  products: JobProduct[];
  additionalLaborCost?: number;
  payrollAllocations?: Array<{
    mechanicId: number;
    allocationRole?: string;
    allocationType?: "Percent" | "Fixed";
    percentage?: number;
    fixedAmount?: number;
    isLead?: boolean;
  }>;
}

export interface JobCompletionSummary {
  ok: boolean;
  servicePrice: number;
  laborCost: number;
  additionalLaborCost: number;
  serviceCost: number;
  productsCost: number;
  totalAmount: number;
}

export interface PayJobOrderPayload {
  actorId: number;
  jobOrderId: number;
  paymentMethod: string;
  paymentReferenceCode?: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact: string;
  phone: string;
}

export interface CreateSupplierPayload {
  actorId: number;
  name: string;
  contact: string;
  phone: string;
}

export interface UpdateSupplierPayload extends CreateSupplierPayload {
  supplierId: number;
}

export interface DeleteSupplierPayload {
  actorId: number;
  supplierId: number;
}

export interface Expense {
  id: number;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  recorded_by: number;
  recorded_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateExpensePayload {
  actorId: number;
  expenseDate: string;
  category: string;
  description: string;
  amount: number;
}

export interface UpdateExpensePayload extends CreateExpensePayload {
  expenseId: number;
}

export interface DeleteExpensePayload {
  actorId: number;
  expenseId: number;
}

export interface Sale {
  id: number;
  receipt_no: string;
  cashier_name: string;
  customer_name?: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  payment_category?: PaymentCategory;
  payment_reference_code?: string;
  status: "Completed" | "Voided" | "Refunded";
  voided_at?: string;
  voided_by?: number;
  void_approved_by?: number;
  void_reason?: string;
  created_at: string;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  item_type: "part" | "service";
  item_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface AuditLog {
  id: number;
  user_name?: string;
  action: string;
  entity: string;
  details: string;
  created_at: string;
}

export interface MechanicAttendance {
  id: number;
  mechanic_id: number;
  mechanic_name: string;
  mechanic_code?: string;
  attendance_date: string;
  time_in?: string;
  time_out?: string;
  status: AttendanceStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollCutoff {
  id: number;
  branch_id?: number | null;
  name: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: "Open" | "Closed" | "Cancelled";
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export interface PayrollRun {
  id: number;
  mechanic_id: number;
  mechanic_name?: string;
  mechanic_code?: string;
  cutoff_id?: number;
  cutoff_name?: string;
  cutoff_pay_date?: string;
  branch_id?: number | null;
  period_start: string;
  period_end: string;
  payroll_type: PayrollType;
  compensation_type: CompensationType;
  attendance_count: number;
  hours_worked: number;
  required_hours: number;
  expected_hours: number;
  credited_hours: number;
  hour_deficit: number;
  attendance_completion: number;
  hourly_equivalent_rate: number;
  holiday_paid_hours: number;
  base_salary: number;
  labor_commission: number;
  additional_incentives: number;
  deductions: number;
  gross_pay: number;
  net_pay: number;
  status: PayrollStatus;
  payment_date?: string;
  payment_method: string;
  processed_by?: number;
  processed_by_name?: string;
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;
  paid_by?: number;
  paid_by_name?: string;
  voided_by?: number;
  voided_at?: string;
  status_reason: string;
  locked_at?: string;
  attendance_snapshot_json: string;
  payroll_settings_snapshot_json: string;
  mechanic_rate_snapshot_json: string;
  commission_snapshot_json: string;
  adjustments_snapshot_json: string;
  cash_advance_snapshot_json: string;
  computed_totals_snapshot_json: string;
  created_at: string;
  updated_at: string;
}

export interface AppData {
  users: UserAccount[];
  customers: Customer[];
  motorcycles: Motorcycle[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderItems: PurchaseOrderItem[];
  inventoryCategories: InventoryCategory[];
  services: Service[];
  inventory: InventoryItem[];
  inventoryAdjustments: InventoryAdjustment[];
  jobOrders: JobOrder[];
  jobStatusHistory: JobStatusHistory[];
  sales: Sale[];
  saleItems: SaleItem[];
  paymentMethods: PaymentMethod[];
  expenses: Expense[];
  auditLogs: AuditLog[];
  branches: Branch[];
  payrollPermissions: PayrollPermission[];
  jobPayrollAllocations: JobPayrollAllocation[];
  mechanicAttendance: MechanicAttendance[];
  payrollRuns: PayrollRun[];
  payrollCutoffs: PayrollCutoff[];
  payrollSettings: PayrollSettings;
  receiptSettings: ReceiptSettings;
  superAdminSettings: SuperAdminSettings;
}

export interface CartItem {
  itemType: "part" | "service";
  itemId: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateSalePayload {
  cashierId: number;
  customerId?: number;
  items: CartItem[];
  discount: number;
  paymentMethod: string;
  paymentReferenceCode?: string;
}

export interface VoidOrRefundSalePayload extends ApprovalPayload {
  actorId: number;
  saleId: number;
  actionType: "Void" | "Refund";
}

export interface SaleReceipt {
  receiptNo: string;
  subtotal: number;
  discount: number;
  total: number;
  createdAt: string;
  paymentCategory?: PaymentCategory;
  paymentReferenceCode?: string;
}
