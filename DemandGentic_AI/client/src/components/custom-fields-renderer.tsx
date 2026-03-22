import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { CustomFieldDefinition } from "@shared/schema";

interface CustomFieldsRendererProps {
  entityType: "contact" | "account";
  values: Record;
  onChange: (key: string, value: any) => void;
  disabled?: boolean;
}

export function CustomFieldsRenderer({
  entityType,
  values,
  onChange,
  disabled = false,
}: CustomFieldsRendererProps) {
  const { data: allFields } = useQuery({
    queryKey: ['/api/custom-fields'],
  });

  const customFields = allFields?.filter(
    (field) => field.entityType === entityType && field.active
  ) || [];

  if (customFields.length === 0) {
    return null;
  }

  const renderField = (field: CustomFieldDefinition) => {
    const value = values[field.fieldKey];

    switch (field.fieldType) {
      case 'text':
        return (
           onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
            placeholder={field.helpText || ''}
          />
        );

      case 'number':
        return (
           onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
            placeholder={field.helpText || ''}
          />
        );

      case 'email':
        return (
           onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
            placeholder={field.helpText || ''}
          />
        );

      case 'url':
        return (
           onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
            placeholder={field.helpText || ''}
          />
        );

      case 'date':
        return (
           onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
          />
        );

      case 'boolean':
        return (
          
             onChange(field.fieldKey, checked)}
              disabled={disabled}
            />
            {field.helpText}
          
        );

      case 'select':
        const options = field.options as string[] || [];
        return (
           onChange(field.fieldKey, val)}
            disabled={disabled}
          >
            
              
            
            
              {options.map((option) => (
                
                  {option}
                
              ))}
            
          
        );

      case 'multi_select':
        const multiOptions = field.options as string[] || [];
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          
            {multiOptions.map((option) => (
              
                 {
                    const newValues = checked
                      ? [...selectedValues, option]
                      : selectedValues.filter((v) => v !== option);
                    onChange(field.fieldKey, newValues);
                  }}
                  disabled={disabled}
                />
                {option}
              
            ))}
            {field.helpText && (
              {field.helpText}
            )}
          
        );

      default:
        return (
           onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
            placeholder={field.helpText || ''}
          />
        );
    }
  };

  return (
    
      
        Custom Fields
        
          {customFields.map((field) => (
            
              
                {field.displayLabel}
                {field.required && *}
              
              {renderField(field)}
            
          ))}
        
      
    
  );
}