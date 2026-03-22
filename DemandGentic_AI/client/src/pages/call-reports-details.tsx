import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useExportAuthority } from "@/hooks/use-export-authority";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, 
  ExternalLink,
  ArrowLeft,
  Download,
  Play
} from "lucide-react";
import { DataTable, DataTableColumn } from "@/components/patterns/data-table";
import { format } from "date-fns";

export default function CallReportsDetailsPage() {
  const [, setLocation] = useLocation();
  const { canExportData } = useExportAuthority();
  const searchParams = new URLSearchParams(useSearch());
  
  const filters = {
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
    campaignId: searchParams.get('campaignId') || undefined,
    agentId: searchParams.get('agentId') || undefined,
    disposition: searchParams.get('disposition') || undefined,
    qaStatus: searchParams.get('qaStatus') || undefined,
  };
  
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  
  // Fetch call details
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/reports/calls/details', filters, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/reports/calls/details?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch calls: ${response.status}`);
      }
      return response.json();
    },
  });
  
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  const columns: DataTableColumn[] = [
    {
      id: 'startTime',
      header: 'Date/Time',
      accessorKey: 'startTime',
      cell: (row: any) => format(new Date(row.startTime), 'MMM dd, yyyy HH:mm'),
      sortable: true,
    },
    {
      id: 'campaignName',
      header: 'Campaign',
      accessorKey: 'campaignName',
      sortable: true,
    },
    {
      id: 'agentName',
      header: 'Agent',
      accessorKey: 'agentName',
      sortable: true,
    },
    {
      id: 'contactName',
      header: 'Contact',
      accessorKey: 'contactName',
      cell: (row: any) => (
        
          {row.contactName}
          {row.accountName}
        
      ),
      sortable: true,
    },
    {
      id: 'disposition',
      header: 'Disposition',
      accessorKey: 'disposition',
      cell: (row: any) => {
        const disposition = row.disposition || 'Unknown';
        const variant =
          disposition === 'Qualified Lead' || disposition === 'qualified' ? 'default' :
          disposition === 'DNC Request' || disposition === 'dnc_request' || disposition === 'do_not_call' ? 'destructive' :
          disposition === 'Not Interested' || disposition === 'not_interested' ? 'outline' :
          'secondary';
        return (
          
            {disposition.replace(/_/g, ' ')}
          
        );
      },
      sortable: true,
    },
    {
      id: 'duration',
      header: 'Duration',
      accessorKey: 'duration',
      cell: (row: any) => formatDuration(row.duration),
      sortable: true,
      align: 'center',
    },
    {
      id: 'qaStatus',
      header: 'QA Status',
      accessorKey: 'qaStatus',
      cell: (row: any) => row.qaStatus ? (
        
          {row.qaStatus}
        
      ) : (
        --
      ),
      sortable: true,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (row: any) => (
        
          {row.recordingUrl && (
             window.open(row.recordingUrl, '_blank')}
              data-testid={`play-recording-${row.id}`}
            >
              
            
          )}
           setLocation(`/contacts/${row.contactId}`)}
            data-testid={`view-contact-${row.id}`}
          >
            
          
        
      ),
    },
  ];
  
  return (
    
      {/* Header */}
      
        
           setLocation('/call-reports')}
            data-testid="button-back"
          >
            
            Back to Reports
          
          
            Call Details
            
              {filters.disposition && `Filtered by: ${filters.disposition.replace(/_/g, ' ')}`}
              {filters.qaStatus && ` | QA: ${filters.qaStatus}`}
            
          
        
        {canExportData && (
          
            
            Export CSV
          
        )}
      
      
      {/* Data Table */}
      
        
          
            {data?.pagination?.total ?? 0} Calls Found
          
        
        
          {error ? (
            
              Failed to load call details. Please try again.
            
          ) : (
            <>
           row.id}
            loading={isLoading}
            onRowClick={(row: any) => setLocation(`/contacts/${row.contactId}`)}
            stickyHeader
          />
          
          {/* Pagination */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            
              
                Page {data.pagination.page} of {data.pagination.totalPages}
              
              
                 setPage(p => p - 1)}
                >
                  Previous
                
                = data.pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                
              
            
          )}
            
          )}
        
      
    
  );
}