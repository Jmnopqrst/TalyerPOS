# Admin Operations Guide

This guide is for owners, admins, and support staff.

## 1. Roles and Responsibilities

### Owner

Owner can manage:

- users
- settings
- inventory
- services
- suppliers
- expenses
- reports
- payroll
- approvals

### Admin

Admin can manage most shop operations but should not own Super Admin controls.

### Cashier

Cashier is focused on:

- POS sales
- customer checkout
- job payment support

### Super Admin

Super Admin is for system-level actions:

- backup and restore
- trial/license settings
- database reset
- system optimization

## 2. Daily Opening Checklist

1. Launch TalyerPOS.
2. Confirm login works.
3. Check Dashboard.
4. Review low stock alerts.
5. Confirm payment methods are active.
6. Confirm receipt printer or PDF output.
7. Test QR attendance scanner if payroll is active.

## 3. Daily Closing Checklist

1. Review daily POS sales.
2. Review job payments.
3. Export daily closing package if needed.
4. Check unpaid completed jobs.
5. Check low stock.
6. Create manual backup.
7. Confirm automatic backup status.

## 4. Backup Operations

Use Super Admin for backup tools.

Backup types:

- manual backup
- automatic scheduled backup
- database export
- restore point before restore/reset

Recommended backup schedule:

- daily automatic backup
- manual backup before major changes
- manual backup before restore/reset
- off-device backup at least weekly

## 5. Restore Operations

Before restoring:

1. Confirm owner approval.
2. Confirm backup belongs to the correct shop.
3. Run restore preview.
4. Note current database state.
5. Let the system create restore point.

After restoring:

1. Confirm business identity.
2. Check recent sales.
3. Check inventory counts.
4. Check users.
5. Check payroll records.
6. Create a fresh backup.

## 6. Audit Review

Review audit logs for:

- void/refund activity
- inventory adjustment
- payroll approval
- settings changes
- restore/reset operations

When investigating a dispute, check:

- audit logs
- approval logs
- job status history
- payroll snapshots
- receipt records

## 7. Payroll Operations

Payroll cycle:

```txt
Create mechanic
-> configure payroll setup
-> create cutoff
-> record QR attendance
-> complete paid jobs
-> generate payroll
-> submit/review
-> approve
-> mark paid
-> issue payslip
```

Rules:

- payroll cannot be paid unless approved
- approved payroll is snapshot-locked
- void/cancel requires reason
- shared commission is based on job payroll allocation

## 8. Inventory Control

Recommended:

- keep reorder levels updated
- use stock-in for received items
- use adjustments only for corrections
- require reason for adjustments
- review low stock weekly
- export inventory before large updates

## 9. Security Practices

Required for live stores:

- change default Owner password
- change default Super Admin password if supported by deployment policy
- do not share Owner credentials
- create individual accounts for staff
- disable inactive users
- keep backups private
- do not send database files through unsecured channels

## 10. Incident Response

For data loss:

1. Stop using the app.
2. Copy current database file if possible.
3. Locate latest backup.
4. Preview restore.
5. Restore only after owner approval.

For wrong stock:

1. Review sale/job history.
2. Review inventory adjustments.
3. Apply stock adjustment with reason.
4. Audit the correction.

For payroll dispute:

1. Review attendance.
2. Review job payroll allocations.
3. Review payroll snapshot.
4. Review approvals and payslip.

