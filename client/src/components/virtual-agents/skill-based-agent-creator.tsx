import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Calendar,
  Target,
  CheckCircle2,
  ArrowRight,
  Loader2
} from 'lucide-react';

// Skill categories mapping
const SKILL_CATEGORIES = {
  content_distribution: { label: 'Content', icon: FileText },
  event_promotion: { label: 'Events', icon: Calendar },
  qualification: { label: 'Qualification', icon: Target },
};

interface SkillInput {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'file' | 'date' | 'url' | 'select';
  placeholder?: string;
  helpText?: string;
  options?: Array<{ value: string; label: string }>;
}

interface AgentSkill {
  id: string;
  name: string;
  category: keyof typeof SKILL_CATEGORIES;
  description: string;
  requiredInputs: SkillInput[];
  optionalInputs: SkillInput[];
}

interface SkillBasedAgentCreatorProps {
  onCreateAgent: (data: {
    agentName: string;
    skillId: string;
    skillInputValues: Record<string, any>;
    voice: string;
    provider: string;
  }) => Promise<void>;
  isCreating?: boolean;
}

const SKILLS: AgentSkill[] = [
  {
    id: 'whitepaper_distribution',
    name: 'Whitepaper Distribution',
    category: 'content_distribution',
    description: 'Share research and insights',
    requiredInputs: [
      { key: 'asset_title', label: 'Whitepaper Title', type: 'text', placeholder: 'e.g., The Future of B2B Marketing' },
      { key: 'publishing_org', label: 'Publishing Organization', type: 'text', placeholder: 'e.g., Acme Corp' }
    ],
    optionalInputs: [
      { key: 'target_persona', label: 'Target Persona', type: 'select', options: [
        { value: 'marketing', label: 'Marketing Leaders' },
        { value: 'sales', label: 'Sales Leaders' },
        { value: 'executive', label: 'C-Suite' }
      ]}
    ]
  },
  {
    id: 'webinar_registration',
    name: 'Webinar Registration',
    category: 'event_promotion',
    description: 'Drive webinar signups',
    requiredInputs: [
      { key: 'event_name', label: 'Webinar Title', type: 'text', placeholder: 'e.g., Mastering Demand Gen' },
      { key: 'event_date', label: 'Event Date', type: 'date' },
      { key: 'registration_link', label: 'Registration URL', type: 'url', placeholder: 'https://...' }
    ],
    optionalInputs: [
      { key: 'speakers', label: 'Speakers', type: 'text', placeholder: 'e.g., Jane Doe (CMO)' }
    ]
  },
  {
    id: 'appointment_setting',
    name: 'Appointment Setting',
    category: 'qualification',
    description: 'Book qualified meetings',
    requiredInputs: [
      { key: 'meeting_purpose', label: 'Meeting Type', type: 'select', options: [
        { value: 'discovery', label: 'Discovery Call' },
        { value: 'demo', label: 'Product Demo' },
        { value: 'consultation', label: 'Consultation' }
      ]},
      { key: 'calendar_link', label: 'Calendar Link', type: 'url', placeholder: 'https://calendly.com/...' }
    ],
    optionalInputs: [
      { key: 'meeting_with', label: 'Meeting With', type: 'text', placeholder: 'e.g., Sarah Johnson, VP Sales' }
    ]
  },
  {
    id: 'executive_dinner',
    name: 'Executive Dinner',
    category: 'event_promotion',
    description: 'Invite C-suite to events',
    requiredInputs: [
      { key: 'event_name', label: 'Event Name', type: 'text', placeholder: 'e.g., CMO Leadership Dinner' },
      { key: 'event_date', label: 'Event Date', type: 'date' },
      { key: 'venue', label: 'Venue', type: 'text', placeholder: 'e.g., The Capital Grille' }
    ],
    optionalInputs: []
  }
];

