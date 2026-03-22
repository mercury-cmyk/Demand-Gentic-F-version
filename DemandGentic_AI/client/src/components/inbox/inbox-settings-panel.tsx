import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { SignatureManager } from "@/components/signature-manager";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings, PenLine, Bell, Mail, Globe } from "lucide-react";

interface InboxSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gmailConnected?: boolean;
  m365Connected?: boolean;
  onConnectGmail?: () => void;
  onConnectM365?: () => void;
  onDisconnectGmail?: () => void;
  onDisconnectM365?: () => void;
  isConnectingGmail?: boolean;
  isConnectingM365?: boolean;
}

interface InboxSettings {
  displayDensity: "compact" | "comfortable" | "spacious";
  autoReplyEnabled: boolean;
  autoReplySubject: string;
  autoReplyBody: string;
  notifyNewEmail: boolean;
  notifyDesktop: boolean;
  sidebarCollapsed: boolean;
}

const defaultSettings: InboxSettings = {
  displayDensity: "comfortable",
  autoReplyEnabled: false,
  autoReplySubject: "",
  autoReplyBody: "",
  notifyNewEmail: true,
  notifyDesktop: false,
  sidebarCollapsed: false,
};

type SettingsTab = "general" | "signatures" | "notifications" | "auto-reply" | "accounts";

export function InboxSettingsPanel({ open, onOpenChange, gmailConnected, m365Connected, onConnectGmail, onConnectM365, onDisconnectGmail, onDisconnectM365, isConnectingGmail, isConnectingM365 }: InboxSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState("general");
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/inbox/settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/inbox/settings");
      return res.json();
    },
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial) => {
      await apiRequest("PUT", "/api/inbox/settings", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const current = settings ?? defaultSettings;

  function updateSetting(key: K, value: InboxSettings[K]) {
    saveMutation.mutate({ [key]: value });
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: "general", label: "General", icon: Settings },
    { id: "signatures", label: "Signatures", icon: PenLine },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "auto-reply", label: "Auto-Reply", icon: Mail },
    { id: "accounts", label: "Accounts", icon: Globe },
  ];

  return (
    
      
        
          Inbox Settings
          Configure your email preferences
        

        {/* Tab navigation */}
        
          {tabs.map((tab) => (
             setActiveTab(tab.id)}
            >
              
              {tab.label}
            
          ))}
        

        {isLoading ? (
          
            
          
        ) : (
          
            {activeTab === "general" && (
              <>
                
                  Display Density
                   updateSetting("displayDensity", v as InboxSettings["displayDensity"])}
                  >
                    
                      
                    
                    
                      Compact
                      Comfortable
                      Spacious
                    
                  
                  Controls the spacing in the email list
                
              
            )}

            {activeTab === "signatures" && (
              
            )}

            {activeTab === "notifications" && (
              <>
                
                  
                    New email notifications
                    Show badge when new emails arrive
                  
                   updateSetting("notifyNewEmail", v)}
                  />
                
                
                
                  
                    Desktop notifications
                    Browser push notifications for new emails
                  
                   updateSetting("notifyDesktop", v)}
                  />
                
              
            )}

            {activeTab === "auto-reply" && (
              <>
                
                  
                    Auto-reply (Vacation)
                    Automatically respond to incoming emails
                  
                   updateSetting("autoReplyEnabled", v)}
                  />
                
                {current.autoReplyEnabled && (
                  
                    
                      Subject
                       updateSetting("autoReplySubject", e.target.value)}
                        placeholder="Out of office"
                        className="h-8 text-sm"
                      />
                    
                    
                      Message
                       updateSetting("autoReplyBody", e.target.value)}
                        placeholder="I'm currently out of the office..."
                        className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm resize-y"
                      />
                    
                  
                )}
              
            )}

            {activeTab === "accounts" && (
              
                
                  
                    
                      
                    
                    
                      Gmail
                      Google Workspace
                    
                  
                  
                    
                      {gmailConnected ? "Connected" : "Not connected"}
                    
                    {gmailConnected ? (
                      
                        Disconnect
                      
                    ) : (
                      
                        {isConnectingGmail ?  : null}
                        Connect
                      
                    )}
                  
                
                
                  
                    
                      
                    
                    
                      Outlook / Microsoft 365
                      Exchange Online
                    
                  
                  
                    
                      {m365Connected ? "Connected" : "Not connected"}
                    
                    {m365Connected ? (
                      
                        Disconnect
                      
                    ) : (
                      
                        {isConnectingM365 ?  : null}
                        Connect
                      
                    )}
                  
                
              
            )}
          
        )}
      
    
  );
}