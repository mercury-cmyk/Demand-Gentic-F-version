/**
 * QA Status Badge Component
 * Displays the QA status of content with color-coded badges
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

export type QAStatus = 'new' | 'under_review' | 'approved' | 'rejected' | 'returned' | 'published';

interface QAStatusBadgeProps {
  status: QAStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const statusConfig: Record<QAStatus, {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: typeof CheckCircle;
  className: string;
}> = {
  new: {
    label: 'New',
    variant: 'secondary',
    icon: Clock,
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  },
  under_review: {
    label: 'Under Review',
    variant: 'outline',
    icon: Eye,
    className: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  },
  approved: {
    label: 'Approved',
    variant: 'default',
    icon: CheckCircle,
    className: 'bg-green-100 text-green-700 border-green-200',
  },
  rejected: {
    label: 'Rejected',
    variant: 'destructive',
    icon: XCircle,
    className: 'bg-red-100 text-red-700 border-red-200',
  },
  returned: {
    label: 'Returned',
    variant: 'outline',
    icon: ArrowRight,
    className: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  published: {
    label: 'Published',
    variant: 'default',
    icon: CheckCircle,
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
};

export function QAStatusBadge({
  status,
  size = 'md',
  showIcon = true,
  className,
}: QAStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.new;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <Badge
      variant={config.variant}
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        config.className,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {config.label}
    </Badge>
  );
}

interface QAScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function QAScoreBadge({
  score,
  size = 'md',
  className,
}: QAScoreBadgeProps) {
  const getScoreConfig = (score: number) => {
    if (score >= 85) {
      return {
        label: 'Excellent',
        className: 'bg-green-100 text-green-700 border-green-200',
      };
    } else if (score >= 70) {
      return {
        label: 'Good',
        className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      };
    } else if (score >= 50) {
      return {
        label: 'Fair',
        className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      };
    } else if (score >= 30) {
      return {
        label: 'Poor',
        className: 'bg-orange-100 text-orange-700 border-orange-200',
      };
    } else {
      return {
        label: 'Low',
        className: 'bg-red-100 text-red-700 border-red-200',
      };
    }
  };

  const config = getScoreConfig(score);

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        config.className,
        sizeClasses[size],
        className
      )}
    >
      <span className="font-bold">{score}</span>
      <span className="text-xs opacity-75">/ 100</span>
    </Badge>
  );
}

interface QAContentTypeBadgeProps {
  type: 'simulation' | 'mock_call' | 'report' | 'data_export' | 'lead';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const contentTypeConfig: Record<string, {
  label: string;
  className: string;
}> = {
  simulation: {
    label: 'Simulation',
    className: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  mock_call: {
    label: 'Mock Call',
    className: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
  report: {
    label: 'Report',
    className: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  },
  data_export: {
    label: 'Data Export',
    className: 'bg-teal-100 text-teal-700 border-teal-200',
  },
  lead: {
    label: 'Lead',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
};

export function QAContentTypeBadge({
  type,
  size = 'md',
  className,
}: QAContentTypeBadgeProps) {
  const config = contentTypeConfig[type] || contentTypeConfig.lead;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center font-medium',
        config.className,
        sizeClasses[size],
        className
      )}
    >
      {config.label}
    </Badge>
  );
}

export default QAStatusBadge;
