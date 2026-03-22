import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface KeyboardShortcutHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts = [
  { group: "Navigation", items: [
    { keys: ["j"], description: "Next email" },
    { keys: ["k"], description: "Previous email" },
    { keys: ["Enter"], description: "Open selected email" },
    { keys: ["Esc"], description: "Close / deselect" },
    { keys: ["g", "i"], description: "Go to Inbox" },
    { keys: ["g", "s"], description: "Go to Starred" },
    { keys: ["g", "t"], description: "Go to Trash" },
    { keys: ["g", "d"], description: "Go to Drafts" },
  ]},
  { group: "Actions", items: [
    { keys: ["c"], description: "Compose new email" },
    { keys: ["r"], description: "Reply" },
    { keys: ["a"], description: "Reply all" },
    { keys: ["f"], description: "Forward" },
    { keys: ["e"], description: "Archive" },
    { keys: ["#"], description: "Delete / Trash" },
    { keys: ["s"], description: "Toggle star" },
    { keys: ["Shift", "i"], description: "Mark as read" },
    { keys: ["Shift", "u"], description: "Mark as unread" },
  ]},
  { group: "General", items: [
    { keys: ["/"], description: "Focus search" },
    { keys: ["?"], description: "Show this help" },
  ]},
];

export function KeyboardShortcutHelp({ open, onOpenChange }: KeyboardShortcutHelpProps) {
  return (
    
      
        
          Keyboard Shortcuts
          
            Navigate and manage your inbox with these keyboard shortcuts.
          
        
        
          {shortcuts.map((group) => (
            
              
                {group.group}
              
              
                {group.items.map((item) => (
                  
                    {item.description}
                    
                      {item.keys.map((key, i) => (
                        
                          {i > 0 && +}
                          
                            {key}
                          
                        
                      ))}
                    
                  
                ))}
              
            
          ))}
        
      
    
  );
}