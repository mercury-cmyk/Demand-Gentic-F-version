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
    shouldTruncate && !expanded ? `${description.slice(0, 280)}...` : description;

  return (
    
      
      {description && (
        
          
            Company Description
          
          
            {visibleDescription}
            {shouldTruncate && (
               setExpanded((prev) => !prev)}>
                {expanded ? "Show less" : "Show more"}
              
            )}
          
        
      )}
    
  );
}