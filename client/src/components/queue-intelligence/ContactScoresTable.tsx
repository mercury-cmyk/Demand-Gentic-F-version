import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import type { ContactScoresResponse, ScoreBreakdown } from "./types";
import { SCORE_DIMENSIONS } from "./types";

interface Props {
  campaignId: string;
}

function SubScoreBars({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex gap-0.5 w-28 cursor-help">
            {SCORE_DIMENSIONS.map(dim => (
              <div
                key={dim.key}
                className="h-4 rounded-sm"
                style={{
                  width: `${(breakdown[dim.key] / 200) * 100}%`,
                  backgroundColor: dim.color,
                  minWidth: "2px",
                }}
              />
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            {SCORE_DIMENSIONS.map(dim => (
              <div key={dim.key} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dim.color }} />
                <span>{dim.label}: {breakdown[dim.key]}/200</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ContactScoresTable({ campaignId }: Props) {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("score");
  const [tierFilter, setTierFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<ContactScoresResponse>({
    queryKey: ["/api/queue-intelligence", campaignId, "contact-scores", page, sortBy, tierFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        sortBy,
      });
      if (tierFilter !== "all") params.set("tier", tierFilter);
      const res = await apiRequest("GET", `/api/queue-intelligence/${campaignId}/contact-scores?${params}`);
      return res.json();
    },
    enabled: !!campaignId,
  });

  const sortOptions = [
    { value: "score", label: "AI Score" },
    { value: "industry", label: "Industry" },
    { value: "topic", label: "Topic" },
    { value: "accountFit", label: "Account Fit" },
    { value: "roleFit", label: "Role Fit" },
    { value: "historical", label: "Historical" },
    { value: "priority", label: "Final Priority" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Contact Scores</CardTitle>
          <div className="flex items-center gap-3">
            {/* Tier Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Tier:</span>
              <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="1">Tier 1</SelectItem>
                  <SelectItem value="2">Tier 2</SelectItem>
                  <SelectItem value="3">Tier 3</SelectItem>
                  <SelectItem value="4">Tier 4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort By */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : !data || data.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No scored contacts. Click "Score Queue" to start.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-center">AI Score</TableHead>
                  <TableHead className="text-center">Sub-Scores</TableHead>
                  <TableHead className="text-center">Final Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.contacts.map((contact) => (
                  <TableRow key={contact.queueId}>
                    <TableCell className="font-medium text-sm">
                      {contact.contactName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {contact.accountName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {contact.industry || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[150px]">
                      {contact.jobTitle || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={
                          contact.aiPriorityScore >= 800
                            ? "border-green-500 text-green-600"
                            : contact.aiPriorityScore >= 600
                            ? "border-blue-500 text-blue-600"
                            : contact.aiPriorityScore >= 400
                            ? "border-yellow-500 text-yellow-600"
                            : "border-red-500 text-red-600"
                        }
                      >
                        {contact.aiPriorityScore}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <SubScoreBars breakdown={contact.breakdown} />
                    </TableCell>
                    <TableCell className="text-center text-sm font-mono">
                      {contact.finalPriority}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} contacts)
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
