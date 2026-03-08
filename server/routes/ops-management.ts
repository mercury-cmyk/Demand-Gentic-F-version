import { Router } from 'express';
import CloudBuildManager from '../services/gcp/cloud-build-manager.js';
import CloudRunDeploymentManager from '../services/gcp/cloud-run-deployment.js';
import DomainMapper from '../services/gcp/domain-mapper.js';
import CostTracker from '../services/gcp/cost-tracker.js';
import CloudWorkstationsManager from '../services/gcp/cloud-workstations.js';
import type { Request, Response } from 'express';
import { requireAuth, requireRole } from '../auth';
import {
  getDeploymentStatus,
  getOpsOverview,
  listWorkspaceDirectory,
  readWorkspaceFile,
  restartDeploymentService,
  runDeployment,
  runDeploymentBuild,
  writeWorkspaceFile,
} from '../services/ops/runtime';
import { OpsAgentError } from '../services/ops/runtime';
import { runOpsCodeAgent } from '../services/ops/code-agent';

const router = Router();
router.use(requireAuth);
router.use(requireRole('admin', 'campaign_manager', 'manager'));

// Initialize GCP managers
const projectId = process.env.GCP_PROJECT_ID || '';
const region = process.env.GCP_REGION || 'us-central1';

const buildManager = new CloudBuildManager(projectId);
const deploymentManager = new CloudRunDeploymentManager(projectId, region);
const domainMapper = new DomainMapper(projectId);
const costTracker = new CostTracker(projectId);
const workstationsManager = new CloudWorkstationsManager(projectId, region);

function handleOpsError(res: Response, error: unknown, fallbackMessage: string): Response {
  if (error instanceof OpsAgentError) {
    return res.status(error.status).json({
      success: false,
      error: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : fallbackMessage,
  });
}

// ===== OPS HUB OVERVIEW =====

router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const overview = await getOpsOverview();
    res.json({
      success: true,
      overview,
    });
  } catch (error) {
    handleOpsError(res, error, 'Failed to load Ops Hub overview');
  }
});

// ===== WORKSPACE FILES =====

router.get('/workspace', async (req: Request, res: Response) => {
  try {
    const directory = await listWorkspaceDirectory((req.query.path as string) || '');
    res.json({
      success: true,
      directory,
    });
  } catch (error) {
    handleOpsError(res, error, 'Failed to list workspace directory');
  }
});

router.get('/workspace/file', async (req: Request, res: Response) => {
  try {
    const requestedPath = req.query.path as string;
    if (!requestedPath) {
      return res.status(400).json({
        success: false,
        error: 'path is required',
      });
    }

    const file = await readWorkspaceFile(requestedPath);
    res.json({
      success: true,
      file,
    });
  } catch (error) {
    handleOpsError(res, error, 'Failed to read workspace file');
  }
});

router.put('/workspace/file', async (req: Request, res: Response) => {
  try {
    const { path: filePath, content } = req.body as {
      path?: string;
      content?: string;
    };

    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'path and content are required',
      });
    }

    const file = await writeWorkspaceFile(filePath, content);
    res.json({
      success: true,
      file,
    });
  } catch (error) {
    handleOpsError(res, error, 'Failed to save workspace file');
  }
});

// ===== VM DEPLOYMENT STATUS =====

router.get('/deployments/status', async (_req: Request, res: Response) => {
  try {
    const status = await getDeploymentStatus();
    res.json({
      success: true,
      status,
    });
  } catch (error) {
    handleOpsError(res, error, 'Failed to load deployment status');
  }
});

// ===== CLOUD BUILD ENDPOINTS =====

/**
 * Trigger a Cloud Build
 * POST /api/ops/deployments/build
 */
