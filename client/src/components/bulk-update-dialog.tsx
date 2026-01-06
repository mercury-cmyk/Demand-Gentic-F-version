
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
  const [selectedField, setSelectedField] = useState<string>("");
  const [updateValue, setUpdateValue] = useState<string>("");

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Bulk Update {entityType === "contact" ? "Contacts" : "Accounts"}</DialogTitle>
          <DialogDescription>
            Update a field for {selectedCount} selected {entityType === "contact" ? "contacts" : "accounts"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Field to Update</Label>
            <Select value={selectedField} onValueChange={setSelectedField}>
              <SelectTrigger>
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {fields.map((field) => (
                  <SelectItem key={field.value} value={field.value}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>New Value</Label>
            <Input
              placeholder="Enter new value"
              value={updateValue}
              onChange={(e) => setUpdateValue(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpdate} disabled={!selectedField || !updateValue}>
            Update {selectedCount} {entityType === "contact" ? "Contacts" : "Accounts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
