
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import type { Segment } from "@shared/schema";

interface AddToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "contact" | "account";
  selectedCount: number;
  onAddToList: (listId: string) => void;
  onCreateList: (name: string, description: string) => void;
}

export function AddToListDialog({
  open,
  onOpenChange,
  entityType,
  selectedCount,
  onAddToList,
  onCreateList,
}: AddToListDialogProps) {
  const [selectedList, setSelectedList] = useState<string>("");
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");

  const { data: lists } = useQuery<any[]>({
    queryKey: ['/api/lists'],
  });

  const filteredLists = lists?.filter(l => l.entityType === entityType) || [];

  const handleAdd = () => {
    if (selectedList) {
      onAddToList(selectedList);
      setSelectedList("");
      onOpenChange(false);
    }
  };

  const handleCreate = () => {
    if (newListName) {
      onCreateList(newListName, newListDescription);
      setNewListName("");
      setNewListDescription("");
      setShowCreateList(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add to List</DialogTitle>
          <DialogDescription>
            Add {selectedCount} selected {entityType === "contact" ? "contacts" : "accounts"} to a list
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!showCreateList ? (
            <>
              <div className="space-y-2">
                <Label>Select List</Label>
                <Select value={selectedList} onValueChange={setSelectedList}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a list" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredLists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowCreateList(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New List
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>List Name</Label>
                <Input
                  placeholder="Enter list name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  placeholder="Enter description"
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowCreateList(false)}
              >
                Back to List Selection
              </Button>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!showCreateList ? (
            <Button onClick={handleAdd} disabled={!selectedList}>
              Add to List
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={!newListName}>
              Create & Add
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
