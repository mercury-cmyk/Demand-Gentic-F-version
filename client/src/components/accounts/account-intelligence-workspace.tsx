import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Brain, 
  Target, 
  Users, 
  Activity, 
  ArrowRight,
  ShieldCheck,
  Zap,
  Info,
  ChevronRight,
  Plus
} from "lucide-react";
import type { Account } from "@shared/schema";
import type { AccountStrategy, BuyingCommitteeMember } from "@shared/schema_addition";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ROUTE_PATHS } from "@/lib/route-paths";

interface AccountIntelligenceWorkspaceProps {
  account: Account;
}

export function AccountIntelligenceWorkspace({ account }: AccountIntelligenceWorkspaceProps) {
  const [, setLocation] = useLocation();
  const { data: strategy } = useQuery<AccountStrategy>({
    queryKey: [`/api/intelligence/accounts/${account.id}/strategy`],
  });

  const { data: committee } = useQuery<BuyingCommitteeMember[]>({
    queryKey: [`/api/intelligence/accounts/${account.id}/committee`],
  });

  const roles = committee || [];
  const hasStrategy = !!strategy;

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'economic_buyer': return <Zap className="h-4 w-4 text-amber-500" />;
      case 'champion': return <Target className="h-4 w-4 text-emerald-500" />;
      case 'technical_evaluator': return <Brain className="h-4 w-4 text-blue-500" />;
      default: return <Users className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Context Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white overflow-hidden relative border border-white/5">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Target className="h-32 w-32" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-500 hover:bg-blue-600 font-bold uppercase tracking-widest text-[9px]">Tier 1 Priority</Badge>
              <Badge variant="outline" className="text-white border-white/20 font-bold uppercase tracking-widest text-[9px]">High ICP Match</Badge>
            </div>
            <h2 className="text-3xl font-bold">{account.name}</h2>
            <p className="text-slate-400 text-sm max-w-xl">
              {account.description?.slice(0, 150)}...
            </p>
          </div>
          <div className="flex flex-col gap-2 min-w-[200px]">
             <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1">Signal Strength</p>
                <div className="flex items-center gap-2">
                   <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[75%]" />
                   </div>
                   <span className="text-xs font-bold">Strong</span>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Strategy Section */}
          <Card className="border-2 border-primary/20 bg-primary/5 shadow-lg overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-primary/10">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Strategic Directive</span>
                  </div>
                  <CardTitle className="text-xl font-bold">Engagement Approach</CardTitle>
                </div>
                {hasStrategy && (
                   <Badge className="bg-emerald-500 text-white font-bold">Approved</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {hasStrategy ? (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Objective</h4>
                      <p className="font-semibold text-slate-900">{strategy.engagementObjective || 'Activate Priority Account'}</p>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Entry Point</h4>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-primary/30 text-primary capitalize font-bold">
                           {strategy.messagingAngle || 'Problem-led'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-white rounded-xl border border-primary/10 italic text-sm text-slate-600">
                    "This account shows strong indicators of tech-debt in their current CX stack. Focus messaging on the 'efficiency gap' and use Case Study A as the primary proof-point for the initial email sequence."
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-primary/10">
                    <div className="flex gap-2">
                      <Badge variant="secondary" className="bg-slate-200">Email</Badge>
                      <Badge variant="secondary" className="bg-slate-200">AI Follow-up</Badge>
                    </div>
                    <Button variant="ghost" size="sm" className="text-primary font-bold">
                      Modify Strategy
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="p-4 bg-white rounded-full shadow-sm">
                    <Zap className="h-8 w-8 text-amber-500 animate-pulse" />
                  </div>
                  <div className="max-w-xs">
                    <h3 className="font-bold text-lg mb-1">Generate Account Strategy</h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Let the Organizational Brain analyze this account's committee and signals to propose a unique path forward.
                    </p>
                    <Button className="w-full font-bold">
                      Run AI Strategy Engine
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Buying Committee */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2 text-slate-900">
                <Users className="h-5 w-5 text-blue-500" />
                Buying Committee
              </h3>
              <Button variant="outline" size="sm" className="h-8 text-xs font-bold uppercase tracking-wider">
                <Plus className="mr-1 h-3 w-3" /> Map Role
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { role: 'economic_buyer', label: 'Economic Buyer', status: 'mapped', name: 'Sarah Thompson' },
                { role: 'champion', label: 'Champion', status: 'mapped', name: 'Mark Wilson' },
                { role: 'technical_evaluator', label: 'Technical Evaluator', status: 'missing', name: null },
                { role: 'influencer', label: 'Influencer', status: 'mapped', name: 'David Chen' },
              ].map((item) => (
                <Card key={item.role} className={`transition-all ${item.status === 'missing' ? 'border-dashed bg-slate-50' : 'hover:shadow-md'}`}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${item.status === 'missing' ? 'bg-slate-200 text-slate-400' : 'bg-blue-50 text-blue-500'}`}>
                        {getRoleIcon(item.role)}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{item.label}</p>
                        <p className={`text-sm font-bold ${item.status === 'missing' ? 'text-slate-400' : 'text-slate-900'}`}>
                          {item.name || 'Role Missing'}
                        </p>
                      </div>
                    </div>
                    {item.status === 'missing' ? (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                         <Plus className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 border-none font-bold text-[9px]">Verified</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Next Best Action Rail */}
          <Card className="bg-slate-900 text-white border-none shadow-xl overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Execution Hub</span>
              </div>
              <CardTitle className="text-xl">Next Best Action</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                   <p className="text-sm font-medium mb-2">Identify Technical Evaluator</p>
                   <p className="text-xs text-slate-400 leading-relaxed">
                      Your buying committee is 75% complete. Identifying the technical lead will unlock the "High-Touch Technical" strategy variant.
                   </p>
                </div>
              </div>
              <Button 
                className="w-full font-bold bg-white text-slate-900 hover:bg-slate-100 py-6"
                onClick={() => setLocation(ROUTE_PATHS.emailCampaignCreate)}
              >
                Launch Engagement
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Quick Metrics */}
          <div className="space-y-4">
             <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Engagement Signal</h4>
             <Card className="bg-white shadow-sm border-slate-200">
                <CardContent className="p-4 space-y-4">
                   <div className="flex justify-between items-end">
                      <div>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Open Rate</p>
                         <p className="text-2xl font-bold">42%</p>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-600 border-none">+12% vs Industry</Badge>
                   </div>
                   <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 w-[42%]" />
                   </div>
                </CardContent>
             </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
