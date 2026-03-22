import { useState } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { FilterCondition, operatorLabels, type Operator, operatorsByFieldType, type FilterFieldType, type EntityType } from "@shared/filter-types";

interface DynamicFieldConfig {
  key: string;
  label: string;
  type: string;
  operators: string[];
  category: string;
  typeAhead?: boolean;
  typeAheadSource?: string;
}

interface UnifiedFilterRowProps {
  condition: FilterCondition;
  entityType: EntityType;
  onChange: (condition: FilterCondition) => void;
  onRemove: () => void;
  dynamicFields?: DynamicFieldConfig[];
  groupedFields?: Record;
}

/**
 * Unified Filter Row Component
 * 
 * Provides compact single-row layout:
 * [Field Dropdown] [Operator Dropdown] [Chip Input] [Remove Button]
 * 
 * Now supports dynamic fields from API including custom fields
 */
export function UnifiedFilterRow({
  condition,
  entityType,
  onChange,
  onRemove,
  dynamicFields = [],
  groupedFields = {}
}: UnifiedFilterRowProps) {
  const [inputValue, setInputValue] = useState("");
  const [showTypeAhead, setShowTypeAhead] = useState(false);
  
  // Find field config from dynamic fields
  const fieldConfig = dynamicFields.find(f => f.key === condition.field);
  
  // Get applicable operators for this field type
  const getApplicableOperators = (fieldType: string): Operator[] => {
    const typeMap: Record = {
      'text': 'text',
      'number': 'number',
      'date': 'date',
      'enum': 'enum',
      'array': 'array',
      'boolean': 'enum'
    };
    const mappedType = typeMap[fieldType] || 'text';
    return operatorsByFieldType[mappedType] || operatorsByFieldType.text;
  };
  
  const applicableOperators = fieldConfig 
    ? (fieldConfig.operators.length > 0 ? fieldConfig.operators as Operator[] : getApplicableOperators(fieldConfig.type))
    : getApplicableOperators('text');
  
  // Fetch type-ahead suggestions if applicable
  const { data: typeAheadOptions } = useQuery({
    queryKey: [`/api/filters/options/${fieldConfig?.typeAheadSource}`, inputValue],
    enabled: !!(fieldConfig?.typeAhead && fieldConfig.typeAheadSource && inputValue.length > 0),
    staleTime: 5 * 60 * 1000
  });

  // Handle field change
  const handleFieldChange = (newField: string) => {
    const newFieldConfig = dynamicFields.find(f => f.key === newField);
    const newOperators = newFieldConfig 
      ? (newFieldConfig.operators.length > 0 ? newFieldConfig.operators as Operator[] : getApplicableOperators(newFieldConfig.type))
      : getApplicableOperators('text');
    const newOperator = newOperators[0] || 'equals';
    onChange({
      ...condition,
      field: newField,
      operator: newOperator,
      values: []
    });
  };

  // Handle operator change
  const handleOperatorChange = (newOperator: Operator) => {
    onChange({
      ...condition,
      operator: newOperator,
      values: (newOperator === 'is_empty' || newOperator === 'has_any_value') ? [] : condition.values
    });
  };

  // Handle adding a value (chip)
  const handleAddValue = (value: string) => {
    if (!value.trim()) return;
    if (condition.values.includes(value)) return;
    
    onChange({
      ...condition,
      values: [...condition.values, value.trim()]
    });
    setInputValue("");
    setShowTypeAhead(false);
  };

  // Handle removing a value (chip)
  const handleRemoveValue = (valueToRemove: string | number) => {
    onChange({
      ...condition,
      values: condition.values.filter(v => v !== valueToRemove)
    });
  };

  // Handle Enter key in input
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddValue(inputValue);
    }
  };

  // Operators that don't need value input
  const needsValueInput = condition.operator !== 'is_empty' && condition.operator !== 'has_any_value';

  // Calculate max values based on field
  const maxValues = condition.field === 'state' || condition.field === 'city' ? 5 : 10;
  const valueCount = condition.values.length;
  const isAtMax = valueCount >= maxValues;

  // Category order for display
  const categoryOrder = [
    'Contact Information',
    'Contact Geography',
    'Account - Firmographic',
    'Account - Technology',
    'Account - Metadata',
    'Account Geography',
    'Company Information',
    'Lists & Segments',
    'Campaigns',
    'Campaign',
    'Email',
    'Call',
    'Ownership',
    'Compliance',
    'Dates',
    'QA & Verification',
    'Verification',
    'Custom Fields',
    'Other'
  ];

  return (
    
      
        {/* Field + Operator Row */}
        
          {/* Field Selector - Grouped by Category */}
          
            
              
            
            
              {categoryOrder.map(category => {
                const fields = groupedFields[category];
                if (!fields || fields.length === 0) return null;

                return (
                  
                    
                      {category}
                    
                    {fields.map((field) => (
                      
                        {field.label}
                      
                    ))}
                  
                );
              })}
              {/* Render any remaining categories not in order */}
              {Object.entries(groupedFields)
                .filter(([cat]) => !categoryOrder.includes(cat))
                .map(([category, fields]) => (
                  
                    
                      {category}
                    
                    {fields.map((field) => (
                      
                        {field.label}
                      
                    ))}
                  
                ))
              }
            
          

          {/* Operator Selector */}
          
            
              
            
            
              {applicableOperators.map((op) => (
                
                  {operatorLabels[op] || op}
                
              ))}
            
          

          {/* Remove button */}
          
            
          
        

        {/* Value Input (Chips) */}
        {needsValueInput && (
          
            
              {/* Chips for selected values */}
              
                {condition.values.map((value, index) => (
                  
                    
                      {String(value)}
                       handleRemoveValue(value)}
                        className="ml-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5 transition-colors"
                        data-testid={`remove-chip-${value}`}
                      >
                        
                      
                    
                  
                ))}
              
              
              {/* Input for adding new values */}
              {!isAtMax && (
                 setInputValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onFocus={() => setShowTypeAhead(true)}
                  onBlur={() => setTimeout(() => setShowTypeAhead(false), 200)}
                  placeholder={condition.values.length === 0 ? "Type value and press Enter" : "Type and press Enter..."}
                  className="flex-1 min-w-[120px] border-0 shadow-none focus-visible:ring-0 p-0 h-auto text-xs font-medium text-slate-800 dark:text-slate-200 placeholder:text-amber-600 dark:placeholder:text-amber-400 placeholder:font-semibold"
                  data-testid="input-value"
                  disabled={isAtMax}
                />
              )}

              {/* Type-ahead suggestions */}
              {showTypeAhead && fieldConfig?.typeAhead && typeAheadOptions?.data && typeAheadOptions.data.length > 0 && (
                
                  {typeAheadOptions.data.slice(0, 10).map((option: { id: string; name: string }) => (
                     handleAddValue(option.name)}
                      data-testid={`typeahead-option-${option.id}`}
                    >
                      {option.name}
                    
                  ))}
                
              )}
            

            {/* Helper text for value count and cap */}
            
              {valueCount > 0 && (
                
                  {fieldConfig?.label || condition.field} ({valueCount}/{maxValues})
                
              )}
              {isAtMax && (
                
                  Max {maxValues} values
                
              )}
            
          
        )}

        {/* Value display for operators that don't need input */}
        {!needsValueInput && (
          
            {operatorLabels[condition.operator]}
          
        )}
      
    
  );
}