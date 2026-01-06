import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ComplianceRules() {
  const [dos, setDos] = useState([
    "Always disclose you are an AI agent",
    "Verify decision maker status early",
    "Record all calls for quality assurance"
  ]);
  
  const [donts, setDonts] = useState([
    "Never promise specific ROI numbers without data",
    "Do not discuss competitor pricing",
    "Never ask for credit card info over chat"
  ]);

  const [newDo, setNewDo] = useState("");
  const [newDont, setNewDont] = useState("");

  const addDo = () => {
    if (newDo.trim()) {
      setDos([...dos, newDo.trim()]);
      setNewDo("");
    }
  };

  const addDont = () => {
    if (newDont.trim()) {
      setDonts([...donts, newDont.trim()]);
      setNewDont("");
    }
  };

  const removeDo = (index: number) => {
    setDos(dos.filter((_, i) => i !== index));
  };

  const removeDont = (index: number) => {
    setDonts(donts.filter((_, i) => i !== index));
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="border-green-200 dark:border-green-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            Do's (Encouraged)
          </CardTitle>
          <CardDescription>
            Behaviors and actions the AI should prioritize.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              placeholder="Add a new rule..." 
              value={newDo}
              onChange={(e) => setNewDo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDo()}
            />
            <Button size="icon" onClick={addDo} variant="outline" className="shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {dos.map((rule, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-100 dark:border-green-900">
                <span className="text-sm">{rule}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeDo(i)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            Don'ts (Restricted)
          </CardTitle>
          <CardDescription>
            Strict prohibitions and negative constraints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              placeholder="Add a new restriction..." 
              value={newDont}
              onChange={(e) => setNewDont(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDont()}
            />
            <Button size="icon" onClick={addDont} variant="outline" className="shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {donts.map((rule, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-100 dark:border-red-900">
                <span className="text-sm">{rule}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeDont(i)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
