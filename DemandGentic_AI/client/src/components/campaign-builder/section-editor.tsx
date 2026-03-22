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
    
      
      {label}
    
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
         onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );

    case 'textarea':
      return (
         onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
        />
      );

    case 'number':
      return (
         onChange(e.target.valueAsNumber)}
          placeholder={field.placeholder}
        />
      );

    case 'array':
      return (
        
      );

    case 'select':
      return (
         onChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
        >
          Select...
          {field.options?.map((opt) => (
            {opt.label}
          ))}
        
      );

    default:
      return (
         onChange(e.target.value)}
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
    
      
        {value.map((item, index) => (
          
            {item}
             removeItem(index)}
              className="ml-1 hover:bg-destructive/20 rounded p-0.5"
            >
              
            
          
        ))}
      
      
         setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Add item...'}
          className="flex-1"
        />
        
          
        
      
    
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
  const [editData, setEditData] = useState(data);
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
    
      
        
          
             setIsPreviewOpen(!isPreviewOpen)}
              className="p-1 hover:bg-muted rounded"
            >
              {isPreviewOpen ? (
                
              ) : (
                
              )}
            
            
              
                {title}
                {isApproved && (
                  
                    
                    Approved
                  
                )}
              
              {description && (
                {description}
              )}
            
          

          
            
            
            {!isEditing && (
              <>
                {onRegenerate && (
                  
                    
                    Regenerate
                  
                )}
                 setIsEditing(true)} className="h-7">
                  
                  Edit
                
              
            )}
          
        
      

      
        {isPreviewOpen && (
          
            
              

              {isEditing ? (
                
                  {schema.fields?.map((field) => (
                    
                      
                        {field.label}
                        {field.required && *}
                      
                      {field.description && (
                        {field.description}
                      )}
                       updateField(field.key, v)}
                      />
                    
                  ))}

                  
                    
                      
                      Save Changes
                    
                    
                      
                      Cancel
                    
                  
                
              ) : hasData ? (
                
                  {/* Render data preview based on schema */}
                  {schema.fields?.map((field) => {
                    const value = data?.[field.key];
                    if (!value || (Array.isArray(value) && value.length === 0)) return null;

                    return (
                      
                        {field.label}:
                        {Array.isArray(value) ? (
                          
                            {value.map((item, i) => (
                              
                                {typeof item === 'object' ? JSON.stringify(item) : item}
                              
                            ))}
                          
                        ) : typeof value === 'object' ? (
                          
                            {JSON.stringify(value, null, 2)}
                          
                        ) : (
                          {value}
                        )}
                      
                    );
                  })}

                  {/* Approval buttons */}
                  {!isApproved && (
                    
                      
                        
                        Approve Section
                      
                      {onReject && (
                        
                          
                          Reject & Redo
                        
                      )}
                    
                  )}
                
              ) : (
                
                  
                  No data yet
                   setIsEditing(true)}
                    className="mt-2"
                  >
                    
                    Add Content
                  
                
              )}
            
          
        )}
      
    
  );
}

// ============================================================
// SECTION SCHEMAS
// ============================================================

export const SECTION_SCHEMAS: Record = {
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