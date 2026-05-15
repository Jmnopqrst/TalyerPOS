import type { PayrollRun, UserAccount } from "../../../types/global";

export function payslipReceiptNo(run: PayrollRun) {
  return `payslip-${run.mechanic_code || run.mechanic_id}-${run.period_start}`;
}

export function mechanicIdReceiptNo(mechanic: UserAccount) {
  return `mechanic-id-${mechanic.mechanic_code || mechanic.id}`;
}
