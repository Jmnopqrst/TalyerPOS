# TalyerPOS User Guide

This guide explains how shop staff navigate and use TalyerPOS for daily repair shop operations. It covers the system workflow from sign in to sales, job orders, inventory, reports, settings, and system administration.

## 1. Sign In

1. Open TalyerPOS.
2. Enter your username.
3. Enter your password.
4. Click `Login`.
5. If the system asks you to change your password, enter the temporary password, create a new password, confirm it, then click `Set password and continue`.

Default demo accounts on a fresh database:
RoleUsernamePasswordOwnerowner0000Adminadmin1111Cashiercashier2222
Important: change default passwords before using the system in a real shop.

## 2. Navigate the Main Workspace

After sign in, the main workspace opens.

1. Use the left sidebar to move between modules.
2. Use the search box at the top of the workspace to search records in the active module.
3. Review messages or errors shown on screen before continuing an action.
4. If a form has unsaved changes and you leave the page, confirm whether to discard the changes.
5. Click `Sign out` in the session card when finished.

Available modules depend on the signed-in role:
RoleTypical ModulesOwnerDashboard, POS, Inventory, Job Orders, Services, Mechanics, Suppliers, Reports, Users, Settings, Audit LogsAdminDashboard, Inventory, Job Orders, Services, Mechanics, Suppliers, Reports, SettingsCashierDashboard, POS, Job Orders
## 3. Dashboard

Use Dashboard at the start of the day and during operations.

1. Click `Dashboard` in the sidebar.
2. Review sales and service activity.
3. Check low stock alerts.
4. Review recent job orders.
5. Note operational reminders before opening POS or Job Orders.

## 4. POS

Use POS for direct parts sales and quick checkout.

### Create a Sale

1. Click `POS`.
2. Search for a part using the top search box, scan or type a product code, or select an item from the catalog.
3. Enter the quantity when prompted.
4. Click `Add to Cart`.
5. Review the cart on the right side of the screen.
6. Use `+`, `-`, or `Remove` if the quantity needs correction.
7. Click `Proceed to Payment (F2)`.
8. Select the payment method.
9. For cash payments, enter the cash received.
10. For digital payments, enter the required reference code.
11. Click `Complete`.
12. Print the receipt or save it as PDF when prompted.

### Hold and Resume a Sale

1. Add items to the POS cart.
2. Click `Hold Sale (F4)` when the customer pauses checkout.
3. Process other transactions as needed.
4. In the held sales area, click the held transaction to resume it.
5. Continue to payment when the customer is ready.

### Reprint or Preview a Receipt

1. Click `Transactions` in POS.
2. Select the transaction.
3. Click `Reprint Receipt` to print or save it again.
4. Click `Preview Receipt` to review it before saving.

### Void or Refund a Transaction

1. Click `Transactions`.
2. Select a completed transaction.
3. Click `Void / Refund`.
4. Choose `Void` or `Refund`.
5. Enter the required approval details and reason.
6. Click the confirmation button to complete the action.

The system records the action in audit logs and restores stock when applicable.

## 5. Job Orders

Use Job Orders for repair intake, repair tracking, product usage, completion, and customer payment.

### Create a Job Order

1. Click `Job Orders`.
2. Click `New Job Order`.
3. Enter the customer name.
4. Enter the customer contact number.
5. Enter motorcycle details such as motorcycle type and plate number.
6. Select the service.
7. Assign the mechanic.
8. Add notes if needed.
9. Click the save or create button.

The job starts as an active repair record.

### Update a Job Order

1. Click `Job Orders`.
2. Select the job from the list.
3. Update customer, motorcycle, service, mechanic, notes, or status as needed.
4. Add products used for the repair.
5. Enter additional labor cost if applicable.
6. Click `Save Job`.

### Complete a Job Order

1. Open the job order.
2. Confirm that the service, mechanic, products used, and charges are correct.
3. Change the job status to `Completed`.
4. Review the completion summary.
5. Click `Confirm Completion`.

### Collect Payment for a Job

1. Open a completed job order.
2. Select the payment method.
3. Enter the reference code if the payment method requires one.
4. Click `Complete`.
5. Print or save the job receipt.

