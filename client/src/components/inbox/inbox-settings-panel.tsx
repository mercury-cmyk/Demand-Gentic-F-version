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
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<InboxSettings>({
    queryKey: ["/api/inbox/settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/inbox/settings");
      return res.json();
    },
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<InboxSettings>) => {
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

  function updateSetting<K extends keyof InboxSettings>(key: K, value: InboxSettings[K]) {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Inbox Settings</SheetTitle>
          <SheetDescription>Configure your email preferences</SheetDescription>
        </SheetHeader>

        {/* Tab navigation */}
        <div className="flex gap-1 mt-4 mb-6 flex-wrap">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon className="h-3.5 w-3.5 mr-1.5" />
              {tab.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {activeTab === "general" && (
              <>
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Display Density</Label>
                  <Select
                    value={current.displayDensity}
                    onValueChange={(v) => updateSetting("displayDensity", v as InboxSettings["displayDensity"])}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compact</SelectItem>
                      <SelectItem value="comfortable">Comfortable</SelectItem>
                      <SelectItem value="spacious">Spacious</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Controls the spacing in the email list</p>
                </div>
              </>
            )}

            {activeTab === "signatures" && (
              <SignatureManager embedded />
            )}

            {activeTab === "notifications" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">New email notifications</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Show badge when new emails arrive</p>
                  </div>
                  <Switch
                    checked={current.notifyNewEmail}
                    onCheckedChange={(v) => updateSetting("notifyNewEmail", v)}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Desktop notifications</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Browser push notifications for new emails</p>
                  </div>
                  <Switch
                    checked={current.notifyDesktop}
                    onCheckedChange={(v) => updateSetting("notifyDesktop", v)}
                  />
                </div>
              </>
            )}

            {activeTab === "auto-reply" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Auto-reply (Vacation)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Automatically respond to incoming emails</p>
                  </div>
                  <Switch
                    checked={current.autoReplyEnabled}
                    onCheckedChange={(v) => updateSetting("autoReplyEnabled", v)}
                  />
                </div>
                {current.autoReplyEnabled && (
                  <div className="space-y-3 mt-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Subject</Label>
                      <Input
                        value={current.autoReplySubject}
                        onChange={(e) => updateSetting("autoReplySubject", e.target.value)}
                        placeholder="Out of office"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Message</Label>
                      <textarea
                        value={current.autoReplyBody}
                        onChange={(e) => updateSetting("autoReplyBody", e.target.value)}
                        placeholder="I'm currently out of the office..."
                        className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm resize-y"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "accounts" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md bg-red-500/10 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-red-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Gmail</p>
                      <p className="text-xs text-muted-foreground">Google Workspace</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={gmailConnected ? "default" : "secondary"}>
                      {gmailConnected ? "Connected" : "Not connected"}
                    </Badge>
                    {gmailConnected ? (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDisconnectGmail}>
                        Disconnect
                      </Button>
                    ) : (
                      <Button size="sm" className="h-7 text-xs" onClick={onConnectGmail} disabled={isConnectingGmail}>
                        {isConnectingGmail ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Outlook / Microsoft 365</p>
                      <p className="text-xs text-muted-foreground">Exchange Online</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m365Connected ? "default" : "secondary"}>
                      {m365Connected ? "Connected" : "Not connected"}
                    </Badge>
                    {m365Connected ? (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDisconnectM365}>
                        Disconnect
                      </Button>
                    ) : (
                      <Button size="sm" className="h-7 text-xs" onClick={onConnectM365} disabled={isConnectingM365}>
                        {isConnectingM365 ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
