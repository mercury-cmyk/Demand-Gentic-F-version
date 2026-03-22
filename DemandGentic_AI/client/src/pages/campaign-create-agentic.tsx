/**
 * Campaign Create Agentic Page
 *
 * Admin page that uses the CampaignCreationWizard from client portal
 * for AI-powered campaign creation
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { CampaignCreationWizard } from '@/components/client-portal/campaigns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowLeft } from 'lucide-react';

export default function CampaignCreateAgenticPage() {
  const [, setLocation] = useLocation();
  const [showWizard, setShowWizard] = useState(true);

  const handleSuccess = (campaign: any) => {
    setShowWizard(false);
    // Navigate to campaigns list after creation
    setLocation('/campaigns');
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setLocation('/campaigns');
    }
    setShowWizard(open);
  };

  return (
    
      
        
           setLocation('/campaigns')}
          >
            
            Back to Campaigns
          
        
      

      
        
          
        
        
          Create Campaign
          AI-powered campaign creation wizard
        
      

      {/* Campaign Creation Wizard Dialog */}
      

      {/* Fallback content when wizard is closed */}
      {!showWizard && (
        
          
            
              
            
            Ready to create a campaign?
            
              Use our AI-powered wizard to set up your campaign with intelligent defaults and recommendations.
            
             setShowWizard(true)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              
              Open Campaign Wizard
            
          
        
      )}
    
  );
}