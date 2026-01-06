
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
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
  const { data, isLoading } = useQuery({
    queryKey: ['/api/reports/calls/details', filters, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      
      const response = await fetch(`/api/reports/calls/details?${params}`);
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
        <div>
          <div className="font-medium">{row.contactName}</div>
          <div className="text-xs text-muted-foreground">{row.accountName}</div>
        </div>
      ),
      sortable: true,
    },
    {
      id: 'disposition',
      header: 'Disposition',
      accessorKey: 'disposition',
      cell: (row: any) => (
        <Badge 
          variant={
            row.disposition === 'qualified' ? 'default' :
            row.disposition === 'dnc_request' ? 'destructive' :
            'secondary'
          }
        >
          {row.disposition?.replace(/_/g, ' ')}
        </Badge>
      ),
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
        <Badge variant={row.qaStatus === 'approved' ? 'default' : 'destructive'}>
          {row.qaStatus}
        </Badge>
      ) : (
        <span className="text-muted-foreground">--</span>
      ),
      sortable: true,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (row: any) => (
        <div className="flex items-center gap-2">
          {row.recordingUrl && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => window.open(row.recordingUrl, '_blank')}
              data-testid={`play-recording-${row.id}`}
            >
              <Play className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLocation(`/contacts/${row.contactId}`)}
            data-testid={`view-contact-${row.id}`}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
  ];
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => setLocation('/call-reports')}
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Call Details</h1>
            <p className="text-muted-foreground">
              {filters.disposition && `Filtered by: ${filters.disposition.replace(/_/g, ' ')}`}
              {filters.qaStatus && ` | QA: ${filters.qaStatus}`}
            </p>
          </div>
        </div>
        <Button variant="outline" data-testid="button-export">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>
      
      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {data?.pagination.total || 0} Calls Found
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={data?.calls || []}
            columns={columns}
            getRowId={(row: any) => row.id}
            loading={isLoading}
            onRowClick={(row: any) => setLocation(`/contacts/${row.contactId}`)}
            stickyHeader
          />
          
          {/* Pagination */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.pagination.page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.pagination.page >= data.pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
