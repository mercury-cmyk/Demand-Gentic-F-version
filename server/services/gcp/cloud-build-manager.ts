import { EventEmitter } from 'events';

interface BuildConfig {
  projectId: string;
  source: {
    repoSource?: {
      branchName: string;
      repoName: string;
    };
  };
  steps: Array<{
    name: string;
    args: string[];
    env?: string[];
  }>;
  images?: string[];
  timeout?: string;
  tags?: string[];
}

export class CloudBuildManager extends EventEmitter {
  private client: any | null = null;
  private clientInitPromise: Promise<void> | null = null;
  private projectId: string;

  constructor(projectId: string) {
    super();
    this.projectId = projectId;
  }

  /**
   * Lazily initialize Cloud Build SDK so server startup does not hard-fail
   * when optional GCP dependencies are not installed in local dev.
   */
  private async ensureClient() {
    if (this.client) return;
    if (this.clientInitPromise) {
      await this.clientInitPromise;
      return;
    }

    this.clientInitPromise = (async () => {
      try {
        const packageName: string = '@google-cloud/cloudbuild';
        const { CloudBuildClient } = await import(packageName);
        this.client = new CloudBuildClient();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Cloud Build SDK is unavailable. Install @google-cloud/cloudbuild and restart the server. Root cause: ${reason}`
        );
      }
    })();

    await this.clientInitPromise;
  }

  /**
   * Trigger a Cloud Build
   */
  async triggerBuild(config: BuildConfig): Promise<string> {
    try {
      await this.ensureClient();
      const [build] = await this.client.createBuild({
        projectId: this.projectId,
        build: {
          name: `${this.projectId}-build-${Date.now()}`,
          source: config.source,
          steps: config.steps as any,
          images: config.images,
          timeout: config.timeout || '3600s',
          tags: config.tags || [],
        },
      });

      const buildId = build.id;
      this.emit('build:started', { buildId, timestamp: new Date() });

      // Stream build status
      this.streamBuildStatus(buildId);

      return buildId;
    } catch (error) {
      this.emit('build:error', { error: (error instanceof Error ? error.message : String(error)) });
      throw error;
    }
  }

  /**
   * Get build status
   */
  async getBuildStatus(buildId: string) {
    try {
      await this.ensureClient();
      const [build] = await this.client.getBuild({
        projectId: this.projectId,
        id: buildId,
      });

      return {
        id: build.id,
        status: build.status,
        startTime: build.startTime,
        finishTime: build.finishTime,
        failureMessage: build.failureMessage,
        timing: build.timing,
        images: build.images,
        buildTriggerId: build.buildTriggerId,
      };
    } catch (error) {
      throw new Error(`Failed to get build status: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Stream build logs (mock implementation - real impl would use Cloud Logging)
   */
  private async streamBuildStatus(buildId: string) {
    const poll = async () => {
      try {
        const status = await this.getBuildStatus(buildId);

        this.emit('build:status', {
          buildId,
          status: status.status,
          timestamp: new Date(),
        });

        // Poll every 5 seconds until build completes
        if (
          status.status !== 'SUCCESS' &&
          status.status !== 'FAILURE' &&
          status.status !== 'TIMEOUT'
        ) {
          setTimeout(poll, 5000);
        } else {
          this.emit('build:complete', {
            buildId,
            status: status.status,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        this.emit('build:error', { error: (error instanceof Error ? error.message : String(error)) });
      }
    };

    poll();
  }

  /**
   * List recent builds
   */
  async listBuilds(limit = 10) {
    try {
      await this.ensureClient();
      const [builds] = await this.client.listBuilds({
        projectId: this.projectId,
        filter: `status != QUEUED AND projectId="${this.projectId}"`,
        pageSize: limit,
      });

      return builds.map((build: any) => ({
        id: build.id,
        status: build.status,
        startTime: build.startTime,
        finishTime: build.finishTime,
      }));
    } catch (error) {
      throw new Error(`Failed to list builds: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Cancel a build
   */
  async cancelBuild(buildId: string) {
    try {
      await this.ensureClient();
      await this.client.cancelBuild({
        projectId: this.projectId,
        id: buildId,
      });

      this.emit('build:cancelled', { buildId, timestamp: new Date() });
    } catch (error) {
      throw new Error(`Failed to cancel build: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }
}

export default CloudBuildManager;
