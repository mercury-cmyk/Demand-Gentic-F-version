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

const CONTENT_TYPE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
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

  const { data, isLoading } = useQuery<{ projects: Project[] }>({
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
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          Generation History
        </SheetTitle>
        <SheetDescription>
          {organizationId ? (
            <span className="space-y-0.5">
              <span className="block">{projects.length} projects generated</span>
              {organizationName && (
                <span className="block text-[11px]">Org: {organizationName}</span>
              )}
              {projectName && (
                <span className="block text-[11px]">Project: {projectName}</span>
              )}
            </span>
          ) : (
            "Select an organization to view history"
          )}
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="flex-1 mt-4">
        <div className="space-y-1.5 pr-4">
          {isLoading && (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
          )}

          {!isLoading && projects.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted/50 mx-auto mb-3">
                <Sparkles className="w-5 h-5 opacity-30" />
              </div>
              <p className="text-sm">
                {organizationId
                  ? "No projects yet. Start generating content!"
                  : "Select an organization to view history."}
              </p>
            </div>
          )}

          {projects.map((project) => {
            const config = CONTENT_TYPE_CONFIG[project.contentType] || { icon: FileText, label: project.contentType, color: "text-muted-foreground bg-muted" };
            const Icon = config.icon;
            return (
              <div
                key={project.id}
                className="group flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-all hover:shadow-sm"
                onClick={() => onSelectProject?.(project)}
              >
                <div className={cn("flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5", config.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{project.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      {config.label}
                    </Badge>
                    <Badge
                      variant={project.status === "published" ? "default" : "secondary"}
                      className="text-[10px] h-4 px-1.5"
                    >
                      {project.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {new Date(project.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(project.id);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </>
  );
}
