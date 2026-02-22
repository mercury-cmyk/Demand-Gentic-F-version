import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CostData {
  service: string;
  cost: number;
  percentage: number;
}

export default function CostsTab() {
  const [currentCost, setCurrentCost] = useState(156.42);
  const [costBreakdown, setCostBreakdown] = useState<CostData[]>([]);
  const [dailyTrend, setDailyTrend] = useState<{ day: string; cost: number; forecast: number }[]>([]);
  const [agentCosts, setAgentCosts] = useState<{ provider: string; calls: number; cost: number }[]>([]);

  useEffect(() => {
    fetchCostData();
  }, []);

  const fetchCostData = async () => {
    try {
      // Mock data
      const breakdown: CostData[] = [
        { service: 'Cloud Run', cost: 62.57, percentage: 40 },
        { service: 'Vertex AI', cost: 54.75, percentage: 35 },
        { service: 'Cloud Storage', cost: 23.4, percentage: 15 },
        { service: 'Cloud Build', cost: 9.36, percentage: 6 },
        { service: 'Secret Manager', cost: 6.34, percentage: 4 },
      ];

      const trend = Array.from({ length: 10 }, (_, i) => ({
        day: `Day ${i + 1}`,
        cost: Math.random() * 30 + 10,
        forecast: Math.random() * 25 + 12,
      }));

      const agents = [
        { provider: 'Gemini API', calls: 250, cost: 25.0 },
        { provider: 'Claude API', calls: 150, cost: 45.0 },
        { provider: 'Copilot License', calls: 1, cost: 20.0 },
      ];

      setCostBreakdown(breakdown);
      setDailyTrend(trend);
      setAgentCosts(agents);
    } catch (error) {
      console.error('Failed to fetch cost data:', error);
    }
  };

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

  const totalCost = costBreakdown.reduce((sum, item) => sum + item.cost, 0);
  const lastMonthCost = 139.2;
  const costChange = (((currentCost - lastMonthCost) / lastMonthCost) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Current Month Cost Card */}
      <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/50">
        <CardContent className="pt-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-slate-400 mb-2">Current Month Cost</p>
              <p className="text-5xl font-bold text-white">${currentCost.toFixed(2)}</p>
              <p className={`text-sm mt-2 ${parseFloat(costChange) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                <TrendingUp className="w-4 h-4 inline mr-1" />
                {parseFloat(costChange) > 0 ? '+' : ''}{costChange}% vs last month
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400 mb-1">Projected Month-End</p>
              <p className="text-3xl font-bold text-slate-200">
                ${(currentCost * 1.35).toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Service Breakdown */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle>Service Breakdown</CardTitle>
            <CardDescription>Cost distribution by GCP service</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={costBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name} ${percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="cost"
                >
                  {costBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => `$${Number(value).toFixed(2)}`}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Daily Trend */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle>Daily Trend</CardTitle>
            <CardDescription>Last 10 days cost with forecast</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="cost" stroke="#3b82f6" name="Actual" />
                <Line type="monotone" dataKey="forecast" stroke="#8b5cf6" name="Forecast" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Service Cost Details */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>Service Cost Details</CardTitle>
          <CardDescription>Detailed breakdown of each GCP service</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-transparent">
                  <TableHead className="text-slate-300">Service</TableHead>
                  <TableHead className="text-slate-300 text-right">Cost</TableHead>
                  <TableHead className="text-slate-300 text-right">Percentage</TableHead>
                  <TableHead className="text-slate-300">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costBreakdown.map((item, index) => (
                  <TableRow
                    key={item.service}
                    className="border-slate-700 hover:bg-slate-700/50 transition"
                  >
                    <TableCell className="text-slate-200">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        ></div>
                        {item.service}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-200">
                      ${item.cost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{item.percentage}%</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-green-400 text-sm">↓ 2.1%</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* AI Agent Costs */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>AI Agent Costs</CardTitle>
          <CardDescription>Cost breakdown by LLM provider</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {agentCosts.map((agent) => (
              <Card key={agent.provider} className="bg-slate-700 border-slate-600">
                <CardContent className="pt-6">
                  <h3 className="text-sm font-medium text-slate-300 mb-3">{agent.provider}</h3>
                  <p className="text-2xl font-bold text-white mb-2">${agent.cost.toFixed(2)}</p>
                  <p className="text-xs text-slate-400">{agent.calls} calls/month</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Export Reports */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
        <Button className="gap-2">
          <Download className="w-4 h-4" />
          Export PDF Report
        </Button>
      </div>
    </div>
  );
}
