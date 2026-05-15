import { useEffect, useState } from "react";
import { BriefcaseBusiness, Download, Printer, ReceiptText, UserCheck, Wrench } from "lucide-react";
import { Badge } from "../../../components/Badge";
import { DataTable } from "../../../components/DataTable";
import { StatCard } from "../../../components/StatCard";
import { ToastBridge } from "../../../components/Toast";
import type { AppData, CompensationType, MechanicAttendance, PayrollRun, PayrollType, UserAccount } from "../../../types/global";
import { buildMechanicIdCardHtml, buildPayslipHtml } from "../../documents/payroll";
import { mechanicIdReceiptNo, payslipReceiptNo } from "./payrollPresentation";
import { friendlyError, withTimeout } from "../../lib/api";
import { formatDateTime, formatTimeOnly, todayInputValue } from "../../lib/date";
import { money } from "../../lib/format";
import { hoursDisplay, normalizeJobStatusForUi, printOrSaveReceiptPdf, RecordsToolbar } from "../shared/featureUtils";
// Feature: Payroll setup, attendance scanning, payslips, and ID cards.
export function Payroll({ data, user, onRefresh }: { data: AppData; user: UserAccount; onRefresh: () => Promise<void> }) {
  const mechanics = data.users.filter((account) => account.is_mechanic && account.status === "Active");
  const branches = data.branches || [];
  const payrollPermissions = data.payrollPermissions || [];
  const userPayrollPermissions = payrollPermissions.filter((permission) => permission.role_name === user.role && permission.enabled);
  const canAccessPayroll = user.role === "Owner" || userPayrollPermissions.length > 0;
  const canManagePayrollSettings = user.role === "Owner" || userPayrollPermissions.some((permission) => permission.permission_key === "manage_payroll_settings");
  const [selectedMechanicId, setSelectedMechanicId] = useState(mechanics[0]?.id ?? 0);
  const selectedMechanic = mechanics.find((mechanic) => mechanic.id === selectedMechanicId) ?? mechanics[0];
  const [setup, setSetup] = useState({
    payrollType: (selectedMechanic?.payroll_type || "Per Day") as PayrollType,
    salaryRate: Number(selectedMechanic?.salary_rate || 0),
    compensationType: (selectedMechanic?.compensation_type || "Fixed Salary") as CompensationType,
    laborCommissionPercentage: Number(selectedMechanic?.labor_commission_percentage || 0)
  });
  const payrollSettings = data.payrollSettings;
  const [settingsForm, setSettingsForm] = useState({
    requiredHoursPerDay: Number(payrollSettings.required_hours_per_day || 8),
    requiredHoursPerWeek: Number(payrollSettings.required_hours_per_week || 40),
    requiredHoursPerMonth: Number(payrollSettings.required_hours_per_month || 176),
    workingDays: String(payrollSettings.working_days || "1,2,3,4,5,6").split(",").map(Number).filter((day) => day >= 0 && day <= 6),
    considerHolidaysPaid: Boolean(payrollSettings.consider_holidays_paid),
    holidayDates: String(payrollSettings.holiday_dates || "").split(",").filter(Boolean).join("\n")
  });
  const [attendanceForm, setAttendanceForm] = useState({ attendanceDate: todayInputValue(), timeIn: "", timeOut: "", status: "Present" as MechanicAttendance["status"], notes: "" });
  const payrollCutoffs = data.payrollCutoffs || [];
  const [payrollForm, setPayrollForm] = useState({ cutoffId: payrollCutoffs[0]?.id ?? 0, periodStart: todayInputValue(), periodEnd: todayInputValue(), deductions: 0, paymentMethod: "" });
  const [cutoffForm, setCutoffForm] = useState({ name: "", periodStart: todayInputValue(), periodEnd: todayInputValue(), payDate: todayInputValue(), branchId: branches[0]?.id ?? 0 });
  const [reportBranchId, setReportBranchId] = useState(0);
  const [scanCode, setScanCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState("");
  const [scannerStatus, setScannerStatus] = useState("Waiting for mechanic QR scan...");
  const [payslipPreview, setPayslipPreview] = useState<{ receiptNo: string; html: string } | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<{ receiptNo: string; html: string; mechanicName: string } | null>(null);
  const mechanicAttendance = data.mechanicAttendance.filter((entry) => !selectedMechanic || entry.mechanic_id === selectedMechanic.id);
  const mechanicPayroll = data.payrollRuns.filter((run) => !selectedMechanic || run.mechanic_id === selectedMechanic.id);
  const selectedCutoff = payrollCutoffs.find((cutoff) => cutoff.id === payrollForm.cutoffId);
  const reportRuns = data.payrollRuns.filter((run) => !reportBranchId || run.branch_id === reportBranchId);
  const reportGross = reportRuns.reduce((sum, run) => sum + Number(run.gross_pay || 0), 0);
  const reportNet = reportRuns.reduce((sum, run) => sum + Number(run.net_pay || 0), 0);
  const reportCommission = reportRuns.reduce((sum, run) => sum + Number(run.labor_commission || 0), 0);
  const reportOvertimeProxy = reportRuns.reduce((sum, run) => sum + Math.max(0, Number(run.hours_worked || 0) - Number(run.expected_hours || run.required_hours || 0)), 0);
  const upcomingCutoffs = payrollCutoffs.filter((cutoff) => !reportBranchId || cutoff.branch_id === reportBranchId).slice(0, 6);
  const payrollPending = data.payrollRuns.filter((run) => run.status === "Draft" || run.status === "Pending Review").length;
  const presentToday = data.mechanicAttendance.filter((entry) => entry.attendance_date === todayInputValue() && entry.time_in).length;
  const totalPayrollExpense = data.payrollRuns.reduce((sum, run) => sum + Number(run.net_pay || 0), 0);
  const totalLaborRevenue = data.jobOrders
    .filter((job) => normalizeJobStatusForUi(job.status) === "Completed")
    .reduce((sum, job) => sum + Number(job.labor_cost || 0) + Number(job.additional_labor_cost || 0), 0);

  useEffect(() => {
    if (!selectedMechanic) return;
    setSetup({
      payrollType: (selectedMechanic.payroll_type || "Per Day") as PayrollType,
      salaryRate: Number(selectedMechanic.salary_rate || 0),
      compensationType: (selectedMechanic.compensation_type || "Fixed Salary") as CompensationType,
      laborCommissionPercentage: Number(selectedMechanic.labor_commission_percentage || 0)
    });
  }, [selectedMechanic?.id]);

  useEffect(() => {
    setSettingsForm({
      requiredHoursPerDay: Number(payrollSettings.required_hours_per_day || 8),
      requiredHoursPerWeek: Number(payrollSettings.required_hours_per_week || 40),
      requiredHoursPerMonth: Number(payrollSettings.required_hours_per_month || 176),
      workingDays: String(payrollSettings.working_days || "1,2,3,4,5,6").split(",").map(Number).filter((day) => day >= 0 && day <= 6),
      considerHolidaysPaid: Boolean(payrollSettings.consider_holidays_paid),
      holidayDates: String(payrollSettings.holiday_dates || "").split(",").filter(Boolean).join("\n")
    });
  }, [payrollSettings.updated_at]);

  if (!canAccessPayroll) {
    return (
      <section className="panel">
        <h2>Payroll</h2>
        <span className="form-error">Your account does not have payroll access yet.</span>
      </section>
    );
  }

  async function saveSetup() {
    if (!selectedMechanic) return;
    setError("");
    setMessage("");
    if (setup.salaryRate < 0) {
      setError("Salary rate must be zero or greater.");
      return;
    }
    if (setup.laborCommissionPercentage < 0 || setup.laborCommissionPercentage > 100) {
      setError("Commission percentage must be between 0 and 100.");
      return;
    }
    setProcessing("Saving payroll setup...");
    try {
      await withTimeout(window.talyer.updateMechanicPayroll({ actorId: user.id, mechanicId: selectedMechanic.id, ...setup }), "saving payroll setup");
      setMessage("Payroll setup saved successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save payroll setup."));
    } finally {
      setProcessing("");
    }
  }

  function toggleWorkingDay(day: number) {
    setSettingsForm((current) => {
      const days = current.workingDays.includes(day) ? current.workingDays.filter((entry) => entry !== day) : [...current.workingDays, day];
      return { ...current, workingDays: days.sort((left, right) => left - right) };
    });
  }

  async function savePayrollSettings() {
    setError("");
    setMessage("");
    if (!settingsForm.workingDays.length) {
      setError("At least one working day is required.");
      return;
    }
    setProcessing("Saving payroll settings...");
    try {
      await withTimeout(window.talyer.updatePayrollSettings({
        actorId: user.id,
        requiredHoursPerDay: settingsForm.requiredHoursPerDay,
        requiredHoursPerWeek: settingsForm.requiredHoursPerWeek,
        requiredHoursPerMonth: settingsForm.requiredHoursPerMonth,
        workingDays: settingsForm.workingDays,
        considerHolidaysPaid: settingsForm.considerHolidaysPaid,
        holidayDates: settingsForm.holidayDates.split(/\s|,|;/).map((date) => date.trim()).filter(Boolean)
      }), "saving payroll settings");
      setMessage("Payroll computation settings saved successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save payroll settings."));
    } finally {
      setProcessing("");
    }
  }

  async function recordAttendance(codeOverride?: string) {
    setError("");
    setMessage("");
    const code = (codeOverride ?? scanCode).replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (!code) {
      setError("Mechanic QR code is required.");
      return;
    }
    setProcessing("Recording attendance...");
    try {
      const result = await withTimeout(window.talyer.recordMechanicAttendance({ actorId: user.id, qrCode: code }), "recording attendance");
      setMessage(`Attendance recorded successfully. ${result.action} recorded for ${result.mechanicName}.`);
      setScannerStatus(`Ready for next scan. Last scan: ${result.action} for ${result.mechanicName}.`);
      setScanCode("");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to record attendance."));
    } finally {
      setProcessing("");
    }
  }

  async function saveAttendance() {
    if (!selectedMechanic) return;
    setError("");
    setMessage("");
    setProcessing("Saving attendance...");
    try {
      await withTimeout(window.talyer.updateMechanicAttendance({
        actorId: user.id,
        mechanicId: selectedMechanic.id,
        attendanceDate: attendanceForm.attendanceDate,
        timeIn: attendanceForm.timeIn ? new Date(`${attendanceForm.attendanceDate}T${attendanceForm.timeIn}`).toISOString() : "",
        timeOut: attendanceForm.timeOut ? new Date(`${attendanceForm.attendanceDate}T${attendanceForm.timeOut}`).toISOString() : "",
        status: attendanceForm.status,
        notes: attendanceForm.notes
      }), "saving attendance");
      setMessage("Attendance updated successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to update attendance."));
    } finally {
      setProcessing("");
    }
  }

  async function generateSelectedPayroll() {
    if (!selectedMechanic) return;
    setError("");
    setMessage("");
    setProcessing("Generating payroll...");
    try {
      await withTimeout(window.talyer.generatePayroll({
        actorId: user.id,
        mechanicId: selectedMechanic.id,
        cutoffId: payrollForm.cutoffId || undefined,
        periodStart: payrollForm.cutoffId ? undefined : payrollForm.periodStart,
        periodEnd: payrollForm.cutoffId ? undefined : payrollForm.periodEnd,
        deductions: payrollForm.deductions
      }), "generating payroll");
      setMessage("Payroll generated successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to generate payroll."));
    } finally {
      setProcessing("");
    }
  }

  async function createCutoff() {
    setError("");
    setMessage("");
    setProcessing("Creating payroll cutoff...");
    try {
      await withTimeout(window.talyer.createPayrollCutoff({
        actorId: user.id,
        name: cutoffForm.name,
        periodStart: cutoffForm.periodStart,
        periodEnd: cutoffForm.periodEnd,
        payDate: cutoffForm.payDate,
        branchId: cutoffForm.branchId || undefined
      }), "creating payroll cutoff");
      setMessage("Payroll cutoff created successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to create payroll cutoff."));
    } finally {
      setProcessing("");
    }
  }

  async function movePayroll(run: PayrollRun, action: "review" | "approve" | "cancel" | "void") {
    const reason = action === "cancel" || action === "void" ? window.prompt(`Reason to ${action} payroll #${run.id}`)?.trim() : "";
    if ((action === "cancel" || action === "void") && !reason) return;
    const labels = { review: "Submitting payroll for review", approve: "Approving payroll", cancel: "Cancelling payroll", void: "Voiding payroll" };
    setError("");
    setMessage("");
    setProcessing(`${labels[action]}...`);
    try {
      if (action === "review") await withTimeout(window.talyer.submitPayrollForReview({ actorId: user.id, payrollId: run.id }), "submitting payroll for review");
      if (action === "approve") await withTimeout(window.talyer.approvePayrollRun({ actorId: user.id, payrollId: run.id }), "approving payroll");
      if (action === "cancel") await withTimeout(window.talyer.cancelPayrollRun({ actorId: user.id, payrollId: run.id, reason: reason || "" }), "cancelling payroll");
      if (action === "void") await withTimeout(window.talyer.voidPayrollRun({ actorId: user.id, payrollId: run.id, reason: reason || "" }), "voiding payroll");
      setMessage("Payroll status updated successfully.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to update payroll status."));
    } finally {
      setProcessing("");
    }
  }

  async function markPaid(run: PayrollRun) {
    if (run.status !== "Approved") {
      setError("Payroll must be approved before it can be marked paid.");
      return;
    }
    setError("");
    setMessage("");
    setProcessing("Marking payroll as paid...");
    try {
      await withTimeout(window.talyer.markPayrollPaid({ actorId: user.id, payrollId: run.id, paymentMethod: payrollForm.paymentMethod }), "marking payroll paid");
      setMessage("Payroll marked as paid.");
      await onRefresh();
    } catch (caught) {
      setError(friendlyError(caught, "Unable to mark payroll as paid."));
    } finally {
      setProcessing("");
    }
  }

  function previewPayslip(run: PayrollRun) {
    setPayslipPreview({ receiptNo: payslipReceiptNo(run), html: buildPayslipHtml(run, data.users.find((account) => account.id === run.mechanic_id)) });
  }

  async function savePayslip() {
    if (!payslipPreview) return;
    try {
      const saved = await withTimeout(window.talyer.saveReceiptPdf({ html: payslipPreview.html, receiptNo: payslipPreview.receiptNo }), "saving payslip");
      if (saved) {
        setMessage("Payslip generated successfully.");
        setPayslipPreview(null);
      }
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save payslip."));
    }
  }

  async function previewIdCard() {
    if (!selectedMechanic) return;
    setProcessing("Preparing ID card preview...");
    setError("");
    try {
      const html = await buildMechanicIdCardHtml(selectedMechanic);
      setIdCardPreview({
        receiptNo: mechanicIdReceiptNo(selectedMechanic),
        html,
        mechanicName: selectedMechanic.name
      });
    } catch (caught) {
      setError(friendlyError(caught, "Unable to prepare the mechanic ID card."));
    } finally {
      setProcessing("");
    }
  }

  async function printIdCard() {
    if (!idCardPreview) return;
    setProcessing("Printing ID card...");
    try {
      await printOrSaveReceiptPdf(idCardPreview.html, idCardPreview.receiptNo);
      setMessage("Mechanic ID card printed or saved as PDF successfully.");
    } catch (caught) {
      setError(friendlyError(caught, "Unable to print or save the mechanic ID card."));
    } finally {
      setProcessing("");
    }
  }

  async function saveIdCardPdf() {
    if (!idCardPreview) return;
    setProcessing("Saving ID card PDF...");
    try {
      const saved = await withTimeout(window.talyer.saveReceiptPdf({ html: idCardPreview.html, receiptNo: idCardPreview.receiptNo }), "saving mechanic ID card");
      if (saved) setMessage("Mechanic ID card PDF saved successfully.");
    } catch (caught) {
      setError(friendlyError(caught, "Unable to save the mechanic ID card PDF."));
    } finally {
      setProcessing("");
    }
  }

  return (
    <div className="content-grid payroll-module">
      <ToastBridge success={message} error={error} />
      <div className="stats-grid">
        <StatCard label="Active Mechanics" value={String(mechanics.length)} detail="Included in payroll" icon={<BriefcaseBusiness />} />
        <StatCard label="Present Today" value={String(presentToday)} detail="QR attendance logs" icon={<UserCheck />} />
        <StatCard label="Payroll Pending" value={String(payrollPending)} detail="Awaiting payment" icon={<ReceiptText />} />
        <StatCard label="Labor Revenue" value={money.format(totalLaborRevenue)} detail={`Payroll expense: ${money.format(totalPayrollExpense)}`} icon={<Wrench />} />
      </div>
      {processing && <div className="processing-banner">{processing}</div>}
      <section className="panel">
        <div className="panel-head">
          <h2>Payroll & Attendance</h2>
          <Badge>{user.role === "Owner" ? "Owner" : "Permissioned"}</Badge>
        </div>
        <section className="payroll-settings-box">
          <div className="panel-head">
            <h3>Computation Settings</h3>
            <Badge>Expected Hours</Badge>
          </div>
          <div className="form-grid">
            <label className="field">Required Hours / Day<input type="number" min={0} max={24} value={settingsForm.requiredHoursPerDay} onChange={(event) => setSettingsForm({ ...settingsForm, requiredHoursPerDay: Math.max(0, Math.min(24, Number(event.target.value) || 0)) })} /></label>
            <label className="field">Required Hours / Week<input type="number" min={0} max={168} value={settingsForm.requiredHoursPerWeek} onChange={(event) => setSettingsForm({ ...settingsForm, requiredHoursPerWeek: Math.max(0, Math.min(168, Number(event.target.value) || 0)) })} /></label>
            <label className="field">Required Hours / Month<input type="number" min={0} max={744} value={settingsForm.requiredHoursPerMonth} onChange={(event) => setSettingsForm({ ...settingsForm, requiredHoursPerMonth: Math.max(0, Math.min(744, Number(event.target.value) || 0)) })} /></label>
            <label className="check-field">
              <input type="checkbox" checked={settingsForm.considerHolidaysPaid} onChange={(event) => setSettingsForm({ ...settingsForm, considerHolidaysPaid: event.target.checked })} />
              Consider holidays as paid working days
            </label>
            <label className="field form-wide">
              Working Days
              <div className="day-toggle-row">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => (
                  <button type="button" className={settingsForm.workingDays.includes(index) ? "day-toggle active" : "day-toggle"} onClick={() => toggleWorkingDay(index)} key={label}>{label}</button>
                ))}
              </div>
            </label>
            <label className="field form-wide">Holiday Dates <small>Use YYYY-MM-DD, one per line</small><textarea value={settingsForm.holidayDates} onChange={(event) => setSettingsForm({ ...settingsForm, holidayDates: event.target.value })} placeholder="2026-12-25" /></label>
          </div>
          <button className="secondary-button compact-button" disabled={!canManagePayrollSettings} onClick={savePayrollSettings}>Save Payroll Settings</button>
        </section>
        <RecordsToolbar>
          <label className="field compact-field">
            Mechanic
            <select value={selectedMechanic?.id ?? 0} onChange={(event) => setSelectedMechanicId(Number(event.target.value))}>
              {mechanics.map((mechanic) => <option value={mechanic.id} key={mechanic.id}>{mechanic.name}</option>)}
            </select>
          </label>
        </RecordsToolbar>
        {!selectedMechanic ? <p className="empty-state">No active mechanics found. Add mechanics before generating payroll.</p> : (
          <div className="payroll-grid">
            <section className="credential-card qr-card">
              <span>Mechanic QR ID Card</span>
              <strong>{selectedMechanic.name}</strong>
              <div className="qr-placeholder">{selectedMechanic.qr_code || selectedMechanic.mechanic_code || "QR"}</div>
              <small>{selectedMechanic.mechanic_code} - {selectedMechanic.contact_number} - {selectedMechanic.status}</small>
              <button className="secondary-button compact-button" onClick={previewIdCard}>Preview ID Card</button>
            </section>
            <section>
              <h3>Mechanic Payroll Setup</h3>
              <div className="form-grid">
                <label className="field">Payroll Type<select value={setup.payrollType} onChange={(event) => setSetup({ ...setup, payrollType: event.target.value as PayrollType })}><option>Per Hour</option><option>Per Day</option><option>Per Week</option><option>Per Month</option></select></label>
                <label className="field">Salary Rate<input type="number" min={0} value={setup.salaryRate} onChange={(event) => setSetup({ ...setup, salaryRate: Math.max(0, Number(event.target.value) || 0) })} /></label>
                <label className="field">Compensation Type<select value={setup.compensationType} onChange={(event) => setSetup({ ...setup, compensationType: event.target.value as CompensationType })}><option>Fixed Salary</option><option>Commission</option><option>Hybrid</option></select></label>
                <label className="field">Labor Commission %<input type="number" min={0} max={100} value={setup.laborCommissionPercentage} onChange={(event) => setSetup({ ...setup, laborCommissionPercentage: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} /></label>
              </div>
              <button className="primary-button compact-button" onClick={saveSetup}>Save Payroll Setup</button>
            </section>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Attendance Scanner</h2><Badge>Time In / Time Out</Badge></div>
        <p className="empty-state">Waiting for mechanic QR scan from a USB or Bluetooth keyboard-wedge scanner. Scans also work globally from any module.</p>
        <div className="inline-controls">
          <input className="scanner-input" value={scanCode} onChange={(event) => setScanCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && recordAttendance()} placeholder="Focused scanner input" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          <button className="secondary-button compact-button" onClick={onRefresh}>Refresh Attendance</button>
        </div>
        {scannerStatus && <small className="helper-text">{scannerStatus}</small>}
        {canManagePayrollSettings && (
          <>
            <div className="form-grid">
              <label className="field">Date<input type="date" value={attendanceForm.attendanceDate} onChange={(event) => setAttendanceForm({ ...attendanceForm, attendanceDate: event.target.value })} /></label>
              <label className="field">Status<select value={attendanceForm.status} onChange={(event) => setAttendanceForm({ ...attendanceForm, status: event.target.value as MechanicAttendance["status"] })}><option>Present</option><option>Absent</option><option>Late</option><option>Incomplete Attendance</option></select></label>
              <label className="field">Time In<input type="time" value={attendanceForm.timeIn} onChange={(event) => setAttendanceForm({ ...attendanceForm, timeIn: event.target.value })} /></label>
              <label className="field">Time Out<input type="time" value={attendanceForm.timeOut} onChange={(event) => setAttendanceForm({ ...attendanceForm, timeOut: event.target.value })} /></label>
              <label className="field form-wide">Notes<input value={attendanceForm.notes} onChange={(event) => setAttendanceForm({ ...attendanceForm, notes: event.target.value })} /></label>
            </div>
            <button className="secondary-button compact-button" onClick={saveAttendance}>Save Manual Attendance</button>
          </>
        )}
      </section>
      <DataTable<MechanicAttendance>
        title="Attendance History"
        rows={mechanicAttendance.slice(0, 20)}
        emptyMessage="No attendance logs yet. Scan a mechanic QR code to record Time In."
        columns={[
          { key: "date", label: "Date", render: (row) => row.attendance_date },
          { key: "in", label: "Time In", render: (row) => row.time_in ? formatTimeOnly(row.time_in) : "None" },
          { key: "out", label: "Time Out", render: (row) => row.time_out ? formatTimeOnly(row.time_out) : "None" },
          { key: "hours", label: "Hours", render: (row) => row.time_in && row.time_out ? hoursDisplay(row.time_in, row.time_out) : "0" },
          { key: "status", label: "Status", render: (row) => <Badge tone={row.status === "Present" ? "good" : row.status === "Incomplete Attendance" ? "warn" : "neutral"}>{row.status}</Badge> }
        ]}
      />
      <section className="panel">
        <div className="panel-head"><h2>Payroll Cutoffs</h2><Badge>Workflow ready</Badge></div>
        <div className="form-grid">
          <label className="field">Cutoff Name<input value={cutoffForm.name} onChange={(event) => setCutoffForm({ ...cutoffForm, name: event.target.value })} placeholder="1st Half May" /></label>
          <label className="field">Branch<select value={cutoffForm.branchId} onChange={(event) => setCutoffForm({ ...cutoffForm, branchId: Number(event.target.value) || 0 })}>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select></label>
          <label className="field">Start Date<input type="date" value={cutoffForm.periodStart} onChange={(event) => setCutoffForm({ ...cutoffForm, periodStart: event.target.value })} /></label>
          <label className="field">End Date<input type="date" value={cutoffForm.periodEnd} onChange={(event) => setCutoffForm({ ...cutoffForm, periodEnd: event.target.value })} /></label>
          <label className="field">Pay Date<input type="date" value={cutoffForm.payDate} onChange={(event) => setCutoffForm({ ...cutoffForm, payDate: event.target.value })} /></label>
        </div>
        <button className="secondary-button compact-button" onClick={createCutoff}>Create Cutoff</button>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Generate Payroll</h2><Badge>Draft until approved</Badge></div>
        <div className="form-grid">
          <label className="field">Payroll Cutoff<select value={payrollForm.cutoffId} onChange={(event) => setPayrollForm({ ...payrollForm, cutoffId: Number(event.target.value) || 0 })}>
            <option value={0}>Manual period</option>
            {payrollCutoffs.map((cutoff) => <option key={cutoff.id} value={cutoff.id}>{cutoff.name} ({cutoff.period_start} to {cutoff.period_end})</option>)}
          </select></label>
          <label className="field">Period Start<input type="date" disabled={Boolean(selectedCutoff)} value={selectedCutoff?.period_start || payrollForm.periodStart} onChange={(event) => setPayrollForm({ ...payrollForm, periodStart: event.target.value })} /></label>
          <label className="field">Period End<input type="date" disabled={Boolean(selectedCutoff)} value={selectedCutoff?.period_end || payrollForm.periodEnd} onChange={(event) => setPayrollForm({ ...payrollForm, periodEnd: event.target.value })} /></label>
          <label className="field">Manual Deductions<input type="number" min={0} value={payrollForm.deductions} onChange={(event) => setPayrollForm({ ...payrollForm, deductions: Math.max(0, Number(event.target.value) || 0) })} /></label>
          <label className="field">Payment Method<input value={payrollForm.paymentMethod} onChange={(event) => setPayrollForm({ ...payrollForm, paymentMethod: event.target.value })} placeholder="Cash, bank transfer, etc." /></label>
        </div>
        <button className="primary-button compact-button" onClick={generateSelectedPayroll}>Generate Payroll</button>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Payroll Reports</h2><Badge>Branch ready</Badge></div>
        <RecordsToolbar>
          <label className="field compact-field">
            Branch
            <select value={reportBranchId} onChange={(event) => setReportBranchId(Number(event.target.value) || 0)}>
              <option value={0}>All branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
        </RecordsToolbar>
        <div className="stats-grid compact-stats">
          <StatCard label="Gross Payroll" value={money.format(reportGross)} detail={`${reportRuns.length} run(s)`} icon={<ReceiptText />} />
          <StatCard label="Net Payroll" value={money.format(reportNet)} detail="After deductions" icon={<BriefcaseBusiness />} />
          <StatCard label="Commissions" value={money.format(reportCommission)} detail="Allocated labor share" icon={<Wrench />} />
          <StatCard label="Overtime Signal" value={`${reportOvertimeProxy.toFixed(2)} hr`} detail="Hours beyond expected" icon={<UserCheck />} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Payroll Calendar</h2><Badge>Upcoming</Badge></div>
        <div className="calendar-list">
          {upcomingCutoffs.length === 0 && <p className="empty-state">No payroll cutoffs scheduled yet.</p>}
          {upcomingCutoffs.map((cutoff) => (
            <div className="calendar-row" key={cutoff.id}>
              <strong>{cutoff.name}</strong>
              <span>{cutoff.period_start} to {cutoff.period_end}</span>
              <Badge tone="good">{`Pay ${cutoff.pay_date}`}</Badge>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Payroll Access Matrix</h2><Badge>Future roles</Badge></div>
        <div className="permission-grid">
          {payrollPermissions.map((permission) => (
            <span className={permission.enabled ? "permission-pill enabled" : "permission-pill"} key={permission.id}>
              <b>{permission.role_name}</b>
              {permission.permission_key.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </section>
      <DataTable<PayrollRun>
        title="Payroll Summary"
        rows={mechanicPayroll}
        emptyMessage="No payroll generated yet. Select a period and generate payroll."
        columns={[
          { key: "period", label: "Period", render: (row) => row.cutoff_name ? `${row.cutoff_name}: ${row.period_start} to ${row.period_end}` : `${row.period_start} to ${row.period_end}` },
          { key: "attendance", label: "Attendance", render: (row) => `${row.attendance_count} day(s), ${row.hours_worked} hr(s)` },
          { key: "required", label: "Required", render: (row) => `${row.expected_hours || row.required_hours || 0} hr(s)` },
          { key: "deficit", label: "Deficit", render: (row) => `${row.hour_deficit || 0} hr(s)` },
          { key: "completion", label: "Completion", render: (row) => `${row.attendance_completion || 0}%` },
          { key: "base", label: "Base Salary", render: (row) => money.format(row.base_salary) },
          { key: "commission", label: "Labor Commission", render: (row) => money.format(row.labor_commission) },
          { key: "net", label: "Net Pay", render: (row) => money.format(row.net_pay) },
          { key: "status", label: "Status", render: (row) => <Badge tone={row.status === "Paid" || row.status === "Approved" ? "good" : row.status === "Cancelled" || row.status === "Void" ? "neutral" : "warn"}>{row.status}</Badge> },
          { key: "actions", label: "Actions", render: (row) => (
            <div className="table-actions">
              <button className="table-action" onClick={() => previewPayslip(row)}>Payslip</button>
              {row.status === "Draft" && <button className="table-action" onClick={() => movePayroll(row, "review")}>Submit</button>}
              {(row.status === "Draft" || row.status === "Pending Review") && <button className="table-action success-action" onClick={() => movePayroll(row, "approve")}>Approve</button>}
              {row.status === "Approved" && <button className="table-action success-action" onClick={() => markPaid(row)}>Mark Paid</button>}
              {(row.status === "Draft" || row.status === "Pending Review") && <button className="table-action danger-action" onClick={() => movePayroll(row, "cancel")}>Cancel</button>}
              {(row.status === "Approved" || row.status === "Paid") && <button className="table-action danger-action" onClick={() => movePayroll(row, "void")}>Void</button>}
            </div>
          ) }
        ]}
      />
      {payslipPreview && (
        <div className="modal-backdrop">
          <section className="modal-window report-preview-window">
            <div className="panel-head">
              <h2>Payslip Preview</h2>
              <button className="table-action" onClick={() => setPayslipPreview(null)}>Close</button>
            </div>
            <iframe className="document-preview" title="Payslip preview" srcDoc={payslipPreview.html} />
            <button className="primary-button" onClick={savePayslip}>Save PDF Payslip</button>
          </section>
        </div>
      )}
      {idCardPreview && (
        <div className="modal-backdrop">
          <section className="modal-window report-preview-window">
            <div className="panel-head">
              <h2>ID Card Preview</h2>
              <button className="table-action" onClick={() => setIdCardPreview(null)}>Close</button>
            </div>
            <p className="empty-state">One standard CR80 ID card is centered on one Letter-size page for {idCardPreview.mechanicName}.</p>
            <iframe className="document-preview id-card-preview" title="Mechanic ID card preview" srcDoc={idCardPreview.html} />
            <div className="inline-controls">
              <button className="primary-button" onClick={printIdCard}><Printer size={16} /> Print ID Card</button>
              <button className="secondary-button" onClick={saveIdCardPdf}><Download size={16} /> Save as PDF</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

