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
    
      
        
          Send Invoice {invoiceNumber}
          
            Send this invoice directly to {clientName} via email with a PDF attachment.
          
        

        
          
            Recipient Email
             setEmail(e.target.value)}
              placeholder="client@company.com"
            />
          
          
            Custom Message (optional)
             setMessage(e.target.value)}
              rows={3}
              placeholder="Hi — please find attached your invoice. Let us know if you have any questions."
            />
          
        

        
           onOpenChange(false)}>Cancel
          
            {isLoading ?  : }
            Send Invoice
          
        
      
    
  );
}