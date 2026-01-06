import { useLocation } from "wouter";
import { ChipsList } from "@/components/patterns/chips-list";

interface AccountListsTagsPanelProps {
  lists: Array<{ id: string; name: string }>;
  tags: string[];
}

export function AccountListsTagsPanel({ lists, tags }: AccountListsTagsPanelProps) {
  const [, setLocation] = useLocation();
  return (
    <div className="grid gap-4">
      <ChipsList
        title="Lists"
        items={lists.map((list) => ({
          id: list.id,
          label: list.name,
          onClick: () => setLocation(`/segments/lists/${list.id}`),
        }))}
        emptyLabel="Account not assigned to lists"
      />
      <ChipsList
        title="Tags"
        items={tags.map((tag) => ({
          id: tag,
          label: tag,
          onClick: () => setLocation(`/accounts?tag=${encodeURIComponent(tag)}`),
        }))}
        emptyLabel="No tags applied"
      />
    </div>
  );
}
