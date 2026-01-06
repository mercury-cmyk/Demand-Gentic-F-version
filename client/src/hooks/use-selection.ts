import { useState, useCallback, useEffect } from "react";

export interface SelectionState<T> {
  selectedIds: Set<string>;
  selectAll: boolean;
  selectionContextId?: string;
}

export function useSelection<T extends { id: string }>(
  items: T[] = [],
  onSelectionChange?: (selectedIds: string[]) => void
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionContextId, setSelectionContextId] = useState<string | undefined>();

  const selectItem = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = items.map(item => item.id);
    setSelectedIds(new Set(allIds));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionContextId(undefined);
  }, []);

  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(Array.from(selectedIds));
    }
  }, [selectedIds, onSelectionChange]);

  return {
    selectedIds: Array.from(selectedIds),
    selectedCount: selectedIds.size,
    selectItem,
    selectAll,
    clearSelection,
    isSelected,
    isAllSelected,
    isSomeSelected,
    selectionContextId,
    setSelectionContextId,
  };
}
