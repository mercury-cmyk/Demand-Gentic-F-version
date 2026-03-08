import { EventEmitter } from 'events';

/**
 * Google Cloud Workstations Manager
 * Manages cloud-based development environments via the GCP Workstations API.
 */

let WorkstationsClient: any = null;

interface WorkstationCluster {
  name: string;
  displayName: string;
  uid: string;
  network: string;
  subnetwork: string;
  controlPlaneIp: string;
  state: string;
  createTime: string;
  updateTime: string;
  degraded: boolean;
  conditions: Array<{ code: number; message: string }>;
}

interface WorkstationConfig {
  name: string;
  displayName: string;
  uid: string;
  machineType: string;
  bootDiskSizeGb: number;
  idleTimeout: string;
  runningTimeout: string;
  container: {
    image: string;
    command: string[];
    args: string[];
    env: Record<string, string>;
    workingDir: string;
  } | null;
  persistentDirectories: Array<{
    mountPath: string;
    gcePd?: { sizeGb: number; fsType: string; diskType: string; reclaimPolicy: string };
  }>;
  state: string;
  createTime: string;
  updateTime: string;
  degraded: boolean;
}

interface Workstation {
  name: string;
  displayName: string;
  uid: string;
  state: 'STATE_UNSPECIFIED' | 'STATE_STARTING' | 'STATE_RUNNING' | 'STATE_STOPPING' | 'STATE_STOPPED';
  host: string;
  createTime: string;
  updateTime: string;
  startTime: string;
  deleteTime: string;
  reconciling: boolean;
  env: Record<string, string>;
}

type WorkstationState = Workstation['state'];

export interface NormalizedCluster {
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

export interface NormalizedConfig {
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

export interface NormalizedWorkstation {
  id: string;
  name: string;
  displayName: string;
  configId: string;
  clusterId: string;
  state: WorkstationState;
  host: string;
  createTime: string;
  startTime: string;
  reconciling: boolean;
  env: Record<string, string>;
}

export interface CreateWorkstationRequest {
  clusterId: string;
  configId: string;
  workstationId: string;
  displayName: string;
  env?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface CreateConfigRequest {
  clusterId: string;
  configId: string;
  displayName: string;
  machineType?: string;
  bootDiskSizeGb?: number;
  idleTimeout?: string;
  runningTimeout?: string;
  containerImage?: string;
  containerEnv?: Record<string, string>;
  persistentDiskSizeGb?: number;
}

export interface CreateClusterRequest {
  clusterId: string;
  displayName: string;
  network?: string;
  subnetwork?: string;
}

function extractId(fullName: string): string {
  const parts = fullName.split('/');
  return parts[parts.length - 1] || fullName;
}

function extractParentIds(fullName: string): { clusterId: string; configId: string } {
  // Format: projects/{project}/locations/{location}/workstationClusters/{cluster}/workstationConfigs/{config}/workstations/{ws}
  const parts = fullName.split('/');
  const clusterIdx = parts.indexOf('workstationClusters');
  const configIdx = parts.indexOf('workstationConfigs');
  return {
    clusterId: clusterIdx >= 0 ? parts[clusterIdx + 1] : '',
    configId: configIdx >= 0 ? parts[configIdx + 1] : '',
  };
}

export default class CloudWorkstationsManager extends EventEmitter {
  private projectId: string;
  private region: string;
  private client: any = null;

  constructor(projectId: string, region = 'us-central1') {
    super();
    this.projectId = projectId;
    this.region = region;
  }

  private async getClient() {
    if (this.client) return this.client;

    if (!WorkstationsClient) {
      const mod = await import('@google-cloud/workstations');
      WorkstationsClient = mod.WorkstationsClient;
    }

    this.client = new WorkstationsClient({
      projectId: this.projectId,
    });
    return this.client;
  }

  private locationPath(): string {
    return `projects/${this.projectId}/locations/${this.region}`;
  }

  private clusterPath(clusterId: string): string {
    return `${this.locationPath()}/workstationClusters/${clusterId}`;
  }

  private configPath(clusterId: string, configId: string): string {
    return `${this.clusterPath(clusterId)}/workstationConfigs/${configId}`;
  }

  private workstationPath(clusterId: string, configId: string, workstationId: string): string {
    return `${this.configPath(clusterId, configId)}/workstations/${workstationId}`;
  }

  // ─── Clusters ───

  async listClusters(): Promise<NormalizedCluster[]> {
    const client = await this.getClient();
    const [clusters] = await client.listWorkstationClusters({
      parent: this.locationPath(),
    });

    return (clusters || []).map((c: any) => ({
      id: extractId(c.name),
      name: c.name,
      displayName: c.displayName || extractId(c.name),
      network: c.network || '',
      subnetwork: c.subnetwork || '',
      controlPlaneIp: c.controlPlaneIp || '',
      state: c.reconciling ? 'RECONCILING' : (c.degraded ? 'DEGRADED' : 'READY'),
      createTime: c.createTime?.seconds ? new Date(Number(c.createTime.seconds) * 1000).toISOString() : '',
      degraded: Boolean(c.degraded),
    }));
  }

