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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card 
        role="button"
        tabIndex={0}
        className="rounded-2xl shadow-smooth hover:shadow-smooth-lg transition-all duration-300 card-hover cursor-pointer border-0 group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        onClick={() => onCardClick?.(account.id)}
        onKeyDown={handleKeyDown}
        data-testid={`account-card-${account.id}`}
        aria-label={`Account ${account.name}`}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            {onToggleSelect && (
              <div 
                className="flex-shrink-0 pt-1" 
                onClick={handleCheckboxClick}
                onKeyDown={handleCheckboxKeyDown}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => {
                    if (checked !== isSelected) {
                      onToggleSelect(account.id);
                    }
                  }}
                  aria-label={`Select ${account.name}`}
                  data-testid={`checkbox-account-${account.id}`}
                />
              </div>
            )}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="size-12 rounded-xl bg-gradient-to-br from-primary to-teal-accent flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-white font-semibold text-sm">
                  {getInitials(account.name)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {account.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {account.industryStandardized || 'Industry not specified'}
                  {account.employeesSizeRange && ` • ${formatEmployeeRange(account.employeesSizeRange)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              {account.domain && (
                <IconActionButton
                  icon={Globe}
                  label="Visit Website"
                  href={`https://${account.domain}`}
                />
              )}
              {account.linkedinUrl && (
                <IconActionButton
                  icon={Linkedin}
                  label="LinkedIn Profile"
                  href={account.linkedinUrl}
                />
              )}
              <IconActionButton
                icon={Mail}
                label="Send Email"
                onClick={() => console.log('Send email to', account.id)}
              />
              {account.mainPhone && (
                <IconActionButton
                  icon={Phone}
                  label="Call Main Number"
                  onClick={() => console.log('Call', account.mainPhone)}
                />
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {account.industryStandardized && (
              <Badge variant="secondary" className="bg-teal-accent/10 text-teal-accent border-0 rounded-full px-2.5 py-0.5">
                {account.industryStandardized}
              </Badge>
            )}
            {account.hqCountry && (
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5">
                {account.hqCountry}
              </Badge>
            )}
            {account.annualRevenue && (
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5">
                {formatRevenue(account.annualRevenue)}
              </Badge>
            )}
          </div>

          {(account.description || account.hqCity) && (
            <div className="mt-3 text-xs text-muted-foreground line-clamp-2">
              {account.hqCity && account.hqState && (
                <span>{account.hqCity}, {account.hqState}</span>
              )}
              {account.description && (
                <span className="ml-1">• {account.description}</span>
              )}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {account.domain || 'No domain'}
            </span>
            <span className="flex items-center gap-1">
              <Building2 className="size-3" />
              Account #{account.id.slice(0, 8)}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
