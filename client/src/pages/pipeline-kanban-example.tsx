
import { useState } from "react";
import { PageShell } from "@/components/patterns/page-shell";
import { KanbanBoard, DefaultKanbanCard, type KanbanColumn } from "@/components/patterns/kanban-board";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface Deal {
  id: string;
  title: string;
  company: string;
  value: number;
  owner: string;
  closeDate: string;
  tags?: string[];
}

const mockDeals: Deal[] = [
  {
    id: "1",
    title: "Enterprise Software License",
    company: "Acme Corp",
    value: 50000,
    owner: "John Doe",
    closeDate: "2025-02-15",
    tags: ["Enterprise", "Hot"],
  },
  {
    id: "2",
    title: "Cloud Migration Project",
    company: "TechStart Inc",
    value: 75000,
    owner: "Jane Smith",
    closeDate: "2025-03-01",
    tags: ["Cloud", "Strategic"],
  },
  {
    id: "3",
    title: "Annual Support Contract",
    company: "Global Industries",
    value: 30000,
    owner: "Bob Wilson",
    closeDate: "2025-02-28",
  },
  {
    id: "4",
    title: "Consulting Services",
    company: "StartupXYZ",
    value: 25000,
    owner: "Alice Johnson",
    closeDate: "2025-04-15",
    tags: ["Consulting"],
  },
];

export default function PipelineKanbanExample() {
  const { toast } = useToast();
  const [columns, setColumns] = useState<KanbanColumn<Deal>[]>([
    {
      id: "lead",
      title: "Lead",
      color: "#94a3b8",
      items: [mockDeals[0]],
    },
    {
      id: "qualified",
      title: "Qualified",
      color: "#60a5fa",
      items: [mockDeals[1]],
    },
    {
      id: "proposal",
      title: "Proposal",
      color: "#fbbf24",
      limit: 5,
      items: [mockDeals[2]],
    },
    {
      id: "negotiation",
      title: "Negotiation",
      color: "#f97316",
      items: [mockDeals[3]],
    },
    {
      id: "closed",
      title: "Closed Won",
      color: "#22c55e",
      items: [],
    },
  ]);

  const handleColumnChange = (
    itemId: string,
    fromColumnId: string,
    toColumnId: string,
    newIndex: number
  ) => {
    toast({
      title: "Deal moved",
      description: `Deal moved from ${fromColumnId} to ${toColumnId}`,
    });
  };

  const handleCardClick = (deal: Deal) => {
    toast({
      title: deal.title,
      description: `${deal.company} - $${deal.value.toLocaleString()}`,
    });
  };

  const handleAddItem = (columnId: string) => {
    toast({
      title: "Add new deal",
      description: `Adding to ${columnId} column`,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <PageShell
      title="Pipeline Kanban Board"
      description="Manage your deals with drag-and-drop"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Pipeline", href: "/pipeline" },
        { label: "Kanban" },
      ]}
      actions={
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Deal
        </Button>
      }
    >
      <div className="p-6 h-full">
        <KanbanBoard
          columns={columns}
          onColumnChange={handleColumnChange}
          onCardClick={handleCardClick}
          getItemId={(deal) => deal.id}
          onAddItem={handleAddItem}
          columnActions={(column) => (
            <>
              <DropdownMenuItem>
                <Edit className="h-4 w-4 mr-2" />
                Edit Column
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash className="h-4 w-4 mr-2" />
                Delete Column
              </DropdownMenuItem>
            </>
          )}
          renderCard={({ item: deal }) => (
            <DefaultKanbanCard
              title={deal.title}
              subtitle={deal.company}
              value={formatCurrency(deal.value)}
              badges={deal.tags?.map((tag) => ({ label: tag, variant: "outline" }))}
              footer={
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{deal.owner}</span>
                  <span>{new Date(deal.closeDate).toLocaleDateString()}</span>
                </div>
              }
            />
          )}
        />
      </div>
    </PageShell>
  );
}