  async createCluster(request: CreateClusterRequest): Promise<NormalizedCluster> {
    const client = await this.getClient();
    const [operation] = await client.createWorkstationCluster({
      parent: this.locationPath(),
      workstationClusterId: request.clusterId,
      workstationCluster: {
        displayName: request.displayName,
        ...(request.network ? { network: request.network } : {}),
        ...(request.subnetwork ? { subnetwork: request.subnetwork } : {}),
      },
    });

    this.emit('cluster:creating', { clusterId: request.clusterId });

    const [cluster] = await operation.promise();
    this.emit('cluster:created', { clusterId: request.clusterId });

    return {
      id: extractId(cluster.name),
      name: cluster.name,
      displayName: cluster.displayName || request.displayName,
      network: cluster.network || '',
      subnetwork: cluster.subnetwork || '',
      controlPlaneIp: cluster.controlPlaneIp || '',
      state: 'READY',
      createTime: new Date().toISOString(),
      degraded: false,
    };
  }

  async deleteCluster(clusterId: string): Promise<void> {
    const client = await this.getClient();
    const [operation] = await client.deleteWorkstationCluster({
      name: this.clusterPath(clusterId),
    });
    await operation.promise();
    this.emit('cluster:deleted', { clusterId });
  }

  // ─── Configs ───

  async listConfigs(clusterId: string): Promise<NormalizedConfig[]> {
    const client = await this.getClient();
    const [configs] = await client.listWorkstationConfigs({
      parent: this.clusterPath(clusterId),
    });

    return (configs || []).map((c: any) => ({
      id: extractId(c.name),
      name: c.name,
      displayName: c.displayName || extractId(c.name),
      clusterId,
      machineType: c.host?.gceInstance?.machineType || 'e2-standard-4',
      bootDiskSizeGb: c.host?.gceInstance?.bootDiskSizeGb || 50,
      idleTimeout: c.idleTimeout?.seconds ? `${c.idleTimeout.seconds}s` : '1200s',
      runningTimeout: c.runningTimeout?.seconds ? `${c.runningTimeout.seconds}s` : '43200s',
      containerImage: c.container?.image || null,
      state: c.reconciling ? 'RECONCILING' : (c.degraded ? 'DEGRADED' : 'READY'),
      createTime: c.createTime?.seconds ? new Date(Number(c.createTime.seconds) * 1000).toISOString() : '',
      degraded: Boolean(c.degraded),
    }));
  }

  async createConfig(request: CreateConfigRequest): Promise<NormalizedConfig> {
    const client = await this.getClient();

    const workstationConfig: any = {
      displayName: request.displayName,
      host: {
        gceInstance: {
          machineType: request.machineType || 'e2-standard-4',
          bootDiskSizeGb: request.bootDiskSizeGb || 50,
        },
      },
      idleTimeout: { seconds: parseInt(request.idleTimeout || '1200') },
      runningTimeout: { seconds: parseInt(request.runningTimeout || '43200') },
    };

    if (request.containerImage) {
      workstationConfig.container = {
        image: request.containerImage,
        ...(request.containerEnv ? { env: request.containerEnv } : {}),
      };
    }

    if (request.persistentDiskSizeGb) {
      workstationConfig.persistentDirectories = [
        {
          mountPath: '/home',
          gcePd: {
            sizeGb: request.persistentDiskSizeGb,
            fsType: 'ext4',
            reclaimPolicy: 'DELETE',
          },
        },
      ];
    }

    const [operation] = await client.createWorkstationConfig({
      parent: this.clusterPath(request.clusterId),
      workstationConfigId: request.configId,
      workstationConfig,
    });

    this.emit('config:creating', { clusterId: request.clusterId, configId: request.configId });
    const [config] = await operation.promise();
    this.emit('config:created', { clusterId: request.clusterId, configId: request.configId });

    return {
      id: extractId(config.name),
      name: config.name,
      displayName: config.displayName || request.displayName,
      clusterId: request.clusterId,
      machineType: request.machineType || 'e2-standard-4',
      bootDiskSizeGb: request.bootDiskSizeGb || 50,
      idleTimeout: request.idleTimeout || '1200s',
      runningTimeout: request.runningTimeout || '43200s',
      containerImage: request.containerImage || null,
      state: 'READY',
      createTime: new Date().toISOString(),
      degraded: false,
    };
  }

  async deleteConfig(clusterId: string, configId: string): Promise<void> {
    const client = await this.getClient();
    const [operation] = await client.deleteWorkstationConfig({
      name: this.configPath(clusterId, configId),
    });
    await operation.promise();
    this.emit('config:deleted', { clusterId, configId });
  }

  // ─── Workstations ───

