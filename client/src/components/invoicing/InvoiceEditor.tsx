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
  projects?: Array<{ id: string; name: string; status: string }>;
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
    items: Array<{ description: string; itemType: string; quantity: number; unitPrice: number; projectId?: string; campaignId?: string }>;
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
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId);
  const [items, setItems] = useState<InvoiceLineItem[]>(
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invoice for {clientName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Invoice Number + Project */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Invoice Number</Label>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder={suggestedInvoiceNumber || 'Auto-generated'}
            />
            <p className="text-xs text-muted-foreground">Enter 0 to hide invoice number on the document</p>
          </div>
          <div className="space-y-1">
            <Label>Project</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No specific project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Period */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Period Start</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Period End</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Leave blank for auto (net terms)</p>
          </div>
        </div>

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Line Items</Label>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Description</TableHead>
                <TableHead className="w-[15%]">Type</TableHead>
                <TableHead className="w-[12%] text-right">Qty</TableHead>
                <TableHead className="w-[15%] text-right">Unit Price</TableHead>
                <TableHead className="w-[15%] text-right">Amount</TableHead>
                <TableHead className="w-[8%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      placeholder="Description"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={item.itemType} onValueChange={(v) => updateItem(idx, 'itemType', v)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium text-sm">
                    ${(Number(item.quantity) * Number(item.unitPrice)).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {items.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-7 w-7 p-0 text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Discount + Totals */}
        <div className="flex justify-between items-start">
          <div className="space-y-1 w-48">
            <Label>Discount ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="text-right space-y-1 text-sm">
            <div className="flex justify-between gap-8">
              <span className="text-muted-foreground">Subtotal:</span>
              <span className="font-medium">${subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between gap-8">
                <span className="text-muted-foreground">Discount:</span>
                <span className="text-red-500">−${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between gap-8 font-bold text-base pt-1 border-t">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Payment instructions, special terms, etc."
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
          )}
          <Button onClick={handleSubmit} disabled={isLoading || !periodStart || !periodEnd || items.length === 0}>
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Invoice
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
