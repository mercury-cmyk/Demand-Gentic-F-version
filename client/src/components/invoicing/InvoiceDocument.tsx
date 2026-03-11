import { forwardRef } from 'react';

export interface InvoiceLineItem {
  id?: string;
  description: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  projectId?: string;
  campaignId?: string;
}

export interface InvoiceData {
  id?: string;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  clientName: string;
  clientCompany?: string;
  clientEmail?: string;
  clientPhone?: string;
  billingAddress?: string;
  items: InvoiceLineItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  amountPaid: number;
  currency: string;
  notes?: string;
  paymentTermsDays?: number;
}

const PIVOTAL_B2B = {
  name: 'Pivotal B2B LLC',
  address: '16192 Coastal Highway',
  city: 'Lewes',
  state: 'DE',
  zip: '19958',
  country: 'USA',
};

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  // Parse as local date to avoid timezone offset (UTC midnight → previous day in local TZ)
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Printable invoice — clean, minimal, professional single-page layout.
 */
export const InvoicePage1 = forwardRef<HTMLDivElement, { invoice: InvoiceData }>(
  ({ invoice }, ref) => {
    const showInvNum = invoice.invoiceNumber && invoice.invoiceNumber !== '0' && !invoice.invoiceNumber.startsWith('NOINV-');

    return (
      <div ref={ref} className="bg-white text-gray-900 max-w-[800px] mx-auto print:p-0 flex flex-col" style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", minHeight: '1056px', padding: '48px' }}>

        {/* ===== HEADER ===== */}
        <div className="flex justify-between items-start mb-8">
          {/* Left: Logo + Company Info */}
          <div>
            <img src="/pivotal-b2b-logo.png" alt="Pivotal B2B" className="h-14 w-auto object-contain mb-2" />
            <p className="text-sm font-semibold text-gray-800">{PIVOTAL_B2B.name}</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              {PIVOTAL_B2B.address}<br />
              {PIVOTAL_B2B.city}, {PIVOTAL_B2B.state} {PIVOTAL_B2B.zip}, {PIVOTAL_B2B.country}
            </p>
          </div>
          {/* Right: INVOICE title + number + issue date */}
          <div className="text-right">
            <h1 className="text-3xl font-extrabold tracking-wide text-gray-900">INVOICE</h1>
            {showInvNum && (
              <p className="text-sm text-gray-600 mt-1">Invoice No: <span className="font-medium">{invoice.invoiceNumber}</span></p>
            )}
            <p className="text-sm text-gray-600 mt-0.5">Issue Date: <span className="font-medium">{formatDate(invoice.issueDate)}</span></p>
          </div>
        </div>

        {/* Thin separator */}
        <div className="h-px bg-gray-200 mb-6" />

        {/* ===== BILLED TO ===== */}
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Billed To:</h3>
          <p className="text-sm font-semibold text-gray-900">{invoice.clientName}</p>
          {invoice.clientCompany && <p className="text-sm text-gray-700">{invoice.clientCompany}</p>}
          {invoice.clientEmail && <p className="text-sm text-gray-600">{invoice.clientEmail}</p>}
          {invoice.clientPhone && <p className="text-sm text-gray-600">{invoice.clientPhone}</p>}
          {invoice.billingAddress && <p className="text-sm text-gray-600 whitespace-pre-line mt-0.5">{invoice.billingAddress}</p>}
        </div>

        {/* ===== INVOICE INFORMATION ===== */}
        <div className="mb-6 text-sm">
          <div className="grid grid-cols-3 gap-4 max-w-md">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Issue Date</p>
              <p className="font-medium text-gray-800">{formatDate(invoice.issueDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Due Date</p>
              <p className="font-medium text-gray-800">{formatDate(invoice.dueDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Billing Period</p>
              <p className="font-medium text-gray-800">{formatDate(invoice.billingPeriodStart)} — {formatDate(invoice.billingPeriodEnd)}</p>
            </div>
          </div>
        </div>

        {/* ===== LINE ITEMS TABLE ===== */}
        <table className="w-full mb-5 border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-2.5 pr-3 font-semibold text-gray-800">Item</th>
              <th className="text-center py-2.5 px-3 font-semibold text-gray-800">Quantity</th>
              <th className="text-right py-2.5 px-3 font-semibold text-gray-800">Unit Price</th>
              <th className="text-right py-2.5 pl-3 font-semibold text-gray-800">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                <td className="py-2.5 pr-3 text-gray-800">{item.description}</td>
                <td className="py-2.5 px-3 text-center text-gray-700">{item.quantity.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right text-gray-700">{formatCurrency(item.unitPrice, invoice.currency)}</td>
                <td className="py-2.5 pl-3 text-right font-medium text-gray-900">{formatCurrency(item.amount, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ===== TOTALS ===== */}
        <div className="flex justify-end mb-5">
          <div className="w-56">
            <div className="flex justify-between text-sm text-gray-600 py-1">
              <span>Subtotal:</span>
              <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            {invoice.discountAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-600 py-1">
                <span>Discount:</span>
                <span className="text-red-500">−{formatCurrency(invoice.discountAmount, invoice.currency)}</span>
              </div>
            )}
            {invoice.taxAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-600 py-1">
                <span>Tax:</span>
                <span>{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
              </div>
            )}
            <div className="border-t border-gray-300 mt-1 pt-2 flex justify-between text-base font-bold text-gray-900">
              <span>Total Due:</span>
              <span>{formatCurrency(invoice.totalAmount, invoice.currency)}</span>
            </div>
            {invoice.amountPaid > 0 && (
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between text-green-600">
                  <span>Amount Paid:</span>
                  <span>−{formatCurrency(invoice.amountPaid, invoice.currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900">
                  <span>Balance Due:</span>
                  <span>{formatCurrency(invoice.totalAmount - invoice.amountPaid, invoice.currency)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes (if present) */}
        {invoice.notes && (
          <div className="mb-4 p-3 rounded border border-gray-200 bg-gray-50">
            <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Notes</p>
            <p className="text-sm text-gray-600 whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}

        {/* Spacer pushes payment info + footer to page bottom */}
        <div className="flex-1" />

        {/* ===== PAYMENT INFORMATION ===== */}
        <div className="border-t border-gray-300 pt-5 mt-6">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800 mb-4">Payment Information</h3>
          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">SWIFT / BIC Code</p>
              <p className="font-medium text-gray-800 font-mono">CHFGUS44021</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">ABA Routing Number</p>
              <p className="font-medium text-gray-800 font-mono">091311229</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Bank Name</p>
              <p className="font-medium text-gray-800">Choice Financial Group</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Bank Address</p>
              <p className="text-gray-700">4501 23rd Avenue S<br />Fargo, ND 58104<br />USA</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">IBAN / Account Number</p>
              <p className="font-medium text-gray-800 font-mono">202556901478</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Beneficiary Name</p>
              <p className="font-medium text-gray-800">Pivotal B2B LLC</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-500">Beneficiary Address</p>
              <p className="text-gray-700">16192 Coastal Highway<br />Lewes, DE 19958<br />USA</p>
            </div>
          </div>
        </div>

        {/* ===== FOOTER ===== */}
        <div className="mt-6 pt-4 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-600 font-medium">Thank you for your business!</p>
          <p className="text-xs text-gray-400 mt-1">Please include the invoice number in the wire transfer reference.</p>
        </div>
      </div>
    );
  }
);
