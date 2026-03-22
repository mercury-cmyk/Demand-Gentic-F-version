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
export const InvoicePage1 = forwardRef(
  ({ invoice }, ref) => {
    const showInvNum = invoice.invoiceNumber && invoice.invoiceNumber !== '0' && !invoice.invoiceNumber.startsWith('NOINV-');

    return (
      

        {/* ===== HEADER ===== */}
        
          {/* Left: Logo + Company Info */}
          
            
            {PIVOTAL_B2B.name}
            
              {PIVOTAL_B2B.address}
              {PIVOTAL_B2B.city}, {PIVOTAL_B2B.state} {PIVOTAL_B2B.zip}, {PIVOTAL_B2B.country}
            
          
          {/* Right: INVOICE title + number + issue date */}
          
            INVOICE
            {showInvNum && (
              Invoice No: {invoice.invoiceNumber}
            )}
            Issue Date: {formatDate(invoice.issueDate)}
          
        

        {/* Thin separator */}
        

        {/* ===== BILLED TO ===== */}
        
          Billed To:
          {invoice.clientName}
          {invoice.clientCompany && {invoice.clientCompany}}
          {invoice.clientEmail && {invoice.clientEmail}}
          {invoice.clientPhone && {invoice.clientPhone}}
          {invoice.billingAddress && {invoice.billingAddress}}
        

        {/* ===== INVOICE INFORMATION ===== */}
        
          
            
              Issue Date
              {formatDate(invoice.issueDate)}
            
            
              Due Date
              {formatDate(invoice.dueDate)}
            
            
              Billing Period
              {formatDate(invoice.billingPeriodStart)} — {formatDate(invoice.billingPeriodEnd)}
            
          
        

        {/* ===== LINE ITEMS TABLE ===== */}
        
          
            
              Item
              Quantity
              Unit Price
              Total
            
          
          
            {invoice.items.map((item, idx) => (
              
                {item.description}
                {item.quantity.toLocaleString()}
                {formatCurrency(item.unitPrice, invoice.currency)}
                {formatCurrency(item.amount, invoice.currency)}
              
            ))}
          
        

        {/* ===== TOTALS ===== */}
        
          
            
              Subtotal:
              {formatCurrency(invoice.subtotal, invoice.currency)}
            
            {invoice.discountAmount > 0 && (
              
                Discount:
                −{formatCurrency(invoice.discountAmount, invoice.currency)}
              
            )}
            {invoice.taxAmount > 0 && (
              
                Tax:
                {formatCurrency(invoice.taxAmount, invoice.currency)}
              
            )}
            
              Total Due:
              {formatCurrency(invoice.totalAmount, invoice.currency)}
            
            {invoice.amountPaid > 0 && (
              
                
                  Amount Paid:
                  −{formatCurrency(invoice.amountPaid, invoice.currency)}
                
                
                  Balance Due:
                  {formatCurrency(invoice.totalAmount - invoice.amountPaid, invoice.currency)}
                
              
            )}
          
        

        {/* Notes (if present) */}
        {invoice.notes && (
          
            Notes
            {invoice.notes}
          
        )}

        {/* Spacer pushes payment info + footer to page bottom */}
        

        {/* ===== PAYMENT INFORMATION ===== */}
        
          Payment Information
          
            
              SWIFT / BIC Code
              CHFGUS44021
            
            
              ABA Routing Number
              091311229
            
            
              Bank Name
              Choice Financial Group
            
            
              Bank Address
              4501 23rd Avenue SFargo, ND 58104USA
            
            
              IBAN / Account Number
              202556901478
            
            
              Beneficiary Name
              Pivotal B2B LLC
            
            
              Beneficiary Address
              16192 Coastal HighwayLewes, DE 19958USA
            
          
        

        {/* ===== FOOTER ===== */}
        
          Thank you for your business!
          Please include the invoice number in the wire transfer reference.
        
      
    );
  }
);