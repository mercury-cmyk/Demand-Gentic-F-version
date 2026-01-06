import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Trash2, Download } from "lucide-react";

export function PlaybookManager() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Playbooks & Knowledge Base</CardTitle>
        <CardDescription>
          Upload internal documents, sales scripts, and operating procedures.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-accent/50 transition-colors cursor-pointer">
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <h3 className="font-semibold">Upload Documents</h3>
            <p className="text-sm text-muted-foreground">
              Drag & drop PDF, DOCX, or TXT files here
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium">Active Documents</h3>
          <div className="space-y-2">
            {[
              { name: "Sales_Playbook_2025.pdf", size: "2.4 MB", date: "Jan 12, 2025" },
              { name: "Brand_Voice_Guidelines.docx", size: "1.1 MB", date: "Dec 20, 2024" },
              { name: "Objection_Handling_Script.txt", size: "45 KB", date: "Jan 15, 2025" },
            ].map((file, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-md bg-card">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.size} • Uploaded {file.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
