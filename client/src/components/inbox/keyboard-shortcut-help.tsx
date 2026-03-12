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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate and manage your inbox with these keyboard shortcuts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
          {shortcuts.map((group) => (
            <div key={group.group}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.group}
              </h4>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span>{item.description}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-muted-foreground mx-0.5">+</span>}
                          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border bg-muted px-1.5 text-xs font-mono font-medium">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