router.post('/deployments/build', async (req: Request, res: Response) => {
  try {
    const explicitTarget = req.body?.target as string | undefined;
    const overview = await getOpsOverview();
    if (explicitTarget !== 'cloud-run' && overview.deploymentTarget === 'vm') {
      const job = await runDeploymentBuild({
        service: req.body?.service,
        rebuildMediaBridge: req.body?.rebuildMediaBridge,
      });

      return res.json({
        success: true,
        job,
        message: 'VM build queued successfully',
      });
    }

    const { branch = 'main', projectName } = req.body;

    const buildConfig = {
      projectId,
      source: {
        repoSource: {
          branchName: branch,
          repoName: projectName || 'demandgentic-main',
        },
      },
      steps: [
        {
          name: 'gcr.io/cloud-builders/docker',
          args: ['build', '-t', `gcr.io/${projectId}/${projectName || 'demandgentic-api'}:latest`, '.'],
        },
        {
          name: 'gcr.io/cloud-builders/docker',
          args: ['push', `gcr.io/${projectId}/${projectName || 'demandgentic-api'}:latest`],
        },
      ],
      images: [`gcr.io/${projectId}/${projectName || 'demandgentic-api'}:latest`],
    };

    const buildId = await buildManager.triggerBuild(buildConfig);

    res.json({
      success: true,
      buildId,
      message: 'Build triggered successfully',
    });
  } catch (error) {
    return handleOpsError(res, error, 'Unknown error deploying service');
  }
});

/**
 * Get build status
 * GET /api/ops/deployments/build/:buildId
 */
