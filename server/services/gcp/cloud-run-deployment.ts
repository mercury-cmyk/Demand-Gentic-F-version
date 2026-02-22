import { EventEmitter } from 'events';

interface CloudRunConfig {
  serviceName: string;
  region: string;
  imageUrl: string;
  environment: Record<string, string>;
  minInstances?: number;
  maxInstances?: number;
  cpuLimit?: string;
  memoryLimit?: string;
  port?: number;
  vpcConnector?: string;
}

interface DeploymentRevision {
  name: string;
  imageUrl: string;
  createTime: Date;
  status: string;
  trafficPercent?: number;
}

export class CloudRunDeploymentManager extends EventEmitter {
  private client: any | null = null;
  private clientInitPromise: Promise<void> | null = null;
  private projectId: string;
  private region: string;

  constructor(projectId: string, region = 'us-central1') {
    super();
    this.projectId = projectId;
    this.region = region;
  }

  private async ensureClient() {
    if (this.client) return;
    if (this.clientInitPromise) {
      await this.clientInitPromise;
      return;
    }

    this.clientInitPromise = (async () => {
      try {
        const packageName: string = '@google-cloud/run';
        const { ServicesClient } = await import(packageName);
        this.client = new ServicesClient({ apiEndpoint: `${this.region}-run.googleapis.com` });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Cloud Run SDK is unavailable. Install @google-cloud/run and restart the server. Root cause: ${reason}`
        );
      }
    })();

    await this.clientInitPromise;
  }

  /**
   * Deploy or update a Cloud Run service
   */
  async deploy(config: CloudRunConfig): Promise<string> {
    try {
      await this.ensureClient();
      this.emit('deploy:started', {
        service: config.serviceName,
        timestamp: new Date(),
      });

      const parent = `projects/${this.projectId}/locations/${this.region}`;
      const serviceName = `${parent}/services/${config.serviceName}`;

      // Create or update service
      const [service] = await this.client.createService({
        parent,
        service: {
          name: serviceName,
          template: {
            spec: {
              containers: [
                {
                  image: config.imageUrl,
                  env: Object.entries(config.environment).map(([key, value]) => ({
                    name: key,
                    value,
                  })),
                  resources: {
                    limits: {
                      cpu: config.cpuLimit || '1',
                      memory: config.memoryLimit || '512Mi',
                    },
                  },
                  ports: [
                    {
                      containerPort: config.port || 8080,
                    },
                  ],
                },
              ],
              serviceAccountEmail: `compute@${this.projectId}.iam.gserviceaccount.com`,
              vpcAccess: config.vpcConnector
                ? {
                    connector: config.vpcConnector,
                    egress: 'PRIVATE_RANGES_ONLY',
                  }
                : undefined,
            },
            scaling: {
              minInstanceCount: config.minInstances || 0,
              maxInstanceCount: config.maxInstances || 100,
            },
          },
          trafficTargets: [
            {
              percent: 100,
              latestRevision: true,
            },
          ],
        } as any,
        allowMissing: true,
      });

      this.emit('deploy:complete', {
        service: config.serviceName,
        url: service.uri,
        timestamp: new Date(),
      });

      return service.uri || serviceName;
    } catch (error) {
      this.emit('deploy:error', { error: (error instanceof Error ? error.message : String(error)) });
      throw error;
    }
  }

  /**
   * Get service status
   */
  async getServiceStatus(serviceName: string): Promise<any> {
    try {
      await this.ensureClient();
      const parent = `projects/${this.projectId}/locations/${this.region}`;
      const [service] = await this.client.getService({
        name: `${parent}/services/${serviceName}`,
      });

      return {
        name: service.name,
        status: service.status,
        uri: service.uri,
        creator: service.creator,
        lastModifier: service.lastModifier,
        createTime: service.createTime,
        updateTime: service.updateTime,
      };
    } catch (error) {
      throw new Error(`Failed to get service status: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * List service revisions
   */
  async listRevisions(serviceName: string): Promise<DeploymentRevision[]> {
    try {
      await this.ensureClient();
      const parent = `projects/${this.projectId}/locations/${this.region}`;
      const [service] = await this.client.getService({
        name: `${parent}/services/${serviceName}`,
      });

      return (service.trafficTargets || []).map((target: any) => ({
        name: target.revisionName || 'unknown',
        imageUrl: '',
        createTime: new Date(),
        status: 'READY',
        trafficPercent: target.percent,
      }));
    } catch (error) {
      throw new Error(`Failed to list revisions: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Update traffic split (blue-green deployment)
   */
  async updateTraffic(
    serviceName: string,
    revisions: Array<{ name: string; percent: number }>
  ) {
    try {
      await this.ensureClient();
      const parent = `projects/${this.projectId}/locations/${this.region}`;
      const [service] = await this.client.updateService({
        service: {
          name: `${parent}/services/${serviceName}`,
          trafficTargets: revisions.map((rev) => ({
            revisionName: rev.name,
            percent: rev.percent,
          })),
        } as any,
        updateMask: {
          paths: ['traffic_targets'],
        },
      });

      this.emit('traffic:updated', {
        service: serviceName,
        revisions,
        timestamp: new Date(),
      });

      return service;
    } catch (error) {
      throw new Error(`Failed to update traffic: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Rollback to previous revision
   */
  async rollback(serviceName: string, previousRevisionName: string) {
    try {
      this.emit('rollback:started', {
        service: serviceName,
        revision: previousRevisionName,
        timestamp: new Date(),
      });

      // List all revisions to find the target
      const revisions = await this.listRevisions(serviceName);

      // Route all traffic to the previous revision
      await this.updateTraffic(serviceName, [
        {
          name: previousRevisionName,
          percent: 100,
        },
      ]);

      this.emit('rollback:complete', {
        service: serviceName,
        revision: previousRevisionName,
        timestamp: new Date(),
      });
    } catch (error) {
      this.emit('rollback:error', { error: (error instanceof Error ? error.message : String(error)) });
      throw error;
    }
  }

  /**
   * Get service metrics
   */
  async getMetrics(serviceName: string): Promise<any> {
    try {
      const status = await this.getServiceStatus(serviceName);
      const revisions = await this.listRevisions(serviceName);

      return {
        serviceName,
        status: status.status,
        uri: status.uri,
        revisions,
        updateTime: status.updateTime,
      };
    } catch (error) {
      throw new Error(`Failed to get metrics: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }
}

export default CloudRunDeploymentManager;
