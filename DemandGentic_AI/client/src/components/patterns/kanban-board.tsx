import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Plus, GripVertical } from "lucide-react";
import { motion, Reorder } from "framer-motion";

// Column definition
export interface KanbanColumn {
  id: string;
  title: string;
  color?: string;
  limit?: number;
  items: T[];
}

// Card render function type
export interface KanbanCardProps {
  item: T;
  isDragging?: boolean;
}

// Kanban Board props
export interface KanbanBoardProps {
  columns: KanbanColumn[];
  onColumnChange?: (itemId: string, fromColumnId: string, toColumnId: string, newIndex: number) => void;
  onCardClick?: (item: T) => void;
  renderCard: (props: KanbanCardProps) => ReactNode;
  getItemId: (item: T) => string;
  columnActions?: (column: KanbanColumn) => ReactNode;
  onAddItem?: (columnId: string) => void;
  className?: string;
  emptyMessage?: string;
}

export function KanbanBoard({
  columns: initialColumns,
  onColumnChange,
  onCardClick,
  renderCard,
  getItemId,
  columnActions,
  onAddItem,
  className,
  emptyMessage = "No items",
}: KanbanBoardProps) {
  const [columns, setColumns] = useState(initialColumns);
  const [draggedItem, setDraggedItem] = useState(null);

  // Handle drag start
  const handleDragStart = (item: T, columnId: string) => {
    setDraggedItem({ item, columnId });
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    
    if (!draggedItem) return;

    const sourceColumnId = draggedItem.columnId;
    const itemId = getItemId(draggedItem.item);

    if (sourceColumnId === targetColumnId) {
      setDraggedItem(null);
      return;
    }

    // Update local state
    setColumns((prev) => {
      const newColumns = [...prev];
      const sourceColumn = newColumns.find((col) => col.id === sourceColumnId);
      const targetColumn = newColumns.find((col) => col.id === targetColumnId);

      if (!sourceColumn || !targetColumn) return prev;

      // Remove from source
      const itemIndex = sourceColumn.items.findIndex((item) => getItemId(item) === itemId);
      if (itemIndex === -1) return prev;

      const [movedItem] = sourceColumn.items.splice(itemIndex, 1);

      // Add to target
      targetColumn.items.push(movedItem);

      return newColumns;
    });

    // Notify parent
    onColumnChange?.(itemId, sourceColumnId, targetColumnId, 0);
    setDraggedItem(null);
  };

  // Handle reorder within column
  const handleReorder = (columnId: string, newOrder: T[]) => {
    setColumns((prev) => {
      const newColumns = [...prev];
      const column = newColumns.find((col) => col.id === columnId);
      if (!column) return prev;
      column.items = newOrder;
      return newColumns;
    });
  };

  return (
    
      {columns.map((column) => {
        const isOverLimit = column.limit && column.items.length > column.limit;
        const isDragTarget = draggedItem && draggedItem.columnId !== column.id;

        return (
           handleDragOver(e, column.id)}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            
              {/* Column Header */}
              
                
                  
                    {column.color && (
                      
                    )}
                    
                      {column.title}
                    
                    
                      {column.items.length}
                      {column.limit && `/${column.limit}`}
                    
                  
                  
                    {onAddItem && (
                       onAddItem(column.id)}
                        data-testid={`add-item-${column.id}`}
                      >
                        
                      
                    )}
                    {columnActions && (
                      
                        
                          
                            
                          
                        
                        
                          {columnActions(column)}
                        
                      
                    )}
                  
                
              

              {/* Column Content */}
              
                {column.items.length === 0 ? (
                  
                    {emptyMessage}
                  
                ) : (
                   handleReorder(column.id, newOrder)}
                    className="space-y-2"
                  >
                    {column.items.map((item) => {
                      const itemId = getItemId(item);
                      const isDragging = !!draggedItem && getItemId(draggedItem.item) === itemId;

                      return (
                         handleDragStart(item, column.id)}
                        >
                           onCardClick?.(item)}
                            className="group"
                          >
                            
                              
                                
                              
                              
                                {renderCard({ item, isDragging })}
                              
                            
                          
                        
                      );
                    })}
                  
                )}
              
            
          
        );
      })}
    
  );
}

// Default card component
export interface DefaultKanbanCardProps {
  title: string;
  subtitle?: string;
  value?: string | number;
  badges?: Array;
  footer?: ReactNode;
  className?: string;
}

export function DefaultKanbanCard({
  title,
  subtitle,
  value,
  badges,
  footer,
  className,
}: DefaultKanbanCardProps) {
  return (
    
      
        
          {/* Title and Value */}
          
            {title}
            {value !== undefined && (
              {value}
            )}
          

          {/* Subtitle */}
          {subtitle && (
            {subtitle}
          )}

          {/* Badges */}
          {badges && badges.length > 0 && (
            
              {badges.map((badge, index) => (
                
                  {badge.label}
                
              ))}
            
          )}

          {/* Footer */}
          {footer && {footer}}
        
      
    
  );
}

// Compact Kanban variant for smaller spaces
export interface CompactKanbanProps {
  columns: KanbanColumn[];
  onColumnChange?: (itemId: string, fromColumnId: string, toColumnId: string) => void;
  onItemClick?: (item: T) => void;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  getItemBadge?: (item: T) => string;
  className?: string;
}

export function CompactKanban({
  columns,
  onColumnChange,
  onItemClick,
  getItemId,
  getItemLabel,
  getItemBadge,
  className,
}: CompactKanbanProps) {
  return (
     (
        
          
            
              {getItemLabel(item)}
              {getItemBadge && (
                
                  {getItemBadge(item)}
                
              )}
            
          
        
      )}
    />
  );
}