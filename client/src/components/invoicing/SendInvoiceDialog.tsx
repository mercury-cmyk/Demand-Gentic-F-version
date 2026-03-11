import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';

interface SendInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNumber: string;
  clientEmail: string;
  clientName: string;
  isLoading: boolean;
  onSend: (data: { recipientEmail: string; message?: string }) => void;
}

export function SendInvoiceDialog({
  open,
  onOpenChange,
  invoiceNumber,
  clientEmail,
  clientName,
  isLoading,
  onSend,
}: SendInvoiceDialogProps) {
  const [email, setEmail] = useState(clientEmail);
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (!email) return;
    onSend({ recipientEmail: email, message: message || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Invoice {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Send this invoice directly to {clientName} via email with a PDF attachment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Recipient Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@company.com"
            />
          </div>
          <div className="space-y-1">
            <Label>Custom Message (optional)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Hi — please find attached your invoice. Let us know if you have any questions."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={isLoading || !email}>
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
