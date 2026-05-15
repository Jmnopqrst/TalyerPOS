export type IpcPayloadChannel =
  | "auth:login"
  | "auth:change-password"
  | "users:create"
  | "users:disable"
  | "users:enable"
  | "jobs:create"
  | "jobs:update"
  | "jobs:pay"
  | "settings:receipt:update"
  | "settings:printer:update"
  | "settings:category:create"
  | "settings:category:delete"
  | "settings:payment:create"
  | "settings:payment:update"
  | "settings:payment:status"
  | "settings:payment:delete"
  | "services:create"
  | "services:update"
  | "services:delete"
  | "mechanics:create"
  | "mechanics:update"
  | "mechanics:status"
  | "mechanics:delete"
  | "payroll:mechanic:update"
  | "payroll:attendance:record"
  | "payroll:attendance:update"
  | "payroll:generate"
  | "payroll:cutoff:create"
  | "payroll:review"
  | "payroll:approve"
  | "payroll:paid"
  | "payroll:cancel"
  | "payroll:void"
  | "payroll:settings:update"
  | "suppliers:create"
  | "suppliers:update"
  | "suppliers:delete"
  | "purchases:create"
  | "purchases:status"
  | "expenses:create"
  | "expenses:update"
  | "expenses:delete"
  | "data:list-scope"
  | "inventory:create"
  | "inventory:update"
  | "inventory:delete"
  | "inventory:stock-in"
  | "inventory:adjust"
  | "sales:create"
  | "sales:void-refund"
  | "super-admin:trial:update"
  | "super-admin:database:optimize"
  | "super-admin:logs:clear"
  | "super-admin:backup:create"
  | "super-admin:backup:settings"
  | "super-admin:database:export"
  | "super-admin:database:restore-preview"
  | "super-admin:database:restore"
  | "super-admin:database:clear"
  | "print:receipt"
  | "receipt:pdf";

type Validator = (value: unknown, path: string) => unknown;
type Shape = Record<string, Validator>;

const roles = ["Owner", "Admin", "Cashier", "SuperAdmin"] as const;
const statuses = ["Active", "Disabled", "Inactive"] as const;
const paymentCategories = ["Manual", "Digital"] as const;
const paymentStatuses = ["Active", "Inactive"] as const;
const paymentOutputModes = ["Printer", "PDF"] as const;
const receiptTemplates = ["Compact", "Detailed"] as const;
const logoSizes = ["Small", "Medium", "Large"] as const;
const payrollTypes = ["Per Hour", "Per Day", "Per Week", "Per Month"] as const;
const compensationTypes = ["Fixed Salary", "Commission", "Hybrid"] as const;
const attendanceStatuses = ["Present", "Absent", "Late", "Half Day", "Sick Leave", "Vacation Leave", "Holiday", "Rest Day", "Incomplete Attendance"] as const;
const backupSchedules = ["Disabled", "Daily", "Weekly", "Monthly"] as const;
const dataScopes = ["all", "core", "sales", "inventory", "jobs", "customers", "payroll", "reports", "settings", "users", "staff", "suppliers", "purchases", "audit"] as const;
const purchaseStatuses = ["Draft", "Ordered", "Partially Received", "Received", "Cancelled"] as const;

