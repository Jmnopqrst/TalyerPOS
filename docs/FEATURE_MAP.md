# TalyerPOS Feature Map

This document lists the major system areas and where to start when changing them.

## App Shell

Start in:

- `src/renderer/src/App.tsx`
- `src/renderer/data/permissions.ts`

Includes:

- login
- role-aware navigation
- global search
- toast messages
- unsaved changes warning
- error boundary

## POS

Start at:

- `src/renderer/src/features/pos/Pos.tsx`
- sales functions in `src/main/db/sales.ts`

Includes:

- cart
- checkout
- payment/reference validation
- receipt print/PDF
- transaction history
- void/refund approval

## Job Orders

Start at:

- `src/renderer/src/features/jobs/Jobs.tsx`
- job functions in `src/main/db/jobs.ts`

Includes:

- job intake
- mechanic/service assignment
- product usage
- completion summary
- additional labor cost
- payment and receipt generation
- shared mechanic payroll allocation

## Inventory

Start at:

- `src/renderer/src/features/inventory/Inventory.tsx`
- inventory functions in `src/main/db/inventory.ts`

Includes:

- products
- categories
- suppliers
- stock-in
- stock adjustment
- delete approval

## Payroll & Attendance

Start at:

- `src/renderer/src/features/payroll/Payroll.tsx`
- `src/renderer/src/hooks/useGlobalQrAttendanceScanner.ts`
- payroll and attendance functions in `src/main/db/payroll.ts`

Includes:

- mechanic payroll setup
- QR ID card print/PDF
- global keyboard-wedge QR attendance listener
- attendance Time In / Time Out logic
- payroll computation settings
- payroll cutoffs
- approval workflow statuses
- locked payroll snapshots
- shared commission allocation
- payroll reports and calendar
- daily/weekly/monthly expected-hours computation
- holiday handling
- payslip generation

## Reports

Start at:

- `src/renderer/src/features/reports/Reports.tsx`

Includes:

- sales reports
- job order reports
- expenses
- PDF export

## Settings

Start at:

- `src/renderer/src/features/settings/SettingsModule.tsx`
- receipt/printer/payment settings functions in `src/main/db/settings.ts`

Includes:

- business identity
- receipt format
- payment methods
- printer settings with approval
- inventory categories

## Super Admin

Start at:

- `SuperAdminConsole` in `src/renderer/src/features/super-admin/SuperAdminConsole.tsx`
- backup/reset/restore handlers in `src/main/main.ts`
- Super Admin database functions in `src/main/database.ts`

Includes:

- system health
- trial/license settings
- Owner payroll module visibility
- automatic backup schedule
- manual backup
- restore database
- clear database
- system logs

## Users

Start at:

- `UsersModule` in `src/renderer/src/App.tsx`
- user functions in `src/main/database.ts`

Includes:

- account creation
- generated temporary password
- disable/enable users
- first-login password change

## Audit

Start at:

- `Audit` in `src/renderer/src/features/audit/Audit.tsx`
- `audit_logs` writes in `src/main/database.ts`

Includes:

- operational activity history
- approval-sensitive actions
- settings changes
