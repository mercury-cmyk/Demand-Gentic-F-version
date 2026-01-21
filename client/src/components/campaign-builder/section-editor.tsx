/**
 * Campaign Section Editor
 * 
 * Editable section viewer with:
 * - Source attribution (user/AI/system)
 * - Edit mode with rich editing
 * - Approval workflow
 * - Change tracking
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Edit3,
  Save,
  X,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  User,
  Settings,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Plus,
  Trash2,
  GripVertical,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { ContentSource } from '@shared/campaign-context-types';

// ============================================================
// TYPES
// ============================================================

interface SectionEditorProps {
  sectionKey: string;
  title: string;
  description?: string;
  data: any;
  schema: SectionSchema;
  source?: ContentSource;
  isApproved: boolean;
  onSave: (data: any) => void;
  onApprove: () => void;
  onReject?: () => void;
  onRegenerate?: () => void;
}

interface SectionSchema {
  type: 'object' | 'array' | 'string' | 'rich';
  fields?: FieldSchema[];
  itemSchema?: FieldSchema[];
}

interface FieldSchema {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'array' | 'select' | 'number' | 'boolean';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  description?: string;
}

// ============================================================
// SOURCE BADGE
// ============================================================

function SourceBadge({ source }: { source?: ContentSource }) {
  if (!source) return null;

  const getSourceInfo = () => {
    switch (source.type) {
      case 'user_provided':
        return { icon: User, label: 'User Provided', color: 'bg-blue-500/10 text-blue-600' };
      case 'ai_generated':
        return {
          icon: Sparkles,
          label: `AI Generated (${Math.round((source.confidence || 0) * 100)}%)`,
          color: 'bg-purple-500/10 text-purple-600'
        };
      case 'system_recommendation':
        return { icon: Settings, label: 'System Recommendation', color: 'bg-gray-500/10 text-gray-600' };
      default:
        return { icon: AlertCircle, label: 'Unknown', color: 'bg-yellow-500/10 text-yellow-600' };
    }
  };

  const { icon: Icon, label, color } = getSourceInfo();

  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", color)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

// ============================================================
// FIELD EDITOR
// ============================================================

interface FieldEditorProps {
  field: FieldSchema;
  value: any;
  onChange: (value: any) => void;
}

function FieldEditor({ field, value, onChange }: FieldEditorProps) {
  switch (field.type) {
    case 'text':
      return (
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );

    case 'textarea':
      return (
        <Textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          placeholder={field.placeholder}
        />
      );

    case 'array':
      return (
        <ArrayEditor
          value={value || []}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      );

    case 'select':
      return (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );

    default:
      return (
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

// ============================================================
// ARRAY EDITOR
// ============================================================

interface ArrayEditorProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

function ArrayEditor({ value, onChange, placeholder }: ArrayEditorProps) {
  const [newItem, setNewItem] = useState('');

  const addItem = () => {
    if (newItem.trim()) {
      onChange([...value, newItem.trim()]);
      setNewItem('');
    }
  };

  const removeItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((item, index) => (
          <Badge key={index} variant="secondary" className="gap-1 pr-1">
            {item}
            <button
              onClick={() => removeItem(index)}
              className="ml-1 hover:bg-destructive/20 rounded p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Add item...'}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN SECTION EDITOR
// ============================================================

export function SectionEditor({
  sectionKey,
  title,
  description,
  data,
  schema,
  source,
  isApproved,
  onSave,
  onApprove,
  onReject,
  onRegenerate,
}: SectionEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>(data);
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);

  const handleSave = () => {
    onSave(editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData(data);
    setIsEditing(false);
  };

  const updateField = (key: string, value: any) => {
    setEditData((prev: any) => ({
      ...prev,
      [key]: value,
    }));
  };

  const hasData = data && Object.keys(data).filter(k => !k.startsWith('_')).length > 0;

  return (
    <Card className={cn(
      "transition-all",
      isApproved && "border-green-500/50 bg-green-500/5",
      isEditing && "ring-2 ring-primary"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPreviewOpen(!isPreviewOpen)}
              className="p-1 hover:bg-muted rounded"
            >
              {isPreviewOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">{title}</CardTitle>
                {isApproved && (
                  <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Approved
                  </Badge>
                )}
              </div>
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SourceBadge source={source} />
            
            {!isEditing && (
              <>
                {onRegenerate && (
                  <Button variant="ghost" size="sm" onClick={onRegenerate} className="h-7">
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Regenerate
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="h-7">
                  <Edit3 className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <CardContent className="pt-0">
              <Separator className="mb-4" />

              {isEditing ? (
                <div className="space-y-4">
                  {schema.fields?.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label className="text-xs">
                        {field.label}
                        {field.required && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      {field.description && (
                        <p className="text-[10px] text-muted-foreground">{field.description}</p>
                      )}
                      <FieldEditor
                        field={field}
                        value={editData?.[field.key]}
                        onChange={(v) => updateField(field.key, v)}
                      />
                    </div>
                  ))}

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handleSave}>
                      <Save className="h-3 w-3 mr-1" />
                      Save Changes
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCancel}>
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : hasData ? (
                <div className="space-y-3">
                  {/* Render data preview based on schema */}
                  {schema.fields?.map((field) => {
                    const value = data?.[field.key];
                    if (!value || (Array.isArray(value) && value.length === 0)) return null;

                    return (
                      <div key={field.key} className="text-sm">
                        <span className="text-xs text-muted-foreground">{field.label}:</span>
                        {Array.isArray(value) ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {value.map((item, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {typeof item === 'object' ? JSON.stringify(item) : item}
                              </Badge>
                            ))}
                          </div>
                        ) : typeof value === 'object' ? (
                          <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          <p className="text-sm">{value}</p>
                        )}
                      </div>
                    );
                  })}

                  {/* Approval buttons */}
                  {!isApproved && (
                    <div className="flex gap-2 pt-3 border-t mt-4">
                      <Button
                        size="sm"
                        onClick={onApprove}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <ThumbsUp className="h-3 w-3 mr-1" />
                        Approve Section
                      </Button>
                      {onReject && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onReject}
                        >
                          <ThumbsDown className="h-3 w-3 mr-1" />
                          Reject & Redo
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No data yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="mt-2"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Content
                  </Button>
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ============================================================
// SECTION SCHEMAS
// ============================================================

export const SECTION_SCHEMAS: Record<string, SectionSchema> = {
  objectives: {
    type: 'object',
    fields: [
      { key: 'primaryGoal', label: 'Primary Goal', type: 'textarea', required: true, placeholder: 'What is the main objective of this campaign?' },
      { key: 'secondaryGoals', label: 'Secondary Goals', type: 'array', placeholder: 'Add a secondary goal' },
      { key: 'desiredOutcomes', label: 'Desired Outcomes', type: 'array', placeholder: 'Add an outcome' },
      { key: 'kpis', label: 'Key Performance Indicators', type: 'array', placeholder: 'Add a KPI' },
    ],
  },
  targetAudience: {
    type: 'object',
    fields: [
      { key: 'industries', label: 'Target Industries', type: 'array', placeholder: 'Add an industry' },
      { key: 'regions', label: 'Geographic Regions', type: 'array', placeholder: 'Add a region' },
      { key: 'companySizeMin', label: 'Min Company Size (employees)', type: 'number', placeholder: '10' },
      { key: 'companySizeMax', label: 'Max Company Size (employees)', type: 'number', placeholder: '1000' },
      { key: 'jobTitles', label: 'Target Job Titles', type: 'array', required: true, placeholder: 'Add a job title' },
      { key: 'jobFunctions', label: 'Job Functions', type: 'array', placeholder: 'Add a function' },
      { 
        key: 'seniorityLevels', 
        label: 'Seniority Levels', 
        type: 'array', 
        placeholder: 'Add seniority level',
        description: 'e.g., entry, mid, senior, director, vp, c_level'
      },
    ],
  },
  coreMessage: {
    type: 'string',
    fields: [
      { key: 'message', label: 'Core Message', type: 'textarea', required: true, placeholder: 'The main value proposition and pitch for this campaign' },
    ],
  },
  successIndicators: {
    type: 'object',
    fields: [
      { key: 'primarySuccess', label: 'Primary Success Indicator', type: 'textarea', required: true, placeholder: 'What defines success for this campaign?' },
      { key: 'secondarySuccess', label: 'Secondary Success Indicators', type: 'array', placeholder: 'Add a success indicator' },
      { key: 'qualifiedLeadDefinition', label: 'Qualified Lead Definition', type: 'textarea', required: true, placeholder: 'What makes a lead qualified?' },
    ],
  },
  qualificationCriteria: {
    type: 'object',
    fields: [
      { key: 'qualifyingConditions', label: 'Qualifying Conditions', type: 'array', placeholder: 'Add a qualifying condition' },
      { key: 'disqualifyingConditions', label: 'Disqualifying Conditions', type: 'array', placeholder: 'Add a disqualifying condition' },
      { key: 'customRules', label: 'Custom Rules', type: 'textarea', placeholder: 'Any additional qualification rules' },
    ],
  },
};

export default SectionEditor;
