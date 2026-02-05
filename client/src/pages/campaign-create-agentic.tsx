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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/campaigns')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Campaigns
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Create Campaign</h1>
          <p className="text-muted-foreground">AI-powered campaign creation wizard</p>
        </div>
      </div>

      {/* Campaign Creation Wizard Dialog */}
      <CampaignCreationWizard
        open={showWizard}
        onOpenChange={handleClose}
        onSuccess={handleSuccess}
      />

      {/* Fallback content when wizard is closed */}
      {!showWizard && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-16 w-16 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-purple-600" />
            </div>
            <h4 className="font-semibold text-lg mb-2">Ready to create a campaign?</h4>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              Use our AI-powered wizard to set up your campaign with intelligent defaults and recommendations.
            </p>
            <Button
              onClick={() => setShowWizard(true)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Open Campaign Wizard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
