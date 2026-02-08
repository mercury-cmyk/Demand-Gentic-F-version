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
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  title: string;
  contentType: string;
  status: string;
  createdAt: string;
  tokensUsed?: number;
}

const CONTENT_TYPE_ICONS: Record<string, any> = {
  landing_page: Globe,
  email_template: Mail,
  blog_post: FileText,
  ebook: BookOpen,
  solution_brief: Briefcase,
  image: Image,
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  landing_page: "Landing Page",
  email_template: "Email Template",
  blog_post: "Blog Post",
  ebook: "eBook",
  solution_brief: "Solution Brief",
};

interface ProjectHistoryPanelProps {
  onSelectProject?: (project: Project) => void;
}

export default function ProjectHistoryPanel({ onSelectProject }: ProjectHistoryPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ projects: Project[] }>({
    queryKey: ["/api/generative-studio/projects"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/generative-studio/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/generative-studio/projects"] });
      toast({ title: "Project deleted" });
    },
  });

  const projects = data?.projects || [];

  return (
    <>
      <SheetHeader>
        <SheetTitle>Generation History</SheetTitle>
        <SheetDescription>
          {projects.length} projects generated
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="flex-1 mt-4">
        <div className="space-y-2 pr-4">
          {isLoading && (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          )}

          {!isLoading && projects.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No projects yet. Start generating content!
            </div>
          )}

          {projects.map((project) => {
            const Icon = CONTENT_TYPE_ICONS[project.contentType] || FileText;
            return (
              <div
                key={project.id}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => onSelectProject?.(project)}
              >
                <div className="mt-0.5">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{project.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {CONTENT_TYPE_LABELS[project.contentType] || project.contentType}
                    </Badge>
                    <Badge
                      variant={project.status === "published" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {project.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {new Date(project.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(project.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </>
  );
}
