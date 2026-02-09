/**
 * OrderCostEstimate
 * Real-time pricing widget for order cost estimation
 */
import { motion } from 'framer-motion';
import {
  DollarSign,
  TrendingDown,
  Clock,
  Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PricingBreakdown } from './order-agent-types';

interface OrderCostEstimateProps {
  pricingBreakdown: PricingBreakdown | null;
  volume: number;
  isLoading?: boolean;
  compact?: boolean;
}

export function OrderCostEstimate({
  pricingBreakdown,
  volume,
  isLoading = false,
  compact = false,
}: OrderCostEstimateProps) {
  if (!pricingBreakdown) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <DollarSign className="h-4 w-4" />
          <span>{isLoading ? 'Calculating...' : 'Cost estimate unavailable'}</span>
        </div>
      </div>
    );
  }

  const {
    baseRate,
    basePrice,
    volumeDiscountPercent,
    volumeDiscount,
    rushFeePercent,
    rushFee,
    hasCustomPricing,
    totalCost,
  } = pricingBreakdown;

  const perLeadCost = volume > 0 ? totalCost / volume : 0;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1.5"
      >
        <DollarSign className="h-4 w-4 text-primary" />
        <span className="font-semibold text-primary">
          ${totalCost.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">
          (${perLeadCost.toFixed(0)}/lead)
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Cost Estimate</span>
        </div>
        {hasCustomPricing && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-xs gap-1">
                  <Info className="h-3 w-3" />
                  Custom Pricing
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Your account has custom pricing rates applied</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Pricing Breakdown */}
      <div className="p-4 space-y-3">
        {/* Base Price */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Base ({volume} x ${baseRate.toFixed(2)})
          </span>
          <span>${basePrice.toLocaleString()}</span>
        </div>

        {/* Volume Discount */}
        {volumeDiscountPercent > 0 && (
          <div className="flex items-center justify-between text-sm text-green-600">
            <span className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              Volume Discount ({volumeDiscountPercent}%)
            </span>
            <span>-${volumeDiscount.toLocaleString()}</span>
          </div>
        )}

        {/* Rush Fee */}
        {rushFeePercent > 0 && (
          <div className="flex items-center justify-between text-sm text-amber-600">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Rush Fee ({rushFeePercent}%)
            </span>
            <span>+${rushFee.toLocaleString()}</span>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Total */}
        <div className="flex items-center justify-between">
          <span className="font-medium">Estimated Total</span>
          <div className="text-right">
            <span className="text-xl font-bold text-primary">
              ${totalCost.toLocaleString()}
            </span>
            <p className="text-xs text-muted-foreground">
              ${perLeadCost.toFixed(2)} per lead
            </p>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="px-4 py-2 bg-muted/30 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground text-center">
          Final pricing confirmed upon order approval
        </p>
      </div>
    </motion.div>
  );
}
