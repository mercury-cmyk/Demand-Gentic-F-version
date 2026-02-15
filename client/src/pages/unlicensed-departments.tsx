import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building, MessageSquare, Target } from "lucide-react";
import { ConversationQualityTab } from "@/components/unlicensed/conversation-quality-tab";
import { LeadQualityTab } from "@/components/unlicensed/lead-quality-tab";

export default function UnlicensedDepartments() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Building className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Unlicensed Department</h1>
            <p className="text-sm text-muted-foreground">
              Independent scoring departments for conversation quality and lead quality analysis
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="conversation-quality" className="flex-1 flex flex-col">
        <div className="border-b px-6">
          <TabsList className="h-12">
            <TabsTrigger value="conversation-quality" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Conversation Quality
            </TabsTrigger>
            <TabsTrigger value="lead-quality" className="gap-2">
              <Target className="h-4 w-4" />
              Lead Quality & Analysis
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="conversation-quality" className="flex-1 m-0">
          <ConversationQualityTab />
        </TabsContent>

        <TabsContent value="lead-quality" className="flex-1 m-0">
          <LeadQualityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
