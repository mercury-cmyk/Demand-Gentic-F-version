import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiJsonRequest } from '@/lib/queryClient';
import WorkstationIDE from './workstation-ide';
import {
  Plus,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Loader2,
  Monitor,
  Server,
  Settings,
  Cpu,
  HardDrive,
  Clock,
  ChevronRight,
  ChevronDown,
  X,
  Cloud,
  ArrowLeft,
  Maximize2,
  CornerDownLeft,
  Plug,
} from 'lucide-react';

/* ── Types ── */
interface Cluster {
  id: string;
  name: string;
  displayName: string;
  network: string;
  subnetwork: string;
  controlPlaneIp: string;
  state: string;
  createTime: string;
  degraded: boolean;
}

interface Config {
  id: string;
  name: string;
  displayName: string;
  clusterId: string;
  machineType: string;
  bootDiskSizeGb: number;
  idleTimeout: string;
  runningTimeout: string;
  containerImage: string | null;
  state: string;
  createTime: string;
  degraded: boolean;
}

interface Workstation {
  id: string;
  name: string;
  displayName: string;
  configId: string;
  clusterId: string;
  state: 'STATE_UNSPECIFIED' | 'STATE_STARTING' | 'STATE_RUNNING' | 'STATE_STOPPING' | 'STATE_STOPPED';
  host: string;
  createTime: string;
  startTime: string;
  reconciling: boolean;
  env: Record;
}

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system';
  text: string;
  timestamp: Date;
}

interface WorkstationIdeInfo {
  success: boolean;
  url: string;
  host: string;
  accessToken: string;
  expireTime: string;
  error?: string;
}

type ViewMode = 'manager' | 'ide';
type CreateMode = 'cluster' | 'config' | 'workstation' | null;

/* ── Constants ── */
const STATE_COLORS: Record = {
  STATE_RUNNING: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  STATE_STARTING: 'bg-amber-100 text-amber-700 border-amber-200',
  STATE_STOPPING: 'bg-orange-100 text-orange-700 border-orange-200',
  STATE_STOPPED: 'bg-slate-100 text-slate-600 border-slate-200',
  STATE_UNSPECIFIED: 'bg-slate-100 text-slate-500 border-slate-200',
  READY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  RECONCILING: 'bg-amber-100 text-amber-700 border-amber-200',
  DEGRADED: 'bg-red-100 text-red-700 border-red-200',
};

const STATE_LABELS: Record = {
  STATE_RUNNING: 'Running',
  STATE_STARTING: 'Starting',
  STATE_STOPPING: 'Stopping',
  STATE_STOPPED: 'Stopped',
  STATE_UNSPECIFIED: 'Unknown',
  READY: 'Ready',
  RECONCILING: 'Reconciling',
  DEGRADED: 'Degraded',
};

const MACHINE_TYPES = [
  { value: 'e2-standard-4', label: 'e2-standard-4 (4 vCPU, 16 GB)' },
  { value: 'e2-standard-8', label: 'e2-standard-8 (8 vCPU, 32 GB)' },
  { value: 'e2-standard-16', label: 'e2-standard-16 (16 vCPU, 64 GB)' },
  { value: 'n2-standard-4', label: 'n2-standard-4 (4 vCPU, 16 GB)' },
  { value: 'n2-standard-8', label: 'n2-standard-8 (8 vCPU, 32 GB)' },
  { value: 'n1-standard-4', label: 'n1-standard-4 (4 vCPU, 15 GB)' },
];

function formatTime(iso: string) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function handleExpandableRowKeyDown(toggle: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };
}

/* ── Helper: workstation API base path ── */
function wsApi(ws: Workstation) {
  return `/api/ops/workstations/clusters/${ws.clusterId}/configs/${ws.configId}/workstations/${ws.id}`;
}

function buildWorkstationAuthUrl(ideUrl: string, accessToken: string) {
  const normalizedUrl = ideUrl.replace(/\/$/, '');
  return `${normalizedUrl}/_workstation/authenticate?access_token=${encodeURIComponent(accessToken)}&redirect_url=${encodeURIComponent('/')}`;
}

