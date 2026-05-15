import QRCode from "qrcode";
import type { PayrollRun, UserAccount } from "../../types/global";
import { formatDateTime } from "../lib/date";
import { escapeHtml, money } from "../lib/format";

export async function buildMechanicIdCardHtml(mechanic: UserAccount) {
  const mechanicCode = mechanic.mechanic_code || `MECH-${String(mechanic.id).padStart(5, "0")}`;
  const qrCode = mechanic.qr_code || mechanicCode;
  const qrDataUrl = await QRCode.toDataURL(qrCode, { errorCorrectionLevel: "M", margin: 1, width: 420, color: { dark: "#211f1b", light: "#ffffff" } });
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="receipt-width-mm" content="215.9" /><meta name="receipt-height-mm" content="279.4" /><title>Mechanic ID Card</title><style>
      @page{size:8.5in 11in;margin:0}
      *{box-sizing:border-box}
      html,body{width:8.5in;height:11in;margin:0;background:#fff;color:#211f1b;font-family:Arial,sans-serif}
      #print-document{width:8.5in;height:11in;display:grid;place-items:center}
      .id-card{width:3.375in;height:2.125in;border:1px solid #211f1b;border-radius:.08in;padding:.14in;display:grid;grid-template-columns:1fr .86in;gap:.12in;background:#fff;overflow:hidden}
      .brand{font-size:.12in;font-weight:800;color:#dc382a;text-transform:uppercase;letter-spacing:0}
      h1{margin:.04in 0 .08in;font-size:.22in;line-height:1.05}
      dl{margin:0;display:grid;gap:.045in;font-size:.085in}
      dt{font-size:.065in;text-transform:uppercase;color:#6d665d;font-weight:700}
      dd{margin:0;font-weight:800;line-height:1.1}
      .qr{width:.82in;height:.82in;border:.02in solid #211f1b;background:#fff}
      .qr img{display:block;width:100%;height:100%;object-fit:contain}
      .qr-code-text{font-size:.055in;font-weight:800;text-align:center;overflow-wrap:anywhere;line-height:1.1}
      .side{display:grid;align-content:start;justify-items:center;gap:.06in}
      .status{border:1px solid #d8d0c4;border-radius:.04in;padding:.03in .06in;font-size:.075in;font-weight:800}
      .cut-note{position:absolute;left:-9999px}
    </style></head><body><main id="print-document">
      <section class="id-card" aria-label="Mechanic ID Card">
        <div>
          <div class="brand">Talyer Mechanic ID</div>
          <h1>${escapeHtml(mechanic.name)}</h1>
          <dl>
            <div><dt>Mechanic ID</dt><dd>${escapeHtml(mechanicCode)}</dd></div>
            <div><dt>Contact</dt><dd>${escapeHtml(mechanic.contact_number || "Optional")}</dd></div>
            <div><dt>Status</dt><dd>${escapeHtml(mechanic.status)}</dd></div>
          </dl>
        </div>
        <div class="side">
          <div class="qr"><img alt="Mechanic QR Code" src="${escapeHtml(qrDataUrl)}" /></div>
          <div class="qr-code-text">${escapeHtml(qrCode)}</div>
          <div class="status">${escapeHtml(mechanic.status)}</div>
        </div>
      </section>
    </main></body></html>`;
}

export function buildPayslipHtml(run: PayrollRun, mechanic?: UserAccount) {
  return `<!doctype html><html><head><meta charset="utf-8" /><title>Payslip</title><style>
      body{font-family:Arial,sans-serif;margin:28px;color:#211f1b}.head{border-bottom:2px solid #dc382a;padding-bottom:14px;margin-bottom:18px}
      h1{margin:0 0 6px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:14px 0}.box{border:1px solid #ded5c9;padding:10px}
      table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #eee;padding:10px;text-align:left}.right{text-align:right}.total{font-weight:700}
    </style></head><body><main id="print-document">
      <section class="head"><h1>Payslip</h1><strong>${escapeHtml(mechanic?.name || run.mechanic_name || "Mechanic")}</strong><br/>${escapeHtml(mechanic?.mechanic_code || run.mechanic_code || "")}</section>
      <div class="grid"><div class="box">Period<br/><strong>${escapeHtml(run.period_start)} to ${escapeHtml(run.period_end)}</strong></div><div class="box">Status<br/><strong>${escapeHtml(run.status)}</strong></div>
      <div class="box">Payroll Type<br/><strong>${escapeHtml(run.payroll_type)}</strong></div><div class="box">Compensation<br/><strong>${escapeHtml(run.compensation_type)}</strong></div>
      <div class="box">Days Worked<br/><strong>${escapeHtml(run.attendance_count)}</strong></div><div class="box">Hours Rendered<br/><strong>${escapeHtml(run.hours_worked)}</strong></div>
      <div class="box">Required Hours<br/><strong>${escapeHtml(run.required_hours || 0)}</strong></div><div class="box">Expected Hours<br/><strong>${escapeHtml(run.expected_hours || 0)}</strong></div>
      <div class="box">Hour Deficit<br/><strong>${escapeHtml(run.hour_deficit || 0)}</strong></div><div class="box">Completion<br/><strong>${escapeHtml(run.attendance_completion || 0)}%</strong></div></div>
      <table><thead><tr><th>Description</th><th class="right">Amount</th></tr></thead><tbody>
      <tr><td>Base Salary</td><td class="right">${escapeHtml(money.format(run.base_salary))}</td></tr>
      <tr><td>Hourly Equivalent Rate</td><td class="right">${escapeHtml(money.format(run.hourly_equivalent_rate || 0))}</td></tr>
      <tr><td>Holiday Paid Hours</td><td class="right">${escapeHtml(run.holiday_paid_hours || 0)}</td></tr>
      <tr><td>Labor Commission</td><td class="right">${escapeHtml(money.format(run.labor_commission))}</td></tr>
      <tr><td>Additional Labor Incentives</td><td class="right">${escapeHtml(money.format(run.additional_incentives))}</td></tr>
      <tr><td>Deductions</td><td class="right">${escapeHtml(money.format(run.deductions))}</td></tr>
      <tr class="total"><td>Gross Pay</td><td class="right">${escapeHtml(money.format(run.gross_pay))}</td></tr>
      <tr class="total"><td>Net Pay</td><td class="right">${escapeHtml(money.format(run.net_pay))}</td></tr>
      </tbody></table><p>Date Generated: ${escapeHtml(formatDateTime(new Date()))}</p></main></body></html>`;
}
