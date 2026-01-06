
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
export interface KanbanColumn<T = any> {
  id: string;
  title: string;
  color?: string;
  limit?: number;
  items: T[];
}

// Card render function type
export interface KanbanCardProps<T = any> {
  item: T;
  isDragging?: boolean;
}

// Kanban Board props
export interface KanbanBoardProps<T = any> {
  columns: KanbanColumn<T>[];
  onColumnChange?: (itemId: string, fromColumnId: string, toColumnId: string, newIndex: number) => void;
  onCardClick?: (item: T) => void;
  renderCard: (props: KanbanCardProps<T>) => ReactNode;
  getItemId: (item: T) => string;
  columnActions?: (column: KanbanColumn<T>) => ReactNode;
  onAddItem?: (columnId: string) => void;
  className?: string;
  emptyMessage?: string;
}

export function KanbanBoard<T = any>({
  columns: initialColumns,
  onColumnChange,
  onCardClick,
  renderCard,
  getItemId,
  columnActions,
  onAddItem,
  className,
  emptyMessage = "No items",
}: KanbanBoardProps<T>) {
  const [columns, setColumns] = useState(initialColumns);
  const [draggedItem, setDraggedItem] = useState<{ item: T; columnId: string } | null>(null);

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
    <div className={cn("flex gap-4 h-full overflow-x-auto pb-4", className)} data-testid="kanban-board">
      {columns.map((column) => {
        const isOverLimit = column.limit && column.items.length > column.limit;
        const isDragTarget = draggedItem && draggedItem.columnId !== column.id;

        return (
          <div
            key={column.id}
            className="flex-shrink-0 w-80"
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <Card
              className={cn(
                "h-full flex flex-col transition-all",
                isDragTarget && "ring-2 ring-primary ring-offset-2"
              )}
              data-testid={`kanban-column-${column.id}`}
            >
              {/* Column Header */}
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {column.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: column.color }}
                      />
                    )}
                    <CardTitle className="text-base font-semibold">
                      {column.title}
                    </CardTitle>
                    <Badge variant={isOverLimit ? "destructive" : "secondary"}>
                      {column.items.length}
                      {column.limit && `/${column.limit}`}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {onAddItem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAddItem(column.id)}
                        data-testid={`add-item-${column.id}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                    {columnActions && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {columnActions(column)}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Column Content */}
              <ScrollArea className="flex-1 p-3">
                {column.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
                    <p className="text-sm">{emptyMessage}</p>
                  </div>
                ) : (
                  <Reorder.Group
                    axis="y"
                    values={column.items}
                    onReorder={(newOrder) => handleReorder(column.id, newOrder)}
                    className="space-y-2"
                  >
                    {column.items.map((item) => {
                      const itemId = getItemId(item);
                      const isDragging = draggedItem && getItemId(draggedItem.item) === itemId;

                      return (
                        <Reorder.Item
                          key={itemId}
                          value={item}
                          className={cn(
                            "cursor-move",
                            isDragging && "opacity-50"
                          )}
                          data-testid={`kanban-item-${itemId}`}
                          draggable
                          onDragStart={() => handleDragStart(item, column.id)}
                        >
                          <motion.div
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => onCardClick?.(item)}
                            className="group"
                          >
                            <div className="relative">
                              <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="pl-6">
                                {renderCard({ item, isDragging })}
                              </div>
                            </div>
                          </motion.div>
                        </Reorder.Item>
                      );
                    })}
                  </Reorder.Group>
                )}
              </ScrollArea>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

// Default card component
export interface DefaultKanbanCardProps {
  title: string;
  subtitle?: string;
  value?: string | number;
  badges?: Array<{ label: string; variant?: "default" | "secondary" | "outline" }>;
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
    <Card className={cn("hover-elevate cursor-pointer transition-all", className)}>
      <CardContent className="p-4">
        <div className="space-y-2">
          {/* Title and Value */}
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-sm line-clamp-2">{title}</h4>
            {value !== undefined && (
              <span className="text-sm font-semibold whitespace-nowrap">{value}</span>
            )}
          </div>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-xs text-muted-foreground line-clamp-1">{subtitle}</p>
          )}

          {/* Badges */}
          {badges && badges.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {badges.map((badge, index) => (
                <Badge key={index} variant={badge.variant || "secondary"} className="text-xs">
                  {badge.label}
                </Badge>
              ))}
            </div>
          )}

          {/* Footer */}
          {footer && <div className="pt-2 border-t">{footer}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// Compact Kanban variant for smaller spaces
export interface CompactKanbanProps<T = any> {
  columns: KanbanColumn<T>[];
  onColumnChange?: (itemId: string, fromColumnId: string, toColumnId: string) => void;
  onItemClick?: (item: T) => void;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  getItemBadge?: (item: T) => string;
  className?: string;
}

export function CompactKanban<T = any>({
  columns,
  onColumnChange,
  onItemClick,
  getItemId,
  getItemLabel,
  getItemBadge,
  className,
}: CompactKanbanProps<T>) {
  return (
    <KanbanBoard
      columns={columns}
      onColumnChange={onColumnChange}
      onCardClick={onItemClick}
      getItemId={getItemId}
      className={className}
      renderCard={({ item }) => (
        <Card className="hover-elevate cursor-pointer">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{getItemLabel(item)}</span>
              {getItemBadge && (
                <Badge variant="secondary" className="text-xs">
                  {getItemBadge(item)}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    />
  );
}
