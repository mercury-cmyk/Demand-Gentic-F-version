import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import type {
  OpsDeploymentActionRequest,
  OpsDeploymentJob,
  OpsDeploymentService,
  OpsDeploymentStatus,
  OpsOverview,
  OpsWorkspaceDirectory,
  OpsWorkspaceEntry,
  OpsWorkspaceFile,
} from "./types";

const WORKSPACE_ROOT = process.cwd();
const COMPOSE_FILE_PATH = path.join(WORKSPACE_ROOT, "vm-deploy", "docker-compose.yml");
const DEPLOY_SCRIPT_PATH = path.join(WORKSPACE_ROOT, "vm-deploy", "deploy.sh");
const JOBS_FILE_PATH = path.join(WORKSPACE_ROOT, ".local", "ops-hub", "jobs.local.json");
const MAX_FILE_BYTES = 512 * 1024;
const INFERRED_MANAGED_RUNTIME = Boolean(
  process.env.K_SERVICE ||
  process.env.CLOUD_RUN_JOB ||
  process.env.FUNCTION_TARGET,
);
const PREFERRED_DEPLOY_TARGET = process.env.OPS_HUB_DEPLOY_TARGET === "vm"
  ? "vm"
  : INFERRED_MANAGED_RUNTIME
    ? "local"
    : fs.existsSync(COMPOSE_FILE_PATH)
      ? "vm"
      : "local";
const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "test-results",
  ".venv",
]);

interface ComposeServiceMeta {
  serviceName: string;
  containerName: string | null;
}

function normalizeRelativePath(input = ""): string {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized) return "";
  const candidate = path.posix.normalize(normalized);
  if (candidate === "." || candidate === "/") return "";
  if (candidate.startsWith("../") || candidate === "..") {
    throw new Error("Path escapes the workspace root");
  }
  return candidate;
}

function resolveWorkspacePath(relativePath = ""): string {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(WORKSPACE_ROOT, normalized);
  const relative = path.relative(WORKSPACE_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the workspace");
  }
  return resolved;
}

function trimSnippet(value: string, maxLength = 4000): string {
  if (value.length <= maxLength) return value;
  return value.slice(value.length - maxLength);
}

function execFileAsync(command: string, args: string[], cwd = WORKSPACE_ROOT): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function commandExists(command: string, args: string[] = ["--version"]): Promise<boolean> {
  try {
    await execFileAsync(command, args);
    return true;
  } catch {
    return false;
  }
}

async function ensureJobsFile(): Promise<void> {
  await fsp.mkdir(path.dirname(JOBS_FILE_PATH), { recursive: true });
  try {
    await fsp.access(JOBS_FILE_PATH);
  } catch {
    await fsp.writeFile(JOBS_FILE_PATH, "[]", "utf8");
  }
}

async function readJobs(): Promise<OpsDeploymentJob[]> {
  await ensureJobsFile();
  const raw = await fsp.readFile(JOBS_FILE_PATH, "utf8");
  const parsed = JSON.parse(raw) as OpsDeploymentJob[];
  return Array.isArray(parsed) ? parsed : [];
}

async function writeJobs(jobs: OpsDeploymentJob[]): Promise<void> {
  await ensureJobsFile();
  await fsp.writeFile(JOBS_FILE_PATH, JSON.stringify(jobs, null, 2), "utf8");
}

async function upsertJob(jobId: string, updater: (job: OpsDeploymentJob) => OpsDeploymentJob): Promise<void> {
  const jobs = await readJobs();
  const nextJobs = jobs.map((job) => (job.id === jobId ? updater(job) : job));
  await writeJobs(nextJobs);
}

async function appendJob(job: OpsDeploymentJob): Promise<void> {
  const jobs = await readJobs();
  jobs.unshift(job);
  await writeJobs(jobs.slice(0, 50));
}

function isTextBuffer(buffer: Buffer): boolean {
  return !buffer.includes(0);
}

function buildBreadcrumbs(currentPath: string): string[] {
  if (!currentPath) return [];
  return currentPath.split("/").filter(Boolean);
}

async function getGitValue(args: string[]): Promise<string | null> {
  try {
    const result = await execFileAsync("git", args);
    return result.trim() || null;
  } catch {
    return null;
  }
}

