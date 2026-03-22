import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BulkUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "contact" | "account";
  selectedCount: number;
  onUpdate: (field: string, value: string) => void;
}

export function BulkUpdateDialog({
  open,
  onOpenChange,
  entityType,
  selectedCount,
  onUpdate,
}: BulkUpdateDialogProps) {
  const [selectedField, setSelectedField] = useState("");
  const [updateValue, setUpdateValue] = useState("");

  const contactFields = [
    { value: "jobTitle", label: "Job Title" },
    { value: "directPhone", label: "Phone" },
    { value: "mobilePhone", label: "Mobile Phone" },
    { value: "linkedinUrl", label: "LinkedIn URL" },
  ];

  const accountFields = [
    { value: "industryStandardized", label: "Industry" },
    { value: "employeesSizeRange", label: "Employee Size Range" },
    { value: "annualRevenue", label: "Annual Revenue" },
  ];

  const fields = entityType === "contact" ? contactFields : accountFields;

  const handleUpdate = () => {
    if (selectedField && updateValue) {
      onUpdate(selectedField, updateValue);
      setSelectedField("");
      setUpdateValue("");
      onOpenChange(false);
    }
  };

  return (
    
      
        
          Bulk Update {entityType === "contact" ? "Contacts" : "Accounts"}
          
            Update a field for {selectedCount} selected {entityType === "contact" ? "contacts" : "accounts"}
          
        
        
          
            Field to Update
            
              
                
              
              
                {fields.map((field) => (
                  
                    {field.label}
                  
                ))}
              
            
          
          
            New Value
             setUpdateValue(e.target.value)}
            />
          
        
        
           onOpenChange(false)}>
            Cancel
          
          
            Update {selectedCount} {entityType === "contact" ? "Contacts" : "Accounts"}
          
        
      
    
  );
}