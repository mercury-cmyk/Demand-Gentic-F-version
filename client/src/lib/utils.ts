import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRevenue(revenue: string | number | null | undefined): string | null {
  if (revenue === null || revenue === undefined) return null;
  
  const num = typeof revenue === 'string' ? parseFloat(revenue) : revenue;
  if (isNaN(num)) return typeof revenue === 'string' ? revenue : null;
  
  // Map numbers to revenue range text (based on common B2B ranges)
  // This handles the case where CSV import converted range text to numbers
  if (num >= 5_000_000_000) return "Over 5 Billion";
  if (num >= 1_000_000_000) return "1-5 Billion";
  if (num >= 500_000_000) return "500 Million - 1 Billion";
  if (num >= 100_000_000) return "100-500 Million";
  if (num >= 50_000_000) return "50-100 Million";
  if (num >= 10_000_000) return "10-50 Million";
  if (num >= 1_000_000) return "1-10 Million";
  if (num >= 500_000) return "500K - 1 Million";
  if (num >= 100_000) return "100K - 500K";
  if (num >= 10_000) return "10K - 100K";
  if (num >= 1_000) return "1K - 10K";
  if (num > 0) return "Under 1K";
  return "$0";
}
