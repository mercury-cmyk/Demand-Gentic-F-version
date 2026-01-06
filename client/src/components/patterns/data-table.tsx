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
export interface DataTableColumn<T = any> {
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
  selectedIds: Set<string>;
  allSelected: boolean;
}

// Data table props
export interface DataTableProps<T = any> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  
  // Features
  enableSelection?: boolean;
  enableSearch?: boolean;
  enableColumnVisibility?: boolean;
  enableVirtualization?: boolean;
  
  // Selection
  onSelectionChange?: (selectedIds: Set<string>, allSelected: boolean) => void;
  
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

export function DataTable<T = any>({
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
}: DataTableProps<T>) {
  // Column visibility
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    new Set(initialColumns.filter((col) => col.hidden).map((col) => col.id))
  );

  const columns = useMemo(
    () => initialColumns.filter((col) => !hiddenColumns.has(col.id)),
    [initialColumns, hiddenColumns]
  );

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting
  const [sortState, setSortState] = useState<SortState | null>(defaultSort || null);

  // Selection
  const [selection, setSelection] = useState<SelectionState>({
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

      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }, [filteredData, sortState, columns]);

  // Virtualization
  const tableContainerRef = useRef<HTMLDivElement>(null);
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
  const getCellValue = (row: T, column: DataTableColumn<T>) => {
    return column.accessorFn
      ? column.accessorFn(row)
      : column.accessorKey
      ? row[column.accessorKey]
      : null;
  };

  // Render cell
  const renderCell = (row: T, column: DataTableColumn<T>) => {
    const value = getCellValue(row, column);
    return column.cell ? column.cell(row, value) : value;
  };

  // Render sort icon
  const renderSortIcon = (columnId: string) => {
    if (sortState?.columnId !== columnId) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    return sortState.direction === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
  };

  const hasSelection = selection.selectedIds.size > 0;
  const totalColumns = Math.max(1, columns.length + (enableSelection ? 1 : 0));

  return (
    <div className={cn("space-y-4", className)} data-testid="data-table">
      {/* Toolbar */}
      {(enableSearch || enableColumnVisibility || bulkActions) && (
        <div className="flex items-center justify-between gap-4">
          {/* Search and bulk actions */}
          <div className="flex items-center gap-2 flex-1">
            {enableSearch && (
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9 pr-9"
                  data-testid="data-table-search"
                />
                {searchQuery && (
                  <button
                    onClick={() => handleSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                    data-testid="clear-search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            {hasSelection && bulkActions && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" data-testid="selected-count">
                  {selection.selectedIds.size} selected
                </Badge>
                {bulkActions}
              </div>
            )}
          </div>

          {/* Column visibility */}
          {enableColumnVisibility && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="column-visibility">
                  <Columns className="h-4 w-4 mr-2" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {initialColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={!hiddenColumns.has(column.id)}
                    onCheckedChange={(checked) => {
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
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {/* Table container */}
      <div
        ref={tableContainerRef}
        className={cn(
          "relative rounded-md border bg-card overflow-auto",
          enableVirtualization && sortedData.length > 50 && "max-h-[600px]"
        )}
        data-testid="data-table-container"
      >
        <Table>
          <TableHeader className={cn(stickyHeader && "sticky top-0 z-10 bg-card")}>
            <TableRow>
              {enableSelection && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={selection.allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all rows"
                    data-testid="select-all-checkbox"
                  />
                </TableHead>
              )}
              {columns.length === 0 ? (
                <TableHead>No columns</TableHead>
              ) : (
                columns.map((column) => (
                  <TableHead
                    key={column.id}
                    style={{
                      width: column.width,
                      minWidth: column.minWidth,
                      maxWidth: column.maxWidth,
                      textAlign: column.align || "left",
                    }}
                    aria-sort={
                      sortState?.columnId === column.id
                        ? sortState.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : column.sortable !== false
                        ? "none"
                        : undefined
                    }
                    data-testid={`column-header-${column.id}`}
                  >
                    {column.sortable !== false ? (
                      <Button
                        variant="ghost"
                        onClick={() => handleSort(column.id)}
                        className="-ml-3 h-8 data-[state=open]:bg-accent"
                        data-testid={`sort-${column.id}`}
                      >
                        {column.header}
                        {renderSortIcon(column.id)}
                      </Button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                ))
              )}
            </TableRow>
          </TableHeader>
          <TableBody className={cn(enableVirtualization && sortedData.length > 50 && "relative")}>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={totalColumns}
                  className="h-24 text-center"
                >
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                </TableCell>
              </TableRow>
            ) : sortedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={totalColumns}
                  className="h-48"
                >
                  <EmptyState
                    icon={emptyState?.icon}
                    title={emptyState?.title || "No results"}
                    description={
                      emptyState?.description ||
                      (searchQuery ? "Try adjusting your search" : "No data available")
                    }
                  >
                    {emptyState?.action}
                  </EmptyState>
                </TableCell>
              </TableRow>
            ) : enableVirtualization && sortedData.length > 50 ? (
              <>
                <tr style={{ height: `${virtualizer.getTotalSize()}px` }} />
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = sortedData[virtualRow.index];
                  const rowId = getRowId(row);
                  const isSelected = selection.selectedIds.has(rowId);

                  return (
                    <TableRow
                      key={rowId}
                      data-index={virtualRow.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      onClick={() => onRowClick?.(row)}
                      className={cn(
                        onRowClick && "cursor-pointer hover-elevate",
                        isSelected && "bg-accent/50",
                        rowClassName?.(row)
                      )}
                      data-testid={`table-row-${rowId}`}
                    >
                      {enableSelection && (
                        <TableCell className="w-12">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              handleSelectRow(rowId, checked as boolean)
                            }
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select row ${rowId}`}
                            data-testid={`select-row-${rowId}`}
                          />
                        </TableCell>
                      )}
                      {columns.map((column) => (
                        <TableCell
                          key={column.id}
                          style={{ textAlign: column.align || "left" }}
                          data-testid={`cell-${rowId}-${column.id}`}
                        >
                          {renderCell(row, column)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </>
            ) : (
              sortedData.map((row) => {
                const rowId = getRowId(row);
                const isSelected = selection.selectedIds.has(rowId);

                return (
                  <TableRow
                    key={rowId}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      onRowClick && "cursor-pointer hover-elevate",
                      isSelected && "bg-accent/50",
                      rowClassName?.(row)
                    )}
                    data-testid={`table-row-${rowId}`}
                  >
                    {enableSelection && (
                      <TableCell className="w-12">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            handleSelectRow(rowId, checked as boolean)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select row ${rowId}`}
                          data-testid={`select-row-${rowId}`}
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell
                        key={column.id}
                        style={{ textAlign: column.align || "left" }}
                        data-testid={`cell-${rowId}-${column.id}`}
                      >
                        {renderCell(row, column)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer with info */}
      {sortedData.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Showing {sortedData.length} of {data.length} row{data.length !== 1 ? "s" : ""}
          </div>
          {hasSelection && (
            <div data-testid="selection-info">
              {selection.selectedIds.size} row{selection.selectedIds.size !== 1 ? "s" : ""}{" "}
              selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
