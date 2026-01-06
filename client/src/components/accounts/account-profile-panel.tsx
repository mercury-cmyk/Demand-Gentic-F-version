import { useMemo, useState } from "react";
import type { Account } from "@shared/schema";
import { FieldGroup } from "@/components/patterns/field-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AccountProfilePanelProps {
  account: Account;
}

export function AccountProfilePanel({ account }: AccountProfilePanelProps) {
  const domain = account.websiteDomain || account.domain;
  const address = useMemo(() => {
    return (
      account.hqAddress ||
      [account.hqStreet1, account.hqCity, account.hqState, account.hqCountry]
        .filter(Boolean)
        .join(", ")
    );
  }, [account]);

  const [expanded, setExpanded] = useState(false);
  const description = account.description || "";
  const shouldTruncate = description.length > 280;
  const visibleDescription =
    shouldTruncate && !expanded ? `${description.slice(0, 280)}…` : description;

  return (
    <div className="space-y-4">
      <FieldGroup
        title="Company Profile"
        rows={[
          {
            label: "Website",
            value: domain || undefined,
            href: domain ? `https://${domain}` : null,
          },
          {
            label: "Industry",
            value: account.industryStandardized,
          },
          {
            label: "SIC",
            value: account.sicCode,
          },
          {
            label: "NAICS",
            value: account.naicsCode,
          },
          {
            label: "Annual Revenue Range",
            value: account.revenueRange,
          },
          {
            label: "Employees Range",
            value: account.employeesSizeRange,
          },
          {
            label: "LinkedIn",
            value: account.linkedinUrl || undefined,
            href: account.linkedinUrl,
          },
          {
            label: "HQ Phone",
            value: account.mainPhone,
            copyValue: account.mainPhone ?? undefined,
          },
          {
            label: "HQ Address",
            value: address,
          },
        ]}
      />
      {description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Company Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{visibleDescription}</p>
            {shouldTruncate && (
              <Button variant="link" size="sm" onClick={() => setExpanded((prev) => !prev)}>
                {expanded ? "Show less" : "Show more"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
