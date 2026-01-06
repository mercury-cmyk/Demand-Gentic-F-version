import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { OperatorPills } from "./operator-pills";
import { MultiSelectFilter } from "./multi-select-filter";
import { TextQueryInput } from "./text-query-input";
import {
  type FieldRule,
  type Operator,
  type FilterField,
  getAvailableOperators,
  isTextOperator,
  isNullCheckOperator,
  getFieldConfig
} from "@shared/filterConfig";
import { cn } from "@/lib/utils";

interface OperatorBasedFilterProps {
  field: FilterField;
  rules: FieldRule[];
  onChange: (rules: FieldRule[]) => void;
  onOptionsLoaded?: (labels: Record<string, string>) => void;
}

export function OperatorBasedFilter({
  field,
  rules = [],
  onChange,
  onOptionsLoaded
}: OperatorBasedFilterProps) {
  const config = getFieldConfig(field);
  const availableOperators = getAvailableOperators(field);
  
  // Initialize with one rule if empty
  const activeRules = rules.length > 0 ? rules : [
    { operator: "INCLUDES_ANY" as Operator, values: [], query: "" }
  ];
  
  const handleRuleChange = (index: number, updatedRule: Partial<FieldRule>) => {
    const newRules = [...activeRules];
    newRules[index] = { ...newRules[index], ...updatedRule };
    onChange(newRules);
  };
  
  const handleAddRule = () => {
    const newRule: FieldRule = {
      operator: "INCLUDES_ANY" as Operator,
      values: [],
      query: ""
    };
    onChange([...activeRules, newRule]);
  };
  
  const handleRemoveRule = (index: number) => {
    if (activeRules.length === 1) {
      // Don't remove the last rule, just clear it
      onChange([{ operator: "INCLUDES_ANY" as Operator, values: [], query: "" }]);
    } else {
      const newRules = activeRules.filter((_, i) => i !== index);
      onChange(newRules);
    }
  };
  
  const hasNonEmptyRules = activeRules.some(rule => {
    if (isTextOperator(rule.operator)) {
      return rule.query && rule.query.trim().length > 0;
    }
    if (isNullCheckOperator(rule.operator)) {
      return true; // Null-check operators are always "active"
    }
    return rule.values && rule.values.length > 0;
  });
  
  return (
    <div className="flex flex-col gap-3">
      <Label className="text-sm font-medium">{config.label}</Label>
      
      <div className="flex flex-col gap-3">
        {activeRules.map((rule, index) => {
          const isTextOp = isTextOperator(rule.operator);
          const hasMultipleRules = activeRules.length > 1;
          
          return (
            <Card
              key={index}
              className={cn(
                "rounded-xl border p-3 space-y-3",
                hasMultipleRules && "bg-muted/30"
              )}
              data-testid={`filter-rule-${index}`}
            >
              {/* Header with rule number and remove button */}
              {hasMultipleRules && (
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">
                    Rule {index + 1}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveRule(index)}
                    className="h-6 w-6 p-0"
                    data-testid={`button-remove-rule-${index}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              {/* Operator pills */}
              {availableOperators.length > 1 && (
                <OperatorPills
                  options={availableOperators}
                  active={rule.operator}
                  onChange={(operator) => {
                    // Clear values/query when switching operator types
                    const newRule: Partial<FieldRule> = { operator };
                    
                    if (isTextOperator(operator)) {
                      // Text operator: keep query, clear values
                      newRule.query = rule.query || "";
                      newRule.values = undefined;
                    } else if (isNullCheckOperator(operator)) {
                      // Null-check: clear both
                      newRule.values = undefined;
                      newRule.query = undefined;
                    } else {
                      // Value operator: keep values, clear query
                      newRule.values = rule.values || [];
                      newRule.query = undefined;
                    }
                    
                    handleRuleChange(index, newRule);
                  }}
                />
              )}
              
              {/* Input based on operator type */}
              {isTextOp ? (
                // Text operators: show text input
                <TextQueryInput
                  value={rule.query || ""}
                  onChange={(query) => handleRuleChange(index, { query })}
                  placeholder={`Enter search text for ${config.label.toLowerCase()}...`}
                />
              ) : isNullCheckOperator(rule.operator) ? (
                // Null-check operators: show descriptive message (no input needed)
                <div className="text-sm text-muted-foreground italic px-3 py-2 bg-muted/50 rounded-md">
                  {rule.operator === "HAS_ANY_VALUE" 
                    ? `Will match records where ${config.label.toLowerCase()} has any value`
                    : `Will match records where ${config.label.toLowerCase()} is empty`}
                </div>
              ) : (
                // Value operators: show multi-select chips
                <MultiSelectFilter
                  label={config.label}
                  source={config.source || ""}
                  value={rule.values || []}
                  onChange={(values) => handleRuleChange(index, { values })}
                  max={config.max}
                  placeholder={`Select ${config.label.toLowerCase()}...`}
                  testId={`multi-select-${field}-${index}`}
                  onOptionsLoaded={index === 0 ? onOptionsLoaded : undefined}
                />
              )}
            </Card>
          );
        })}
      </div>
      
      {/* Add rule button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddRule}
        className="w-fit"
        data-testid={`button-add-rule-${field}`}
      >
        <Plus className="h-4 w-4 mr-1" />
        Add rule
      </Button>
    </div>
  );
}
