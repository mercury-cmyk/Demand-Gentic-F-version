import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";

export function CampaignPlannerUnderConstruction() {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-slate-100 p-2">
            <Wrench className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <CardTitle className="text-xl">Campaign Planner</CardTitle>
          </div>
          <Badge variant="secondary" className="ml-auto bg-slate-200 text-slate-700">
            Coming soon
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Campaign Planner is under construction. We&apos;re working on it and it will be available soon.
        </p>
      </CardContent>
    </Card>
  );
}

export default CampaignPlannerUnderConstruction;
