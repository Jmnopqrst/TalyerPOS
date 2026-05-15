import type { ReactNode } from "react";
import type { JobOrder, JobProduct, ReceiptSettings, Service } from "../../../types/global";
import { withTimeout } from "../../lib/api";
import { formatDateOnly, formatDateTime, formatTimeOnly } from "../../lib/date";
import { money } from "../../lib/format";

function contactDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidContactNumber(value: string) {
  const digits = contactDigits(value);
  return digits.length >= 10 && digits.length <= 11;
}

export function closeOnEscape(event: KeyboardEvent, close: () => void) {
  if (event.key === "Escape") close();
}

export function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
}

interface ReceiptBreakdown {
  servicePrice: number;
  laborCost: number;
  additionalLaborCost: number;
  productsTotal: number;
}

interface ReceiptBuildInput {
  receiptNo: string;
  cashierName?: string;
  customerName?: string;
  transactionType: string;
  paymentMethod: string;
  paymentCategory?: string;
  paymentReferenceCode?: string;
  createdAt: Date;
  lines: ReceiptLine[];
  subtotal: number;
  total: number;
  breakdown?: ReceiptBreakdown;
}
export function ReceiptStatusTimeline({ current, done = false }: { current: string; done?: boolean }) {
  if (!current && !done) return null;
  const steps = ["Saving transaction", "Generating receipt", "Printing / Saving PDF", "Done"];
  const activeIndex = done ? steps.length - 1 : Math.max(0, steps.findIndex((step) => current.toLowerCase().includes(step.toLowerCase().split(" / ")[0])));

  return (
    <div className="receipt-status-timeline">
      {steps.map((step, index) => (
        <span className={index < activeIndex || done ? "done" : index === activeIndex ? "active" : ""} key={step}>
          {step}
        </span>
      ))}
    </div>
  );
}

