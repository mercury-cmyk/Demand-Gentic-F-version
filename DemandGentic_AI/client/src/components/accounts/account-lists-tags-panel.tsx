import { useLocation } from "wouter";
import { ChipsList } from "@/components/patterns/chips-list";

interface AccountListsTagsPanelProps {
  lists: Array;
  tags: string[];
}

export function AccountListsTagsPanel({ lists, tags }: AccountListsTagsPanelProps) {
  const [, setLocation] = useLocation();
  return (
    
       ({
          id: list.id,
          label: list.name,
          onClick: () => setLocation(`/segments/lists/${list.id}`),
        }))}
        emptyLabel="Account not assigned to lists"
      />
       ({
          id: tag,
          label: tag,
          onClick: () => setLocation(`/accounts?tag=${encodeURIComponent(tag)}`),
        }))}
        emptyLabel="No tags applied"
      />
    
  );
}