function openWorkstationLoadingWindow(): Window | null {
  const popup = window.open('', '_blank');
  if (!popup) return null;

  popup.document.write(`
Cloud IDE - Loading...

body{margin:0;font-family:system-ui;background:#1e1e2e;color:#cdd6f4;display:flex;align-items:center;justify-content:center;height:100vh}
.loading{text-align:center}.spinner{width:40px;height:40px;border:3px solid #313244;border-top:3px solid #89b4fa;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}

Opening Cloud Workstation…`);
  popup.document.close();

  return popup;
}

async function launchWorkstationIDE(ws: Workstation): Promise {
  const popup = openWorkstationLoadingWindow();

  try {
    const data = await apiJsonRequest('GET', `${wsApi(ws)}/ide-url`);
    if (!data.success || !data.url) {
      throw new Error(data.error || 'Unable to get workstation IDE URL');
    }

    const authUrl = buildWorkstationAuthUrl(data.url, data.accessToken);

    if (popup && !popup.closed) {
      popup.location.replace(authUrl);
    } else {
      const fallbackPopup = window.open(authUrl, '_blank');
      if (!fallbackPopup) {
        throw new Error('Popup blocked. Allow popups for this site and try again.');
      }
    }

    return data;
  } catch (error) {
    if (popup && !popup.closed) {
      popup.close();
    }
    throw error;
  }
}

/* ── StateBadge ── */
function StateBadge({ state }: { state: string }) {
  const spinning = state === 'STATE_STARTING' || state === 'STATE_STOPPING' || state === 'RECONCILING';
  return (
    
      {spinning ? (
        
      ) : (
        
      )}
      {STATE_LABELS[state] || state}
    
  );
}

/* ══════════════════════════════════════════════════════════════
   CLOUD IDE VIEW — terminal workspace with IDE in new tab
   ══════════════════════════════════════════════════════════════ */
