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
    
      
        
          
            {SCORE_DIMENSIONS.map(dim => (
              
            ))}
          
        
        
          
            {SCORE_DIMENSIONS.map(dim => (
              
                
                {dim.label}: {breakdown[dim.key]}/200
              
            ))}
          
        
      
    
  );
}

export function ContactScoresTable({ campaignId }: Props) {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("score");
  const [tierFilter, setTierFilter] = useState("all");

  const { data, isLoading } = useQuery({
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
    
      
        
          Contact Scores
          
            {/* Tier Filter */}
            
              Tier:
               { setTierFilter(v); setPage(1); }}>
                
                  
                
                
                  All
                  Tier 1
                  Tier 2
                  Tier 3
                  Tier 4
                
              
            

            {/* Sort By */}
            
              
               { setSortBy(v); setPage(1); }}>
                
                  
                
                
                  {sortOptions.map(opt => (
                    {opt.label}
                  ))}
                
              
            
          
        
      
      
        {isLoading ? (
          Loading...
        ) : !data || data.contacts.length === 0 ? (
          
            No scored contacts. Click "Score Queue" to start.
          
        ) : (
          <>
            
              
                
                  Contact
                  Company
                  Industry
                  Title
                  AI Score
                  Sub-Scores
                  Final Priority
                
              
              
                {data.contacts.map((contact) => (
                  
                    
                      {contact.contactName}
                    
                    
                      {contact.accountName}
                    
                    
                      {contact.industry || "—"}
                    
                    
                      {contact.jobTitle || "—"}
                    
                    
                      = 800
                            ? "border-green-500 text-green-600"
                            : contact.aiPriorityScore >= 600
                            ? "border-blue-500 text-blue-600"
                            : contact.aiPriorityScore >= 400
                            ? "border-yellow-500 text-yellow-600"
                            : "border-red-500 text-red-600"
                        }
                      >
                        {contact.aiPriorityScore}
                      
                    
                    
                      
                    
                    
                      {contact.finalPriority}
                    
                  
                ))}
              
            

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              
                
                  Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} contacts)
                
                
                   setPage(p => p - 1)}
                  >
                    
                  
                  = data.pagination.totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    
                  
                
              
            )}
          
        )}
      
    
  );
}