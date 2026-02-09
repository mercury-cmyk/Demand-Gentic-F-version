/**
 * OrderConfigurationCard
 * Displays and allows editing of order configuration within AgentX chat
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  Building2,
  Users,
  Globe,
  Calendar,
  Phone,
  Mail,
  Edit2,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  type OrderConfiguration,
  type OrderRecommendation,
  CAMPAIGN_TYPES,
  DELIVERY_TIMELINES,
} from './order-agent-types';

interface OrderConfigurationCardProps {
  recommendation: OrderRecommendation;
  configuration: OrderConfiguration;
  onConfigurationChange: (config: Partial<OrderConfiguration>) => void;
  onApprove: () => void;
  onCancel: () => void;
  isEditing?: boolean;
  rationale?: string;
}

export function OrderConfigurationCard({
  recommendation,
  configuration,
  onConfigurationChange,
  onApprove,
  onCancel,
  isEditing = false,
  rationale,
}: OrderConfigurationCardProps) {
  const [editing, setEditing] = useState(isEditing);

  const campaignTypeLabel = CAMPAIGN_TYPES.find(
    (t) => t.value === configuration.campaignType
  )?.label || configuration.campaignType;

  const timelineLabel = DELIVERY_TIMELINES.find(
    (t) => t.value === configuration.deliveryTimeline
  )?.label || configuration.deliveryTimeline;

  const toggleChannel = (channel: string) => {
    const currentChannels = configuration.channels || [];
    if (currentChannels.includes(channel)) {
      onConfigurationChange({
        channels: currentChannels.filter((c) => c !== channel),
      });
    } else {
      onConfigurationChange({
        channels: [...currentChannels, channel],
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-primary/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium text-sm">AI Recommendation</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setEditing(!editing)}
        >
          {editing ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Done Editing
            </>
          ) : (
            <>
              <Edit2 className="h-3 w-3 mr-1" />
              Edit
            </>
          )}
        </Button>
      </div>

      {/* Rationale */}
      {rationale && (
        <div className="px-4 py-3 bg-primary/5 border-b border-primary/10">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {rationale}
          </p>
        </div>
      )}

      {/* Configuration */}
      <div className="p-4 space-y-4">
        {editing ? (
          <EditMode
            configuration={configuration}
            onConfigurationChange={onConfigurationChange}
            toggleChannel={toggleChannel}
          />
        ) : (
          <ViewMode
            configuration={configuration}
            campaignTypeLabel={campaignTypeLabel}
            timelineLabel={timelineLabel}
          />
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-primary/10 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1.5" />
          Cancel
        </Button>
        <Button size="sm" onClick={onApprove}>
          <Check className="h-3.5 w-3.5 mr-1.5" />
          Proceed with Order
        </Button>
      </div>
    </motion.div>
  );
}

function ViewMode({
  configuration,
  campaignTypeLabel,
  timelineLabel,
}: {
  configuration: OrderConfiguration;
  campaignTypeLabel: string;
  timelineLabel: string;
}) {
  return (
    <div className="grid gap-3">
      {/* Campaign Type & Volume */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Target className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{campaignTypeLabel}</span>
        </div>
        <Badge variant="secondary" className="text-sm">
          {configuration.volume} leads
        </Badge>
      </div>

      {/* Industries */}
      {configuration.industries && (
        <div className="flex items-start gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <span className="text-xs text-muted-foreground">Industries</span>
            <p className="text-sm">{configuration.industries}</p>
          </div>
        </div>
      )}

      {/* Job Titles */}
      {configuration.jobTitles && (
        <div className="flex items-start gap-2">
          <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <span className="text-xs text-muted-foreground">Job Titles</span>
            <p className="text-sm">{configuration.jobTitles}</p>
          </div>
        </div>
      )}

      {/* Company Size */}
      {(configuration.companySizeMin || configuration.companySizeMax) && (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {configuration.companySizeMin || 1} - {configuration.companySizeMax || '10,000+'} employees
          </span>
        </div>
      )}

      {/* Geographies */}
      {configuration.geographies && (
        <div className="flex items-start gap-2">
          <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <span className="text-xs text-muted-foreground">Geographies</span>
            <p className="text-sm">{configuration.geographies}</p>
          </div>
        </div>
      )}

      {/* Timeline & Channels */}
      <div className="flex items-center gap-4 pt-2 border-t border-border/50">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{timelineLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {configuration.channels?.includes('voice') && (
            <Badge variant="outline" className="text-xs gap-1">
              <Phone className="h-3 w-3" />
              Voice
            </Badge>
          )}
          {configuration.channels?.includes('email') && (
            <Badge variant="outline" className="text-xs gap-1">
              <Mail className="h-3 w-3" />
              Email
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function EditMode({
  configuration,
  onConfigurationChange,
  toggleChannel,
}: {
  configuration: OrderConfiguration;
  onConfigurationChange: (config: Partial<OrderConfiguration>) => void;
  toggleChannel: (channel: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Campaign Type */}
      <div className="space-y-1.5">
        <Label className="text-xs">Campaign Type</Label>
        <Select
          value={configuration.campaignType}
          onValueChange={(value) => onConfigurationChange({ campaignType: value })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAMPAIGN_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Volume */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Volume</Label>
          <span className="text-sm font-medium">{configuration.volume} leads</span>
        </div>
        <Slider
          value={[configuration.volume]}
          onValueChange={([value]) => onConfigurationChange({ volume: value })}
          min={25}
          max={1000}
          step={25}
          className="py-2"
        />
      </div>

      {/* Industries */}
      <div className="space-y-1.5">
        <Label className="text-xs">Target Industries</Label>
        <Input
          value={configuration.industries}
          onChange={(e) => onConfigurationChange({ industries: e.target.value })}
          placeholder="e.g., Healthcare, Financial Services, Technology"
          className="h-9 text-sm"
        />
      </div>

      {/* Job Titles */}
      <div className="space-y-1.5">
        <Label className="text-xs">Job Titles</Label>
        <Input
          value={configuration.jobTitles}
          onChange={(e) => onConfigurationChange({ jobTitles: e.target.value })}
          placeholder="e.g., CIO, CTO, VP IT, Director of Engineering"
          className="h-9 text-sm"
        />
      </div>

      {/* Geographies */}
      <div className="space-y-1.5">
        <Label className="text-xs">Geographies</Label>
        <Input
          value={configuration.geographies}
          onChange={(e) => onConfigurationChange({ geographies: e.target.value })}
          placeholder="e.g., United States, Canada, UK"
          className="h-9 text-sm"
        />
      </div>

      {/* Timeline */}
      <div className="space-y-1.5">
        <Label className="text-xs">Delivery Timeline</Label>
        <Select
          value={configuration.deliveryTimeline}
          onValueChange={(value) => onConfigurationChange({ deliveryTimeline: value })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DELIVERY_TIMELINES.map((timeline) => (
              <SelectItem key={timeline.value} value={timeline.value}>
                {timeline.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Channels */}
      <div className="space-y-2">
        <Label className="text-xs">Channels</Label>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="voice"
              checked={configuration.channels?.includes('voice')}
              onCheckedChange={() => toggleChannel('voice')}
            />
            <label htmlFor="voice" className="text-sm flex items-center gap-1.5 cursor-pointer">
              <Phone className="h-3.5 w-3.5" />
              Voice
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="email"
              checked={configuration.channels?.includes('email')}
              onCheckedChange={() => toggleChannel('email')}
            />
            <label htmlFor="email" className="text-sm flex items-center gap-1.5 cursor-pointer">
              <Mail className="h-3.5 w-3.5" />
              Email
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
