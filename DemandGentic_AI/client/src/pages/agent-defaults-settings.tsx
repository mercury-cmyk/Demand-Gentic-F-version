/**
 * Agent Defaults Settings Page
 * 
 * Administrative page for configuring global agent defaults.
 * Accessible from Settings or Admin panel.
 */

import { AgentDefaultsConfiguration } from '@/components/virtual-agents/agent-defaults-configuration';
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'wouter';

export default function AgentDefaultsSettingsPage() {
  const { user } = useAuth();

  // Only allow admins/managers to access this page
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return ;
  }

  return (
    
      
    
  );
}