When payment is completed, the system deducts used products from inventory, marks the job as paid, stores receipt details, and records audit logs.

## 6. Inventory

Use Inventory to maintain parts, stock counts, reorder levels, and stock movement history.

### Add a New Inventory Item

1. Click `Inventory`.
2. Click `New Item`.
3. Enter the product code if required by your shop process.
4. Enter the item name.
5. Choose the category.
6. Enter the stock count.
7. Enter the reorder level.
8. Enter the unit cost and selling price.
9. Select the supplier if available.
10. Click `Create Inventory Item`.

### Edit an Inventory Item

1. Click `Inventory`.
2. Find the item in the inventory table.
3. Click `Edit`.
4. Update the item details.
5. Click `Save Changes`.

### Record Stock In

1. Click `Inventory`.
2. Find the item being received.
3. Click `Stock In`.
4. Enter the quantity received.
5. Select the supplier if applicable.
6. Enter the invoice, delivery receipt, or memo number.
7. Enter the reason or note.
8. Click `Save Stock In`.

### Adjust Stock

1. Click `Inventory`.
2. Find the item that needs correction.
3. Click `Adjust`.
4. Enter the new stock count.
5. Enter a reference number if available.
6. Enter the reason for the adjustment.
7. Click `Save Adjustment`.

### Delete an Inventory Item

1. Click `Inventory`.
2. Find the item.
3. Click `Delete`.
4. Enter the required approval details and reason.
5. Click `Delete Inventory Item`.

Use the low stock badges, forecasting area, supplier purchase history, and recent stock movements to plan replenishment.

## 7. Services

Use Services to maintain the repair and service catalog used by POS and Job Orders.

### Add a Service

1. Click `Services`.
2. Click `Add Service`.
3. Enter the service name.
4. Enter the category.
5. Enter the estimated duration.
6. Enter the price.
7. Enter the labor cost if used by the shop.
8. Click `Create Service`.

### Edit or Delete a Service

1. Click `Services`.
2. Find the service in the table.
3. Click `Edit` to update details, then click `Save Service`.
4. Click `Delete` to remove a service that should no longer be used.

## 8. Mechanics

Use Mechanics to maintain mechanic records used in job order assignment.

### Add a Mechanic

1. Click `Mechanics`.
2. Click `Add Mechanic`.
3. Enter the mechanic name.
4. Enter the contact number.
5. Enter the complete address.
6. Click `Create Mechanic`.

### Edit, Disable, or Delete a Mechanic

1. Click `Mechanics`.
2. Find the mechanic in the table.
3. Click `Edit` to update the record.
4. Click `Disable` to stop using an active mechanic account without deleting its history.
5. Click `Delete` only when the record should be removed.

## 9. Suppliers

Use Suppliers to manage vendor contact information for inventory sourcing.

### Add a Supplier

1. Click `Suppliers`.
2. Click `Add Supplier`.
3. Enter the supplier name.
4. Enter the contact person.
5. Enter the phone number.
6. Click `Create Supplier`.

### Edit or Delete a Supplier

1. Click `Suppliers`.
2. Find the supplier in the table.
3. Click `Edit` to update supplier information, then click `Save Supplier`.
4. Click `Delete` to remove a supplier that is no longer used.

## 10. Reports

Use Reports to review sales, job orders, expenses, and business summaries.

### View Reports

1. Click `Reports`.
2. Select the start date and end date.
3. Choose a report tab: `Overview`, `Sales Reports`, `Job Order Reports`, or `Expenses`.
4. Review the totals, tables, and summaries.

### Export Reports

1. Click `Reports`.
2. Set the date range.
3. Click `Export CSV` to save spreadsheet data.
4. Click `Preview PDF Report` to review a printable report.
5. In the preview window, click `Save PDF Report`.

### Add an Expense

1. Click `Reports`.
2. Open the `Expenses` tab.
3. Enter the expense date.
4. Enter the category.
5. Enter the amount.
6. Enter the description.
7. Click `Add Expense`.

### Edit or Delete an Expense

1. Open `Reports`.
2. Go to `Expenses`.
3. Find the expense record.
4. Click `Edit`, update the fields, then click `Update Expense`.
5. Click `Delete` to remove an incorrect expense record.

