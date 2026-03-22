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
  const [selectedCategory, setSelectedCategory] = useState(null);
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
    const labels: Record = {
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
    
      {/* Header */}
      
        
           navigate('/settings')}
            data-testid="button-back"
          >
            
          
          
            
              Data Management
            
            
              Admin-only: Permanently delete business data
            
          
        
      

      {/* Warning Banner */}
      
        
          
            
            Danger Zone
          
        
        
          
            These actions are permanent and irreversible. Deleted data cannot be recovered.
            All deletion actions are logged for audit purposes.
          
        
      

      {/* Data Categories */}
      
        {dataCategories.map(({ category, title, description, danger }) => (
          
            
              
                
                  
                  {title}
                
                
                  {danger === 'critical' ? 'CRITICAL' : danger === 'high' ? 'High Risk' : 'Medium Risk'}
                
              
              {description}
            
            
               handleDeleteClick(category)}
                className="w-full"
                data-testid={`button-delete-${category}`}
              >
                
                Delete {title}
              
            
          
        ))}
      

      {/* Confirmation Dialog */}
      
        
          
            
              
              Confirm Data Deletion
            
            
              
                You are about to permanently delete:{" "}
                
                  {selectedCategory && getCategoryLabel(selectedCategory)}
                
              
              
                This action CANNOT be undone. All data will be permanently lost.
              
              
                
                  Type DELETE to confirm
                
                 setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  data-testid="input-confirm-delete"
                />
              
            
          
          
             {
                setDeleteDialogOpen(false);
                setConfirmText("");
                setSelectedCategory(null);
              }}
              data-testid="button-cancel"
            >
              Cancel
            
            
              {deleteMutation.isPending && }
              Delete Permanently
            
          
        
      
    
  );
}