router.get('/deployments/build/:buildId', async (req: Request, res: Response) => {
  try {
    const { buildId } = req.params;
    const status = await buildManager.getBuildStatus(buildId);

    res.json({
      success: true,
      build: status,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error getting build status';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * List recent builds
 * GET /api/ops/deployments/builds
 */
router.get('/deployments/builds', async (req: Request, res: Response) => {
  try {
    const explicitTarget = req.query.target as string | undefined;
    const overview = await getOpsOverview();
    if (explicitTarget !== 'cloud-run' && overview.deploymentTarget === 'vm') {
      const status = await getDeploymentStatus();
      return res.json({
        success: true,
        builds: status.jobs,
        count: status.jobs.length,
      });
    }

    const { limit = 10 } = req.query;
    const builds = await buildManager.listBuilds(parseInt(limit as string));

    res.json({
      success: true,
      builds,
      count: builds.length,
    });
  } catch (error) {
    handleOpsError(res, error, 'Unknown error listing builds');
  }
});

/**
 * Cancel a build
 * POST /api/ops/deployments/build/:buildId/cancel
 */
router.post('/deployments/build/:buildId/cancel', async (req: Request, res: Response) => {
  try {
    const { buildId } = req.params;
    await buildManager.cancelBuild(buildId);

    res.json({
      success: true,
      message: 'Build cancelled successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ===== CLOUD RUN DEPLOYMENT ENDPOINTS =====

/**
 * Deploy to Cloud Run or VM
 * POST /api/ops/deployments/deploy
 * Pass { target: 'cloud-run' } to force Cloud Run deployment even on a VM host
 */
router.post('/deployments/deploy', async (req: Request, res: Response) => {
  try {
    const explicitTarget = req.body?.target as string | undefined;
    const overview = await getOpsOverview();
    const useVM = explicitTarget !== 'cloud-run' && overview.deploymentTarget === 'vm';
    if (useVM) {
      const job = await runDeployment({
        rebuildMediaBridge: req.body?.rebuildMediaBridge,
      });

      return res.status(202).json({
        success: true,
        job,
        message: 'VM deploy queued successfully',
      });
    }

    const {
      serviceName,
      imageUrl,
      environment = {},
      minInstances = 0,
      maxInstances = 100,
      cpuLimit = '1',
      memoryLimit = '512Mi',
      port = 8080,
      vpcConnector,
      region = process.env.GCP_REGION || 'us-central1',
      deploymentEnv = 'prod',
    } = req.body;

    if (!serviceName || !imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'serviceName and imageUrl are required',
      });
    }

    const deploymentResult = await deploymentManager.deploy({
      serviceName,
      imageUrl,
      environment,
      region,
      minInstances,
      maxInstances,
      cpuLimit,
      memoryLimit,
      port,
      vpcConnector,
    });

    res.json({
      success: true,
      url: deploymentResult,
      message: `Deployment to ${deploymentEnv} completed`,
    });
  } catch (error) {
    handleOpsError(res, error, 'Unknown error');
  }
});

/**
 * Get service status
 * GET /api/ops/deployments/service/:serviceName?target=cloud-run
 */
router.get('/deployments/service/:serviceName', async (req: Request, res: Response) => {
  try {
    const explicitTarget = req.query.target as string | undefined;
    const overview = await getOpsOverview();
    const useVM = explicitTarget !== 'cloud-run' && overview.deploymentTarget === 'vm';
    if (useVM) {
      const status = await getDeploymentStatus();
      const service = status.services.find(
        (entry) => entry.serviceName === req.params.serviceName,
      );

      if (!service) {
        return res.status(404).json({
          success: false,
          error: `Service ${req.params.serviceName} not found`,
        });
      }

      return res.json({
        success: true,
        service,
      });
    }

    const { serviceName } = req.params;
    const status = await deploymentManager.getServiceStatus(serviceName);

    res.json({
      success: true,
      service: status,
    });
  } catch (error) {
    handleOpsError(res, error, 'Unknown error');
  }
});

/**
 * List service revisions
 * GET /api/ops/deployments/service/:serviceName/revisions
 */
router.get('/deployments/service/:serviceName/revisions', async (req: Request, res: Response) => {
  try {
    const { serviceName } = req.params;
    const revisions = await deploymentManager.listRevisions(serviceName);

    res.json({
      success: true,
      revisions,
      count: revisions.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Rollback to previous revision
 * POST /api/ops/deployments/service/:serviceName/rollback
 */
router.post('/deployments/service/:serviceName/rollback', async (req: Request, res: Response) => {
  try {
    const explicitTarget = req.body?.target as string | undefined;
    const overview = await getOpsOverview();
    if (explicitTarget !== 'cloud-run' && overview.deploymentTarget === 'vm') {
      return res.status(400).json({
        success: false,
        error: 'Rollback is not automated for VM deployments. Use the host deployment history or git checkout on the VM.',
      });
    }

    const { serviceName } = req.params;
    const { revisionName } = req.body;

    if (!revisionName) {
      return res.status(400).json({
        success: false,
        error: 'revisionName is required',
      });
    }

    await deploymentManager.rollback(serviceName, revisionName);

    res.json({
      success: true,
      message: `Rolled back ${serviceName} to ${revisionName}`,
    });
  } catch (error) {
    handleOpsError(res, error, 'Unknown error');
  }
});

/**
 * Update traffic split (blue-green deployment)
 * POST /api/ops/deployments/service/:serviceName/traffic
 */
router.post('/deployments/service/:serviceName/traffic', async (req: Request, res: Response) => {
  try {
    const explicitTarget = req.body?.target as string | undefined;
    const overview = await getOpsOverview();
    if (explicitTarget !== 'cloud-run' && overview.deploymentTarget === 'vm') {
      return res.status(400).json({
        success: false,
        error: 'Traffic splitting is only available for Cloud Run deployments.',
      });
    }

    const { serviceName } = req.params;
    const { revisions } = req.body;

    if (!revisions || !Array.isArray(revisions)) {
      return res.status(400).json({
        success: false,
        error: 'revisions array is required',
      });
    }

    await deploymentManager.updateTraffic(serviceName, revisions);

    res.json({
      success: true,
      message: 'Traffic updated successfully',
      revisions,
    });
  } catch (error) {
    handleOpsError(res, error, 'Unknown error');
  }
});

router.post('/deployments/restart', async (req: Request, res: Response) => {
  try {
    const { service } = req.body as { service?: string };
    if (!service) {
      return res.status(400).json({
        success: false,
        error: 'service is required',
      });
    }

    const job = await restartDeploymentService(service);
    res.status(202).json({
      success: true,
      job,
      message: `Restart queued for ${service}`,
    });
  } catch (error) {
    handleOpsError(res, error, 'Failed to restart service');
  }
});

// ===== CONTAINER LOGS ENDPOINT =====

/**
 * Fetch real-time logs from a docker container
 * GET /api/ops/logs/:service?tail=200&since=5m&grep=pattern
 */
router.get('/logs/:service', async (req: Request, res: Response) => {
  try {
    const { service } = req.params;
    const tail = parseInt(req.query.tail as string) || 200;
    const since = (req.query.since as string) || '30m';
    const grep = (req.query.grep as string) || '';
    const safeTail = Math.min(Math.max(tail, 10), 2000);

    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const args = [
      'compose', '-f', 'vm-deploy/docker-compose.yml',
      'logs', service,
      '--tail', String(safeTail),
      '--no-log-prefix',
      '--no-color',
    ];
    if (since) args.push('--since', since);

    const { stdout, stderr } = await execFileAsync('docker', args, {
      cwd: process.cwd(),
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    });

    let lines = (stdout || stderr || '')
      .split('\n')
      .filter((line: string) => line.trim());

    if (grep) {
      const pattern = new RegExp(grep, 'i');
      lines = lines.filter((line: string) => pattern.test(line));
    }

    res.json({
      success: true,
      service,
      lines,
      count: lines.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    // If docker isn't available, return empty
    if (error?.message?.includes('ENOENT') || error?.message?.includes('not found')) {
      return res.json({ success: true, service: req.params.service, lines: [], count: 0, note: 'Docker not available on this host' });
    }
    handleOpsError(res, error, 'Failed to fetch container logs');
  }
});

// ===== DOMAIN MANAGEMENT ENDPOINTS =====

/**
 * Map a domain to Cloud Run service
 * POST /api/ops/domains
 */
router.post('/domains', async (req: Request, res: Response) => {
  try {
    const { domain, cloudRunService, environment } = req.body;

    if (!domain || !cloudRunService || !environment) {
      return res.status(400).json({
        success: false,
        error: 'domain, cloudRunService, and environment are required',
      });
    }

    const mapping = await domainMapper.mapDomain({
      domain,
      cloudRunService,
      environment,
    });

    const dnsRecords = domainMapper.generateDNSRecords(domain, cloudRunService);

    res.json({
      success: true,
      mapping,
      dnsRecords,
      message: `Domain ${domain} mapped to ${cloudRunService}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * List all domains
 * GET /api/ops/domains
 */
router.get('/domains', async (req: Request, res: Response) => {
  try {
    const domains = domainMapper.listDomains();

    res.json({
      success: true,
      domains,
      count: domains.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get domain details
 * GET /api/ops/domains/:domain
 */
router.get('/domains/:domain', async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const domainData = domainMapper.getDomain(domain);

    if (!domainData) {
      return res.status(404).json({
        success: false,
        error: `Domain ${domain} not found`,
      });
    }

    res.json({
      success: true,
      domain: domainData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Check domain health
 * GET /api/ops/domains/:domain/health
 */
router.get('/domains/:domain/health', async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const health = await domainMapper.checkDomainHealth(domain);

    res.json({
      success: true,
      health,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Renew SSL certificate
 * POST /api/ops/domains/:domain/ssl/renew
 */
router.post('/domains/:domain/ssl/renew', async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    await domainMapper.renewSSLCertificate(domain);

    res.json({
      success: true,
      message: `SSL certificate renewal initiated for ${domain}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Remove domain mapping
 * DELETE /api/ops/domains/:domain
 */
router.delete('/domains/:domain', async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    await domainMapper.removeDomain(domain);

    res.json({
      success: true,
      message: `Domain mapping for ${domain} removed`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ===== COST ANALYTICS ENDPOINTS =====

/**
 * Get current month cost
 * GET /api/ops/costs/current
 */
router.get('/costs/current', async (req: Request, res: Response) => {
  try {
    const cost = await costTracker.getCurrentMonthCost();

    res.json({
      success: true,
      currentMonthCost: cost,
      currency: 'USD',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get cost breakdown
 * GET /api/ops/costs/breakdown
 */
router.get('/costs/breakdown', async (req: Request, res: Response) => {
  try {
    const breakdown = await costTracker.getCostBreakdown();

    res.json({
      success: true,
      breakdown,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get historical costs
 * GET /api/ops/costs/history
 */
router.get('/costs/history', async (req: Request, res: Response) => {
  try {
    const history = await costTracker.getHistoricalCosts();

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get agent costs
 * GET /api/ops/costs/agents
 */
router.get('/costs/agents', async (req: Request, res: Response) => {
  try {
    const agentCosts = await costTracker.getAgentCosts();

    res.json({
      success: true,
      agentCosts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get cost by project
 * GET /api/ops/costs/projects
 */
router.get('/costs/projects', async (req: Request, res: Response) => {
  try {
    const projectCosts = await costTracker.getCostByProject();

    res.json({
      success: true,
      projects: projectCosts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ===== AGENT ORCHESTRATOR ENDPOINTS =====

/**
 * Get orchestrator status and provider list
 * GET /api/ops/agents/status
 */
router.get('/agents/status', async (_req: Request, res: Response) => {
  try {
    const { getOrchestrator } = await import('../services/multi-provider-agent.js');
    const orchestrator = getOrchestrator();
    const status = orchestrator.getStatus();
    const providers = orchestrator.listProviders();

    res.json({
      success: true,
      status,
      providers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Test the agent orchestrator with a prompt
 * POST /api/ops/agents/test
 */
router.post('/agents/test', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      task = 'general',
      maxTokens,
      temperature,
      providerMode,
      preferredProvider,
      optimizationProfile,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    const { getOrchestrator } = await import('../services/multi-provider-agent.js');
    const orchestrator = getOrchestrator();
    const response = await orchestrator.execute({
      prompt,
      task,
      maxTokens,
      temperature,
      providerMode,
      preferredProvider,
      optimizationProfile,
    });

    res.json({
      success: true,
      response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post('/coding-agent', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body as { prompt?: string };

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required',
      });
    }

    const response = await runOpsCodeAgent({
      prompt: prompt.trim(),
      mode: req.body?.mode,
      selectedFilePath: req.body?.selectedFilePath,
      selectedFileContent: req.body?.selectedFileContent,
      applyChanges: Boolean(req.body?.applyChanges),
      providerMode: req.body?.providerMode,
      preferredProvider: req.body?.preferredProvider,
      optimizationProfile: req.body?.optimizationProfile,
    });

    res.json({
      success: true,
      response,
    });
  } catch (error) {
    handleOpsError(res, error, 'Failed to run coding agent');
  }
});

// ===== FILE MANAGER ENDPOINTS =====

/**
 * List files in GCS bucket
 * GET /api/ops/files?prefix=
 */
router.get('/files', async (req: Request, res: Response) => {
  try {
    const { Storage } = await import('@google-cloud/storage');
    const prefix = (req.query.prefix as string) || '';
    const bucketName = process.env.GCS_BUCKET || process.env.S3_BUCKET || 'demandgentic-ai-storage';

    const gcs = new Storage({
      projectId: process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
    });
    const bucket = gcs.bucket(bucketName);

    // Get bucket metadata
    let bucketMeta: any = {};
    try {
      const [metadata] = await bucket.getMetadata();
      bucketMeta = {
        name: metadata.name || bucketName,
        location: metadata.location || 'unknown',
        storageClass: metadata.storageClass || 'STANDARD',
      };
    } catch {
      bucketMeta = { name: bucketName, location: 'unknown', storageClass: 'STANDARD' };
    }

    // List files with prefix (acts as folder navigation via delimiter)
    const [allFiles] = await bucket.getFiles({ prefix, delimiter: '/' });
    
    // Get "folders" (common prefixes)
    const [, , apiResponse] = await bucket.getFiles({ prefix, delimiter: '/', autoPaginate: false });
    const prefixes: string[] = (apiResponse as any)?.prefixes || [];

    const folders: any[] = prefixes.map((p: string) => ({
      name: p,
      size: 0,
      contentType: '',
      updated: '',
      isFolder: true,
    }));

    const files = allFiles
      .filter(f => f.name !== prefix) // exclude the prefix itself
      .map(f => ({
        name: f.name,
        size: Number(f.metadata?.size || 0),
        contentType: f.metadata?.contentType || 'application/octet-stream',
        updated: f.metadata?.updated || '',
        isFolder: false,
      }));

    res.json({
      success: true,
      bucket: bucketMeta,
      files: [...folders, ...files],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list files',
    });
  }
});

/**
 * Get presigned download URL
 * GET /api/ops/files/download?key=
 */
router.get('/files/download', async (req: Request, res: Response) => {
  try {
    const key = req.query.key as string;
    if (!key) return res.status(400).json({ success: false, error: 'key is required' });

    const { getPresignedDownloadUrl } = await import('../lib/storage.js');
    const url = await getPresignedDownloadUrl(key);
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate download URL',
    });
  }
});

/**
 * Get presigned upload URL
 * POST /api/ops/files/upload-url
 */
router.post('/files/upload-url', async (req: Request, res: Response) => {
  try {
    const { key, contentType } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'key is required' });

    const { getPresignedUploadUrl } = await import('../lib/storage.js');
    const url = await getPresignedUploadUrl(key, contentType || 'application/octet-stream');
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate upload URL',
    });
  }
});

/**
 * Delete a file from GCS
 * DELETE /api/ops/files?key=
 */
router.delete('/files', async (req: Request, res: Response) => {
  try {
    const key = req.query.key as string;
    if (!key) return res.status(400).json({ success: false, error: 'key is required' });

    const { deleteFromS3 } = await import('../lib/storage.js');
    await deleteFromS3(key);
    res.json({ success: true, message: `Deleted ${key}` });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete file',
    });
  }
});

// ===== CLOUD WORKSTATIONS =====

/**
 * List all workstation clusters
 * GET /api/ops/workstations/clusters
 */
router.get('/workstations/clusters', async (_req: Request, res: Response) => {
  try {
    const clusters = await workstationsManager.listClusters();
    res.json({ success: true, clusters });
  } catch (error) {
    handleOpsError(res, error, 'Failed to list workstation clusters');
  }
});

/**
 * Create a workstation cluster
 * POST /api/ops/workstations/clusters
 */
router.post('/workstations/clusters', async (req: Request, res: Response) => {
  try {
    const { clusterId, displayName, network, subnetwork } = req.body;
    if (!clusterId || !displayName) {
      return res.status(400).json({ success: false, error: 'clusterId and displayName are required' });
    }
    const cluster = await workstationsManager.createCluster({ clusterId, displayName, network, subnetwork });
    res.json({ success: true, cluster });
  } catch (error) {
    handleOpsError(res, error, 'Failed to create workstation cluster');
  }
});

/**
 * Delete a workstation cluster
 * DELETE /api/ops/workstations/clusters/:clusterId
 */
router.delete('/workstations/clusters/:clusterId', async (req: Request, res: Response) => {
  try {
    await workstationsManager.deleteCluster(req.params.clusterId);
    res.json({ success: true, message: `Cluster ${req.params.clusterId} deleted` });
  } catch (error) {
    handleOpsError(res, error, 'Failed to delete workstation cluster');
  }
});

/**
 * List configs for a cluster
 * GET /api/ops/workstations/clusters/:clusterId/configs
 */
router.get('/workstations/clusters/:clusterId/configs', async (req: Request, res: Response) => {
  try {
    const configs = await workstationsManager.listConfigs(req.params.clusterId);
    res.json({ success: true, configs });
  } catch (error) {
    handleOpsError(res, error, 'Failed to list workstation configs');
  }
});

/**
 * Create a workstation config
 * POST /api/ops/workstations/clusters/:clusterId/configs
 */
router.post('/workstations/clusters/:clusterId/configs', async (req: Request, res: Response) => {
  try {
    const { configId, displayName, machineType, bootDiskSizeGb, idleTimeout, runningTimeout, containerImage, containerEnv, persistentDiskSizeGb } = req.body;
    if (!configId || !displayName) {
      return res.status(400).json({ success: false, error: 'configId and displayName are required' });
    }
    const config = await workstationsManager.createConfig({
      clusterId: req.params.clusterId,
      configId,
      displayName,
      machineType,
      bootDiskSizeGb,
      idleTimeout,
      runningTimeout,
      containerImage,
      containerEnv,
      persistentDiskSizeGb,
    });
    res.json({ success: true, config });
  } catch (error) {
    handleOpsError(res, error, 'Failed to create workstation config');
  }
});

/**
 * Delete a workstation config
 * DELETE /api/ops/workstations/clusters/:clusterId/configs/:configId
 */
router.delete('/workstations/clusters/:clusterId/configs/:configId', async (req: Request, res: Response) => {
  try {
    await workstationsManager.deleteConfig(req.params.clusterId, req.params.configId);
    res.json({ success: true, message: `Config ${req.params.configId} deleted` });
  } catch (error) {
    handleOpsError(res, error, 'Failed to delete workstation config');
  }
});

/**
 * List workstations for a config
 * GET /api/ops/workstations/clusters/:clusterId/configs/:configId/workstations
 */
router.get('/workstations/clusters/:clusterId/configs/:configId/workstations', async (req: Request, res: Response) => {
  try {
    const workstations = await workstationsManager.listWorkstations(req.params.clusterId, req.params.configId);
    res.json({ success: true, workstations });
  } catch (error) {
    handleOpsError(res, error, 'Failed to list workstations');
  }
});

/**
 * List ALL workstations across all clusters and configs
 * GET /api/ops/workstations/all
 */
router.get('/workstations/all', async (_req: Request, res: Response) => {
  try {
    const workstations = await workstationsManager.listAllWorkstations();
    res.json({ success: true, workstations });
  } catch (error) {
    handleOpsError(res, error, 'Failed to list all workstations');
  }
});

/**
 * Create a workstation
 * POST /api/ops/workstations/clusters/:clusterId/configs/:configId/workstations
 */
router.post('/workstations/clusters/:clusterId/configs/:configId/workstations', async (req: Request, res: Response) => {
  try {
    const { workstationId, displayName, env, labels } = req.body;
    if (!workstationId || !displayName) {
      return res.status(400).json({ success: false, error: 'workstationId and displayName are required' });
    }
    const workstation = await workstationsManager.createWorkstation({
      clusterId: req.params.clusterId,
      configId: req.params.configId,
      workstationId,
      displayName,
      env,
      labels,
    });
    res.json({ success: true, workstation });
  } catch (error) {
    handleOpsError(res, error, 'Failed to create workstation');
  }
});

/**
 * Start a workstation
 * POST /api/ops/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/start
 */
router.post('/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/start', async (req: Request, res: Response) => {
  try {
    const { clusterId, configId, workstationId } = req.params;
    const workstation = await workstationsManager.startWorkstation(clusterId, configId, workstationId);
    res.json({ success: true, workstation });
  } catch (error) {
    handleOpsError(res, error, 'Failed to start workstation');
  }
});

/**
 * Stop a workstation
 * POST /api/ops/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/stop
 */
router.post('/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/stop', async (req: Request, res: Response) => {
  try {
    const { clusterId, configId, workstationId } = req.params;
    const workstation = await workstationsManager.stopWorkstation(clusterId, configId, workstationId);
    res.json({ success: true, workstation });
  } catch (error) {
    handleOpsError(res, error, 'Failed to stop workstation');
  }
});

/**
 * Delete a workstation
 * DELETE /api/ops/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId
 */
router.delete('/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId', async (req: Request, res: Response) => {
  try {
    const { clusterId, configId, workstationId } = req.params;
    await workstationsManager.deleteWorkstation(clusterId, configId, workstationId);
    res.json({ success: true, message: `Workstation ${workstationId} deleted` });
  } catch (error) {
    handleOpsError(res, error, 'Failed to delete workstation');
  }
});

/**
 * Generate access token for a workstation (opens IDE)
 * POST /api/ops/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/access-token
 */
router.post('/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/access-token', async (req: Request, res: Response) => {
  try {
    const { clusterId, configId, workstationId } = req.params;
    const tokenInfo = await workstationsManager.generateAccessToken(clusterId, configId, workstationId);
    res.json({ success: true, ...tokenInfo });
  } catch (error) {
    handleOpsError(res, error, 'Failed to generate access token');
  }
});

/**
 * Execute command on a running workstation
 * POST /api/ops/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/exec
 */
router.post('/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/exec', async (req: Request, res: Response) => {
  try {
    const { clusterId, configId, workstationId } = req.params;
    const { command } = req.body;
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ success: false, error: 'command is required' });
    }
    const result = await workstationsManager.execCommand(clusterId, configId, workstationId, command);
    res.json({ success: true, ...result });
  } catch (error) {
    handleOpsError(res, error, 'Failed to execute command on workstation');
  }
});

/**
 * List files on a running workstation
 * GET /api/ops/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/files?path=/home/user
 */
router.get('/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/files', async (req: Request, res: Response) => {
  try {
    const { clusterId, configId, workstationId } = req.params;
    const dirPath = (req.query.path as string) || '/home/user';
    const escaped = dirPath.replace(/'/g, "'\\''");

    const result = await workstationsManager.execCommand(
      clusterId, configId, workstationId,
      `ls -la --color=never '${escaped}' 2>/dev/null && echo '---STAT---' && stat -c '%Y' '${escaped}' 2>/dev/null`,
    );

    const lines = result.stdout.split('\n').filter(Boolean);
    const entries: Array<{ name: string; path: string; type: 'file' | 'directory'; size: number; permissions: string }> = [];

    for (const line of lines) {
      if (line === '---STAT---' || line.startsWith('total ')) continue;
      // Parse ls -la output: permissions links owner group size month day time name
      const match = line.match(/^([drwxlst-]+)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+[\d:]+\s+(.+)$/);
      if (match) {
        const [, perms, size, name] = match;
        if (name === '.' || name === '..') continue;
        const isDir = perms.startsWith('d');
        const cleanPath = dirPath.endsWith('/') ? dirPath : dirPath + '/';
        entries.push({
          name,
          path: cleanPath + name,
          type: isDir ? 'directory' : 'file',
          size: parseInt(size) || 0,
          permissions: perms,
        });
      }
    }

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ success: true, entries, cwd: dirPath });
  } catch (error) {
    handleOpsError(res, error, 'Failed to list files on workstation');
  }
});

/**
 * Read file from a running workstation
 * GET /api/ops/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/file?path=/home/user/file.ts
 */
router.get('/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/file', async (req: Request, res: Response) => {
  try {
    const { clusterId, configId, workstationId } = req.params;
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ success: false, error: 'path query parameter is required' });

    const escaped = filePath.replace(/'/g, "'\\''");
    const result = await workstationsManager.execCommand(clusterId, configId, workstationId, `cat '${escaped}'`);

    if (result.exitCode !== 0) {
      return res.status(404).json({ success: false, error: result.stderr || 'File not found' });
    }

    res.json({ success: true, content: result.stdout, path: filePath });
  } catch (error) {
    handleOpsError(res, error, 'Failed to read file from workstation');
  }
});

/**
 * Write file to a running workstation
 * PUT /api/ops/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/file
 */
router.put('/workstations/clusters/:clusterId/configs/:configId/workstations/:workstationId/file', async (req: Request, res: Response) => {
  try {
    const { clusterId, configId, workstationId } = req.params;
    const { path: filePath, content } = req.body;
    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'path and content are required' });
    }

    const b64 = Buffer.from(content).toString('base64');
    const escaped = filePath.replace(/'/g, "'\\''");
    const result = await workstationsManager.execCommand(
      clusterId, configId, workstationId,
      `echo '${b64}' | base64 -d > '${escaped}'`,
    );

    if (result.exitCode !== 0) {
      return res.status(500).json({ success: false, error: result.stderr || 'Failed to write file' });
    }

    res.json({ success: true, path: filePath });
  } catch (error) {
    handleOpsError(res, error, 'Failed to write file to workstation');
  }
});

export default router;
