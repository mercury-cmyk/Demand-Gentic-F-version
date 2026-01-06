import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NotesOverridesTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes & Overrides</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Manual notes and system overrides will appear here.</p>
      </CardContent>
    </Card>
  );
}
