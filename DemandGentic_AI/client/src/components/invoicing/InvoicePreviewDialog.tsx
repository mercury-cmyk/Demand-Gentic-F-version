import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Send } from 'lucide-react';
import { InvoicePage1, type InvoiceData } from './InvoiceDocument';
import { downloadInvoicePDF } from '@/lib/invoice-pdf';

interface InvoicePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceData | null;
  onSend?: (invoice: InvoiceData) => void;
}

export function InvoicePreviewDialog({ open, onOpenChange, invoice, onSend }: InvoicePreviewDialogProps) {
  if (!invoice) return null;

  return (
    
      
        
          Invoice Preview — {invoice.invoiceNumber}
        

        
          
        

        
           { downloadInvoicePDF(invoice); }}>
            
            Download PDF
          
          {onSend && (
             onSend(invoice)}>
              
              Send to Client
            
          )}
        
      
    
  );
}