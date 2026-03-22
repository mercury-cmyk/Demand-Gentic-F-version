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
  options?: Array;
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
    skillInputValues: Record;
    voice: string;
    provider: string;
  }) => Promise;
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
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [agentName, setAgentName] = useState('');
  const [skillInputValues, setSkillInputValues] = useState>({});
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
         handleInputChange(input.key, val)}>
          
            
          
          
            {input.options.map(opt => (
              {opt.label}
            ))}
          
        
      );
    }

    if (input.type === 'textarea') {
      return (
         handleInputChange(input.key, e.target.value)}
          placeholder={input.placeholder}
          className="h-16 text-sm"
        />
      );
    }

    return (
       handleInputChange(input.key, e.target.value)}
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
    
      {/* Agent Name - Fixed at top */}
      
        Agent Name *
         setAgentName(e.target.value)}
          className="h-8 mt-1 text-sm"
        />
      

      {/* Scrollable Content */}
      
        {/* Skill Selection */}
        
          Select Skill *
          
            {SKILLS.map((skill) => {
              const CategoryIcon = SKILL_CATEGORIES[skill.category].icon;
              const isSelected = selectedSkill?.id === skill.id;
              return (
                 handleSkillSelect(skill)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  
                    
                    {isSelected && }
                  
                  {skill.name}
                  {skill.description}
                
              );
            })}
          
        

        {/* Skill Configuration */}
        {selectedSkill && (
          
            Configure {selectedSkill.name}

            {/* Required Fields */}
            {selectedSkill.requiredInputs.map((input) => (
              
                
                  {input.label} *
                
                {renderInput(input)}
              
            ))}

            {/* Optional Fields */}
            {selectedSkill.optionalInputs.length > 0 && (
              
                Optional
                {selectedSkill.optionalInputs.map((input) => (
                  
                    {input.label}
                    {renderInput(input)}
                  
                ))}
              
            )}

            {/* Voice Settings */}
            
              Voice Settings
              
                
                  Provider
                  
                    
                      
                    
                    
                      OpenAI
                      ElevenLabs
                    
                  
                
                
                  Voice
                  
                    
                      
                    
                    
                      Nova (Female)
                      Alloy (Neutral)
                      Echo (Male)
                    
                  
                
              
            
          
        )}
      

      {/* Deploy Button - Fixed at bottom */}
      
        
          {isCreating ? (
            <>
              
              Creating...
            
          ) : (
            <>
              
              Deploy Agent
            
          )}
        
        {selectedSkill && (
          
            Creates a {selectedSkill.name} agent with pretrained intelligence
          
        )}
      
    
  );
}