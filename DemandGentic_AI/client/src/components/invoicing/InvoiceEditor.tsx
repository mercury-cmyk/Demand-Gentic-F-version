import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import type { InvoiceLineItem } from './InvoiceDocument';

const ITEM_TYPES = [
  { value: 'leads', label: 'Leads' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'ai_calls', label: 'AI Calls' },
  { value: 'emails', label: 'Emails' },
  { value: 'retainer', label: 'Retainer' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'other', label: 'Other' },
];

interface InvoiceEditorProps {
  clientId: string;
  clientName: string;
  /** Available projects for this client */
  projects?: Array;
  /** Suggested next invoice number */
  suggestedInvoiceNumber?: string;
  /** Pre-populated items (e.g. from auto-generation) */
  initialItems?: InvoiceLineItem[];
  initialPeriodStart?: string;
  initialPeriodEnd?: string;
  initialDueDate?: string;
  initialNotes?: string;
  initialDiscount?: number;
  initialProjectId?: string;
  isLoading?: boolean;
  onSave: (data: {
    clientAccountId: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    dueDate?: string;
    invoiceNumber?: string;
    projectId?: string;
    items: Array;
    notes?: string;
    discountAmount?: number;
  }) => void;
  onCancel?: () => void;
}

export function InvoiceEditor({
  clientId,
  clientName,
  projects = [],
  suggestedInvoiceNumber = '',
  initialItems = [],
  initialPeriodStart = '',
  initialPeriodEnd = '',
  initialDueDate = '',
  initialNotes = '',
  initialDiscount = 0,
  initialProjectId = '',
  isLoading = false,
  onSave,
  onCancel,
}: InvoiceEditorProps) {
  const [periodStart, setPeriodStart] = useState(initialPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriodEnd);
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [notes, setNotes] = useState(initialNotes);
  const [discount, setDiscount] = useState(initialDiscount);
  const [invoiceNumber, setInvoiceNumber] = useState(suggestedInvoiceNumber);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [items, setItems] = useState(
    initialItems.length > 0
      ? initialItems
      : [{ description: '', itemType: 'leads', quantity: 1, unitPrice: 0, amount: 0 }]
  );

  const updateItem = useCallback((index: number, field: keyof InvoiceLineItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        item.amount = Number(item.quantity) * Number(item.unitPrice);
      }
      updated[index] = item;
      return updated;
    });
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { description: '', itemType: 'leads', quantity: 1, unitPrice: 0, amount: 0 }]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);
  const total = subtotal - discount;

  const handleSubmit = () => {
    if (!periodStart || !periodEnd || items.length === 0) return;
    onSave({
      clientAccountId: clientId,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      dueDate: dueDate || undefined,
      invoiceNumber: invoiceNumber || undefined,
      projectId: selectedProjectId && selectedProjectId !== '__none' ? selectedProjectId : undefined,
      items: items.map((item) => ({
        description: item.description,
        itemType: item.itemType,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        projectId: item.projectId,
        campaignId: item.campaignId,
      })),
      notes: notes || undefined,
      discountAmount: discount > 0 ? discount : undefined,
    });
  };

  return (
    
      
        Invoice for {clientName}
      
      
        {/* Invoice Number + Project */}
        
          
            Invoice Number
             setInvoiceNumber(e.target.value)}
              placeholder={suggestedInvoiceNumber || 'Auto-generated'}
            />
            Enter 0 to hide invoice number on the document
          
          
            Project
            
              
                
              
              
                No specific project
                {projects.map((p) => (
                  {p.name}
                ))}
              
            
          
        

        {/* Period */}
        
          
            Period Start
             setPeriodStart(e.target.value)} />
          
          
            Period End
             setPeriodEnd(e.target.value)} />
          
          
            Due Date
             setDueDate(e.target.value)} />
            Leave blank for auto (net terms)
          
        

        {/* Line Items */}
        
          
            Line Items
            
               Add Item
            
          
          
            
              
                Description
                Type
                Qty
                Unit Price
                Amount
                
              
            
            
              {items.map((item, idx) => (
                
                  
                     updateItem(idx, 'description', e.target.value)}
                      placeholder="Description"
                      className="h-8 text-sm"
                    />
                  
                  
                     updateItem(idx, 'itemType', v)}>
                      
                        
                      
                      
                        {ITEM_TYPES.map((t) => (
                          {t.label}
                        ))}
                      
                    
                  
                  
                     updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm text-right"
                    />
                  
                  
                     updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm text-right"
                    />
                  
                  
                    ${(Number(item.quantity) * Number(item.unitPrice)).toFixed(2)}
                  
                  
                    {items.length > 1 && (
                       removeItem(idx)} className="h-7 w-7 p-0 text-red-500">
                        
                      
                    )}
                  
                
              ))}
            
          
        

        {/* Discount + Totals */}
        
          
            Discount ($)
             setDiscount(parseFloat(e.target.value) || 0)}
            />
          
          
            
              Subtotal:
              ${subtotal.toFixed(2)}
            
            {discount > 0 && (
              
                Discount:
                −${discount.toFixed(2)}
              
            )}
            
              Total:
              ${total.toFixed(2)}
            
          
        

        {/* Notes */}
        
          Notes (optional)
           setNotes(e.target.value)}
            rows={2}
            placeholder="Payment instructions, special terms, etc."
          />
        

        {/* Actions */}
        
          {onCancel && (
            Cancel
          )}
          
            {isLoading ?  : }
            Save Invoice
          
        
      
    
  );
}