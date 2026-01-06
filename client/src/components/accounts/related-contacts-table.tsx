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

const emailStatusStyles: Record<string, string> = {
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
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-base font-semibold">Related Contacts</CardTitle>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search contacts..."
          className="max-w-sm"
        />
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts found.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>LinkedIn</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((contact) => {
                  const legacyName =
                    (contact as unknown as { full_name?: string }).full_name;
                  const fullName =
                    contact.fullName || legacyName || contact.name;
                  const emailStatus = contact.emailVerificationStatus || "unknown";
                  const phone = contact.directPhone || contact.mobilePhone;
                  const lastActivity =
                    contact.lastActivityAt ||
                    contact.updatedAt?.toString() ||
                    contact.createdAt?.toString();
                  return (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/contacts/${contact.id}`}
                          className="text-primary hover:underline"
                        >
                          {fullName}
                        </Link>
                      </TableCell>
                      <TableCell>{contact.jobTitle || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">
                            {contact.email || "—"}
                          </span>
                          {contact.email && (
                            <CopyButton value={contact.email} size="xs" />
                          )}
                          <Badge
                            variant="outline"
                            className={emailStatusStyles[emailStatus] ?? emailStatusStyles.unknown}
                          >
                            {emailStatus}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{phone ?? "—"}</span>
                          {phone && <CopyButton value={phone} size="xs" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.linkedinUrl ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            className="h-8 w-8"
                          >
                            <a
                              href={contact.linkedinUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Linkedin className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lastActivity
                          ? new Date(lastActivity).toLocaleDateString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
