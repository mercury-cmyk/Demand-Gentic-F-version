import React, { useState, useEffect, useCallback } from 'react';
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
  ExternalLink,
  Cpu,
  HardDrive,
  Clock,
  ChevronRight,
  ChevronDown,
  X,
  Cloud,
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
  env: Record<string, string>;
}

type CreateMode = 'cluster' | 'config' | 'workstation' | null;

const STATE_COLORS: Record<string, string> = {
  STATE_RUNNING: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  STATE_STARTING: 'bg-amber-100 text-amber-700 border-amber-200',
  STATE_STOPPING: 'bg-orange-100 text-orange-700 border-orange-200',
  STATE_STOPPED: 'bg-slate-100 text-slate-600 border-slate-200',
  STATE_UNSPECIFIED: 'bg-slate-100 text-slate-500 border-slate-200',
  READY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  RECONCILING: 'bg-amber-100 text-amber-700 border-amber-200',
  DEGRADED: 'bg-red-100 text-red-700 border-red-200',
};

const STATE_LABELS: Record<string, string> = {
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
  { value: 'n2-standard-16', label: 'n2-standard-16 (16 vCPU, 64 GB)' },
  { value: 'n1-standard-4', label: 'n1-standard-4 (4 vCPU, 15 GB)' },
  { value: 'n1-standard-8', label: 'n1-standard-8 (8 vCPU, 30 GB)' },
];