export function SkillBasedAgentCreator({ onCreateAgent, isCreating = false }: SkillBasedAgentCreatorProps) {
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill | null>(null);
  const [agentName, setAgentName] = useState('');
  const [skillInputValues, setSkillInputValues] = useState<Record<string, any>>({});
  const [voice, setVoice] = useState('nova');
  const [provider, setProvider] = useState('openai');

  const handleSkillSelect = (skill: AgentSkill) => {
    setSelectedSkill(skill);
    setSkillInputValues({});
  };

  const handleInputChange = (key: string, value: any) => {
    setSkillInputValues(prev => ({ ...prev, [key]: value }));
  };

  const handleDeploy = async () => {
    if (!selectedSkill || !agentName) return;
    await onCreateAgent({
      agentName,
      skillId: selectedSkill.id,
      skillInputValues,
      voice,
      provider
    });
  };

  const renderInput = (input: SkillInput) => {
    const value = skillInputValues[input.key] || '';

    if (input.type === 'select' && input.options) {
      return (
        <Select value={value} onValueChange={(val) => handleInputChange(input.key, val)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {input.options.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (input.type === 'textarea') {
      return (
        <Textarea
          value={value}
          onChange={(e) => handleInputChange(input.key, e.target.value)}
          placeholder={input.placeholder}
          className="h-16 text-sm"
        />
      );
    }

    return (
      <Input
        type={input.type === 'date' ? 'datetime-local' : input.type}
        value={value}
        onChange={(e) => handleInputChange(input.key, e.target.value)}
        placeholder={input.placeholder}
        className="h-8 text-sm"
      />
    );
  };

  const isValid = () => {
    if (!selectedSkill || !agentName.trim()) return false;
    return selectedSkill.requiredInputs.every(input => skillInputValues[input.key]);
  };

  return (
    <div className="flex flex-col h-[60vh] overflow-hidden">
      {/* Agent Name - Fixed at top */}
      <div className="flex-shrink-0 pb-3 border-b">
        <Label className="text-xs font-medium">Agent Name *</Label>
        <Input
          placeholder="e.g., Sarah Chen"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          className="h-8 mt-1 text-sm"
        />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        {/* Skill Selection */}
        <div>
          <Label className="text-xs font-medium mb-2 block">Select Skill *</Label>
          <div className="grid grid-cols-2 gap-2">
            {SKILLS.map((skill) => {
              const CategoryIcon = SKILL_CATEGORIES[skill.category].icon;
              const isSelected = selectedSkill?.id === skill.id;
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => handleSkillSelect(skill)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CategoryIcon className="h-4 w-4 text-primary" />
                    {isSelected && <CheckCircle2 className="h-3 w-3 text-primary ml-auto" />}
                  </div>
                  <div className="text-sm font-medium">{skill.name}</div>
                  <div className="text-xs text-muted-foreground">{skill.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Skill Configuration */}
        {selectedSkill && (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Configure {selectedSkill.name}</Label>

            {/* Required Fields */}
            {selectedSkill.requiredInputs.map((input) => (
              <div key={input.key}>
                <Label className="text-xs text-muted-foreground">
                  {input.label} <span className="text-red-500">*</span>
                </Label>
                {renderInput(input)}
              </div>
            ))}

            {/* Optional Fields */}
            {selectedSkill.optionalInputs.length > 0 && (
              <div className="pt-2 border-t space-y-3">
                <span className="text-xs text-muted-foreground">Optional</span>
                {selectedSkill.optionalInputs.map((input) => (
                  <div key={input.key}>
                    <Label className="text-xs text-muted-foreground">{input.label}</Label>
                    {renderInput(input)}
                  </div>
                ))}
              </div>
            )}

            {/* Voice Settings */}
            <div className="pt-2 border-t">
              <Label className="text-xs font-medium mb-2 block">Voice Settings</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Provider</Label>
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Voice</Label>
                  <Select value={voice} onValueChange={setVoice}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nova">Nova (Female)</SelectItem>
                      <SelectItem value="alloy">Alloy (Neutral)</SelectItem>
                      <SelectItem value="echo">Echo (Male)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deploy Button - Fixed at bottom */}
      <div className="flex-shrink-0 pt-3 border-t">
        <Button
          onClick={handleDeploy}
          disabled={!isValid() || isCreating}
          className="w-full"
          size="sm"
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <ArrowRight className="h-4 w-4 mr-2" />
              Deploy Agent
            </>
          )}
        </Button>
        {selectedSkill && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Creates a {selectedSkill.name} agent with pretrained intelligence
          </p>
        )}
      </div>
    </div>
  );
}
