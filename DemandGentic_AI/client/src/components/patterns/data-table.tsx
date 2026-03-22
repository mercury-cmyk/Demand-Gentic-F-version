import { ReactNode, useState, useMemo, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns,
  Search,
  X,
  Loader2,
} from "lucide-react";
import { EmptyState } from "./empty-state";

// Column definition
export interface DataTableColumn {
  id: string;
  header: string;
  accessorKey?: keyof T;
  accessorFn?: (row: T) => any;
  cell?: (row: T, value: any) => ReactNode;
  sortable?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  hidden?: boolean;
  align?: "left" | "center" | "right";
}

// Sort state
export interface SortState {
  columnId: string;
  direction: "asc" | "desc";
}

// Selection state
export interface SelectionState {
  selectedIds: Set;
  allSelected: boolean;
}

// Data table props
export interface DataTableProps {
  data: T[];
  columns: DataTableColumn[];
  getRowId: (row: T) => string;
  
  // Features
  enableSelection?: boolean;
  enableSearch?: boolean;
  enableColumnVisibility?: boolean;
  enableVirtualization?: boolean;
  
  // Selection
  onSelectionChange?: (selectedIds: Set, allSelected: boolean) => void;
  
  // Search
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  
  // Sorting
  onSort?: (sort: SortState | null) => void;
  defaultSort?: SortState;
  
  // Bulk actions
  bulkActions?: ReactNode;
  
  // States
  loading?: boolean;
  emptyState?: {
    icon?: any;
    title?: string;
    description?: string;
    action?: ReactNode;
  };
  
  // Styling
  className?: string;
  rowClassName?: (row: T) => string;
  stickyHeader?: boolean;
  
  // Row actions
  onRowClick?: (row: T) => void;
  
  // Virtualization settings
  estimatedRowHeight?: number;
  overscan?: number;
}

