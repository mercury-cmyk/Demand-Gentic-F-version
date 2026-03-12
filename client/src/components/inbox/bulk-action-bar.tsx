import { Button } from "@/components/ui/button";
import { Archive, Trash2, Mail, MailOpen, X } from "lucide-react";

interface BulkActionBarProps {
  selectedCount: number;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  isArchiving?: boolean;
  isDeleting?: boolean;
}

export function BulkActionBar({
  selectedCount,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onDelete,
  onClearSelection,
  isArchiving,
  isDeleting,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-lg border bg-background/95 backdrop-blur px-4 py-2.5 shadow-lg">
      <span className="text-sm font-medium mr-2">
        {selectedCount} selected
      </span>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onMarkRead}>
        <MailOpen className="h-3.5 w-3.5 mr-1.5" />
        Read
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onMarkUnread}>
        <Mail className="h-3.5 w-3.5 mr-1.5" />
        Unread
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onArchive} disabled={isArchiving}>
        <Archive className="h-3.5 w-3.5 mr-1.5" />
        Archive
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={onDelete} disabled={isDeleting}>
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        Delete
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={onClearSelection}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
