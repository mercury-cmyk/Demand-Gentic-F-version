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
  const [selectedList, setSelectedList] = useState("");
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");

  const { data: lists } = useQuery({
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
    
      
        
          Add to List
          
            Add {selectedCount} selected {entityType === "contact" ? "contacts" : "accounts"} to a list
          
        
        
          {!showCreateList ? (
            <>
              
                Select List
                
                  
                    
                  
                  
                    {filteredLists.map((list) => (
                      
                        {list.name}
                      
                    ))}
                  
                
              
               setShowCreateList(true)}
              >
                
                Create New List
              
            
          ) : (
            <>
              
                List Name
                 setNewListName(e.target.value)}
                />
              
              
                Description (optional)
                 setNewListDescription(e.target.value)}
                />
              
               setShowCreateList(false)}
              >
                Back to List Selection
              
            
          )}
        
        
           onOpenChange(false)}>
            Cancel
          
          {!showCreateList ? (
            
              Add to List
            
          ) : (
            
              Create & Add
            
          )}
        
      
    
  );
}