export function buildReceiptHtml(settings: ReceiptSettings, receipt: ReceiptBuildInput) {
  const isLetter = Number(settings.paper_width) === 216;
  const widthMm = isLetter ? 216 : Number(settings.paper_width) === 80 ? 80 : 58;
  const heightMm = isLetter ? 279 : 160;
  const compact = settings.receipt_template === "Compact";
  const logoPx = settings.logo_size === "Large" ? 92 : settings.logo_size === "Small" ? 48 : 68;
  const paddingMm = isLetter ? 18 : widthMm === 80 ? 5 : 4;
  const fontSize = isLetter ? 13 : compact ? 10 : 11;
  const safe = (value: string | number | undefined) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] ?? char));
  const rows = receipt.lines.map((line, index) => `
    <tr>
      ${compact ? "" : `<td class="muted">${index + 1}</td>`}
      <td>${safe(line.name)}</td>
      <td class="right">${safe(String(line.quantity))}</td>
      ${compact ? "" : `<td class="right">${safe(money.format(line.unitPrice))}</td>`}
      <td class="right">${safe(money.format(line.quantity * line.unitPrice))}</td>
    </tr>
  `).join("");
  const footerCopy = settings.custom_footer || settings.footer_message || "Thank you for your business.";
  const headerCopy = settings.custom_header;
  const breakdown = receipt.breakdown;
  const showBreakdown = Boolean(breakdown && settings.show_labor_breakdown === 1 && !compact);

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${safe(receipt.receiptNo)}</title>
        <meta name="receipt-width-mm" content="${widthMm}" />
        <meta name="receipt-height-mm" content="${heightMm}" />
        <style>
          @page { size: ${isLetter ? "letter" : `${widthMm}mm auto`}; margin: 0; }
          * { box-sizing: border-box; }
          html, body { min-height: ${isLetter ? `${heightMm}mm` : "auto"}; }
          body {
            width: ${widthMm}mm;
            margin: 0;
            color: #171512;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${fontSize}px;
          }
          .page {
            display: grid;
            min-height: ${isLetter ? `${heightMm}mm` : "auto"};
            grid-template-rows: auto auto 1fr auto;
            padding: ${paddingMm}mm;
          }
          .topbar {
            display: ${isLetter ? "flex" : "grid"};
            align-items: flex-start;
            justify-content: space-between;
            gap: ${isLetter ? "24px" : "8px"};
            border-bottom: 3px solid #dc382a;
            padding-bottom: ${isLetter ? "18px" : "10px"};
            text-align: ${isLetter ? "left" : "center"};
          }
          .logo {
            width: ${logoPx}px;
            height: ${logoPx}px;
            object-fit: contain;
            margin: ${isLetter ? "0 0 10px" : "0 auto 8px"};
          }
          .brand h1 {
            margin: 0 0 8px;
            color: #171512;
            font-size: ${isLetter ? "28px" : compact ? "16px" : "18px"};
            letter-spacing: 0;
            text-transform: uppercase;
          }
          .brand p,
          .meta p,
          .party p,
          .footer p {
            margin: 3px 0;
          }
          .receipt-title {
            min-width: ${isLetter ? "210px" : "0"};
            text-align: ${isLetter ? "right" : "center"};
          }
          .receipt-title h2 {
            margin: 0 0 8px;
            color: #dc382a;
            font-size: ${isLetter ? "30px" : compact ? "17px" : "20px"};
            text-transform: uppercase;
          }
          .receipt-title strong {
            display: block;
            font-size: 16px;
          }
          .muted {
            color: #706a61;
          }
          .info-grid {
            display: grid;
            grid-template-columns: ${isLetter ? "1fr 1fr" : "1fr"};
            gap: ${isLetter ? "18px" : "8px"};
            margin: ${isLetter ? "24px 0" : "10px 0"};
          }
          .box {
            border: 1px solid #ded5c9;
            border-radius: 6px;
            padding: 14px;
          }
          .box h3 {
            margin: 0 0 10px;
            color: #dc382a;
            font-size: 13px;
            text-transform: uppercase;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            border-bottom: 1px solid #eee5d8;
            padding: 5px 0;
          }
          .meta-row:last-child {
            border-bottom: 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            background: #211f1b;
            color: #fff;
            font-size: ${isLetter ? "12px" : "10px"};
            text-align: left;
            text-transform: uppercase;
          }
          th,
          td {
            padding: ${isLetter ? "11px 10px" : "6px 3px"};
            border-bottom: 1px solid #eee5d8;
            vertical-align: top;
          }
          .right {
            text-align: right;
          }
          .totals {
            display: grid;
            justify-content: end;
            margin-top: 20px;
          }
          .totals table {
            width: ${isLetter ? "270px" : "100%"};
          }
          .totals td {
            padding: 8px 10px;
          }
          .grand-total td {
            border-top: 2px solid #211f1b;
            border-bottom: 0;
            color: #dc382a;
            font-size: ${isLetter ? "18px" : "14px"};
            font-weight: 800;
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 42px;
            margin-top: 38px;
          }
          .signature-line {
            border-top: 1px solid #211f1b;
            padding-top: 8px;
            text-align: center;
          }
          .footer {
            border-top: 1px solid #ded5c9;
            margin-top: 26px;
            padding-top: 12px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <main id="print-receipt" class="page">
          <section class="topbar">
            <div class="brand">
              ${settings.logo_data_url ? `<img class="logo" src="${safe(settings.logo_data_url)}" alt="" />` : ""}
              <h1>${safe(settings.business_name)}</h1>
              ${headerCopy ? `<p><strong>${safe(headerCopy)}</strong></p>` : ""}
              <p>${safe(settings.address)}</p>
              ${settings.email ? `<p>${safe(settings.email)}</p>` : ""}
              <p>${safe(settings.contact_number)}</p>
              ${settings.show_tax_id ? `<p>${safe(settings.tax_id)}</p>` : ""}
            </div>
            <div class="receipt-title">
              <h2>Receipt</h2>
              <strong>${safe(receipt.receiptNo)}</strong>
              <p class="muted">${safe(receipt.transactionType)}</p>
            </div>
          </section>

          ${compact ? "" : `<section class="info-grid">
            <div class="box party">
              <h3>Customer / Job Details</h3>
              <p><strong>${safe(receipt.customerName || "Walk-in Customer")}</strong></p>
              <p class="muted">Transaction Type: ${safe(receipt.transactionType)}</p>
            </div>
            <div class="box meta">
              <h3>Transaction Information</h3>
              <div class="meta-row"><span>Receipt No.</span><strong>${safe(receipt.receiptNo)}</strong></div>
              <div class="meta-row"><span>Date</span><strong>${safe(formatDateOnly(receipt.createdAt))}</strong></div>
              <div class="meta-row"><span>Time</span><strong>${safe(formatTimeOnly(receipt.createdAt))}</strong></div>
              ${settings.show_cashier ? `<div class="meta-row"><span>Cashier</span><strong>${safe(receipt.cashierName)}</strong></div>` : ""}
              <div class="meta-row"><span>Payment Method</span><strong>${safe(receipt.paymentMethod)}</strong></div>
              ${receipt.paymentCategory === "Digital" && receipt.paymentReferenceCode ? `<div class="meta-row"><span>Reference Code</span><strong>${safe(receipt.paymentReferenceCode)}</strong></div>` : ""}
            </div>
          </section>`}

          <section>
            <table>
              <thead>
                <tr>
                  ${compact ? "" : `<th style="width: 52px;">No.</th>`}
                  <th>Description</th>
                  <th class="right" style="width: 86px;">Qty</th>
                  ${compact ? "" : `<th class="right" style="width: 130px;">Unit Price</th>`}
                  <th class="right" style="width: 130px;">Amount</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            ${showBreakdown ? `
              <div class="totals">
                <table>
                  <tr><td>Service Cost</td><td class="right">${safe(money.format(breakdown?.servicePrice ?? 0))}</td></tr>
                  <tr><td>Labor Cost</td><td class="right">${safe(money.format(breakdown?.laborCost ?? 0))}</td></tr>
                  <tr><td>Additional Labor Cost</td><td class="right">${safe(money.format(breakdown?.additionalLaborCost ?? 0))}</td></tr>
                  <tr><td>Products Total</td><td class="right">${safe(money.format(breakdown?.productsTotal ?? 0))}</td></tr>
                </table>
              </div>
            ` : ""}
            <div class="totals">
              <table>
                <tr><td>Subtotal</td><td class="right">${safe(money.format(receipt.subtotal))}</td></tr>
                <tr><td>Payment</td><td class="right">${safe(receipt.paymentMethod)}</td></tr>
                ${receipt.paymentCategory === "Digital" && receipt.paymentReferenceCode ? `<tr><td>Reference</td><td class="right">${safe(receipt.paymentReferenceCode)}</td></tr>` : ""}
                <tr class="grand-total"><td>Total</td><td class="right">${safe(money.format(receipt.total))}</td></tr>
              </table>
          </section>

          <section class="footer">
            <p>${safe(footerCopy)}</p>
          </section>
        </main>
      </body>
    </html>`;
}

export async function printOrSaveReceiptPdf(html: string, receiptNo: string) {
  const printed = await withTimeout(window.talyer.printReceipt({ html }), "printing receipt");
  if (printed) return;
  const saved = await withTimeout(window.talyer.saveReceiptPdf({ html, receiptNo }), "saving receipt PDF");
  if (!saved) throw new Error("Receipt PDF save was canceled.");
}

export function parseJobProducts(raw: string | undefined): JobProduct[] {
  try {
    return JSON.parse(raw || "[]") as JobProduct[];
  } catch {
    return [];
  }
}

export function serviceNameForJob(job: JobOrder, services: Service[]) {
  return services.find((service) => service.id === job.service_id)?.name ?? "Service not found";
}

export function serviceTotal(service: Service) {
  return Number(service.price) + Number(service.labor_cost || 0);
}

export function normalizeJobStatusForUi(status: string) {
  if (status === "Ready" || status === "Released") return "Completed";
  return status;
}

export function fallbackJobTimeline(job: JobOrder) {
  const timeline = [
    { status: "Created", details: `Job order ${job.job_no} created.`, created_at: job.created_at, actor_name: "System" },
    { status: normalizeJobStatusForUi(job.status), details: "Current job status.", created_at: job.created_at, actor_name: "System" }
  ];
  if (job.paid_at) timeline.push({ status: "Paid", details: `Paid via ${job.payment_method || "payment method"}.`, created_at: job.paid_at, actor_name: "System" });
  return timeline;
}

export function hoursDisplay(start: string, end: string) {
  return (Math.max(0, new Date(end).getTime() - new Date(start).getTime()) / 36e5).toFixed(2);
}

export function RecordsToolbar({
  children,
  onClear,
  showClear
}: {
  children?: ReactNode;
  onClear?: () => void;
  showClear?: boolean;
}) {
  return (
    <div className="records-toolbar">
      <div className="records-filters">{children}</div>
      {showClear && <button className="secondary-button compact-button" onClick={onClear}>Clear Filters</button>}
    </div>
  );
}
