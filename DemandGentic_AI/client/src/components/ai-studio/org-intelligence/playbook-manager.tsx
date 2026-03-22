import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Trash2, Download } from "lucide-react";

export function PlaybookManager() {
  return (
    
      
        Playbooks & Knowledge Base
        
          Upload internal documents, sales scripts, and operating procedures.
        
      
      
        
          
            
            Upload Documents
            
              Drag & drop PDF, DOCX, or TXT files here
            
          
        

        
          Active Documents
          
            {[
              { name: "Sales_Playbook_2025.pdf", size: "2.4 MB", date: "Jan 12, 2025" },
              { name: "Brand_Voice_Guidelines.docx", size: "1.1 MB", date: "Dec 20, 2024" },
              { name: "Objection_Handling_Script.txt", size: "45 KB", date: "Jan 15, 2025" },
            ].map((file, i) => (
              
                
                  
                    
                  
                  
                    {file.name}
                    {file.size} • Uploaded {file.date}
                  
                
                
                  
                    
                  
                  
                    
                  
                
              
            ))}
          
        
      
    
  );
}