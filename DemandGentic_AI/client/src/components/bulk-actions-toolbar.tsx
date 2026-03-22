import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useExportAuthority } from "@/hooks/use-export-authority";
import { X, Download, Edit, Trash2, Users } from "lucide-react";

interface BulkActionsToolbarProps {
  selectedCount: number;
  totalCount?: number;
  onClearSelection: () => void;
  onBulkUpdate?: () => void;
  onBulkDelete?: () => void;
  onBulkExport?: () => void;
  onBulkAddToList?: () => void;
}

export function BulkActionsToolbar({
  selectedCount,
  totalCount,
  onClearSelection,
  onBulkUpdate,
  onBulkDelete,
  onBulkExport,
  onBulkAddToList,
}: BulkActionsToolbarProps) {
  const { canExportData } = useExportAuthority();

  if (selectedCount === 0) return null;

  return (
    
      
        
          {selectedCount} selected
          {totalCount !== undefined && (
            of {totalCount}
          )}
        
        
          
          Clear
        
      
      
      
        {canExportData && onBulkExport && (
          
            
            Export
          
        )}
        {onBulkAddToList && (
          
            
            Add to List
          
        )}
        {onBulkUpdate && (
          
            
            Update
          
        )}
        {onBulkDelete && (
          
            
            Delete
          
        )}
      
    
  );
}