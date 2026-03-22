import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Server,
  RefreshCw,
  Rocket,
  Wrench,
  RotateCcw,
  ShieldCheck,
  Clock3,
  Cloud,
  HardDrive,
  Loader2,
  ArrowLeftRight,
  ExternalLink,
  GitBranch,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiJsonRequest } from '@/lib/queryClient';
import type { Project } from '@/pages/ops-hub';
import MultiCloudPlanner from '@/components/ops/multi-cloud-planner';

/* ── Shared types ── */

interface DeploymentService {
  serviceName: string;
  containerName: string | null;
  status: 'running' | 'stopped' | 'missing' | 'unknown';
  health: string | null;
  image: string | null;
  ports: string | null;
  source: 'docker' | 'compose';
}

interface DeploymentJob {
  id: string;
  action: 'build' | 'deploy' | 'restart';
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  command: string;
  target?: string;
  outputSnippet?: string;
  exitCode?: number | null;
}

interface VMStatusResponse {
  target: 'local' | 'vm';
  mode: 'local' | 'ops-agent';
  composeFilePath: string;
  deployScriptPath: string;
  diagnostics: {
    dockerAvailable: boolean;
    composeAvailable: boolean;
    deployScriptAvailable: boolean;
    opsAgentReachable: boolean;
  };
  services: DeploymentService[];
  jobs: DeploymentJob[];
}

interface CloudRunServiceStatus {
  name: string;
  serviceName: string;
  uri: string;
  status: string;
  createTime: string;
  updateTime: string;
  creator: string;
  lastModifier: string;
}

interface CloudRunRevision {
  name: string;
  imageUrl: string;
  createTime: string;
  status: string;
  trafficPercent?: number;
}

/* ── Helpers ── */

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getServiceBadge(status: string) {
  switch (status) {
    case 'running':
    case 'READY':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'stopped':
    case 'STOPPED':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'missing':
    case 'FAILED':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function getJobBadge(status: DeploymentJob['status']) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'running':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'failed':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

/* ── VM Deployment Panel ── */

function VMDeploymentPanel({ project }: { project: Project }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedService, setSelectedService] = useState(
    project.services[0]?.dockerComposeService || 'api',
  );
  const [actionLoading, setActionLoading] = useState(null);

  const fetchStatus = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const data = await apiJsonRequest('GET', '/api/ops/deployments/status');
        if (!data.success) throw new Error(data.error || 'Failed to load deployment status');
        setStatus(data.status);
      } catch (error) {
        toast({
          title: 'VM status unavailable',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => fetchStatus(true), 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const runningServices = useMemo(
    () => status?.services.filter((s) => s.status === 'running').length ?? 0,
    [status],
  );

  const activeJobs = useMemo(
    () => status?.jobs.filter((j) => j.status === 'running' || j.status === 'queued').length ?? 0,
    [status],
  );

  const queueAction = async (path: string, body?: Record) => {
    setActionLoading(path);
    try {
      const data = await apiJsonRequest('POST', path, body || {});
      if (!data.success) throw new Error(data.error || 'Request failed');
      toast({
        title: 'Action queued',
        description: data.message || `${data.job?.action || 'Operation'} started`,
      });
      fetchStatus(true);
    } catch (error) {
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    
      {/* Stats Row */}
      
        
          
            
              
              Target
            
            {status?.target || '-'}
            {status?.mode || 'loading'}
          
        

        
          
            
              
              Services
            
            
              {runningServices}/{status?.services.length ?? 0}
            
            running
          
        

        
          
            
              
              Jobs
            
            {activeJobs}
            active
          
        

        
          
            
              
              Agent
            
            
              {status?.diagnostics.opsAgentReachable ? 'Reachable' : 'Local mode'}
            
          
        
      

      {/* Controls */}
      
        
          
            
              
                
                VM Stack Controls
              
              
                Build images, deploy stack, or restart individual services on the VM.
              
            
            
               fetchStatus(true)}
                disabled={refreshing}
              >
                
                Refresh
              
               queueAction('/api/ops/deployments/build', { service: selectedService })}
                disabled={actionLoading !== null}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                
                Build {selectedService}
              
               queueAction('/api/ops/deployments/deploy')}
                disabled={actionLoading !== null}
              >
                
                Deploy Stack
              
               queueAction('/api/ops/deployments/restart', { service: selectedService })}
                disabled={actionLoading !== null || !selectedService}
              >
                
                Restart {selectedService}
              
            
          
        
        
          
            
              compose: {status?.composeFilePath || '-'}
            
            
              deploy: {status?.deployScriptPath || '-'}
            
            {status?.diagnostics.dockerAvailable && (
              
                
                Docker ready
              
            )}
          
        
      

      {/* Services Table */}
      
        
          Services
          
            Live container state from Docker Compose on the VM.
          
        
        
          {loading ? (
            
               Loading services...
            
          ) : (
            
              
                
                  
                    Service
                    Container
                    Status
                    Health
                    Ports
                    Image
                  
                
                
                  {status?.services.map((service) => (
                     setSelectedService(service.serviceName)}
                    >
                      
                        
                          
                          {service.serviceName}
                        
                      
                      
                        {service.containerName || '-'}
                      
                      
                        
                          {service.status}
                        
                      
                      {service.health || '-'}
                      {service.ports || '-'}
                      
                        {service.image || '-'}
                      
                    
                  ))}
                
              
            
          )}
        
      

      {/* Job History */}
      
        
          Job History
          
            Recent build, deploy, and restart jobs.
          
        
        
          {!status?.jobs.length ? (
            No deployment jobs recorded yet.
          ) : (
            
              {status.jobs.map((job) => (
                
                  
                    
                      
                        {job.status}
                        
                          {job.action}
                        
                        {job.target && (
                          
                            {job.target}
                          
                        )}
                      
                      {job.command}
                    
                    
                      
                        
                        {formatDate(job.startedAt || job.createdAt)}
                      
                      {job.finishedAt ? `Finished ${formatDate(job.finishedAt)}` : 'Still running'}
                    
                  
                  {job.outputSnippet && (
                    
                      {job.outputSnippet}
                    
                  )}
                
              ))}
            
          )}
        
      
    
  );
}