async function parseComposeMetadata(): Promise<ComposeServiceMeta[]> {
  try {
    const raw = await fsp.readFile(COMPOSE_FILE_PATH, "utf8");
    const services: ComposeServiceMeta[] = [];
    let inServices = false;
    let current: ComposeServiceMeta | null = null;

    for (const line of raw.split(/\r?\n/)) {
      if (!inServices) {
        if (/^services:\s*$/.test(line)) {
          inServices = true;
        }
        continue;
      }

      const serviceMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
      if (serviceMatch) {
        current = {
          serviceName: serviceMatch[1],
          containerName: null,
        };
        services.push(current);
        continue;
      }

      const containerMatch = line.match(/^    container_name:\s*(.+?)\s*$/);
      if (containerMatch && current) {
        current.containerName = containerMatch[1].trim();
        continue;
      }

      if (/^[A-Za-z0-9_-]+:\s*$/.test(line) || /^volumes:\s*$/.test(line)) {
        break;
      }
    }

    return services;
  } catch {
    return [];
  }
}

async function getDockerRows(): Promise<Array<Record<string, string>>> {
  if (!(await commandExists("docker"))) {
    return [];
  }

  try {
    const stdout = await execFileAsync("docker", [
      "ps",
      "-a",
      "--format",
      "{{json .}}",
    ]);
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, string>);
  } catch {
    return [];
  }
}

function deriveServiceStatus(rawStatus?: string): OpsDeploymentService["status"] {
  if (!rawStatus) return "missing";
  if (rawStatus.startsWith("Up")) return "running";
  if (rawStatus.startsWith("Exited") || rawStatus.startsWith("Created")) return "stopped";
  return "unknown";
}

function deriveHealth(rawStatus?: string): string | null {
  if (!rawStatus) return null;
  const healthMatch = rawStatus.match(/\((healthy|unhealthy|health: starting)\)/i);
  return healthMatch?.[1] ?? null;
}

async function startJob(
  action: OpsDeploymentJob["action"],
  command: string,
  args: string[],
  target?: string,
): Promise<OpsDeploymentJob> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const job: OpsDeploymentJob = {
    id,
    action,
    status: "running",
    createdAt,
    startedAt: createdAt,
    command: [command, ...args].join(" "),
    target,
  };

  await appendJob(job);

  let outputSnippet = "";

  try {
    const child = spawn(command, args, {
      cwd: WORKSPACE_ROOT,
      env: {
        ...process.env,
        APP_DIR: process.env.APP_DIR || WORKSPACE_ROOT,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer | string) => {
      outputSnippet = trimSnippet(outputSnippet + String(chunk));
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      outputSnippet = trimSnippet(outputSnippet + String(chunk));
    });

    child.on("close", async (code) => {
      await upsertJob(id, (current) => ({
        ...current,
        status: code === 0 ? "completed" : "failed",
        finishedAt: new Date().toISOString(),
        exitCode: code,
        outputSnippet,
      }));
    });

    child.on("error", async (error) => {
      await upsertJob(id, (current) => ({
        ...current,
        status: "failed",
        finishedAt: new Date().toISOString(),
        exitCode: null,
        outputSnippet: trimSnippet(`${outputSnippet}\n${error.message}`),
      }));
    });
  } catch (error) {
    await upsertJob(id, (current) => ({
      ...current,
      status: "failed",
      finishedAt: new Date().toISOString(),
      exitCode: null,
      outputSnippet: error instanceof Error ? error.message : String(error),
    }));
  }

  return job;
}

export async function getLocalOverview(): Promise<OpsOverview> {
  return {
    deploymentTarget: PREFERRED_DEPLOY_TARGET,
    mode: "local",
    previewBaseUrl:
      process.env.APP_BASE_URL ||
      process.env.BASE_URL ||
      `http://localhost:${process.env.PORT || "5000"}`,
    workspaceRoot: WORKSPACE_ROOT,
    currentBranch: await getGitValue(["branch", "--show-current"]),
    currentCommit: await getGitValue(["rev-parse", "--short", "HEAD"]),
    canEditWorkspace: true,
    canManageDeployments: await commandExists("docker"),
    composeFilePath: COMPOSE_FILE_PATH,
    opsAgentReachable: false,
  };
}