  async listWorkstations(clusterId: string, configId: string): Promise<NormalizedWorkstation[]> {
    const client = await this.getClient();
    const [workstations] = await client.listWorkstations({
      parent: this.configPath(clusterId, configId),
    });

    return (workstations || []).map((ws: any) => {
      const ids = extractParentIds(ws.name);
      return {
        id: extractId(ws.name),
        name: ws.name,
        displayName: ws.displayName || extractId(ws.name),
        configId: ids.configId,
        clusterId: ids.clusterId,
        state: ws.state || 'STATE_UNSPECIFIED',
        host: ws.host || '',
        createTime: ws.createTime?.seconds ? new Date(Number(ws.createTime.seconds) * 1000).toISOString() : '',
        startTime: ws.startTime?.seconds ? new Date(Number(ws.startTime.seconds) * 1000).toISOString() : '',
        reconciling: Boolean(ws.reconciling),
        env: ws.env || {},
      };
    });
  }

  async listAllWorkstations(): Promise<NormalizedWorkstation[]> {
    const clusters = await this.listClusters();
    const allWorkstations: NormalizedWorkstation[] = [];

    for (const cluster of clusters) {
      const configs = await this.listConfigs(cluster.id);
      for (const config of configs) {
        const workstations = await this.listWorkstations(cluster.id, config.id);
        allWorkstations.push(...workstations);
      }
    }

    return allWorkstations;
  }

  async createWorkstation(request: CreateWorkstationRequest): Promise<NormalizedWorkstation> {
    const client = await this.getClient();

    const [operation] = await client.createWorkstation({
      parent: this.configPath(request.clusterId, request.configId),
      workstationId: request.workstationId,
      workstation: {
        displayName: request.displayName,
        ...(request.env ? { env: request.env } : {}),
        ...(request.labels ? { labels: request.labels } : {}),
      },
    });

    this.emit('workstation:creating', { workstationId: request.workstationId });
    const [workstation] = await operation.promise();
    this.emit('workstation:created', { workstationId: request.workstationId });

    return {
      id: extractId(workstation.name),
      name: workstation.name,
      displayName: workstation.displayName || request.displayName,
      configId: request.configId,
      clusterId: request.clusterId,
      state: workstation.state || 'STATE_STOPPED',
      host: workstation.host || '',
      createTime: new Date().toISOString(),
      startTime: '',
      reconciling: false,
      env: request.env || {},
    };
  }

  async startWorkstation(clusterId: string, configId: string, workstationId: string): Promise<NormalizedWorkstation> {
    const client = await this.getClient();

    const [operation] = await client.startWorkstation({
      name: this.workstationPath(clusterId, configId, workstationId),
    });

    this.emit('workstation:starting', { workstationId });
    const [workstation] = await operation.promise();
    this.emit('workstation:started', { workstationId });

    const ids = extractParentIds(workstation.name);
    return {
      id: extractId(workstation.name),
      name: workstation.name,
      displayName: workstation.displayName || workstationId,
      configId: ids.configId,
      clusterId: ids.clusterId,
      state: workstation.state || 'STATE_RUNNING',
      host: workstation.host || '',
      createTime: workstation.createTime?.seconds ? new Date(Number(workstation.createTime.seconds) * 1000).toISOString() : '',
      startTime: new Date().toISOString(),
      reconciling: false,
      env: workstation.env || {},
    };
  }

  async stopWorkstation(clusterId: string, configId: string, workstationId: string): Promise<NormalizedWorkstation> {
    const client = await this.getClient();

    const [operation] = await client.stopWorkstation({
      name: this.workstationPath(clusterId, configId, workstationId),
    });

    this.emit('workstation:stopping', { workstationId });
    const [workstation] = await operation.promise();
    this.emit('workstation:stopped', { workstationId });

    const ids = extractParentIds(workstation.name);
    return {
      id: extractId(workstation.name),
      name: workstation.name,
      displayName: workstation.displayName || workstationId,
      configId: ids.configId,
      clusterId: ids.clusterId,
      state: workstation.state || 'STATE_STOPPED',
      host: workstation.host || '',
      createTime: workstation.createTime?.seconds ? new Date(Number(workstation.createTime.seconds) * 1000).toISOString() : '',
      startTime: '',
      reconciling: false,
      env: workstation.env || {},
    };
  }

  async deleteWorkstation(clusterId: string, configId: string, workstationId: string): Promise<void> {
    const client = await this.getClient();
    const [operation] = await client.deleteWorkstation({
      name: this.workstationPath(clusterId, configId, workstationId),
    });
    await operation.promise();
    this.emit('workstation:deleted', { workstationId });
  }

  async generateAccessToken(clusterId: string, configId: string, workstationId: string): Promise<{ accessToken: string; expireTime: string }> {
    const client = await this.getClient();
    const [response] = await client.generateAccessToken({
      workstation: this.workstationPath(clusterId, configId, workstationId),
    });

    return {
      accessToken: response.accessToken || '',
      expireTime: response.expireTime?.seconds ? new Date(Number(response.expireTime.seconds) * 1000).toISOString() : '',
    };
  }
}
