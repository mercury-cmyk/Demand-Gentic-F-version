import { useMemo, useState } from "react";
import type { Contact } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/patterns/copy-button";
import { Button } from "@/components/ui/button";
import { Linkedin } from "lucide-react";
import { Link } from "wouter";

interface RelatedContactsTableProps {
  contacts?: Contact[];
}

const emailStatusStyles: Record = {
  verified: "bg-emerald-50 text-emerald-800 border-emerald-200",
  valid: "bg-emerald-50 text-emerald-800 border-emerald-200",
  risky: "bg-amber-50 text-amber-700 border-amber-200",
  invalid: "bg-red-50 text-red-700 border-red-200",
  unknown: "bg-muted text-muted-foreground border-border",
};

export function RelatedContactsTable({ contacts = [] }: RelatedContactsTableProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query) return contacts;
    const lowered = query.toLowerCase();
    return contacts.filter((contact) =>
      [contact.fullName, contact.email, contact.jobTitle]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(lowered)),
    );
  }, [contacts, query]);

  return (
    
      
        Related Contacts
         setQuery(event.target.value)}
          placeholder="Search contacts..."
          className="max-w-sm"
        />
      
      
        {filtered.length === 0 ? (
          No contacts found.
        ) : (
          
            
              
                
                  Name
                  Job Title
                  Email
                  Phone
                  LinkedIn
                  Last Activity
                
              
              
                {filtered.map((contact) => {
                  const legacyName =
                    (contact as unknown as { full_name?: string }).full_name;
                  const composedName = [contact.firstName, contact.lastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  const fullName =
                    contact.fullName || composedName || legacyName || "-";
                  const emailStatus = contact.emailVerificationStatus || "unknown";
                  const phone = contact.directPhone || contact.mobilePhone;
                  const lastActivity =
                    contact.updatedAt?.toString() || contact.createdAt?.toString();
                  return (
                    
                      
                        
                          {fullName}
                        
                      
                      {contact.jobTitle || "-"}
                      
                        
                          
                            {contact.email || "-"}
                          
                          {contact.email && (
                            
                          )}
                          
                            {emailStatus}
                          
                        
                      
                      
                        
                          {phone ?? "-"}
                          {phone && }
                        
                      
                      
                        {contact.linkedinUrl ? (
                          
                            
                              
                            
                          
                        ) : (
                          "-"
                        )}
                      
                      
                        {lastActivity
                          ? new Date(lastActivity).toLocaleDateString()
                          : "-"}
                      
                    
                  );
                })}
              
            
          
        )}
      
    
  );
}