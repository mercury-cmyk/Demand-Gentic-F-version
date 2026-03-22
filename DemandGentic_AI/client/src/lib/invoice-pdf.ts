import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InvoiceData } from '@/components/invoicing/InvoiceDocument';

function fmt(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function fmtDate(d: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Load an image from a URL and return its base64 data URL + natural dimensions. */
async function loadImageAsBase64(url: string): Promise {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return { data: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return null;
  }
}

/**
 * Generate a clean, minimal, professional single-page PDF invoice.
 * Returns a Blob suitable for download or email attachment.
 */
export async function generateInvoicePDF(invoice: InvoiceData): Promise {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  // Preload logo
  const logoResult = await loadImageAsBase64('/pivotal-b2b-logo.png');

  const showInvNum = invoice.invoiceNumber && invoice.invoiceNumber !== '0' && !invoice.invoiceNumber.startsWith('NOINV-');

  // ===== HEADER =====

  // Left — Logo + Company Name + Address (preserve aspect ratio)
  const logoH = 42;
  if (logoResult) {
    const aspect = logoResult.width / logoResult.height;
    const logoW = logoH * aspect;
    doc.addImage(logoResult.data, 'PNG', margin, y - 4, logoW, logoH);
  }
  const companyTextY = logoResult ? y + 46 : y + 4;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40);
  doc.text('Pivotal B2B LLC', margin, companyTextY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text('16192 Coastal Highway', margin, companyTextY + 12);
  doc.text('Lewes, DE 19958, USA', margin, companyTextY + 22);

  // Right — INVOICE title + number + issue date
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30);
  doc.text('INVOICE', pageW - margin, y + 6, { align: 'right' });

  let headerRightY = y + 24;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  if (showInvNum) {
    doc.text(`Invoice No: ${invoice.invoiceNumber}`, pageW - margin, headerRightY, { align: 'right' });
    headerRightY += 13;
  }
  doc.text(`Issue Date: ${fmtDate(invoice.issueDate)}`, pageW - margin, headerRightY, { align: 'right' });

  // Separator
  y = companyTextY + 36;
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 18;

  // ===== BILLED TO =====
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(130);
  doc.text('BILLED TO:', margin, y);
  y += 13;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30);
  doc.text(invoice.clientName, margin, y);
  y += 13;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  if (invoice.clientCompany) { doc.text(invoice.clientCompany, margin, y); y += 12; }
  if (invoice.clientEmail) { doc.text(invoice.clientEmail, margin, y); y += 12; }
  if (invoice.clientPhone) { doc.text(invoice.clientPhone, margin, y); y += 12; }
  if (invoice.billingAddress) {
    const addrLines = invoice.billingAddress.split('\n');
    for (const line of addrLines) { doc.text(line, margin, y); y += 11; }
  }
  y += 8;

  // ===== INVOICE INFORMATION =====
  const infoStartY = y;
  const col1X = margin;
  const col2X = margin + 150;
  const col3X = margin + 300;

  const drawInfoBlock = (label: string, value: string, x: number, yPos: number) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130);
    doc.text(label, x, yPos);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40);
    doc.text(value, x, yPos + 12);
  };

  drawInfoBlock('Issue Date', fmtDate(invoice.issueDate), col1X, infoStartY);
  drawInfoBlock('Due Date', fmtDate(invoice.dueDate), col2X, infoStartY);
  drawInfoBlock('Billing Period', `${fmtDate(invoice.billingPeriodStart)} — ${fmtDate(invoice.billingPeriodEnd)}`, col3X, infoStartY);

  y = infoStartY + 30;

  // ===== LINE ITEMS TABLE =====
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Item', 'Quantity', 'Unit Price', 'Total']],
    body: invoice.items.map((item) => [
      item.description,
      item.quantity.toLocaleString(),
      fmt(item.unitPrice, invoice.currency),
      fmt(item.amount, invoice.currency),
    ]),
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [40, 40, 40],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 6,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [60, 60, 60],
      cellPadding: 6,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 60 },
      2: { halign: 'right', cellWidth: 80 },
      3: { halign: 'right', cellWidth: 80, fontStyle: 'bold', textColor: [30, 30, 30] },
    },
    theme: 'plain',
    styles: { lineColor: [220, 220, 220], lineWidth: 0 },
    didDrawPage: (data: any) => {
      // Draw bottom border under header row
      const headY = data.table.head[0].cells[0].y + data.table.head[0].cells[0].height;
      doc.setDrawColor(40);
      doc.setLineWidth(1.2);
      doc.line(margin, headY, pageW - margin, headY);
    },
    willDrawCell: (data: any) => {
      // Draw thin bottom border on each body row
      if (data.section === 'body') {
        const cellBottom = data.cell.y + data.cell.height;
        doc.setDrawColor(230);
        doc.setLineWidth(0.3);
        doc.line(margin, cellBottom, pageW - margin, cellBottom);
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 18;

  // ===== TOTALS =====
  const totalsX = pageW - margin - 160;
  const valX = pageW - margin;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Subtotal:', totalsX, y);
  doc.text(fmt(invoice.subtotal, invoice.currency), valX, y, { align: 'right' });
  y += 14;

  if (invoice.discountAmount > 0) {
    doc.setTextColor(200, 60, 60);
    doc.text('Discount:', totalsX, y);
    doc.text(`−${fmt(invoice.discountAmount, invoice.currency)}`, valX, y, { align: 'right' });
    doc.setTextColor(100);
    y += 14;
  }

  if (invoice.taxAmount > 0) {
    doc.text('Tax:', totalsX, y);
    doc.text(fmt(invoice.taxAmount, invoice.currency), valX, y, { align: 'right' });
    y += 14;
  }

  // Separator line
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y, valX, y);
  y += 14;

  // Total Due — bold and larger
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30);
  doc.text('Total Due:', totalsX, y);
  doc.text(fmt(invoice.totalAmount, invoice.currency), valX, y, { align: 'right' });
  y += 16;

  if (invoice.amountPaid > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 139, 34);
    doc.text('Amount Paid:', totalsX, y);
    doc.text(`−${fmt(invoice.amountPaid, invoice.currency)}`, valX, y, { align: 'right' });
    y += 14;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30);
    doc.text('Balance Due:', totalsX, y);
    doc.text(fmt(invoice.totalAmount - invoice.amountPaid, invoice.currency), valX, y, { align: 'right' });
    y += 16;
  }

  // ===== NOTES =====
  if (invoice.notes) {
    y += 4;
    const noteLines = doc.splitTextToSize(invoice.notes, pageW - margin * 2 - 16);
    const noteHeight = noteLines.length * 11 + 22;
    doc.setFillColor(248, 248, 248);
    doc.setDrawColor(220);
    doc.roundedRect(margin, y, pageW - margin * 2, noteHeight, 3, 3, 'FD');
    y += 13;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(130);
    doc.text('NOTES', margin + 8, y);
    y += 11;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.setFontSize(8);
    doc.text(noteLines, margin + 8, y);
    y += noteLines.length * 11 + 6;
  }

  // ===== PAYMENT INFORMATION (pinned to bottom) =====
  const payStartY = pageH - 190;

  // Separator line
  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(margin, payStartY, pageW - margin, payStartY);

  let pY = payStartY + 16;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30);
  doc.text('PAYMENT INFORMATION', margin, pY);
  pY += 18;

  // 2-column layout for payment details
  const payCol1 = margin;
  const payCol2 = pageW / 2 + 10;

  const drawPayField = (label: string, value: string, x: number, yPos: number, mono = false) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130);
    doc.text(label, x, yPos);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', mono ? 'bold' : 'normal');
    doc.setTextColor(40);
    doc.text(value, x, yPos + 11);
  };

  // Row 1
  drawPayField('SWIFT / BIC Code', 'CHFGUS44021', payCol1, pY, true);
  drawPayField('ABA Routing Number', '091311229', payCol2, pY, true);
  pY += 28;

  // Row 2
  drawPayField('Bank Name', 'Choice Financial Group', payCol1, pY);
  // Bank Address — multi-line
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(130);
  doc.text('Bank Address', payCol2, pY);
  doc.setFontSize(8.5);
  doc.setTextColor(60);
  doc.text('4501 23rd Avenue S', payCol2, pY + 11);
  doc.text('Fargo, ND 58104, USA', payCol2, pY + 21);
  pY += 38;

  // Row 3
  drawPayField('IBAN / Account Number', '202556901478', payCol1, pY, true);
  drawPayField('Beneficiary Name', 'Pivotal B2B LLC', payCol2, pY);
  pY += 28;

  // Beneficiary Address
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(130);
  doc.text('Beneficiary Address', payCol1, pY);
  doc.setFontSize(8.5);
  doc.setTextColor(60);
  doc.text('16192 Coastal Highway, Lewes, DE 19958, USA', payCol1, pY + 11);

  // ===== FOOTER =====
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80);
  doc.text('Thank you for your business!', pageW / 2, pageH - 38, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150);
  doc.text('Please include the invoice number in the wire transfer reference.', pageW / 2, pageH - 26, { align: 'center' });

  return doc.output('blob');
}

/**
 * Trigger a browser download of the invoice PDF.
 */
export async function downloadInvoicePDF(invoice: InvoiceData) {
  const blob = await generateInvoicePDF(invoice);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename = invoice.invoiceNumber && invoice.invoiceNumber !== '0' && !invoice.invoiceNumber.startsWith('NOINV-')
    ? `${invoice.invoiceNumber}.pdf`
    : `invoice-${invoice.id || 'draft'}.pdf`;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}