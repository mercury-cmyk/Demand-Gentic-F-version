
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
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  disabled?: boolean;
}

export function CustomFieldsRenderer({
  entityType,
  values,
  onChange,
  disabled = false,
}: CustomFieldsRendererProps) {
  const { data: allFields } = useQuery<CustomFieldDefinition[]>({
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
          <Input
            value={value || ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
            placeholder={field.helpText || ''}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
            placeholder={field.helpText || ''}
          />
        );

      case 'email':
        return (
          <Input
            type="email"
            value={value || ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
            placeholder={field.helpText || ''}
          />
        );

      case 'url':
        return (
          <Input
            type="url"
            value={value || ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
            placeholder={field.helpText || ''}
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
          />
        );

      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Switch
              checked={!!value}
              onCheckedChange={(checked) => onChange(field.fieldKey, checked)}
              disabled={disabled}
            />
            <span className="text-sm text-muted-foreground">{field.helpText}</span>
          </div>
        );

      case 'select':
        const options = field.options as string[] || [];
        return (
          <Select
            value={value || ''}
            onValueChange={(val) => onChange(field.fieldKey, val)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.helpText || 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'multi_select':
        const multiOptions = field.options as string[] || [];
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {multiOptions.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  checked={selectedValues.includes(option)}
                  onCheckedChange={(checked) => {
                    const newValues = checked
                      ? [...selectedValues, option]
                      : selectedValues.filter((v) => v !== option);
                    onChange(field.fieldKey, newValues);
                  }}
                  disabled={disabled}
                />
                <label className="text-sm">{option}</label>
              </div>
            ))}
            {field.helpText && (
              <p className="text-sm text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );

      default:
        return (
          <Textarea
            value={value || ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
            disabled={disabled}
            placeholder={field.helpText || ''}
          />
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-t pt-4">
        <h3 className="text-lg font-semibold mb-4">Custom Fields</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {customFields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label>
                {field.displayLabel}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {renderField(field)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