/* ── Cloud Run Deployment Panel ── */

function CloudRunDeploymentPanel({ project }: { project: Project }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [serviceStatuses, setServiceStatuses] = useState([]);
  const [selectedService, setSelectedService] = useState(
    project.services[0]?.cloudRunService || '',
  );
  const [revisions, setRevisions] = useState([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // Deploy form state
  const [deployImage, setDeployImage] = useState(project.services[0]?.imageUrl || '');
  const [deployServiceName, setDeployServiceName] = useState(project.services[0]?.cloudRunService || '');

  const fetchServiceStatuses = useCallback(async () => {
    setLoading(true);
    const statuses: CloudRunServiceStatus[] = [];

    for (const svc of project.services) {
      if (!svc.cloudRunService) continue;
      try {
        const data = await apiJsonRequest('GET', `/api/ops/deployments/service/${svc.cloudRunService}?target=cloud-run`);
        if (data.success && data.service) {
          statuses.push({ ...data.service, serviceName: svc.cloudRunService });
        }
      } catch {
        statuses.push({
          name: svc.cloudRunService,
          serviceName: svc.cloudRunService,
          uri: '-',
          status: 'NOT_FOUND',
          createTime: '',
          updateTime: '',
          creator: '',
          lastModifier: '',
        });
      }
    }

    setServiceStatuses(statuses);
    setLoading(false);
  }, [project.services]);

  const fetchRevisions = useCallback(async (serviceName: string) => {
    setRevisionsLoading(true);
    try {
      const data = await apiJsonRequest('GET', `/api/ops/deployments/service/${serviceName}/revisions?target=cloud-run`);
      if (data.success) {
        setRevisions(data.revisions || []);
      }
    } catch {
      setRevisions([]);
    } finally {
      setRevisionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServiceStatuses();
  }, [fetchServiceStatuses]);

  useEffect(() => {
    if (selectedService) {
      fetchRevisions(selectedService);
    }
  }, [selectedService, fetchRevisions]);

  const deployToCloudRun = async () => {
    if (!deployServiceName || !deployImage) {
      toast({ title: 'Missing fields', description: 'Service name and image URL are required', variant: 'destructive' });
      return;
    }
    setActionLoading('deploy');
    try {
      const data = await apiJsonRequest('POST', '/api/ops/deployments/deploy', {
        target: 'cloud-run',
        serviceName: deployServiceName,
        imageUrl: deployImage,
        environment: {},
      });
      if (!data.success) throw new Error(data.error || 'Deploy failed');
      toast({ title: 'Deployed', description: data.message || `Deployed to ${data.url}` });
      fetchServiceStatuses();
      if (selectedService) fetchRevisions(selectedService);
    } catch (error) {
      toast({ title: 'Deploy failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const rollbackService = async (revisionName: string) => {
    if (!selectedService) return;
    setActionLoading('rollback');
    try {
      const data = await apiJsonRequest('POST', `/api/ops/deployments/service/${selectedService}/rollback`, {
        target: 'cloud-run',
        revisionName,
      });
      if (!data.success) throw new Error(data.error || 'Rollback failed');
      toast({ title: 'Rolled back', description: data.message });
      fetchRevisions(selectedService);
    } catch (error) {
      toast({ title: 'Rollback failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    
      {/* Stats */}
      
        
          
            
              
              Platform
            
            Cloud Run
            GCP Managed
          
        

        
          
            
              
              Services
            
            {serviceStatuses.length}
            
              {serviceStatuses.filter((s) => s.status !== 'NOT_FOUND').length} active
            
          
        

        
          
            
              
              Revisions
            
            {revisions.length}
            {selectedService || 'select a service'}
          
        
      

      {/* Deploy Form */}
      
        
          
            
            Deploy to Cloud Run
          
          
            Deploy a container image to a Cloud Run service with auto-scaling.
          
        
        
          
            
              Service Name
               setDeployServiceName(e.target.value)}
                placeholder="demandgentic-api"
                className="h-9 text-sm"
              />
            
            
              Image URL
               setDeployImage(e.target.value)}
                placeholder="gcr.io/project/image:tag"
                className="h-9 text-sm font-mono"
              />
            
            
              {actionLoading === 'deploy' ? (
                
              ) : (
                
              )}
              Deploy
            
          
        
      

      {/* Services Table */}
      
        
          
            
              Cloud Run Services
              
                Managed services running on Google Cloud Run.
              
            
            
              
              Refresh
            
          
        
        
          {loading ? (
            
               Loading Cloud Run services...
            
          ) : serviceStatuses.length === 0 ? (
            
              No Cloud Run services configured for this project.
            
          ) : (
            
              
                
                  
                    Service
                    Status
                    URL
                    Last Updated
                    Last Modifier
                  
                
                
                  {serviceStatuses.map((svc) => (
                     setSelectedService(svc.serviceName)}
                    >
                      
                        
                          
                          {svc.serviceName}
                        
                      
                      
                        
                          {svc.status}
                        
                      
                      
                        {svc.uri && svc.uri !== '-' ? (
                          
                            {svc.uri.replace(/^https?:\/\//, '').slice(0, 40)}...
                            
                          
                        ) : (
                          -
                        )}
                      
                      {formatDate(svc.updateTime)}
                      {svc.lastModifier || '-'}
                    
                  ))}
                
              
            
          )}
        
      

      {/* Revisions & Traffic */}
      {selectedService && (
        
          
            
              
                
                  
                  Revisions & Traffic
                
                
                  Manage traffic splitting and rollbacks for {selectedService}.
                
              
            
          
          
            {revisionsLoading ? (
              
                 Loading revisions...
              
            ) : revisions.length === 0 ? (
              No revisions found.
            ) : (
              
                {revisions.map((rev) => (
                  
                    
                      {rev.status}
                      {rev.name}
                      {rev.trafficPercent !== undefined && rev.trafficPercent > 0 && (
                        
                          {rev.trafficPercent}% traffic
                        
                      )}
                    
                    
                      {formatDate(rev.createTime)}
                       rollbackService(rev.name)}
                        disabled={actionLoading !== null || (rev.trafficPercent === 100)}
                        className="h-7 text-xs"
                      >
                        
                        Rollback
                      
                    
                  
                ))}
              
            )}
          
        
      )}
    
  );
}

/* ── Main DeploymentsTab ── */

interface DeploymentsTabProps {
  project: Project;
}

export default function DeploymentsTab({ project }: DeploymentsTabProps) {
  const isCloudRun = project.deployTarget === 'cloud-run';

  return (
    
      

      {/* Target indicator */}
      
        
          {isCloudRun ?  : }
          
            {isCloudRun ? 'Cloud Run' : 'VM / Docker Compose'}
          
        
        
          {project.name} — {project.services.length} service{project.services.length !== 1 ? 's' : ''}
        
      

      {isCloudRun ? (
        
      ) : (
        
      )}
    
  );
}