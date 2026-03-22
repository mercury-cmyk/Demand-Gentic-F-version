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
    
      
        {selectedCount} selected
      
      
        
        Read
      
      
        
        Unread
      
      
        
        Archive
      
      
        
        Delete
      
      
        
      
    
  );
}