import type { AppData } from "../../types/global";

export function normalizeAppData(next: Partial<AppData>): AppData {
  const receiptSettings = next.receiptSettings ?? {
    id: 1,
    system_name: "TalyerPOS",
    logo_data_url: "",
    business_name: "TalyerPOS",
    address: "Main Branch",
    email: "support@talyerpos.local",
    contact_number: "09170000000",
    tax_id: "TIN: 000-000-000-000",
    footer_message: "Thank you. Ride safe!",
    show_tax_id: 1 as const,
    show_cashier: 1 as const,
    paper_width: 58 as const,
    receipt_template: "Detailed" as const,
    show_labor_breakdown: 1 as const,
    custom_header: "",
    custom_footer: "",
    logo_size: "Medium" as const,
    receipt_output_mode: "PDF" as const,
    receipt_printer_name: ""
  };
  const superAdminSettings = next.superAdminSettings ?? {
    id: 1,
    trial_enabled: 0,
    trial_started_at: "",
    trial_days: 30,
    license_key: "",
    license_status: "Trial" as const,
    last_backup_at: "",
    backup_schedule: "Disabled" as const,
    backup_time: "23:00",
    backup_weekday: 0,
    backup_month_day: 1,
    backup_folder: "",
    backup_retention_count: 10,
    last_auto_backup_at: "",
    last_backup_error: "",
    payroll_module_enabled: 0,
    updated_at: "",
    trial: {
      active: false,
      expired: false,
      daysRemaining: 0,
      expiresAt: ""
    }
  };

  return {
    ...next,
    users: next.users ?? [],
    customers: next.customers ?? [],
    motorcycles: next.motorcycles ?? [],
    suppliers: next.suppliers ?? [],
    purchaseOrders: next.purchaseOrders ?? [],
    purchaseOrderItems: next.purchaseOrderItems ?? [],
    inventoryCategories: next.inventoryCategories ?? [],
    services: next.services ?? [],
    inventory: next.inventory ?? [],
    inventoryAdjustments: next.inventoryAdjustments ?? [],
    jobOrders: next.jobOrders ?? [],
    jobStatusHistory: next.jobStatusHistory ?? [],
    sales: next.sales ?? [],
    saleItems: next.saleItems ?? [],
    paymentMethods: next.paymentMethods ?? [],
    expenses: next.expenses ?? [],
    auditLogs: next.auditLogs ?? [],
    branches: next.branches ?? [],
    payrollPermissions: next.payrollPermissions ?? [],
    jobPayrollAllocations: next.jobPayrollAllocations ?? [],
    mechanicAttendance: next.mechanicAttendance ?? [],
    payrollRuns: next.payrollRuns ?? [],
    payrollCutoffs: next.payrollCutoffs ?? [],
    payrollSettings: next.payrollSettings ?? {
      id: 1,
      required_hours_per_day: 8,
      required_hours_per_week: 40,
      required_hours_per_month: 176,
      working_days: "1,2,3,4,5,6",
      consider_holidays_paid: 0,
      holiday_dates: "",
      updated_at: ""
    },
    superAdminSettings: {
      ...superAdminSettings,
      last_backup_error: superAdminSettings.last_backup_error ?? "",
      trial: superAdminSettings.trial ?? {
        active: false,
        expired: false,
        daysRemaining: 0,
        expiresAt: ""
      }
    },
    receiptSettings: {
      ...receiptSettings,
      paper_width: ([58, 80, 216].includes(Number(receiptSettings.paper_width)) ? Number(receiptSettings.paper_width) : 58) as 58 | 80 | 216,
      receipt_template: receiptSettings.receipt_template === "Compact" ? "Compact" : "Detailed",
      show_labor_breakdown: receiptSettings.show_labor_breakdown === 0 ? 0 : 1,
      custom_header: receiptSettings.custom_header ?? "",
      custom_footer: receiptSettings.custom_footer ?? "",
      logo_size: ["Small", "Medium", "Large"].includes(receiptSettings.logo_size) ? receiptSettings.logo_size : "Medium"
    }
  };
}
