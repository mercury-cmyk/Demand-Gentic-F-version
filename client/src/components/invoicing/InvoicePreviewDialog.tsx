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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[860px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice Preview — {invoice.invoiceNumber}</DialogTitle>
        </DialogHeader>

        <div className="border rounded-lg overflow-auto max-h-[65vh]">
          <InvoicePage1 invoice={invoice} />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { downloadInvoicePDF(invoice); }}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          {onSend && (
            <Button onClick={() => onSend(invoice)}>
              <Send className="h-4 w-4 mr-2" />
              Send to Client
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
