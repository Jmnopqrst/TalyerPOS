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
      createSupplier(payload: CreateSupplierPayload): Promise<Supplier>;
      updateSupplier(payload: UpdateSupplierPayload): Promise<Supplier>;
      deleteSupplier(payload: DeleteSupplierPayload): Promise<{ ok: boolean }>;
      createExpense(payload: CreateExpensePayload): Promise<{ id: number }>;
      updateExpense(payload: UpdateExpensePayload): Promise<{ ok: boolean }>;
      deleteExpense(payload: DeleteExpensePayload): Promise<{ ok: boolean }>;
      listPrinters(): Promise<PrinterOption[]>;
      listData(): Promise<AppData>;
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
      exportDatabase(payload: SuperAdminActionPayload): Promise<SuperAdminData>;
      restoreDatabase(payload: RestoreDatabasePayload): Promise<SuperAdminData>;
      clearDatabase(payload: ClearDatabasePayload): Promise<SuperAdminData>;
      printReceipt(payload: ReceiptDocumentPayload): Promise<boolean>;
      saveReceiptPdf(payload: ReceiptDocumentPayload): Promise<boolean>;
    };
  }
}

export type Role = "Owner" | "Admin" | "Cashier" | "SuperAdmin";

export interface UserAccount {
  id: number;
  name: string;
  role: Role;
  username: string;
  contact_number: string;
  address: string;
  email: string;
  is_mechanic: 0 | 1;
  must_change_password: 0 | 1;
  status: "Active" | "Disabled";
  created_at?: string;
  created_by_name?: string;
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
  paper_width: 58 | 80;
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
  backup_schedule: "Manual" | "Daily" | "Weekly";
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
  };
  backupHistory: SystemLog[];
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
}

export interface UpdateTrialSettingsPayload extends SuperAdminActionPayload {
  trialEnabled: boolean;
  trialDays: number;
  backupSchedule: "Manual" | "Daily" | "Weekly";
  licenseKey?: string;
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

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
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
  status: string;
  concern: string;
  estimate: number;
  created_at: string;
  due_at: string;
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
}

export interface UpdateJobOrderPayload {
  actorId: number;
  jobOrderId: number;
  status: string;
  products: JobProduct[];
  additionalLaborCost?: number;
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

export interface AppData {
  users: UserAccount[];
  customers: Customer[];
  motorcycles: Motorcycle[];
  suppliers: Supplier[];
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