## 11. Users

Owners use Users to create and manage staff accounts.

### Create a User

1. Click `Users`.
2. Click `New User`.
3. Enter the username.
4. Enter the full name.
5. Enter the contact number.
6. Enter the address.
7. Enter the email address if available.
8. Select the role.
9. Click `Create user and generate password`.
10. Securely share the generated temporary password with the user.

The user may be required to set a new password on first sign in.

### Enable or Disable a User

1. Click `Users`.
2. Find the user account.
3. Click `Disable` to block access.
4. Click `Enable` to restore access.

## 12. Settings

Use Settings to configure business details, receipts, payment methods, printers, inventory categories, and import/export tools.

### Update Business and Receipt Details

1. Click `Settings`.
2. Update the business name, address, contact details, and receipt text.
3. Upload or adjust the logo if needed.
4. Choose the paper size and receipt layout.
5. Click the save button for the section.
6. Use `Receipt Preview` to review the output.
7. Click `Test Print` if printer or PDF output needs testing.

### Manage Payment Methods

1. Click `Settings`.
2. Go to the payment methods area.
3. Click `Add Payment Method`.
4. Enter the payment method name, category, status, and description.
5. Click `Add Payment Method`.
6. Use `Edit` to update a method.
7. Use `Delete` to remove a method that should no longer be available.

Digital payment methods can require a reference code during POS and job order payment.

### Configure Printer Output

1. Click `Settings`.
2. Go to `Printer Settings`.
3. Click `Refresh Printers`.
4. Select `Save as PDF` or choose a printer.
5. Enter the required approval details if prompted.
6. Click `Save Printer Settings`.

### Manage Inventory Categories

1. Click `Settings`.
2. Go to `Inventory Categories`.
3. Enter the category name.
4. Enter the category code.
5. Click `Add Category`.
6. Use `Delete` to remove categories that should no longer be used.

### Use Import and Export Tools

1. Click `Settings`.
2. Open the import/export area.
3. Export records before major updates when a backup copy is needed.
4. Import only verified files prepared for this system.
5. Review any confirmation or validation message before continuing.

## 13. Audit Logs

Use Audit Logs to review important activity and approval-sensitive actions.

1. Click `Audit Logs`.
2. Review the visibility note.
3. Use the user filter to show activity for one user or all users.
4. Use the search box to find a specific action, module, reference, or reason.
5. Review the date, user, module, action, reference, and notes.

Audit logs commonly include sales, voids, refunds, inventory changes, job payments, settings changes, user actions, backup activity, and restore activity.

## 14. Super Admin Console

Super Admin is for system-level control and maintenance, not normal shop transactions.

### Review System Health

1. Sign in using a Super Admin account.
2. Review `System Health`.
3. Check database size, backup status, failed backups, and maintenance indicators.

### Configure Trial and License

1. Go to the `Trial Mode` area.
2. Enable or disable trial mode.
3. Set the trial duration.
4. Enter the license key if available.
5. Click `Save Trial Settings`.

### Configure Automatic Backups

1. Go to `Automatic Backup Settings`.
2. Choose the backup schedule.
3. Set the backup time.
4. Set the weekday or month day if required by the schedule.
5. Enter how many backups to keep.
6. Click `Choose Folder` or enter a backup folder path.
7. Click `Save Automatic Backup Settings`.

### Create or Export a Backup

1. Go to `Backup & Restore`.
2. Click `Create Backup` to create a managed backup.
3. Click `Export Database File` to save a database copy manually.

### Restore a Database

1. Go to `Backup & Restore`.
2. Enter the Super Admin password.
3. Click `Preview Backup`.
4. Review the restore preview and integrity result.
5. Click `Restore Database` only after confirming the selected backup is correct.

### Maintain the Database

1. Go to `Database Maintenance`.
2. Click `Optimize Database` to run maintenance.
3. Click `Clear Logs Older Than 30 Days` to remove old logs.
4. Use `Clear Database` only when intentionally resetting operational data.

### Review System Logs

1. Go to `System Logs`.
2. Review backup, restore, maintenance, and system-level activity.
3. Investigate failed actions before continuing system changes.