export async function listLocalWorkspaceDirectory(relativePath = ""): Promise<OpsWorkspaceDirectory> {
  const resolvedPath = resolveWorkspacePath(relativePath);
  const stats = await fsp.stat(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Error("Requested path is not a directory");
  }

  const dirEntries = await fsp.readdir(resolvedPath, { withFileTypes: true });
  const entries: OpsWorkspaceEntry[] = [];

  for (const entry of dirEntries) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }

    const childPath = path.join(resolvedPath, entry.name);
    const childStats = await fsp.stat(childPath);
    entries.push({
      name: entry.name,
      path: normalizeRelativePath(path.relative(WORKSPACE_ROOT, childPath)),
      type: entry.isDirectory() ? "directory" : "file",
      size: childStats.size,
      modifiedAt: childStats.mtime.toISOString(),
    });
  }

  entries.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    currentPath: normalizeRelativePath(relativePath),
    breadcrumbs: buildBreadcrumbs(normalizeRelativePath(relativePath)),
    entries,
  };
}

export async function readLocalWorkspaceFile(relativePath: string): Promise<OpsWorkspaceFile> {
  const resolvedPath = resolveWorkspacePath(relativePath);
  const stats = await fsp.stat(resolvedPath);
  if (!stats.isFile()) {
    throw new Error("Requested path is not a file");
  }
  if (stats.size > MAX_FILE_BYTES) {
    throw new Error(`File exceeds ${MAX_FILE_BYTES / 1024} KB limit`);
  }

  const buffer = await fsp.readFile(resolvedPath);
  if (!isTextBuffer(buffer)) {
    throw new Error("Binary files are not editable in Ops Hub");
  }

  return {
    path: normalizeRelativePath(relativePath),
    content: buffer.toString("utf8"),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

export async function writeLocalWorkspaceFile(relativePath: string, content: string): Promise<OpsWorkspaceFile> {
  const resolvedPath = resolveWorkspacePath(relativePath);
  await fsp.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fsp.writeFile(resolvedPath, content, "utf8");
  return readLocalWorkspaceFile(relativePath);
}

export async function getLocalDeploymentStatus(): Promise<OpsDeploymentStatus> {
  const composeServices = await parseComposeMetadata();
  const dockerRows = await getDockerRows();
  const dockerAvailable = await commandExists("docker");
  const composeAvailable = dockerAvailable
    ? await commandExists("docker", ["compose", "version"])
    : false;
  const containerMap = new Map(
    dockerRows.map((row) => [row.Names, row]),
  );

  const services = composeServices.map<OpsDeploymentService>((service) => {
    const containerName = service.containerName || null;
    const dockerRow = containerName ? containerMap.get(containerName) : undefined;
    return {
      serviceName: service.serviceName,
      containerName,
      status: deriveServiceStatus(dockerRow?.Status),
      health: deriveHealth(dockerRow?.Status),
      image: dockerRow?.Image || null,
      ports: dockerRow?.Ports || null,
      source: dockerRow ? "docker" : "compose",
    };
  });

  return {
    target: PREFERRED_DEPLOY_TARGET,
    mode: "local",
    composeFilePath: COMPOSE_FILE_PATH,
    deployScriptPath: DEPLOY_SCRIPT_PATH,
    diagnostics: {
      dockerAvailable,
      composeAvailable,
      deployScriptAvailable: fs.existsSync(DEPLOY_SCRIPT_PATH),
      opsAgentReachable: false,
    },
    services,
    jobs: await readJobs(),
  };
}

export async function runLocalBuildAction(
  request: OpsDeploymentActionRequest = {},
): Promise<OpsDeploymentJob> {
  const services = new Set<string>();
  if (request.service && request.service !== "all") {
    services.add(request.service);
  } else {
    services.add("api");
  }
  if (request.rebuildMediaBridge) {
    services.add("media-bridge");
  }

  return startJob(
    "build",
    "docker",
    ["compose", "-f", "vm-deploy/docker-compose.yml", "build", ...services],
    Array.from(services).join(", "),
  );
}

export async function runLocalDeployAction(
  request: OpsDeploymentActionRequest = {},
): Promise<OpsDeploymentJob> {
  const args = ["vm-deploy/deploy.sh"];
  if (request.rebuildMediaBridge) {
    args.push("--rebuild-media-bridge");
  }

  return startJob("deploy", "bash", args, "vm-deploy");
}

export async function runLocalRestartAction(service: string): Promise<OpsDeploymentJob> {
  return startJob(
    "restart",
    "docker",
    ["compose", "-f", "vm-deploy/docker-compose.yml", "restart", service],
    service,
  );
}
