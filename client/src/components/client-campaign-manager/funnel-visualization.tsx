import { Phone, Mail, MessageSquareText, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FunnelStage {
  stage: string;
  stageLabel: string;
  objective: string;
  primaryChannels: string[];
  secondaryChannels?: string[];
  estimatedConversionRate: string;
  estimatedVolumeAtStage: string;
  durationDays: number;
  tactics?: string[];
  messagingTheme?: string;
}

interface FunnelVisualizationProps {
  funnelStrategy: FunnelStage[];
  onStageClick?: (stage: string) => void;
  compact?: boolean;
}

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string; gradient: string }> = {
  awareness: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', gradient: 'from-blue-500 to-blue-600' },
  engaged: { bg: 'bg-cyan-50', border: 'border-cyan-300', text: 'text-cyan-700', gradient: 'from-cyan-500 to-cyan-600' },
  qualifying: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', gradient: 'from-amber-500 to-amber-600' },
  qualified_sql: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', gradient: 'from-orange-500 to-orange-600' },
  appointment: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', gradient: 'from-purple-500 to-purple-600' },
  closed_won: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', gradient: 'from-green-500 to-green-600' },
};

const DEFAULT_COLORS = { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700', gradient: 'from-gray-500 to-gray-600' };

function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  switch (channel) {
    case 'voice': return <Phone size={size} />;
    case 'email': return <Mail size={size} />;
    case 'messaging': return <MessageSquareText size={size} />;
    default: return null;
  }
}

export function FunnelVisualization({ funnelStrategy, onStageClick, compact = false }: FunnelVisualizationProps) {
  if (!funnelStrategy?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No funnel strategy available
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="w-full">
        {/* Desktop: Horizontal funnel */}
        <div className="hidden md:flex items-stretch gap-0">
          {funnelStrategy.map((stage, idx) => {
            const colors = STAGE_COLORS[stage.stage] || DEFAULT_COLORS;
            const isLast = idx === funnelStrategy.length - 1;
            // Funnel narrows: width decreases from left to right
            const widthPercent = 100 / funnelStrategy.length;

            return (
              <div
                key={stage.stage}
                className="flex items-center"
                style={{ width: `${widthPercent}%` }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onStageClick?.(stage.stage)}
                      className={`flex-1 ${colors.bg} ${colors.border} border rounded-lg p-3 hover:shadow-md transition-all cursor-pointer group relative`}
                    >
                      {/* Stage header bar */}
                      <div className={`h-1.5 w-full bg-gradient-to-r ${colors.gradient} rounded-full mb-2`} />

                      {/* Stage label */}
                      <h4 className={`text-xs font-bold ${colors.text} uppercase tracking-wider mb-1`}>
                        {stage.stageLabel}
                      </h4>

                      {/* Volume */}
                      <p className="text-sm font-semibold text-foreground mb-1">
                        {stage.estimatedVolumeAtStage}
                      </p>

                      {/* Conversion rate */}
                      <p className="text-xs text-muted-foreground mb-2">
                        {stage.estimatedConversionRate} conversion
                      </p>

                      {/* Channel icons */}
                      <div className="flex items-center gap-1.5">
                        {stage.primaryChannels.map((ch) => (
                          <Badge key={ch} variant="secondary" className={`text-[10px] px-1.5 py-0.5 ${colors.text} gap-1`}>
                            <ChannelIcon channel={ch} size={10} />
                            {ch}
                          </Badge>
                        ))}
                      </div>

                      {/* Duration */}
                      {!compact && (
                        <p className="text-[10px] text-muted-foreground mt-2">
                          ~{stage.durationDays} days
                        </p>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-semibold mb-1">{stage.stageLabel}</p>
                    <p className="text-xs text-muted-foreground mb-2">{stage.objective}</p>
                    {stage.messagingTheme && (
                      <p className="text-xs italic">Theme: {stage.messagingTheme}</p>
                    )}
                  </TooltipContent>
                </Tooltip>

                {/* Arrow connector */}
                {!isLast && (
                  <ChevronRight className="text-muted-foreground/40 mx-0.5 flex-shrink-0" size={20} />
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile: Vertical funnel */}
        <div className="md:hidden space-y-2">
          {funnelStrategy.map((stage, idx) => {
            const colors = STAGE_COLORS[stage.stage] || DEFAULT_COLORS;
            const isLast = idx === funnelStrategy.length - 1;

            return (
              <div key={stage.stage}>
                <button
                  onClick={() => onStageClick?.(stage.stage)}
                  className={`w-full ${colors.bg} ${colors.border} border rounded-lg p-3 text-left hover:shadow-md transition-all`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h4 className={`text-xs font-bold ${colors.text} uppercase tracking-wider`}>
                      {stage.stageLabel}
                    </h4>
                    <Badge variant="outline" className="text-[10px]">
                      {stage.estimatedConversionRate}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold mb-1">{stage.estimatedVolumeAtStage}</p>
                  <div className="flex items-center gap-1.5">
                    {stage.primaryChannels.map((ch) => (
                      <Badge key={ch} variant="secondary" className={`text-[10px] px-1.5 py-0.5 ${colors.text} gap-1`}>
                        <ChannelIcon channel={ch} size={10} />
                        {ch}
                      </Badge>
                    ))}
                  </div>
                </button>
                {!isLast && (
                  <div className="flex justify-center py-0.5">
                    <ChevronRight className="text-muted-foreground/40 rotate-90" size={16} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
