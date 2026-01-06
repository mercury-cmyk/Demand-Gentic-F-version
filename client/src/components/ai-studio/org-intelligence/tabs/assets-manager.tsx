import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AssetsManagerTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assets</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Case studies, decks, and other assets will be managed here.</p>
      </CardContent>
    </Card>
  );
}