function CloudIDE({
  workstation,
  config,
  onDisconnect,
}: {
  workstation: Workstation;
  config: Config | null;
  onDisconnect: () => void;
}) {
  const [terminalLines, setTerminalLines] = useState([
    { id: 0, type: 'system', text: `Connected to ${workstation.displayName} (${workstation.id})`, timestamp: new Date() },
    { id: 1, type: 'system', text: `Host: ${workstation.host || 'resolving...'}`, timestamp: new Date() },
    { id: 2, type: 'system', text: 'IDE opens in a separate browser tab. Use Reopen IDE if you need a fresh session.', timestamp: new Date() },
    { id: 3, type: 'system', text: 'Terminal ready. Type commands to execute on the workstation.', timestamp: new Date() },
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [ideOpened, setIdeOpened] = useState(true);
  const terminalEndRef = useRef(null);
  const lineIdRef = useRef(4);
  const inputRef = useRef(null);

  const addTerminalLine = useCallback((type: TerminalLine['type'], text: string) => {
    const id = lineIdRef.current++;
    setTerminalLines(prev => [...prev, { id, type, text, timestamp: new Date() }]);
  }, []);

  const openIDEInNewTab = async () => {
    try {
      addTerminalLine('system', 'Fetching IDE credentials...');
      const data = await launchWorkstationIDE(workstation);
      setIdeOpened(true);
      addTerminalLine('system', `IDE opened in new tab. Token expires: ${new Date(data.expireTime).toLocaleTimeString()}`);
    } catch (err) {
      setIdeOpened(false);
      addTerminalLine('error', `Failed to open IDE: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /* ── Terminal ── */
  const execCommand = async (command: string) => {
    if (!command.trim()) return;
    addTerminalLine('input', `$ ${command}`);
    setTerminalRunning(true);
    try {
      const data = await apiJsonRequest(
        'POST', `${wsApi(workstation)}/exec`, { command },
      );
      if (data.stdout) addTerminalLine('output', data.stdout.trimEnd());
      if (data.stderr) addTerminalLine('error', data.stderr.trimEnd());
      if (data.exitCode !== 0) addTerminalLine('system', `Exit code: ${data.exitCode}`);
    } catch (err) {
      addTerminalLine('error', `Command failed: ${err}`);
    } finally {
      setTerminalRunning(false);
      inputRef.current?.focus();
    }
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = terminalInput.trim();
    if (!cmd) return;
    setTerminalInput('');
    execCommand(cmd);
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLines]);

  return (
    
      {/* ── Top Bar ── */}
      
        
           Manager
        
        
        
          
          {workstation.displayName}
          {config && (
            
               {config.machineType}
            
          )}
        
        
        
          
             {ideOpened ? 'Reopen IDE' : 'Open IDE'}
          
           { setTerminalLines([]); lineIdRef.current = 0; addTerminalLine('system', 'Terminal cleared'); }}
            className="h-7 px-2 text-[#a6adc8] hover:bg-[#313244]">
            
          
        
      

      {/* ── Full-screen Terminal ── */}
      
         inputRef.current?.focus()}>
          {terminalLines.map((line) => (
            {line.text}
          ))}
          
        
        
          
            $
             setTerminalInput(e.target.value)}
              placeholder="Type a command..." disabled={terminalRunning}
              className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-[#cdd6f4] placeholder:text-[#45475a]" autoFocus />
            {terminalRunning ? (
              
            ) : (
              
                
              
            )}
          
        
      

      {/* ── Status Bar ── */}
      
        
          
          Connected
        
        
        {workstation.host}
        {config && <>{config.machineType} &middot; {config.bootDiskSizeGb} GB}
        
        {ideOpened && IDE open in tab}
        Cloud Workstation
      
    
  );
}

/* ══════════════════════════════════════════════════════════════
   WORKSTATION MANAGER VIEW — cluster/config/workstation tree
   ══════════════════════════════════════════════════════════════ */
export default function WorkstationsTab() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState('manager');
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState([]);
  const [configs, setConfigs] = useState>({});
  const [workstations, setWorkstations] = useState>({});
  const [expandedClusters, setExpandedClusters] = useState>(new Set());
  const [expandedConfigs, setExpandedConfigs] = useState>(new Set());
  const [actionLoading, setActionLoading] = useState>({});
  const [createMode, setCreateMode] = useState(null);
  const [createParent, setCreateParent] = useState({});
  const [connectedWs, setConnectedWs] = useState(null);
  const [connectedConfig, setConnectedConfig] = useState(null);

  // Create form fields
  const [formId, setFormId] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formMachineType, setFormMachineType] = useState('e2-standard-4');
  const [formDiskSize, setFormDiskSize] = useState('50');
  const [formIdleTimeout, setFormIdleTimeout] = useState('1200');
  const [formContainerImage, setFormContainerImage] = useState('');

  /* ── Data fetching ── */
  const fetchClusters = useCallback(async () => {
    try {
      const data = await apiJsonRequest(
        'GET', '/api/ops/workstations/clusters',
      );
      if (data.success) {
        setClusters(data.clusters || []);
        for (const cluster of data.clusters || []) {
          fetchConfigs(cluster.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch clusters:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchConfigs = async (clusterId: string) => {
    try {
      const data = await apiJsonRequest(
        'GET', `/api/ops/workstations/clusters/${clusterId}/configs`,
      );
      if (data.success) {
        setConfigs(prev => ({ ...prev, [clusterId]: data.configs || [] }));
        for (const config of data.configs || []) {
          fetchWorkstations(clusterId, config.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch configs:', err);
    }
  };

  const fetchWorkstations = async (clusterId: string, configId: string) => {
    try {
      const data = await apiJsonRequest(
        'GET', `/api/ops/workstations/clusters/${clusterId}/configs/${configId}/workstations`,
      );
      if (data.success) {
        setWorkstations(prev => ({ ...prev, [`${clusterId}/${configId}`]: data.workstations || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch workstations:', err);
    }
  };

  useEffect(() => { fetchClusters(); }, [fetchClusters]);

  /* ── Actions ── */
  const setActionState = (key: string, loading: boolean) => {
    setActionLoading(prev => ({ ...prev, [key]: loading }));
  };

  const startWorkstation = async (ws: Workstation) => {
    const key = `start-${ws.id}`;
    setActionState(key, true);
    try {
      const data = await apiJsonRequest(
        'POST', `${wsApi(ws)}/start`, {},
      );
      if (data.success) {
        toast({ title: 'Workstation starting', description: `${ws.displayName} is starting up...` });
        fetchWorkstations(ws.clusterId, ws.configId);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({ title: 'Failed to start', description: String(err), variant: 'destructive' });
    } finally {
      setActionState(key, false);
    }
  };

  const stopWorkstation = async (ws: Workstation) => {
    const key = `stop-${ws.id}`;
    setActionState(key, true);
    try {
      const data = await apiJsonRequest(
        'POST', `${wsApi(ws)}/stop`, {},
      );
      if (data.success) {
        toast({ title: 'Workstation stopping', description: `${ws.displayName} is shutting down...` });
        fetchWorkstations(ws.clusterId, ws.configId);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({ title: 'Failed to stop', description: String(err), variant: 'destructive' });
    } finally {
      setActionState(key, false);
    }
  };

  const connectToWorkstation = async (ws: Workstation) => {
    if (ws.state !== 'STATE_RUNNING') {
      toast({ title: 'Not running', description: 'Start the workstation first.', variant: 'destructive' });
      return;
    }

    const key = `connect-${ws.id}`;
    setActionState(key, true);

    try {
      await launchWorkstationIDE(ws);

      const cfgList = configs[ws.clusterId] || [];
      const cfg = cfgList.find(c => c.id === ws.configId) || null;
      setConnectedWs(ws);
      setConnectedConfig(cfg);
      setViewMode('ide');
    } catch (err) {
      toast({
        title: 'Unable to open IDE',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setActionState(key, false);
    }
  };

  const deleteWorkstation = async (ws: Workstation) => {
    if (!confirm(`Delete workstation "${ws.displayName}"? This cannot be undone.`)) return;
    const key = `delete-${ws.id}`;
    setActionState(key, true);
    try {
      const data = await apiJsonRequest(
        'DELETE', wsApi(ws),
      );
      if (data.success) {
        toast({ title: 'Workstation deleted', description: ws.displayName });
        fetchWorkstations(ws.clusterId, ws.configId);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({ title: 'Failed to delete', description: String(err), variant: 'destructive' });
    } finally {
      setActionState(key, false);
    }
  };

  const toggleCluster = (clusterId: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else { next.add(clusterId); fetchConfigs(clusterId); }
      return next;
    });
  };

  const toggleConfig = (configKey: string) => {
    setExpandedConfigs(prev => {
      const next = new Set(prev);
      if (next.has(configKey)) next.delete(configKey); else next.add(configKey);
      return next;
    });
  };

  const resetForm = () => {
    setCreateMode(null);
    setCreateParent({});
    setFormId('');
    setFormDisplayName('');
    setFormMachineType('e2-standard-4');
    setFormDiskSize('50');
    setFormIdleTimeout('1200');
    setFormContainerImage('');
  };

  const handleCreate = async () => {
    if (!formId || !formDisplayName) {
      toast({ title: 'Missing fields', description: 'ID and Display Name are required.', variant: 'destructive' });
      return;
    }
    setActionState('create', true);
    try {
      let url = '';
      let body: any = {};
      if (createMode === 'cluster') {
        url = '/api/ops/workstations/clusters';
        body = { clusterId: formId, displayName: formDisplayName };
      } else if (createMode === 'config') {
        url = `/api/ops/workstations/clusters/${createParent.clusterId}/configs`;
        body = {
          configId: formId, displayName: formDisplayName, machineType: formMachineType,
          bootDiskSizeGb: parseInt(formDiskSize) || 50, idleTimeout: formIdleTimeout,
          containerImage: formContainerImage || undefined,
        };
      } else if (createMode === 'workstation') {
        url = `/api/ops/workstations/clusters/${createParent.clusterId}/configs/${createParent.configId}/workstations`;
        body = { workstationId: formId, displayName: formDisplayName };
      }
      const data = await apiJsonRequest('POST', url, body);
      if (data.success) {
        toast({ title: `${createMode} created`, description: formDisplayName });
        resetForm();
        fetchClusters();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({ title: 'Create failed', description: String(err), variant: 'destructive' });
    } finally {
      setActionState('create', false);
    }
  };

  /* ── Counts ── */
  const totalWorkstations = Object.values(workstations).reduce((sum, list) => sum + list.length, 0);
  const runningWorkstations = Object.values(workstations).reduce(
    (sum, list) => sum + list.filter(ws => ws.state === 'STATE_RUNNING').length, 0,
  );

  /* ── IDE View ── */
  if (viewMode === 'ide' && connectedWs) {
    return (
       {
          setViewMode('manager');
          setConnectedWs(null);
          setConnectedConfig(null);
        }}
      />
    );
  }

  /* ── Manager View ── */
  if (loading) {
    return (
      
        
        Loading Cloud Workstations...
      
    );
  }

  return (
    
      {/* Header */}
      
        
          
            
            Cloud Workstations
          
          
            Managed cloud development environments with integrated IDE
          
        
        
          
            
              {clusters.length}
              Clusters
            
            
            
              {totalWorkstations}
              Workstations
            
            
            
              {runningWorkstations}
              Running
            
          
           { setLoading(true); fetchClusters(); }}
            className="h-9"
          >
             Refresh
          
           { resetForm(); setCreateMode('cluster'); }}
            className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
             New Cluster
          
        
      

      {/* Create Form */}
      {createMode && (
        
          
            
              
              Create New {createMode === 'cluster' ? 'Cluster' : createMode === 'config' ? 'Configuration' : 'Workstation'}
            
            
              
            
          

          
            
              ID (lowercase, no spaces)
               setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder={`my-${createMode}`}
                className="h-9 text-sm bg-white"
              />
            
            
              Display Name
               setFormDisplayName(e.target.value)}
                placeholder={`My ${createMode === 'cluster' ? 'Cluster' : createMode === 'config' ? 'Config' : 'Workstation'}`}
                className="h-9 text-sm bg-white"
              />
            
          

          {createMode === 'config' && (
            
              
                Machine Type
                
                  
                  
                    {MACHINE_TYPES.map(mt => (
                      {mt.label}
                    ))}
                  
                
              
              
                Boot Disk (GB)
                 setFormDiskSize(e.target.value)}
                  className="h-9 text-sm bg-white" />
              
              
                Idle Timeout (seconds)
                 setFormIdleTimeout(e.target.value)}
                  placeholder="1200" className="h-9 text-sm bg-white" />
              
              
                Container Image (optional)
                 setFormContainerImage(e.target.value)}
                  placeholder="us-central1-docker.pkg.dev/..." className="h-9 text-sm bg-white" />
              
            
          )}

          
            Cancel
            
              {actionLoading['create'] ?  : }
              Create
            
          
        
      )}

      {/* Empty State */}
      {clusters.length === 0 && !createMode && (
        
          
            
          
          No Workstation Clusters
          
            Create a workstation cluster to get started with managed cloud development environments.
          
           setCreateMode('cluster')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
             Create First Cluster
          
        
      )}

      {/* Cluster Tree */}
      
        {clusters.map(cluster => {
          const isExpanded = expandedClusters.has(cluster.id);
          const clusterConfigs = configs[cluster.id] || [];

          return (
            
              {/* Cluster Header */}
               toggleCluster(cluster.id)}
                onKeyDown={handleExpandableRowKeyDown(() => toggleCluster(cluster.id))}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {isExpanded ?  : }
                
                  
                
                
                  
                    {cluster.displayName}
                    
                  
                  
                    ID: {cluster.id}
                    {cluster.controlPlaneIp && IP: {cluster.controlPlaneIp}}
                    Created: {formatTime(cluster.createTime)}
                  
                
                
                  
                    {clusterConfigs.length} config{clusterConfigs.length !== 1 ? 's' : ''}
                  
                   {
                      e.stopPropagation();
                      setCreateMode('config');
                      setCreateParent({ clusterId: cluster.id });
                      setFormId(''); setFormDisplayName('');
                    }}
                  >
                     Config
                  
                
              

              {/* Configs */}
              {isExpanded && (
                
                  {clusterConfigs.length === 0 ? (
                    
                      No configurations in this cluster.
                       { setCreateMode('config'); setCreateParent({ clusterId: cluster.id }); }}>
                        Create one
                      
                    
                  ) : (
                    clusterConfigs.map(config => {
                      const configKey = `${cluster.id}/${config.id}`;
                      const isConfigExpanded = expandedConfigs.has(configKey);
                      const configWorkstations = workstations[configKey] || [];

                      return (
                        
                          {/* Config Header */}
                           toggleConfig(configKey)}
                            onKeyDown={handleExpandableRowKeyDown(() => toggleConfig(configKey))}
                            className="w-full flex items-center gap-3 px-5 py-3 pl-12 hover:bg-slate-50/80 transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                          >
                            {isConfigExpanded ?  : }
                            
                              
                            
                            
                              
                                {config.displayName}
                                
                              
                              
                                 {config.machineType}
                                 {config.bootDiskSizeGb} GB
                                 Idle: {Math.round(parseInt(config.idleTimeout) / 60)}m
                              
                            
                            
                              
                                {configWorkstations.length} ws
                              
                               {
                                  e.stopPropagation();
                                  setCreateMode('workstation');
                                  setCreateParent({ clusterId: cluster.id, configId: config.id });
                                  setFormId(''); setFormDisplayName('');
                                }}>
                                 Workstation
                              
                            
                          

                          {/* Workstations */}
                          {isConfigExpanded && (
                            
                              {configWorkstations.length === 0 ? (
                                
                                  No workstations.
                                   { setCreateMode('workstation'); setCreateParent({ clusterId: cluster.id, configId: config.id }); }}>
                                    Create one
                                  
                                
                              ) : (
                                configWorkstations.map(ws => (
                                  
                                    
                                      
                                    
                                    
                                      
                                        {ws.displayName}
                                        
                                        {ws.reconciling && (
                                          
                                             Reconciling
                                          
                                        )}
                                      
                                      
                                        ID: {ws.id}
                                        {ws.startTime && Started: {formatTime(ws.startTime)}}
                                        {ws.host && {ws.host}}
                                      
                                    
                                    
                                      {ws.state === 'STATE_STOPPED' && (
                                         startWorkstation(ws)}
                                          disabled={actionLoading[`start-${ws.id}`]}
                                        >
                                          {actionLoading[`start-${ws.id}`]
                                            ? 
                                            : <> Start}
                                        
                                      )}
                                      {ws.state === 'STATE_RUNNING' && (
                                        <>
                                           connectToWorkstation(ws)}
                                            disabled={actionLoading[`connect-${ws.id}`]}
                                          >
                                            {actionLoading[`connect-${ws.id}`]
                                              ? 
                                              : <> Connect IDE}
                                          
                                           stopWorkstation(ws)}
                                            disabled={actionLoading[`stop-${ws.id}`]}
                                          >
                                            {actionLoading[`stop-${ws.id}`]
                                              ? 
                                              : <> Stop}
                                          
                                        
                                      )}
                                      {(ws.state === 'STATE_STARTING' || ws.state === 'STATE_STOPPING') && (
                                        
                                          
                                          {ws.state === 'STATE_STARTING' ? 'Starting...' : 'Stopping...'}
                                        
                                      )}
                                       deleteWorkstation(ws)}
                                        disabled={actionLoading[`delete-${ws.id}`]}
                                      >
                                        {actionLoading[`delete-${ws.id}`]
                                          ? 
                                          : }
                                      
                                    
                                  
                                ))
                              )}
                            
                          )}
                        
                      );
                    })
                  )}
                
              )}
            
          );
        })}
      

      {/* Info Footer */}
      {clusters.length > 0 && (
        
          
            
          
          
            Cloud IDE Integration
            
              Click Connect IDE on any running workstation to open the integrated development environment
              with file explorer, code editor, and terminal &mdash; all within Operations Hub.
              Workstations automatically stop after the idle timeout to save costs.
            
          
        
      )}
    
  );
}