function fail(path: string, expected: string): never {
  throw new Error(`Invalid IPC payload: ${path} must be ${expected}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(shape: Shape): Validator {
  return (value, path) => {
    if (!isRecord(value)) fail(path, "an object");
    const result: Record<string, unknown> = { ...value };
    for (const [key, validator] of Object.entries(shape)) {
      result[key] = validator(value[key], `${path}.${key}`);
    }
    return result;
  };
}

function optional(validator: Validator): Validator {
  return (value, path) => value === undefined || value === null ? undefined : validator(value, path);
}

function stringValue(options: { allowEmpty?: boolean; max?: number } = {}): Validator {
  return (value, path) => {
    if (typeof value !== "string") fail(path, "a string");
    if (!options.allowEmpty && value.trim() === "") fail(path, "a non-empty string");
    if (options.max && value.length > options.max) fail(path, `at most ${options.max} characters`);
    return value;
  };
}

function numberValue(options: { integer?: boolean; min?: number; max?: number } = {}): Validator {
  return (value, path) => {
    if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "a finite number");
    if (options.integer && !Number.isInteger(value)) fail(path, "an integer");
    if (options.min !== undefined && value < options.min) fail(path, `at least ${options.min}`);
    if (options.max !== undefined && value > options.max) fail(path, `at most ${options.max}`);
    return value;
  };
}

function booleanValue(): Validator {
  return (value, path) => {
    if (typeof value !== "boolean") fail(path, "a boolean");
    return value;
  };
}

function oneOf<T extends readonly string[]>(values: T): Validator {
  return (value, path) => {
    if (typeof value !== "string" || !values.includes(value)) fail(path, `one of ${values.join(", ")}`);
    return value;
  };
}

function arrayOf(validator: Validator, options: { min?: number; max?: number } = {}): Validator {
  return (value, path) => {
    if (!Array.isArray(value)) fail(path, "an array");
    if (options.min !== undefined && value.length < options.min) fail(path, `an array with at least ${options.min} item(s)`);
    if (options.max !== undefined && value.length > options.max) fail(path, `an array with at most ${options.max} item(s)`);
    return value.map((item, index) => validator(item, `${path}[${index}]`));
  };
}

const id = numberValue({ integer: true, min: 1 });
const text = stringValue({ max: 1000 });
const optionalText = optional(stringValue({ allowEmpty: true, max: 1000 }));
const approval = {
  approvalUsername: stringValue({ max: 80 }),
  approvalPassword: stringValue({ max: 300 }),
  approvalReason: stringValue({ max: 1000 })
};
const superAdminAction = { superAdminId: id };

const cartItem = object({
  itemType: oneOf(["part", "service"] as const),
  itemId: id,
  name: text,
  quantity: numberValue({ min: 1 }),
  unitPrice: numberValue({ min: 0 })
});

const jobProduct = object({
  itemId: id,
  name: text,
  quantity: numberValue({ min: 1 }),
  unitPrice: numberValue({ min: 0 })
});

const jobPayrollAllocation = object({
  mechanicId: id,
  allocationRole: optionalText,
  allocationType: optional(oneOf(["Percent", "Fixed"] as const)),
  percentage: optional(numberValue({ min: 0, max: 100 })),
  fixedAmount: optional(numberValue({ min: 0 })),
  isLead: optional(booleanValue())
});

const purchaseOrderItem = object({
  itemId: id,
  quantityOrdered: numberValue({ min: 1 }),
  unitCost: optional(numberValue({ min: 0 }))
});

const purchaseOrderReceiveItem = object({
  itemId: id,
  quantityReceived: numberValue({ min: 0 })
});

const schemas: Record<IpcPayloadChannel, Validator> = {
  "auth:login": object({ username: text, password: stringValue({ max: 300 }) }),
  "auth:change-password": object({ userId: id, currentPassword: stringValue({ max: 300 }), newPassword: stringValue({ max: 300 }) }),
  "users:create": object({ creatorId: id, role: oneOf(roles), name: text, contactNumber: text, address: text, email: optionalText, username: text }),
  "users:disable": object({ ownerId: id, targetUserId: id }),
  "users:enable": object({ ownerId: id, targetUserId: id }),
  "jobs:create": object({ actorId: id, customerName: text, contactNumber: text, motorcycleType: text, plateNumber: text, serviceId: id, mechanicId: id, branchId: optional(id) }),
  "jobs:update": object({ actorId: id, jobOrderId: id, status: text, products: arrayOf(jobProduct, { max: 500 }), additionalLaborCost: optional(numberValue({ min: 0 })), payrollAllocations: optional(arrayOf(jobPayrollAllocation, { min: 1, max: 20 })) }),
  "jobs:pay": object({ actorId: id, jobOrderId: id, paymentMethod: text, paymentReferenceCode: optionalText }),
  "settings:receipt:update": object({
    actorId: id,
    systemName: text,
    logoDataUrl: stringValue({ allowEmpty: true, max: 2_500_000 }),
    businessName: text,
    address: text,
    email: optionalText,
    contactNumber: text,
    taxId: optionalText,
    footerMessage: optionalText,
    showTaxId: booleanValue(),
    showCashier: booleanValue(),
    paperWidth: numberValue({ integer: true }),
    receiptTemplate: oneOf(receiptTemplates),
    showLaborBreakdown: booleanValue(),
    customHeader: optionalText,
    customFooter: optionalText,
    logoSize: oneOf(logoSizes)
  }),
  "settings:printer:update": object({ actorId: id, outputMode: oneOf(paymentOutputModes), printerName: stringValue({ allowEmpty: true, max: 300 }), ...approval }),
  "settings:category:create": object({ actorId: id, name: text, code: text }),
  "settings:category:delete": object({ actorId: id, categoryId: id }),
  "settings:payment:create": object({ actorId: id, name: text, paymentCategory: oneOf(paymentCategories), description: optionalText }),
  "settings:payment:update": object({ actorId: id, methodId: id, name: text, paymentCategory: oneOf(paymentCategories), description: optionalText }),
  "settings:payment:status": object({ actorId: id, methodId: id, status: oneOf(paymentStatuses) }),
  "settings:payment:delete": object({ actorId: id, methodId: id }),
  "services:create": object({ actorId: id, name: text, category: text, durationMinutes: numberValue({ min: 0 }), price: numberValue({ min: 0 }), laborCost: numberValue({ min: 0 }) }),
  "services:update": object({ actorId: id, serviceId: id, name: text, category: text, durationMinutes: numberValue({ min: 0 }), price: numberValue({ min: 0 }), laborCost: numberValue({ min: 0 }) }),
  "services:delete": object({ actorId: id, serviceId: id }),
  "mechanics:create": object({ actorId: id, name: text, contactNumber: text, address: text, status: oneOf(statuses) }),
  "mechanics:update": object({ actorId: id, mechanicId: id, name: text, contactNumber: text, address: text, status: oneOf(statuses) }),
  "mechanics:status": object({ actorId: id, mechanicId: id, status: oneOf(statuses) }),
  "mechanics:delete": object({ actorId: id, mechanicId: id }),
  "payroll:mechanic:update": object({ actorId: id, mechanicId: id, payrollType: oneOf(payrollTypes), salaryRate: numberValue({ min: 0 }), compensationType: oneOf(compensationTypes), laborCommissionPercentage: numberValue({ min: 0, max: 100 }) }),
  "payroll:attendance:record": object({ actorId: optional(id), qrCode: text }),
  "payroll:attendance:update": object({ actorId: id, attendanceId: optional(id), mechanicId: id, attendanceDate: text, timeIn: optionalText, timeOut: optionalText, status: oneOf(attendanceStatuses), notes: optionalText }),
  "payroll:generate": object({ actorId: id, mechanicId: id, periodStart: optionalText, periodEnd: optionalText, cutoffId: optional(id), deductions: optional(numberValue({ min: 0 })) }),
  "payroll:cutoff:create": object({ actorId: id, name: text, periodStart: text, periodEnd: text, payDate: text, branchId: optional(id) }),
  "payroll:review": object({ actorId: id, payrollId: id }),
  "payroll:approve": object({ actorId: id, payrollId: id }),
  "payroll:paid": object({ actorId: id, payrollId: id, paymentMethod: optionalText }),
  "payroll:cancel": object({ actorId: id, payrollId: id, reason: text }),
  "payroll:void": object({ actorId: id, payrollId: id, reason: text }),
  "payroll:settings:update": object({ actorId: id, requiredHoursPerDay: numberValue({ min: 0, max: 24 }), requiredHoursPerWeek: numberValue({ min: 0, max: 168 }), requiredHoursPerMonth: numberValue({ min: 0, max: 744 }), workingDays: arrayOf(numberValue({ integer: true, min: 0, max: 6 }), { min: 1, max: 7 }), considerHolidaysPaid: booleanValue(), holidayDates: arrayOf(stringValue({ max: 20 }), { max: 400 }) }),
  "suppliers:create": object({ actorId: id, name: text, contact: text, phone: text }),
  "suppliers:update": object({ actorId: id, supplierId: id, name: text, contact: text, phone: text }),
  "suppliers:delete": object({ actorId: id, supplierId: id }),
  "purchases:create": object({ actorId: id, supplierId: optional(id), notes: optionalText, items: arrayOf(purchaseOrderItem, { min: 1, max: 500 }) }),
  "purchases:status": object({ actorId: id, purchaseOrderId: id, status: oneOf(purchaseStatuses), receivedItems: optional(arrayOf(purchaseOrderReceiveItem, { max: 500 })) }),
  "expenses:create": object({ actorId: id, expenseDate: text, category: text, description: text, amount: numberValue({ min: 0 }) }),
  "expenses:update": object({ actorId: id, expenseId: id, expenseDate: text, category: text, description: text, amount: numberValue({ min: 0 }) }),
  "expenses:delete": object({ actorId: id, expenseId: id }),
  "data:list-scope": object({ scope: oneOf(dataScopes) }),
  "inventory:create": object({ actorId: id, categoryId: id, name: text, stock: numberValue({ min: 0 }), reorderLevel: optional(numberValue({ min: 0 })), unitCost: optional(numberValue({ min: 0 })), sellPrice: numberValue({ min: 0 }), supplierId: optional(id) }),
  "inventory:update": object({ actorId: id, itemId: id, categoryId: id, name: text, stock: numberValue({ min: 0 }), reorderLevel: optional(numberValue({ min: 0 })), unitCost: optional(numberValue({ min: 0 })), sellPrice: numberValue({ min: 0 }), supplierId: optional(id) }),
  "inventory:delete": object({ actorId: id, itemId: id, ...approval }),
  "inventory:stock-in": object({ actorId: id, itemId: id, quantity: numberValue({ min: 1 }), supplierId: optional(id), referenceNo: optionalText, reason: text }),
  "inventory:adjust": object({ actorId: id, itemId: id, newStock: numberValue({ min: 0 }), referenceNo: optionalText, reason: text }),
  "sales:create": object({ cashierId: id, customerId: optional(id), items: arrayOf(cartItem, { min: 1, max: 500 }), discount: numberValue({ min: 0 }), paymentMethod: text, paymentReferenceCode: optionalText }),
  "sales:void-refund": object({ actorId: id, saleId: id, actionType: oneOf(["Void", "Refund"] as const), ...approval }),
  "super-admin:trial:update": object({ superAdminId: id, trialEnabled: booleanValue(), trialDays: numberValue({ integer: true, min: 1, max: 365 }), backupSchedule: optional(oneOf(backupSchedules)), licenseKey: optionalText, payrollModuleEnabled: optional(booleanValue()) }),
  "super-admin:database:optimize": object(superAdminAction),
  "super-admin:logs:clear": object({ superAdminId: id, daysToKeep: numberValue({ integer: true, min: 1, max: 3650 }) }),
  "super-admin:backup:create": object(superAdminAction),
  "super-admin:backup:settings": object({ superAdminId: id, backupSchedule: oneOf(backupSchedules), backupTime: text, backupWeekday: numberValue({ integer: true, min: 0, max: 6 }), backupMonthDay: numberValue({ integer: true, min: 1, max: 31 }), backupFolder: stringValue({ allowEmpty: true, max: 1000 }), backupRetentionCount: numberValue({ integer: true, min: 1, max: 365 }) }),
  "super-admin:database:export": object(superAdminAction),
  "super-admin:database:restore-preview": object({ superAdminId: id, password: stringValue({ max: 300 }) }),
  "super-admin:database:restore": object({ superAdminId: id, password: stringValue({ max: 300 }), restorePath: optional(stringValue({ allowEmpty: true, max: 1000 })) }),
  "super-admin:database:clear": object({ superAdminId: id, password: stringValue({ max: 300 }) }),
  "print:receipt": object({ html: stringValue({ max: 5_000_000 }) }),
  "receipt:pdf": object({ html: stringValue({ max: 5_000_000 }), receiptNo: optionalText })
};

export function validateIpcPayload<T = unknown>(channel: IpcPayloadChannel, payload: unknown): T {
  return schemas[channel](payload, channel) as T;
}