function StateBadge({ state }: { state: string }) {
  return (
    <Badge className={`text-[10px] px-2 py-0.5 border ${STATE_COLORS[state] || STATE_COLORS.STATE_UNSPECIFIED}`}>
      {state === 'STATE_STARTING' || state === 'STATE_STOPPING' || state === 'RECONCILING' ? (
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
      ) : (
        <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          state === 'STATE_RUNNING' || state === 'READY' ? 'bg-emerald-500' :
          state === 'STATE_STOPPED' ? 'bg-slate-400' :
          state === 'DEGRADED' ? 'bg-red-500' : 'bg-amber-500'
        }`} />
      )}
      {STATE_LABELS[state] || state}
    </Badge>
  );
}

function formatTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function WorkstationsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [configs, setConfigs] = useState<Record<string, Config[]>>({});
  const [workstations, setWorkstations] = useState<Record<string, Workstation[]>>({});
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [createParent, setCreateParent] = useState<{ clusterId?: string; configId?: string }>({});

  // Create form fields
  const [formId, setFormId] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formMachineType, setFormMachineType] = useState('e2-standard-4');
  const [formDiskSize, setFormDiskSize] = useState('50');
  const [formIdleTimeout, setFormIdleTimeout] = useState('1200');
  const [formContainerImage, setFormContainerImage] = useState('');

  const fetchClusters = useCallback(async () => {
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        clusters?: Cluster[];
      }>('GET', '/api/ops/workstations/clusters');
      if (data.success) {
        setClusters(data.clusters || []);
        // Auto-expand clusters and fetch their configs
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
      const data = await apiJsonRequest<{
        success: boolean;
        configs?: Config[];
      }>('GET', `/api/ops/workstations/clusters/${clusterId}/configs`);
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
      const data = await apiJsonRequest<{
        success: boolean;
        workstations?: Workstation[];
      }>('GET', `/api/ops/workstations/clusters/${clusterId}/configs/${configId}/workstations`);
      if (data.success) {
        setWorkstations(prev => ({ ...prev, [`${clusterId}/${configId}`]: data.workstations || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch workstations:', err);
    }
  };

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  const toggleCluster = (clusterId: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else {
        next.add(clusterId);
        fetchConfigs(clusterId);
      }
      return next;
    });
  };

  const toggleConfig = (configKey: string) => {
    setExpandedConfigs(prev => {
      const next = new Set(prev);
      if (next.has(configKey)) next.delete(configKey);
      else next.add(configKey);
      return next;
    });
  };

  const setActionState = (key: string, loading: boolean) => {
    setActionLoading(prev => ({ ...prev, [key]: loading }));
  };

  const startWorkstation = async (ws: Workstation) => {
    const key = `start-${ws.id}`;
    setActionState(key, true);
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        error?: string;
      }>(
        'POST',
        `/api/ops/workstations/clusters/${ws.clusterId}/configs/${ws.configId}/workstations/${ws.id}/start`,
        {},
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
      const data = await apiJsonRequest<{
        success: boolean;
        error?: string;
      }>(
        'POST',
        `/api/ops/workstations/clusters/${ws.clusterId}/configs/${ws.configId}/workstations/${ws.id}/stop`,
        {},
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

  const openWorkstation = async (ws: Workstation) => {
    if (ws.host) {
      window.open(`https://${ws.host}`, '_blank');
    } else {
      toast({ title: 'No host available', description: 'Start the workstation first.', variant: 'destructive' });
    }
  };

  const deleteWorkstation = async (ws: Workstation) => {
    if (!confirm(`Delete workstation "${ws.displayName}"? This cannot be undone.`)) return;
    const key = `delete-${ws.id}`;
    setActionState(key, true);
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        error?: string;
      }>(
        'DELETE',
        `/api/ops/workstations/clusters/${ws.clusterId}/configs/${ws.configId}/workstations/${ws.id}`,
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
          configId: formId,
          displayName: formDisplayName,
          machineType: formMachineType,
          bootDiskSizeGb: parseInt(formDiskSize) || 50,
          idleTimeout: formIdleTimeout,
          containerImage: formContainerImage || undefined,
        };
      } else if (createMode === 'workstation') {
        url = `/api/ops/workstations/clusters/${createParent.clusterId}/configs/${createParent.configId}/workstations`;
        body = { workstationId: formId, displayName: formDisplayName };
      }

      const data = await apiJsonRequest<{
        success: boolean;
        error?: string;
      }>('POST', url, body);

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

  // Count all workstations
  const totalWorkstations = Object.values(workstations).reduce((sum, list) => sum + list.length, 0);
  const runningWorkstations = Object.values(workstations).reduce(
    (sum, list) => sum + list.filter(ws => ws.state === 'STATE_RUNNING').length, 0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        Loading Cloud Workstations...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Cloud className="w-6 h-6 text-indigo-500" />
            Google Cloud Workstations
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Managed cloud development environments powered by GCP
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900">{clusters.length}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Clusters</div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900">{totalWorkstations}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Workstations</div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-600">{runningWorkstations}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Running</div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setLoading(true); fetchClusters(); }}
            className="h-9"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => { setCreateMode('cluster'); resetForm(); setCreateMode('cluster'); }}
            className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New Cluster
          </Button>
        </div>
      </div>

      {/* Create Form */}
      {createMode && (
        <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create New {createMode === 'cluster' ? 'Cluster' : createMode === 'config' ? 'Configuration' : 'Workstation'}
            </h3>
            <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 w-7 p-0">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">ID (lowercase, no spaces)</label>
              <Input
                value={formId}
                onChange={(e) => setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder={`my-${createMode}`}
                className="h-9 text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Display Name</label>
              <Input
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                placeholder={`My ${createMode === 'cluster' ? 'Cluster' : createMode === 'config' ? 'Config' : 'Workstation'}`}
                className="h-9 text-sm bg-white"
              />
            </div>
          </div>

          {createMode === 'config' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Machine Type</label>
                <Select value={formMachineType} onValueChange={setFormMachineType}>
                  <SelectTrigger className="h-9 text-sm bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MACHINE_TYPES.map(mt => (
                      <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Boot Disk (GB)</label>
                <Input
                  type="number"
                  value={formDiskSize}
                  onChange={(e) => setFormDiskSize(e.target.value)}
                  className="h-9 text-sm bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Idle Timeout (seconds)</label>
                <Input
                  type="number"
                  value={formIdleTimeout}
                  onChange={(e) => setFormIdleTimeout(e.target.value)}
                  placeholder="1200"
                  className="h-9 text-sm bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Container Image (optional)</label>
                <Input
                  value={formContainerImage}
                  onChange={(e) => setFormContainerImage(e.target.value)}
                  placeholder="us-central1-docker.pkg.dev/..."
                  className="h-9 text-sm bg-white"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={actionLoading['create'] || !formId || !formDisplayName}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {actionLoading['create'] ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {clusters.length === 0 && !createMode && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <Cloud className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No Workstation Clusters</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Create a workstation cluster to get started with managed cloud development environments.
            Each cluster can host multiple configurations and workstations.
          </p>
          <Button
            onClick={() => { setCreateMode('cluster'); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" /> Create First Cluster
          </Button>
        </div>
      )}

      {/* Cluster Tree */}
      <div className="space-y-3">
        {clusters.map(cluster => {
          const isExpanded = expandedClusters.has(cluster.id);
          const clusterConfigs = configs[cluster.id] || [];

          return (
            <div key={cluster.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              {/* Cluster Header */}
              <button
                onClick={() => toggleCluster(cluster.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm shrink-0">
                  <Server className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{cluster.displayName}</span>
                    <StateBadge state={cluster.state} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                    <span>ID: {cluster.id}</span>
                    {cluster.controlPlaneIp && <span>IP: {cluster.controlPlaneIp}</span>}
                    <span>Created: {formatTime(cluster.createTime)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">
                    {clusterConfigs.length} config{clusterConfigs.length !== 1 ? 's' : ''}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreateMode('config');
                      setCreateParent({ clusterId: cluster.id });
                      setFormId('');
                      setFormDisplayName('');
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Config
                  </Button>
                </div>
              </button>

              {/* Configs */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {clusterConfigs.length === 0 ? (
                    <div className="px-5 py-6 text-center text-sm text-slate-400">
                      No configurations in this cluster.
                      <Button
                        variant="link"
                        size="sm"
                        className="ml-1 text-indigo-600"
                        onClick={() => {
                          setCreateMode('config');
                          setCreateParent({ clusterId: cluster.id });
                        }}
                      >
                        Create one
                      </Button>
                    </div>
                  ) : (
                    clusterConfigs.map(config => {
                      const configKey = `${cluster.id}/${config.id}`;
                      const isConfigExpanded = expandedConfigs.has(configKey);
                      const configWorkstations = workstations[configKey] || [];

                      return (
                        <div key={config.id} className="border-t border-slate-100 first:border-t-0">
                          {/* Config Header */}
                          <button
                            onClick={() => toggleConfig(configKey)}
                            className="w-full flex items-center gap-3 px-5 py-3 pl-12 hover:bg-slate-50/80 transition-colors text-left"
                          >
                            {isConfigExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                              <Settings className="w-4 h-4 text-violet-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-800">{config.displayName}</span>
                                <StateBadge state={config.state} />
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                                <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {config.machineType}</span>
                                <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {config.bootDiskSizeGb} GB</span>
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Idle: {Math.round(parseInt(config.idleTimeout) / 60)}m</span>
                                {config.containerImage && <span className="truncate max-w-[200px]">Image: {config.containerImage}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">
                                {configWorkstations.length} ws
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCreateMode('workstation');
                                  setCreateParent({ clusterId: cluster.id, configId: config.id });
                                  setFormId('');
                                  setFormDisplayName('');
                                }}
                              >
                                <Plus className="w-3 h-3 mr-1" /> Workstation
                              </Button>
                            </div>
                          </button>

                          {/* Workstations */}
                          {isConfigExpanded && (
                            <div className="bg-slate-50/50">
                              {configWorkstations.length === 0 ? (
                                <div className="px-5 py-4 pl-20 text-sm text-slate-400">
                                  No workstations.
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="ml-1 text-indigo-600"
                                    onClick={() => {
                                      setCreateMode('workstation');
                                      setCreateParent({ clusterId: cluster.id, configId: config.id });
                                    }}
                                  >
                                    Create one
                                  </Button>
                                </div>
                              ) : (
                                configWorkstations.map(ws => (
                                  <div
                                    key={ws.id}
                                    className="flex items-center gap-3 px-5 py-3 pl-20 border-t border-slate-100 hover:bg-white/80 transition-colors"
                                  >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                      ws.state === 'STATE_RUNNING'
                                        ? 'bg-emerald-100'
                                        : ws.state === 'STATE_STARTING' || ws.state === 'STATE_STOPPING'
                                        ? 'bg-amber-100'
                                        : 'bg-slate-100'
                                    }`}>
                                      <Monitor className={`w-4 h-4 ${
                                        ws.state === 'STATE_RUNNING' ? 'text-emerald-600' :
                                        ws.state === 'STATE_STARTING' || ws.state === 'STATE_STOPPING' ? 'text-amber-600' :
                                        'text-slate-500'
                                      }`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-800">{ws.displayName}</span>
                                        <StateBadge state={ws.state} />
                                        {ws.reconciling && (
                                          <Badge className="bg-amber-50 text-amber-600 border-amber-200 text-[10px]">
                                            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Reconciling
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                                        <span>ID: {ws.id}</span>
                                        {ws.startTime && <span>Started: {formatTime(ws.startTime)}</span>}
                                        {ws.host && <span className="text-indigo-600 truncate max-w-[200px]">{ws.host}</span>}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {ws.state === 'STATE_STOPPED' && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-8 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                          onClick={() => startWorkstation(ws)}
                                          disabled={actionLoading[`start-${ws.id}`]}
                                        >
                                          {actionLoading[`start-${ws.id}`] ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <><Play className="w-3.5 h-3.5 mr-1" /> Start</>
                                          )}
                                        </Button>
                                      )}
                                      {ws.state === 'STATE_RUNNING' && (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                            onClick={() => openWorkstation(ws)}
                                          >
                                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open IDE
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs text-orange-700 border-orange-200 hover:bg-orange-50"
                                            onClick={() => stopWorkstation(ws)}
                                            disabled={actionLoading[`stop-${ws.id}`]}
                                          >
                                            {actionLoading[`stop-${ws.id}`] ? (
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                              <><Square className="w-3.5 h-3.5 mr-1" /> Stop</>
                                            )}
                                          </Button>
                                        </>
                                      )}
                                      {(ws.state === 'STATE_STARTING' || ws.state === 'STATE_STOPPING') && (
                                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs px-3 py-1">
                                          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                          {ws.state === 'STATE_STARTING' ? 'Starting...' : 'Stopping...'}
                                        </Badge>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                                        onClick={() => deleteWorkstation(ws)}
                                        disabled={actionLoading[`delete-${ws.id}`]}
                                      >
                                        {actionLoading[`delete-${ws.id}`] ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info Footer */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
          <Cloud className="w-4 h-4 text-indigo-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800">About Google Cloud Workstations</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Cloud Workstations provides managed, secure development environments on Google Cloud.
            Each workstation runs in its own container with persistent storage, pre-configured IDEs (VS Code, JetBrains, etc.),
            and direct access to GCP services. Workstations automatically stop after the idle timeout to save costs.
          </p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
            <span>Project: {'{GCP_PROJECT_ID}'}</span>
            <span>Region: {'{GCP_REGION}'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
