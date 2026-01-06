import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, BarChart3, TrendingUp, Mail, Phone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

const campaignPerformance = [
  { name: 'Jan', email: 65, calls: 45 },
  { name: 'Feb', email: 78, calls: 52 },
  { name: 'Mar', email: 85, calls: 61 },
  { name: 'Apr', email: 72, calls: 48 },
  { name: 'May', email: 91, calls: 67 },
  { name: 'Jun', email: 88, calls: 73 },
];

const leadsBySource = [
  { name: 'Email', value: 45 },
  { name: 'Telemarketing', value: 35 },
  { name: 'Webinar', value: 20 },
];

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))'];

const accountCoverage = [
  { name: 'Technology', accounts: 450, contacts: 3200, penetration: 7.1 },
  { name: 'Manufacturing', accounts: 320, contacts: 2100, penetration: 6.6 },
  { name: 'Healthcare', accounts: 280, contacts: 1800, penetration: 6.4 },
  { name: 'Finance', accounts: 190, contacts: 1500, penetration: 7.9 },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Comprehensive insights into campaign performance and ABM metrics
          </p>
        </div>
        <Button data-testid="button-export-report">
          <Download className="mr-2 h-4 w-4" />
          Export Report
        </Button>
      </div>

      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList>
          <TabsTrigger value="campaigns" data-testid="tab-campaign-reports">
            <BarChart3 className="mr-2 h-4 w-4" />
            Campaign Performance
          </TabsTrigger>
          <TabsTrigger value="leads" data-testid="tab-lead-reports">
            <TrendingUp className="mr-2 h-4 w-4" />
            Lead Analytics
          </TabsTrigger>
          <TabsTrigger value="abm" data-testid="tab-abm-reports">
            <Mail className="mr-2 h-4 w-4" />
            ABM Metrics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Performance Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={campaignPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.375rem'
                      }}
                    />
                    <Line type="monotone" dataKey="email" stroke="hsl(var(--chart-1))" strokeWidth={2} />
                    <Line type="monotone" dataKey="calls" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lead Sources</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={leadsBySource}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}%`}
                      outerRadius={100}
                      fill="hsl(var(--chart-1))"
                      dataKey="value"
                    >
                      {leadsBySource.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.375rem'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Email Campaign Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold">24,567</div>
                  <div className="text-sm text-muted-foreground mt-1">Sent</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-chart-2">24,234</div>
                  <div className="text-sm text-muted-foreground mt-1">Delivered (98.6%)</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-chart-1">9,847</div>
                  <div className="text-sm text-muted-foreground mt-1">Opened (40.6%)</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-chart-4">2,456</div>
                  <div className="text-sm text-muted-foreground mt-1">Clicked (24.9%)</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-destructive">145</div>
                  <div className="text-sm text-muted-foreground mt-1">Bounced (0.6%)</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Telemarketing Call Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold">1,847</div>
                  <div className="text-sm text-muted-foreground mt-1">Total Attempts</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-chart-2">892</div>
                  <div className="text-sm text-muted-foreground mt-1">Connected (48.3%)</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-chart-1">456</div>
                  <div className="text-sm text-muted-foreground mt-1">Qualified (51.1%)</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold">18m 34s</div>
                  <div className="text-sm text-muted-foreground mt-1">Avg Talk Time</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-chart-4">234</div>
                  <div className="text-sm text-muted-foreground mt-1">Callbacks</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leads" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Lead Quality Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-4xl font-bold">487</div>
                  <div className="text-sm text-muted-foreground mt-1">Total Leads</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-chart-2">376</div>
                  <div className="text-sm text-muted-foreground mt-1">Approved (77.2%)</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-chart-3">68</div>
                  <div className="text-sm text-muted-foreground mt-1">Pending Review</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-destructive">43</div>
                  <div className="text-sm text-muted-foreground mt-1">Rejected (8.8%)</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="abm" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Coverage & Penetration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {accountCoverage.map((industry) => (
                  <div key={industry.name} className="border-b last:border-0 pb-4 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{industry.name}</h4>
                      <span className="text-sm text-muted-foreground">
                        Avg {industry.penetration} contacts/account
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Accounts: </span>
                        <span className="font-medium">{industry.accounts}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Contacts: </span>
                        <span className="font-medium">{industry.contacts}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Industry Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={accountCoverage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.375rem'
                    }}
                  />
                  <Bar dataKey="accounts" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
