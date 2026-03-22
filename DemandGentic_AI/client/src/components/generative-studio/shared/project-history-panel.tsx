import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Globe,
  Mail,
  FileText,
  BookOpen,
  Briefcase,
  Image,
  Clock,
  Trash2,
  Sparkles,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  title: string;
  contentType: string;
  status: string;
  createdAt: string;
  tokensUsed?: number;
}

const CONTENT_TYPE_CONFIG: Record = {
  landing_page: { icon: Globe, label: "Landing Page", color: "text-blue-600 bg-blue-50" },
  email_template: { icon: Mail, label: "Email Template", color: "text-emerald-600 bg-emerald-50" },
  blog_post: { icon: FileText, label: "Blog Post", color: "text-orange-600 bg-orange-50" },
  ebook: { icon: BookOpen, label: "eBook", color: "text-rose-600 bg-rose-50" },
  solution_brief: { icon: Briefcase, label: "Solution Brief", color: "text-teal-600 bg-teal-50" },
  image: { icon: Image, label: "Image", color: "text-violet-600 bg-violet-50" },
};

interface ProjectHistoryPanelProps {
  onSelectProject?: (project: Project) => void;
  organizationId?: string;
  clientProjectId?: string;
  organizationName?: string;
  projectName?: string;
}

export default function ProjectHistoryPanel({
  onSelectProject,
  organizationId,
  clientProjectId,
  organizationName,
  projectName,
}: ProjectHistoryPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectsQueryKey = `/api/generative-studio/projects?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`;

  const { data, isLoading } = useQuery({
    queryKey: [projectsQueryKey],
    enabled: !!organizationId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(
        "DELETE",
        `/api/generative-studio/projects/${id}?organizationId=${organizationId || ""}&clientProjectId=${clientProjectId || ""}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [projectsQueryKey] });
      toast({ title: "Project deleted" });
    },
  });

  const projects = data?.projects || [];

  return (
    <>
      
        
          
          Generation History
        
        
          {organizationId ? (
            
              {projects.length} projects generated
              {organizationName && (
                Org: {organizationName}
              )}
              {projectName && (
                Project: {projectName}
              )}
            
          ) : (
            "Select an organization to view history"
          )}
        
      

      
        
          {isLoading && (
            Loading...
          )}

          {!isLoading && projects.length === 0 && (
            
              
                
              
              
                {organizationId
                  ? "No projects yet. Start generating content!"
                  : "Select an organization to view history."}
              
            
          )}

          {projects.map((project) => {
            const config = CONTENT_TYPE_CONFIG[project.contentType] || { icon: FileText, label: project.contentType, color: "text-muted-foreground bg-muted" };
            const Icon = config.icon;
            return (
               onSelectProject?.(project)}
              >
                
                  
                
                
                  {project.title}
                  
                    
                      {config.label}
                    
                    
                      {project.status}
                    
                  
                  
                    
                    {new Date(project.createdAt).toLocaleDateString()}
                  
                
                 {
                    e.stopPropagation();
                    deleteMutation.mutate(project.id);
                  }}
                >
                  
                
              
            );
          })}
        
      
    
  );
}