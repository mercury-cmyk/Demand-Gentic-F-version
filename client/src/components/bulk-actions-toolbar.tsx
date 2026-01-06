import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50" data-testid="bulk-actions-toolbar">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" data-testid="badge-selected-count">
          {selectedCount} selected
          {totalCount !== undefined && (
            <span className="text-muted-foreground ml-1">of {totalCount}</span>
          )}
        </Badge>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onClearSelection}
          data-testid="button-clear-selection"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>
      
      <div className="flex items-center gap-2">
        {onBulkExport && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={onBulkExport}
            data-testid="button-bulk-export"
          >
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
        )}
        {onBulkAddToList && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={onBulkAddToList}
            data-testid="button-bulk-add-to-list"
          >
            <Users className="h-4 w-4 mr-1" />
            Add to List
          </Button>
        )}
        {onBulkUpdate && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={onBulkUpdate}
            data-testid="button-bulk-update"
          >
            <Edit className="h-4 w-4 mr-1" />
            Update
          </Button>
        )}
        {onBulkDelete && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={onBulkDelete}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
