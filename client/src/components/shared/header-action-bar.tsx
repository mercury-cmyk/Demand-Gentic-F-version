import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { IconButton } from "./icon-button";
import { 
  Linkedin, 
  Globe, 
  Phone, 
  Mail, 
  Copy,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ReactNode } from "react";

interface HeaderAction {
  type: "linkedin" | "website" | "call" | "email" | "copy";
  value?: string;
  label: string;
  onClick?: () => void;
}

interface HeaderActionBarProps {
  avatarUrl?: string;
  avatarFallback: string;
  title: string;
  subtitle?: string;
  badges?: Array<{ label: string; variant?: any; className?: string }>;
  actions: HeaderAction[];
  loading?: boolean;
  rightContent?: ReactNode;
}

export function HeaderActionBar({
  avatarUrl,
  avatarFallback,
  title,
  subtitle,
  badges = [],
  actions,
  loading = false,
  rightContent,
}: HeaderActionBarProps) {
  const { toast } = useToast();

  const handleAction = (action: HeaderAction) => {
    if (action.onClick) {
      action.onClick();
      return;
    }

    switch (action.type) {
      case "linkedin":
        if (action.value) {
          window.open(action.value, "_blank", "noopener,noreferrer");
        }
        break;
      case "website":
        if (action.value) {
          const url = action.value.startsWith("http") 
            ? action.value 
            : `https://${action.value}`;
          window.open(url, "_blank", "noopener,noreferrer");
        }
        break;
      case "call":
        if (action.value) {
          // For now, use tel: fallback
          // In production, this would trigger Telnyx softphone
          window.location.href = `tel:${action.value}`;
        }
        break;
      case "email":
        if (action.value) {
          window.location.href = `mailto:${action.value}`;
        }
        break;
      case "copy":
        if (action.value) {
          navigator.clipboard.writeText(action.value);
          toast({
            title: "Copied",
            description: `${action.label} copied to clipboard`,
          });
        }
        break;
    }
  };

  const getIcon = (type: HeaderAction["type"]) => {
    switch (type) {
      case "linkedin": return Linkedin;
      case "website": return Globe;
      case "call": return Phone;
      case "email": return Mail;
      case "copy": return Copy;
    }
  };

  return (
    <div className="sticky top-0 z-10 border-b bg-gradient-surface shadow-smooth backdrop-blur-sm">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-6">
          {/* Left: Avatar + Title + Badges */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="relative">
              <Avatar className="h-16 w-16 border-2 border-primary/30 shadow-lg">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={title} />}
                <AvatarFallback className="bg-gradient-primary text-white font-bold text-xl">
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-green-500 rounded-full border-2 border-background"></div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold truncate">{title}</h1>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
              )}
              {badges.length > 0 && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {badges.map((badge, idx) => (
                    <Badge 
                      key={idx} 
                      variant={badge.variant}
                      className={badge.className}
                    >
                      {badge.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Action Icons */}
          <div className="flex items-center gap-1">
            {actions.map((action, idx) => (
              <IconButton
                key={idx}
                icon={getIcon(action.type)}
                label={action.label}
                onClick={() => handleAction(action)}
                disabled={!action.value && !action.onClick}
                testId={`action-${action.type}`}
              />
            ))}
            {rightContent}
          </div>
        </div>
      </div>
    </div>
  );
}