export function DataTable({
  data,
  columns: initialColumns,
  getRowId,
  enableSelection = false,
  enableSearch = false,
  enableColumnVisibility = false,
  enableVirtualization = false,
  onSelectionChange,
  searchPlaceholder = "Search...",
  onSearch,
  onSort,
  defaultSort,
  bulkActions,
  loading = false,
  emptyState,
  className,
  rowClassName,
  stickyHeader = true,
  onRowClick,
  estimatedRowHeight = 56,
  overscan = 10,
}: DataTableProps) {
  // Column visibility
  const [hiddenColumns, setHiddenColumns] = useState>(
    new Set(initialColumns.filter((col) => col.hidden).map((col) => col.id))
  );

  const columns = useMemo(
    () => initialColumns.filter((col) => !hiddenColumns.has(col.id)),
    [initialColumns, hiddenColumns]
  );

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting
  const [sortState, setSortState] = useState(defaultSort || null);

  // Selection
  const [selection, setSelection] = useState({
    selectedIds: new Set(),
    allSelected: false,
  });

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim() || !enableSearch) return data;

    const query = searchQuery.toLowerCase();
    return data.filter((row) => {
      return columns.some((column) => {
        const value = column.accessorFn
          ? column.accessorFn(row)
          : column.accessorKey
          ? row[column.accessorKey]
          : null;
        return value != null && String(value).toLowerCase().includes(query);
      });
    });
  }, [data, searchQuery, columns, enableSearch]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortState) return filteredData;

    const column = columns.find((col) => col.id === sortState.columnId);
    if (!column) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = column.accessorFn
        ? column.accessorFn(a)
        : column.accessorKey
        ? a[column.accessorKey]
        : null;
      const bValue = column.accessorFn
        ? column.accessorFn(b)
        : column.accessorKey
        ? b[column.accessorKey]
        : null;

      if (aValue == null) return 1;
      if (bValue == null) return -1;

      const comparison = aValue  bValue ? 1 : 0;
      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }, [filteredData, sortState, columns]);

  // Virtualization
  const tableContainerRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
    enabled: enableVirtualization && sortedData.length > 50,
  });

  // Handle sort
  const handleSort = (columnId: string) => {
    const column = columns.find((col) => col.id === columnId);
    if (!column || column.sortable === false) return;

    const newSortState: SortState | null =
      sortState?.columnId === columnId
        ? sortState.direction === "asc"
          ? { columnId, direction: "desc" }
          : null
        : { columnId, direction: "asc" };

    setSortState(newSortState);
    onSort?.(newSortState);
  };

  // Handle selection
  const handleSelectAll = (checked: boolean) => {
    const newSelection: SelectionState = checked
      ? { selectedIds: new Set(sortedData.map(getRowId)), allSelected: true }
      : { selectedIds: new Set(), allSelected: false };

    setSelection(newSelection);
    onSelectionChange?.(newSelection.selectedIds, newSelection.allSelected);
  };

  const handleSelectRow = (rowId: string, checked: boolean) => {
    const newSelectedIds = new Set(selection.selectedIds);
    if (checked) {
      newSelectedIds.add(rowId);
    } else {
      newSelectedIds.delete(rowId);
    }

    const newSelection: SelectionState = {
      selectedIds: newSelectedIds,
      allSelected: newSelectedIds.size === sortedData.length && sortedData.length > 0,
    };

    setSelection(newSelection);
    onSelectionChange?.(newSelection.selectedIds, newSelection.allSelected);
  };

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    onSearch?.(query);
  };

  // Reconcile selection when filtered data changes
  useEffect(() => {
    if (selection.selectedIds.size === 0) return;

    const filteredRowIds = new Set(sortedData.map(getRowId));
    const newSelectedIds = new Set(
      Array.from(selection.selectedIds).filter((id) => filteredRowIds.has(id))
    );

    // If selection changed, update it
    if (newSelectedIds.size !== selection.selectedIds.size) {
      const newSelection: SelectionState = {
        selectedIds: newSelectedIds,
        allSelected: newSelectedIds.size === sortedData.length && sortedData.length > 0,
      };
      setSelection(newSelection);
      onSelectionChange?.(newSelection.selectedIds, newSelection.allSelected);
    }
  }, [sortedData]); // Only run when sortedData changes

  // Get cell value
  const getCellValue = (row: T, column: DataTableColumn) => {
    return column.accessorFn
      ? column.accessorFn(row)
      : column.accessorKey
      ? row[column.accessorKey]
      : null;
  };

  // Render cell
  const renderCell = (row: T, column: DataTableColumn) => {
    const value = getCellValue(row, column);
    return column.cell ? column.cell(row, value) : value;
  };

  // Render sort icon
  const renderSortIcon = (columnId: string) => {
    if (sortState?.columnId !== columnId) {
      return ;
    }
    return sortState.direction === "asc" ? (
      
    ) : (
      
    );
  };

  const hasSelection = selection.selectedIds.size > 0;
  const totalColumns = Math.max(1, columns.length + (enableSelection ? 1 : 0));

  return (
    
      {/* Toolbar */}
      {(enableSearch || enableColumnVisibility || bulkActions) && (
        
          {/* Search and bulk actions */}
          
            {enableSearch && (
              
                
                 handleSearch(e.target.value)}
                  className="pl-9 pr-9"
                  data-testid="data-table-search"
                />
                {searchQuery && (
                   handleSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                    data-testid="clear-search"
                  >
                    
                  
                )}
              
            )}
            {hasSelection && bulkActions && (
              
                
                  {selection.selectedIds.size} selected
                
                {bulkActions}
              
            )}
          

          {/* Column visibility */}
          {enableColumnVisibility && (
            
              
                
                  
                  Columns
                
              
              
                {initialColumns.map((column) => (
                   {
                      const newHidden = new Set(hiddenColumns);
                      if (checked) {
                        newHidden.delete(column.id);
                      } else {
                        newHidden.add(column.id);
                      }
                      setHiddenColumns(newHidden);
                    }}
                  >
                    {column.header}
                  
                ))}
              
            
          )}
        
      )}

      {/* Table container */}
       50 && "max-h-[600px]"
        )}
        data-testid="data-table-container"
      >
        
          
            
              {enableSelection && (
                
                  
                
              )}
              {columns.length === 0 ? (
                No columns
              ) : (
                columns.map((column) => (
                  
                    {column.sortable !== false ? (
                       handleSort(column.id)}
                        className="-ml-3 h-8 data-[state=open]:bg-accent"
                        data-testid={`sort-${column.id}`}
                      >
                        {column.header}
                        {renderSortIcon(column.id)}
                      
                    ) : (
                      column.header
                    )}
                  
                ))
              )}
            
          
           50 && "relative")}>
            {loading ? (
              
                
                  
                    
                    Loading...
                  
                
              
            ) : sortedData.length === 0 ? (
              
                
                  
                    {emptyState?.action}
                  
                
              
            ) : enableVirtualization && sortedData.length > 50 ? (
              <>
                
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = sortedData[virtualRow.index];
                  const rowId = getRowId(row);
                  const isSelected = selection.selectedIds.has(rowId);

                  return (
                     onRowClick?.(row)}
                      className={cn(
                        onRowClick && "cursor-pointer hover-elevate",
                        isSelected && "bg-accent/50",
                        rowClassName?.(row)
                      )}
                      data-testid={`table-row-${rowId}`}
                    >
                      {enableSelection && (
                        
                          
                              handleSelectRow(rowId, checked as boolean)
                            }
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select row ${rowId}`}
                            data-testid={`select-row-${rowId}`}
                          />
                        
                      )}
                      {columns.map((column) => (
                        
                          {renderCell(row, column)}
                        
                      ))}
                    
                  );
                })}
              
            ) : (
              sortedData.map((row) => {
                const rowId = getRowId(row);
                const isSelected = selection.selectedIds.has(rowId);

                return (
                   onRowClick?.(row)}
                    className={cn(
                      onRowClick && "cursor-pointer hover-elevate",
                      isSelected && "bg-accent/50",
                      rowClassName?.(row)
                    )}
                    data-testid={`table-row-${rowId}`}
                  >
                    {enableSelection && (
                      
                        
                            handleSelectRow(rowId, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select row ${rowId}`}
                          data-testid={`select-row-${rowId}`}
                        />
                      
                    )}
                    {columns.map((column) => (
                      
                        {renderCell(row, column)}
                      
                    ))}
                  
                );
              })
            )}
          
        
      

      {/* Footer with info */}
      {sortedData.length > 0 && (
        
          
            Showing {sortedData.length} of {data.length} row{data.length !== 1 ? "s" : ""}
          
          {hasSelection && (
            
              {selection.selectedIds.size} row{selection.selectedIds.size !== 1 ? "s" : ""}{" "}
              selected
            
          )}
        
      )}
    
  );
}