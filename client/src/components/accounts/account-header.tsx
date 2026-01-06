import type { Account } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Link as LinkIcon, Plus, ListPlus, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AccountHeaderProps {
  account: Account;
}

export function AccountHeader({ account }: AccountHeaderProps) {
  const { toast } = useToast();
  const domain = account.websiteDomain || account.domain;

  const handleAction = (action: string) => {
    toast({
      title: `${action} triggered`,
      description: "Action wiring coming soon.",
    });
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 px-6 py-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold">{account.name}</h2>
            {account.industryStandardized && (
              <Badge variant="secondary">{account.industryStandardized}</Badge>
            )}
          </div>
          {domain && (
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Globe className="h-4 w-4" />
              {domain}
            </a>
          )}
          {account.linkedinUrl && (
            <a
              href={account.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <LinkIcon className="h-4 w-4" />
              LinkedIn Company Page
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => handleAction("Add contact")}>
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction("Add tag")}
          >
            <Tag className="mr-2 h-4 w-4" />
            Add Tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction("Add to list")}
          >
            <ListPlus className="mr-2 h-4 w-4" />
            Add to List
          </Button>
        </div>
      </div>
    </div>
  );
}
