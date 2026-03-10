import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Target, BarChart3, Users, Building2, FileText, TestTube, Mail, Bot, Loader2, CheckCircle, TrendingUp, Phone } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';

// Define types for props
interface Campaign {
  id: string;
  name: string;
  status: string;
  eligibleCount: number;
  totalContacts: number;
  verifiedCount: number;
  deliveredCount: number;
  type?: string;
  campaignType?: string;
  // Add other campaign properties as needed
}

interface CampaignDetailViewProps {
  campaign: Campaign;
  onBack: () => void;
}

async function fetchCampaignData(campaignId: string, dataType: 'accounts' | 'contacts') {
  const token = localStorage.getItem('clientPortalToken');
  const params = new URLSearchParams({ campaignId, limit: '1000' });
  const res = await fetch(`/api/client-portal/crm/${dataType}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${dataType}`);
  return res.json();
}

export function CampaignDetailView({ campaign, onBack }: CampaignDetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: accountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['campaign-accounts', campaign.id],
    queryFn: () => fetchCampaignData(campaign.id, 'accounts'),
  });

  const { data: contactsData, isLoading: isLoadingContacts } = useQuery({
    queryKey: ['campaign-contacts', campaign.id],
    queryFn: () => fetchCampaignData(campaign.id, 'contacts'),
  });

  const campaignAccounts = accountsData?.accounts || [];
  const campaignContacts = contactsData?.contacts || [];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'progress', label: 'Progress', icon: BarChart3 },
    { id: 'accounts', label: 'Accounts', icon: Building2 },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'context', label: 'Context', icon: FileText },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'email-test', label: 'Email Test', icon: Mail },
    { id: 'ai-call-test', label: 'AI Call Test', icon: Bot },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{campaign.name}</h2>
          <p className="text-muted-foreground">Campaign Details</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8">
          {tabs.map(tab => (
            <TabsTrigger key={tab.id} value={tab.id}>
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Overview</CardTitle>
              <CardDescription>High-level summary and key metrics for this campaign.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{campaign.totalContacts?.toLocaleString() || 'N/A'}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Delivered</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{campaign.deliveredCount?.toLocaleString() || 'N/A'}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {campaign.totalContacts > 0
                        ? `${((campaign.deliveredCount / campaign.totalContacts) * 100).toFixed(1)}%`
                        : 'N/A'}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Type</CardTitle>
                    {campaign.campaignType === 'email' ? <Mail className="h-4 w-4 text-muted-foreground" /> : <Phone className="h-4 w-4 text-muted-foreground" />}
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold capitalize">{campaign.campaignType || campaign.type || 'N/A'}</div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress">
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
              <CardDescription>Detailed campaign performance and progress towards goals.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium">Overall Progress</h4>
                  <span className="text-sm font-semibold">
                    {campaign.deliveredCount?.toLocaleString()} / {campaign.totalContacts?.toLocaleString()}
                  </span>
                </div>
                <Progress value={campaign.totalContacts ? (campaign.deliveredCount / campaign.totalContacts) * 100 : 0} />
                <p className="text-xs text-muted-foreground mt-2">
                  {campaign.totalContacts ? ((campaign.deliveredCount / campaign.totalContacts) * 100).toFixed(1) : '0.0'}% of total contacts reached.
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium">Verified Contacts</h4>
                   <span className="text-sm font-semibold">
                    {campaign.verifiedCount?.toLocaleString()} / {campaign.totalContacts?.toLocaleString()}
                  </span>
                </div>
                <Progress value={campaign.totalContacts ? (campaign.verifiedCount / campaign.totalContacts) * 100 : 0} className="[&>*]:bg-green-500" />
                 <p className="text-xs text-muted-foreground mt-2">
                  {campaign.totalContacts ? ((campaign.verifiedCount / campaign.totalContacts) * 100).toFixed(1) : '0.0'}% of contacts have been verified.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>Accounts targeted in this campaign.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAccounts ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : campaignAccounts.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company Name</TableHead>
                        <TableHead>Industry</TableHead>
                        <TableHead>Website</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaignAccounts.map((account: any) => (
                        <TableRow key={account.id}>
                          <TableCell className="font-medium">{account.name}</TableCell>
                          <TableCell>{account.industry}</TableCell>
                          <TableCell>
                            <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {account.website}
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p>No accounts associated with this campaign.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <CardHeader>
              <CardTitle>Contacts</CardTitle>
              <CardDescription>Contacts targeted in this campaign.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingContacts ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : campaignContacts.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Company</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaignContacts.map((contact: any) => (
                        <TableRow key={contact.id}>
                          <TableCell className="font-medium">{contact.firstName} {contact.lastName}</TableCell>
                          <TableCell>{contact.email}</TableCell>
                          <TableCell>{contact.phone}</TableCell>
                          <TableCell>{contact.company}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p>No contacts associated with this campaign.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="context">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Context</CardTitle>
              <CardDescription>Contextual information for the AI agent.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Campaign context content for {campaign.name}.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Reports</CardTitle>
              <CardDescription>Downloadable reports for this campaign.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Reports content for {campaign.name}.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email-test">
          <Card>
            <CardHeader>
              <CardTitle>Email Test</CardTitle>
              <CardDescription>Send test emails for this campaign.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Email test content for {campaign.name}.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-call-test">
          <Card>
            <CardHeader>
              <CardTitle>AI Call Test</CardTitle>
              <CardDescription>Perform test calls with the AI agent.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>AI call test content for {campaign.name}.</p>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

