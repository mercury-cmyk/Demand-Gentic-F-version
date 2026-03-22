/**
 * Settings Hub Layout
 *
 * Provides a consistent layout for all settings pages with sidebar navigation.
 */

import { ReactNode } from 'react';
import { useLocation, Link } from 'wouter';
import { cn } from '@/lib/utils';
import {
  User,
  Database,
  Bell,
  Zap,
  Shield,
  Clock,
  Phone,
  Users,
  Settings,
  ChevronRight,
  Crown,
  Eye,
  GitBranch,
  Bot,
} from 'lucide-react';
import { ROUTES } from '@/lib/routes';

// Settings navigation configuration
interface SettingsNavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  description?: string;
  category: 'personal' | 'organization' | 'infrastructure' | 'system' | 'super';
}

// Exported type for category
export type { SettingsNavItem };

export const SETTINGS_NAV: SettingsNavItem[] = [
  // Personal Settings
  {
    id: 'profile',
    label: 'Profile',
    href: ROUTES.SETTINGS_PROFILE,
    icon: User,
    description: 'Your personal information',
    category: 'personal',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    href: ROUTES.SETTINGS_NOTIFICATIONS,
    icon: Bell,
    description: 'Notification preferences',
    category: 'personal',
  },
  {
    id: 'security',
    label: 'Security',
    href: ROUTES.SETTINGS_SECURITY,
    icon: Shield,
    description: 'Password and 2FA',
    category: 'personal',
  },

  // Organization Settings
  {
    id: 'users',
    label: 'Users & Roles',
    href: ROUTES.SETTINGS_USERS,
    icon: Users,
    description: 'User management',
    category: 'organization',
  },
  {
    id: 'custom-fields',
    label: 'Custom Fields',
    href: ROUTES.SETTINGS_CUSTOM_FIELDS,
    icon: Database,
    description: 'Contact and account fields',
    category: 'organization',
  },

  // Infrastructure Settings
  {
    id: 'telephony',
    label: 'Telephony (SIP)',
    href: ROUTES.SETTINGS_TELEPHONY,
    icon: Phone,
    description: 'SIP trunk configuration',
    category: 'infrastructure',
  },
  {
    id: 'agent-defaults',
    label: 'Agent Defaults',
    href: ROUTES.SETTINGS_AGENT_DEFAULTS,
    icon: Settings,
    description: 'Global agent configuration',
    category: 'infrastructure',
  },
  {
    id: 'ai-governance',
    label: 'AI Governance',
    href: ROUTES.SETTINGS_AI_GOVERNANCE,
    icon: Bot,
    description: 'Task-based model routing',
    category: 'infrastructure',
  },
  {
    id: 'prompt-inspector',
    label: 'Prompt Inspector',
    href: ROUTES.SETTINGS_PROMPT_INSPECTOR,
    icon: Eye,
    description: 'View all knowledge layers',
    category: 'infrastructure',
  },
  {
    id: 'voice-engine',
    label: 'Voice Engine',
    href: ROUTES.SETTINGS_VOICE_ENGINE,
    icon: GitBranch,
    description: 'Call engine switching',
    category: 'infrastructure',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    href: ROUTES.SETTINGS_INTEGRATIONS,
    icon: Zap,
    description: 'Connected services',
    category: 'infrastructure',
  },

  // System Settings
  {
    id: 'background-jobs',
    label: 'Background Jobs',
    href: ROUTES.SETTINGS_BACKGROUND_JOBS,
    icon: Clock,
    description: 'Automated tasks',
    category: 'system',
  },

  // Super Organization Settings (Owner-only)
  {
    id: 'super-org',
    label: 'Super Organization',
    href: ROUTES.SETTINGS_SUPER_ORG,
    icon: Crown,
    description: 'Pivotal B2B platform settings',
    category: 'super',
  },
];

// Category type
type SettingsCategory = 'personal' | 'organization' | 'infrastructure' | 'system' | 'super';

// Group items by category
export const CATEGORIES: readonly { id: SettingsCategory; label: string }[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'organization', label: 'Organization' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'system', label: 'System' },
  { id: 'super', label: 'Platform Admin' },
];

interface SettingsLayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function SettingsLayout({ children, title, description }: SettingsLayoutProps) {
  const [location] = useLocation();

  // Determine active item
  const activeItem = SETTINGS_NAV.find(item => location.startsWith(item.href));

  return (
    
      {/* Settings Sidebar */}
      
        
          {/* Header */}
          
            
            Settings
          

          {/* Navigation by category */}
          
            {CATEGORIES.map(category => {
              const items = SETTINGS_NAV.filter(item => item.category === category.id);
              if (items.length === 0) return null;

              return (
                
                  
                    {category.label}
                  
                  
                    {items.map(item => {
                      const isActive = location.startsWith(item.href);
                      const Icon = item.icon;

                      return (
                        
                          
                            
                              
                              {item.label}
                              {isActive && (
                                
                              )}
                            
                          
                        
                      );
                    })}
                  
                
              );
            })}
          
        
      

      {/* Main Content */}
      
        
          {/* Page Header */}
          {(title || description) && (
            
              {title && {title}}
              {description && (
                {description}
              )}
            
          )}

          {/* Page Content */}
          {children}
        
      
    
  );
}

/**
 * Get the current settings page info based on location
 */
export function getSettingsPageInfo(location: string) {
  return SETTINGS_NAV.find(item => location.startsWith(item.href));
}