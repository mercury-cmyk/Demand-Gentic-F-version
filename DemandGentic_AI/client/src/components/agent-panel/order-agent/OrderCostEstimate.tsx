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
      
        
          
          {isLoading ? 'Calculating...' : 'Cost estimate unavailable'}
        
      
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
      
        
        
          ${totalCost.toLocaleString()}
        
        
          (${perLeadCost.toFixed(0)}/lead)
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
          
          Cost Estimate
        
        {hasCustomPricing && (
          
            
              
                
                  
                  Custom Pricing
                
              
              
                Your account has custom pricing rates applied
              
            
          
        )}
      

      {/* Pricing Breakdown */}
      
        {/* Base Price */}
        
          
            Base ({volume} x ${baseRate.toFixed(2)})
          
          ${basePrice.toLocaleString()}
        

        {/* Volume Discount */}
        {volumeDiscountPercent > 0 && (
          
            
              
              Volume Discount ({volumeDiscountPercent}%)
            
            -${volumeDiscount.toLocaleString()}
          
        )}

        {/* Rush Fee */}
        {rushFeePercent > 0 && (
          
            
              
              Rush Fee ({rushFeePercent}%)
            
            +${rushFee.toLocaleString()}
          
        )}

        {/* Divider */}
        

        {/* Total */}
        
          Estimated Total
          
            
              ${totalCost.toLocaleString()}
            
            
              ${perLeadCost.toFixed(2)} per lead
            
          
        
      

      {/* Footer Note */}
      
        
          Final pricing confirmed upon order approval
        
      
    
  );
}