import { motion } from "framer-motion";
import { Building2, Globe, Mail, Phone, Linkedin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { IconActionButton } from "@/components/shared/icon-action-button";
import type { Account } from "@shared/schema";
import { formatRevenue } from "@/lib/utils";

interface AccountCardPremiumProps {
  account: Account;
  onCardClick?: (id: string) => void;
  index?: number;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function AccountCardPremium({ account, onCardClick, index = 0, isSelected = false, onToggleSelect }: AccountCardPremiumProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatEmployeeRange = (range: string | null) => {
    if (!range) return null;
    return range.replace(/employees/i, '').trim();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick?.(account.id);
    }
  };

  const handleCheckboxKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    
       onCardClick?.(account.id)}
        onKeyDown={handleKeyDown}
        data-testid={`account-card-${account.id}`}
        aria-label={`Account ${account.name}`}
      >
        
          
            {onToggleSelect && (
              
                 {
                    if (checked !== isSelected) {
                      onToggleSelect(account.id);
                    }
                  }}
                  aria-label={`Select ${account.name}`}
                  data-testid={`checkbox-account-${account.id}`}
                />
              
            )}
            
              
                
                  {getInitials(account.name)}
                
              
              
                
                  {account.name}
                
                
                  {account.industryStandardized || 'Industry not specified'}
                  {account.employeesSizeRange && ` • ${formatEmployeeRange(account.employeesSizeRange)}`}
                
              
            
             e.stopPropagation()}>
              {account.domain && (
                
              )}
              {account.linkedinUrl && (
                
              )}
               console.log('Send email to', account.id)}
              />
              {account.mainPhone && (
                 console.log('Call', account.mainPhone)}
                />
              )}
            
          

          
            {account.industryStandardized && (
              
                {account.industryStandardized}
              
            )}
            {account.hqCountry && (
              
                {account.hqCountry}
              
            )}
            {account.annualRevenue && (
              
                {formatRevenue(account.annualRevenue)}
              
            )}
          

          {(account.description || account.hqCity) && (
            
              {account.hqCity && account.hqState && (
                {account.hqCity}, {account.hqState}
              )}
              {account.description && (
                • {account.description}
              )}
            
          )}

          
            
              {account.domain || 'No domain'}
            
            
              
              Account #{account.id.slice(0, 8)}
            
          
        
      
    
  );
}