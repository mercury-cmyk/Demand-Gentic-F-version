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

    // Don't block — cluster provisioning takes 10-20 minutes
    operation.promise().then(() => {
      this.emit('cluster:created', { clusterId: request.clusterId });
    }).catch((err: any) => {
      this.emit('cluster:error', { clusterId: request.clusterId, error: err?.message });
    });

    return {
      id: request.clusterId,
      name: `${this.locationPath()}/workstationClusters/${request.clusterId}`,
      displayName: request.displayName,
      network: request.network || '',
      subnetwork: request.subnetwork || '',
      controlPlaneIp: '',
      state: 'RECONCILING',
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

    // Don't block — provisioning takes minutes. Fire-and-forget, emit when done.
    operation.promise().then(() => {
      this.emit('config:created', { clusterId: request.clusterId, configId: request.configId });
    }).catch((err: any) => {
      this.emit('config:error', { clusterId: request.clusterId, configId: request.configId, error: err?.message });
    });

    return {
      id: request.configId,
      name: `${this.clusterPath(request.clusterId)}/workstationConfigs/${request.configId}`,
      displayName: request.displayName,
      clusterId: request.clusterId,
      machineType: request.machineType || 'e2-standard-4',
      bootDiskSizeGb: request.bootDiskSizeGb || 50,
      idleTimeout: request.idleTimeout || '1200s',
      runningTimeout: request.runningTimeout || '43200s',
      containerImage: request.containerImage || null,
      state: 'RECONCILING',
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

    // Don't block — return immediately, let provisioning happen in background
    operation.promise().then(async () => {
      this.emit('workstation:created', { workstationId: request.workstationId });
      // Auto-grant IAM so the service account can generate access tokens
      try {
        await this.autoGrantWorkstationIAM(request.clusterId, request.configId, request.workstationId);
      } catch (iamErr: any) {
        console.error(`[Workstations] Failed to auto-grant IAM on ${request.workstationId}:`, iamErr?.message);
      }
    }).catch((err: any) => {
      this.emit('workstation:error', { workstationId: request.workstationId, error: err?.message });
    });

    return {
      id: request.workstationId,
      name: `${this.configPath(request.clusterId, request.configId)}/workstations/${request.workstationId}`,
      displayName: request.displayName,
      configId: request.configId,
      clusterId: request.clusterId,
      state: 'STATE_STOPPED',
      host: '',
      createTime: new Date().toISOString(),
      startTime: '',
      reconciling: true,
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

  /**
   * Execute a command on a running workstation.
   * Uses the workstation's access token + host URL to proxy via HTTP.
   * Falls back to gcloud ssh if available.
   */
  async execCommand(
    clusterId: string,
    configId: string,
    workstationId: string,
    command: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Get workstation host and access token
    const workstations = await this.listWorkstations(clusterId, configId);
    const ws = workstations.find(w => w.id === workstationId);
    if (!ws || !ws.host) {
      return { stdout: '', stderr: 'Workstation not found or has no host URL', exitCode: 1 };
    }
    if (ws.state !== 'STATE_RUNNING') {
      return { stdout: '', stderr: 'Workstation is not running', exitCode: 1 };
    }

    const tokenInfo = await this.generateAccessToken(clusterId, configId, workstationId);

    // Try HTTP proxy to workstation's Code Server API
    try {
      const https = await import('https');
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
        const postData = JSON.stringify({ command });
        const url = new URL(`https://${ws.host}`);

        const req = https.request({
          hostname: url.hostname,
          port: 443,
          path: '/api/exec',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenInfo.accessToken}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 30000,
        }, (res) => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve({
                stdout: parsed.stdout || parsed.output || data,
                stderr: parsed.stderr || '',
                exitCode: parsed.exitCode || parsed.code || 0,
              });
            } catch {
              // If the response isn't JSON, treat the whole body as stdout
              resolve({ stdout: data, stderr: '', exitCode: res.statusCode === 200 ? 0 : 1 });
            }
          });
        });

        req.on('error', (err: Error) => reject(err));
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        req.write(postData);
        req.end();
      });

      return result;
    } catch (httpError: any) {
      // HTTP proxy failed — try gcloud ssh as fallback
      try {
        const { exec } = await import('child_process');
        return await new Promise((resolve) => {
          const escaped = command.replace(/'/g, "'\\''");
          const cmd = [
            'gcloud', 'workstations', 'ssh', workstationId,
            `--cluster=${clusterId}`,
            `--config=${configId}`,
            `--region=${this.region}`,
            `--project=${this.projectId}`,
            `--command='${escaped}'`,
          ].join(' ');

          exec(cmd, { timeout: 30000, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
            resolve({
              stdout: stdout || '',
              stderr: stderr || '',
              exitCode: error?.code || 0,
            });
          });
        });
      } catch {
        return {
          stdout: '',
          stderr: `Command execution not available. HTTP proxy error: ${httpError.message}. gcloud not found in container.`,
          exitCode: 1,
        };
      }
    }
  }

  /**
   * Get a short-lived auth URL for embedding the workstation IDE in an iframe.
   * Returns the workstation host URL with bearer token info.
   */
  async getIDEUrl(clusterId: string, configId: string, workstationId: string): Promise<{ url: string; host: string; accessToken: string; expireTime: string }> {
    const workstations = await this.listWorkstations(clusterId, configId);
    const ws = workstations.find(w => w.id === workstationId);
    if (!ws || !ws.host) {
      throw new Error('Workstation not found or has no host URL');
    }
    const tokenInfo = await this.generateAccessToken(clusterId, configId, workstationId);
    return {
      url: `https://${ws.host}`,
      host: ws.host,
      ...tokenInfo,
    };
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

  /**
   * Auto-grant IAM on a workstation so the service account can generate access tokens
   * and the configured user email can access the IDE.
   */
  private async autoGrantWorkstationIAM(clusterId: string, configId: string, workstationId: string): Promise<void> {
    const https = await import('https');
    const metadata = await import('http');

    // Get access token from metadata server
    const metaToken = await new Promise<string>((resolve, reject) => {
      metadata.get(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        { headers: { 'Metadata-Flavor': 'Google' } },
        (res) => {
          let data = '';
          res.on('data', (c: string) => data += c);
          res.on('end', () => {
            try { resolve(JSON.parse(data).access_token); }
            catch { reject(new Error('Failed to parse metadata token')); }
          });
        },
      ).on('error', reject);
    });

    // Get service account email
    const saEmail = await new Promise<string>((resolve, reject) => {
      metadata.get(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
        { headers: { 'Metadata-Flavor': 'Google' } },
        (res) => {
          let data = '';
          res.on('data', (c: string) => data += c);
          res.on('end', () => resolve(data.trim()));
        },
      ).on('error', reject);
    });

    const wsPath = `projects/${this.projectId}/locations/${this.region}/workstationClusters/${clusterId}/workstationConfigs/${configId}/workstations/${workstationId}`;
    const body = JSON.stringify({
      policy: {
        bindings: [
          { role: 'roles/workstations.admin', members: [`serviceAccount:${saEmail}`] },
          { role: 'roles/workstations.user', members: [`serviceAccount:${saEmail}`] },
        ],
      },
    });

    await new Promise<void>((resolve, reject) => {
      const req = https.request({
        hostname: 'workstations.googleapis.com',
        path: `/v1/${wsPath}:setIamPolicy`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', (c: string) => data += c);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[Workstations] Auto-granted IAM on ${workstationId}`);
            resolve();
          } else {
            reject(new Error(`IAM setPolicy failed (${res.statusCode}): ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
