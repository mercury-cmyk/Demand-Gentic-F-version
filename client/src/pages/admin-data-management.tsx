import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2, Database, ArrowLeft, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

type DataCategory = 'verification_campaigns' | 'verification_contacts' | 'campaigns' | 'contacts' | 'accounts' | 'leads' | 'all';

export default function AdminDataManagementPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DataCategory | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async (category: DataCategory) => {
      return await apiRequest('DELETE', `/api/admin/data/${category}`, {});
    },
    onSuccess: (_, category) => {
      toast({
        title: "Data Deleted",
        description: `Successfully deleted ${getCategoryLabel(category)}`,
      });
      setDeleteDialogOpen(false);
      setConfirmText("");
      setSelectedCategory(null);
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete data",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (category: DataCategory) => {
    setSelectedCategory(category);
    setConfirmText("");
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedCategory && confirmText === "DELETE") {
      deleteMutation.mutate(selectedCategory);
    }
  };

  const getCategoryLabel = (category: DataCategory): string => {
    const labels: Record<DataCategory, string> = {
      verification_campaigns: "All Verification Campaigns",
      verification_contacts: "All Verification Contacts",
      campaigns: "All Regular Campaigns",
      contacts: "All Contacts",
      accounts: "All Accounts",
      leads: "All Leads",
      all: "ALL Business Data",
    };
    return labels[category];
  };

  const dataCategories = [
    {
      category: 'verification_campaigns' as DataCategory,
      title: "Verification Campaigns",
      description: "Delete all verification campaigns and their settings",
      danger: "medium",
    },
    {
      category: 'verification_contacts' as DataCategory,
      title: "Verification Contacts",
      description: "Delete all contacts in verification campaigns",
      danger: "high",
    },
    {
      category: 'campaigns' as DataCategory,
      title: "Regular Campaigns",
      description: "Delete all email/telemarketing campaigns",
      danger: "medium",
    },
    {
      category: 'contacts' as DataCategory,
      title: "Contacts",
      description: "Delete all contacts from CRM",
      danger: "high",
    },
    {
      category: 'accounts' as DataCategory,
      title: "Accounts",
      description: "Delete all company accounts",
      danger: "high",
    },
    {
      category: 'leads' as DataCategory,
      title: "Leads",
      description: "Delete all generated leads",
      danger: "medium",
    },
    {
      category: 'all' as DataCategory,
      title: "ALL BUSINESS DATA",
      description: "⚠️ DANGER: Delete everything - campaigns, contacts, accounts, leads",
      danger: "critical",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/settings')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              Data Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Admin-only: Permanently delete business data
            </p>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      <Card className="border-destructive">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            These actions are <strong>permanent and irreversible</strong>. Deleted data cannot be recovered.
            All deletion actions are logged for audit purposes.
          </p>
        </CardContent>
      </Card>

      {/* Data Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dataCategories.map(({ category, title, description, danger }) => (
          <Card 
            key={category}
            className={danger === 'critical' ? 'border-destructive' : ''}
            data-testid={`card-${category}`}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  {title}
                </CardTitle>
                <Badge 
                  variant={danger === 'critical' ? 'destructive' : danger === 'high' ? 'outline' : 'secondary'}
                >
                  {danger === 'critical' ? 'CRITICAL' : danger === 'high' ? 'High Risk' : 'Medium Risk'}
                </Badge>
              </div>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant={danger === 'critical' ? 'destructive' : 'outline'}
                onClick={() => handleDeleteClick(category)}
                className="w-full"
                data-testid={`button-delete-${category}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {title}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Data Deletion
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                You are about to <strong>permanently delete</strong>:{" "}
                <span className="text-destructive font-semibold">
                  {selectedCategory && getCategoryLabel(selectedCategory)}
                </span>
              </p>
              <p className="text-destructive font-semibold">
                This action CANNOT be undone. All data will be permanently lost.
              </p>
              <div className="space-y-2">
                <Label htmlFor="confirm-text">
                  Type <span className="font-mono font-bold">DELETE</span> to confirm
                </Label>
                <Input
                  id="confirm-text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  data-testid="input-confirm-delete"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setDeleteDialogOpen(false);
                setConfirmText("");
                setSelectedCategory(null);
              }}
              data-testid="button-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={confirmText !== "DELETE" || deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
