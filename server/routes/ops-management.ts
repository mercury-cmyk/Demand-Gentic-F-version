import express from 'express';
import { Router } from 'express';
import CloudBuildManager from '../services/gcp/cloud-build-manager.js';
import CloudRunDeploymentManager from '../services/gcp/cloud-run-deployment.js';
import DomainMapper from '../services/gcp/domain-mapper.js';
import CostTracker from '../services/gcp/cost-tracker.js';
import type { Request, Response } from 'express';

const router = Router();

// Initialize GCP managers
const projectId = process.env.GCP_PROJECT_ID || '';
const region = process.env.GCP_REGION || 'us-central1';

const buildManager = new CloudBuildManager(projectId);
const deploymentManager = new CloudRunDeploymentManager(projectId, region);
const domainMapper = new DomainMapper(projectId);
const costTracker = new CostTracker(projectId);

// ===== CLOUD BUILD ENDPOINTS =====

/**
 * Trigger a Cloud Build
 * POST /api/ops/deployments/build
 */
router.post('/deployments/build', async (req: Request, res: Response) => {
  try {
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error deploying service';
    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
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
    const { limit = 10 } = req.query;
    const builds = await buildManager.listBuilds(parseInt(limit as string));

    res.json({
      success: true,
      builds,
      count: builds.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error listing builds';
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
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
 * Deploy to Cloud Run
 * POST /api/ops/deployments/deploy
 */
router.post('/deployments/deploy', async (req: Request, res: Response) => {
  try {
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
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get service status
 * GET /api/ops/deployments/service/:serviceName
 */
router.get('/deployments/service/:serviceName', async (req: Request, res: Response) => {
  try {
    const { serviceName } = req.params;
    const status = await deploymentManager.getServiceStatus(serviceName);

    res.json({
      success: true,
      service: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
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
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Update traffic split (blue-green deployment)
 * POST /api/ops/deployments/service/:serviceName/traffic
 */
router.post('/deployments/service/:serviceName/traffic', async (req: Request, res: Response) => {
  try {
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
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
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
    const { prompt, task = 'general', maxTokens, temperature } = req.body;

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

// ===== FILE MANAGER ENDPOINTS =====

/**
 * List files in GCS bucket
 * GET /api/ops/files?prefix=
 */
router.get('/files', async (req: Request, res: Response) => {
  try {
    const { Storage } = await import('@google-cloud/storage');
    const prefix = (req.query.prefix as string) || '';
    const bucketName = process.env.GCS_BUCKET || process.env.S3_BUCKET || 'demandgentic-storage';

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

export default router;
