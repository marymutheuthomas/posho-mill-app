import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtKsh = (v: number | string | null | undefined): string => {
  const n = Number(v) || 0;
  return `KSh ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (v: string | null | undefined): string => {
  if (!v) return 'N/A';
  const d = new Date(v);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Shared table defaults
const HEAD_NAVY   = [30, 58, 138] as [number, number, number];
const HEAD_SLATE  = [71, 85, 105] as [number, number, number];
const HEAD_DARK   = [15, 23, 42]  as [number, number, number];
const STRIPE_LIGHT = [248, 250, 252] as [number, number, number];
const STRIPE_RED   = [254, 242, 242] as [number, number, number];

// ── Interface ──────────────────────────────────────────────────────────────
export interface ManagerPDFData {
  cashFlow:    any[];
  production:  any[];   // dashboard_internal_production
  extProd:     any[];   // dashboard_external_production
  creditRisk:  any[];
  startDate:   Date;
  endDate:     Date;
}

// ── Main Export ────────────────────────────────────────────────────────────
export const generateManagerPDF = ({
  cashFlow, production, extProd, creditRisk, startDate, endDate
}: ManagerPDFData) => {

  const doc       = new jsPDF('portrait', 'pt', 'a4');
  const pageW     = doc.internal.pageSize.getWidth();
  const pageH     = doc.internal.pageSize.getHeight();
  const margin    = 40;
  const bodyWidth = pageW - margin * 2;

  // ── Period label ──────────────────────────────────────────────────────────
  const periodLabel = `${fmtDate(startDate.toISOString())} – ${fmtDate(endDate.toISOString())}`;

  // ── Page helper ───────────────────────────────────────────────────────────
  const checkPage = (y: number, needed = 180): number => {
    if (y > pageH - needed) { doc.addPage(); return 60; }
    return y;
  };

  // ── Section heading helper ─────────────────────────────────────────────────
  const sectionHeading = (y: number, num: string, title: string): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text(`${num}  ${title.toUpperCase()}`, margin, y);
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 4, pageW - margin, y + 4);
    return y + 20;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════

  // Top navy accent bar
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageW, 10, 'F');

  // Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text('BokyVent Posho Mill', margin, 50);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text('Operational Management Report', margin, 68);

  // Period
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);
  doc.text(`Report Period:  ${periodLabel}`, margin, 84);

  // Generated timestamp
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${new Date().toLocaleString('en-KE')}`, margin, 98);

  // CONFIDENTIAL stamp (top-right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(220, 38, 38);
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(1.5);
  const stampW = 130, stampH = 26, stampX = pageW - margin - stampW, stampY = 52;
  doc.rect(stampX, stampY, stampW, stampH);
  doc.text('CONFIDENTIAL', stampX + stampW / 2, stampY + 17, { align: 'center' });

  // Reset
  doc.setTextColor(15, 23, 42);
  doc.setLineWidth(0.5);

  let y = 128;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 – FINANCIAL AUDIT & REVENUE BREAKDOWN
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Aggregate from cashFlow ──────────────────────────────────────────────
  const serviceSalesTotal = cashFlow.reduce((s, r) => s + (Number(r.total_service_revenue)  || 0), 0);
  const retailSalesTotal  = cashFlow.reduce((s, r) => s + (Number(r.total_retail_revenue)   || 0), 0);
  const totalGrossRevenue = serviceSalesTotal + retailSalesTotal;
  const mpesaTotal        = cashFlow.reduce((s, r) => s + (Number(r.expected_mpesa_intake)  || 0), 0);
  const debtTotal         = cashFlow.reduce((s, r) => s + (Number(r.total_new_debt_issued)  || 0), 0);
  const expectedPhysical  = totalGrossRevenue - mpesaTotal - debtTotal;
  const actualCollected   = cashFlow.reduce((s, r) => s + (Number(r.total_cash_collected)   || 0), 0);
  const variance          = actualCollected - expectedPhysical;

  y = sectionHeading(y, '1.', 'Financial Audit & Revenue Breakdown');

  // Table 1a — Revenue Sources
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Revenue Sources', margin, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [['Revenue Category', 'Amount (KSh)']],
    body: [
      ['Milling Service Sales',    fmtKsh(serviceSalesTotal)],
      ['Retail / Inventory Sales', fmtKsh(retailSalesTotal)],
      [
        { content: 'TOTAL GROSS REVENUE', styles: { fontStyle: 'bold', textColor: [30, 58, 138] as any } },
        { content: fmtKsh(totalGrossRevenue), styles: { fontStyle: 'bold', textColor: [30, 58, 138] as any } }
      ],
    ],
    theme: 'striped',
    headStyles:          { fillColor: HEAD_NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles:  { fillColor: STRIPE_LIGHT },
    margin:              { left: margin, right: margin },
    tableWidth:          bodyWidth * 0.5,
    styles:              { fontSize: 9, cellPadding: 6 },
    columnStyles:        { 1: { halign: 'right', fontStyle: 'bold' } },
  });

  // Table 1b — Collection & Reconciliation (right-aligned next to 1a)
  const leftTableRight = margin + bodyWidth * 0.5 + 14;
  const table1aFinalY  = (doc as any).lastAutoTable.finalY;

  autoTable(doc, {
    startY: y,
    head: [['Payment Method', 'Amount (KSh)']],
    body: [
      ['M-Pesa Collections',  fmtKsh(mpesaTotal)],
      ['Unsettled Debt / Credit', fmtKsh(debtTotal)],
      [
        { content: 'EXPECTED PHYSICAL CASH', styles: { fontStyle: 'bold', textColor: [21, 128, 61] as any, fillColor: [236, 253, 245] as any } },
        { content: fmtKsh(expectedPhysical),  styles: { fontStyle: 'bold', textColor: [21, 128, 61] as any, fillColor: [236, 253, 245] as any } },
      ],
    ],
    theme: 'striped',
    headStyles:         { fillColor: HEAD_SLATE, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: STRIPE_LIGHT },
    margin:             { left: leftTableRight, right: margin },
    tableWidth:         bodyWidth * 0.5 - 14,
    styles:             { fontSize: 9, cellPadding: 6 },
    columnStyles:       { 1: { halign: 'right', fontStyle: 'bold' } },
  });

  const table1bFinalY = (doc as any).lastAutoTable.finalY;
  y = Math.max(table1aFinalY, table1bFinalY) + 12;

  // Variance summary bar
  doc.setFillColor(variance >= 0 ? 236 : 254, variance >= 0 ? 253 : 226, variance >= 0 ? 245 : 226);
  doc.setDrawColor(variance >= 0 ? 21 : 220, variance >= 0 ? 128 : 38, variance >= 0 ? 61 : 38);
  doc.setLineWidth(1);
  doc.rect(margin, y, bodyWidth, 22, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(variance >= 0 ? 21 : 220, variance >= 0 ? 128 : 38, variance >= 0 ? 61 : 38);
  const varianceLabel = variance === 0
    ? '✓ RECONCILED — No discrepancy detected.'
    : variance < 0
      ? `⚠  SHORTAGE of ${fmtKsh(Math.abs(variance))} — Actual collected is BELOW expected physical cash.`
      : `✓  OVERAGE of ${fmtKsh(variance)} — Actual collected EXCEEDS expected physical cash.`;
  doc.text(varianceLabel, margin + 10, y + 14);
  y += 36;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 – DAILY CASH FLOW (date-filtered)
  // ═══════════════════════════════════════════════════════════════════════════

  y = checkPage(y);
  y = sectionHeading(y, '2.', 'Daily Cash Flow Summary');

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Service Rev', 'Retail Rev', 'M-Pesa', 'Debt Issued', 'Actual Collected', 'Variance']],
    body: cashFlow.length > 0 ? cashFlow.map(row => {
      const svc  = Number(row.total_service_revenue)  || 0;
      const ret  = Number(row.total_retail_revenue)   || 0;
      const mp   = Number(row.expected_mpesa_intake)  || 0;
      const debt = Number(row.total_new_debt_issued)  || 0;
      const act  = Number(row.total_cash_collected)   || 0;
      const exp  = (svc + ret) - mp - debt;
      const diff = act - exp;
      return [
        fmtDate(row.reconciliation_date),
        fmtKsh(svc),
        fmtKsh(ret),
        fmtKsh(mp),
        fmtKsh(debt),
        fmtKsh(act),
        {
          content: (diff >= 0 ? '+' : '') + fmtKsh(diff),
          styles: { textColor: diff < 0 ? [220, 38, 38] : [21, 128, 61], fontStyle: 'bold' as any }
        }
      ];
    }) : [['No data for selected period', '', '', '', '', '', '']],
    theme: 'striped',
    headStyles:         { fillColor: HEAD_NAVY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: STRIPE_LIGHT },
    margin:             { left: margin, right: margin },
    styles:             { fontSize: 8, cellPadding: 5 },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 36;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3 – INTERNAL PRODUCTION YIELDS & EFFICIENCY
  // ═══════════════════════════════════════════════════════════════════════════

  y = checkPage(y);
  y = sectionHeading(y, '3.', 'Internal Production Yields & Efficiency');

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Session Code', 'Input KG', 'Net Output KG', 'Power (kWh)', 'Power Cost', 'Proj. Value', 'Efficiency']],
    body: production.length > 0 ? production.map(row => {
      const eff = Number(row.efficiency_score) || 0;
      return [
        fmtDate(row.production_date),
        row.session_code || row.session_id || 'N/A',
        `${Number(row.total_input_kg || row.kgs_processed || 0).toLocaleString()} KG`,
        `${Number(row.net_output_kg  || 0).toLocaleString()} KG`,
        `${Number(row.power_consumed_kwh || 0).toFixed(2)} kWh`,
        fmtKsh(row.exact_power_cost_ksh || 0),
        fmtKsh(row.projected_retail_value || 0),
        {
          content: `${eff.toFixed(1)}%`,
          styles: { textColor: eff < 80 ? [220, 38, 38] : [21, 128, 61], fontStyle: 'bold' as any }
        }
      ];
    }) : [['No internal production data for period', '', '', '', '', '', '', '']],
    theme: 'striped',
    headStyles:         { fillColor: HEAD_SLATE, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: STRIPE_LIGHT },
    margin:             { left: margin, right: margin },
    styles:             { fontSize: 8, cellPadding: 5 },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 36;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4 – EXTERNAL MILLING SERVICE
  // ═══════════════════════════════════════════════════════════════════════════

  if (extProd.length > 0) {
    y = checkPage(y);
    y = sectionHeading(y, '4.', 'External Milling Service');

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Session Code', 'Total Input KG', 'Service Revenue', 'Power (kWh)', 'Power Cost']],
      body: extProd.map(row => [
        fmtDate(row.production_date),
        row.session_code || row.session_id || 'N/A',
        `${Number(row.total_input_kg || 0).toLocaleString()} KG`,
        fmtKsh(row.total_service_revenue || 0),
        `${Number(row.power_consumed_kwh || 0).toFixed(2)} kWh`,
        fmtKsh(row.exact_power_cost_ksh || 0),
      ]),
      theme: 'striped',
      headStyles:         { fillColor: HEAD_DARK, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: STRIPE_LIGHT },
      margin:             { left: margin, right: margin },
      styles:             { fontSize: 8, cellPadding: 5 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 36;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5 – OUTSTANDING DEBTS (Credit Risk)
  // ═══════════════════════════════════════════════════════════════════════════

  y = checkPage(y);
  const sectionNum = extProd.length > 0 ? '5.' : '4.';
  y = sectionHeading(y, sectionNum, 'Outstanding Debts & Credit Risk');

  const totalDebtOutstanding = creditRisk.reduce((s, r) => s + (Number(r.outstanding_balance) || 0), 0);

  autoTable(doc, {
    startY: y,
    head: [['Customer Name', 'Outstanding Balance', 'Overdue Days', 'Last Transaction', 'Risk Status']],
    body: creditRisk.length > 0 ? [
      ...creditRisk.map(row => {
        const isHigh = (row.days_overdue || 0) > 14;
        return [
          row.customer_name || 'Unknown',
          {
            content: fmtKsh(row.outstanding_balance),
            styles: { textColor: isHigh ? [220, 38, 38] : [15, 23, 42], fontStyle: 'bold' as any }
          },
          { content: `${row.days_overdue || 0} days`, styles: { halign: 'right' as any, textColor: isHigh ? [220, 38, 38] : [15, 23, 42] } },
          fmtDate(row.last_transaction_date),
          {
            content: row.risk_status || (isHigh ? 'OVERDUE' : 'ACTIVE'),
            styles: { fontStyle: 'bold' as any, textColor: isHigh ? [220, 38, 38] : [21, 128, 61] }
          }
        ];
      }),
      // Totals row
      [
        { content: 'TOTAL OUTSTANDING', styles: { fontStyle: 'bold' as any, textColor: [30, 58, 138] as any } },
        { content: fmtKsh(totalDebtOutstanding), styles: { fontStyle: 'bold' as any, textColor: [30, 58, 138] as any, halign: 'right' as any } },
        '', '', ''
      ]
    ] : [['No outstanding debts on record', '', '', '', '']],
    theme: 'striped',
    headStyles:         { fillColor: HEAD_DARK, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: STRIPE_RED },
    margin:             { left: margin, right: margin },
    styles:             { fontSize: 8, cellPadding: 5 },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
      2: { halign: 'right' },
      4: { halign: 'center', fontStyle: 'bold' },
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER — page numbers on every page
  // ═══════════════════════════════════════════════════════════════════════════

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Bottom navy bar
    doc.setFillColor(30, 58, 138);
    doc.rect(0, pageH - 18, pageW, 18, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`BokyVent Posho Mill  ·  ${periodLabel}  ·  CONFIDENTIAL`, margin, pageH - 6);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const start = startDate.toISOString().split('T')[0];
  const end   = endDate.toISOString().split('T')[0];
  doc.save(`BokyVent_Manager_Report_${start}_to_${end}.pdf`);
};
