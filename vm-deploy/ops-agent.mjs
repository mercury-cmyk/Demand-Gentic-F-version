import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { URL } from "node:url";

const WORKSPACE_ROOT = process.env.OPS_AGENT_WORKSPACE_ROOT || "/workspace";
const COMPOSE_FILE_PATH = path.join(WORKSPACE_ROOT, "vm-deploy", "docker-compose.yml");
const DEPLOY_SCRIPT_PATH = path.join(WORKSPACE_ROOT, "vm-deploy", "deploy.sh");
const JOBS_FILE_PATH = path.join(WORKSPACE_ROOT, ".local", "ops-hub", "jobs.agent.json");
const MAX_FILE_BYTES = 512 * 1024;
const HOST = process.env.OPS_AGENT_HOST || "127.0.0.1";
const PORT = Number(process.env.OPS_AGENT_PORT || 8383);
const TOKEN = (process.env.OPS_AGENT_TOKEN || "").trim();
const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "test-results",
  ".venv",
]);

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function trimSnippet(value, maxLength = 4000) {
  if (value.length <= maxLength) return value;
  return value.slice(value.length - maxLength);
}

function normalizeRelativePath(input = "") {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized) return "";
  const candidate = path.posix.normalize(normalized);
  if (candidate === "." || candidate === "/") return "";
  if (candidate === ".." || candidate.startsWith("../")) {
    throw new Error("Path escapes the workspace root");
  }
  return candidate;
}

function resolveWorkspacePath(relativePath = "") {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(WORKSPACE_ROOT, normalized);
  const relative = path.relative(WORKSPACE_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path is outside the workspace");
  }
  return resolved;
}

function buildBreadcrumbs(currentPath) {
  if (!currentPath) return [];
  return currentPath.split("/").filter(Boolean);
}

async function ensureJobsFile() {
  await fsp.mkdir(path.dirname(JOBS_FILE_PATH), { recursive: true });
  try {
    await fsp.access(JOBS_FILE_PATH);
  } catch {
    await fsp.writeFile(JOBS_FILE_PATH, "[]", "utf8");
  }
}

async function readJobs() {
  await ensureJobsFile();
  const raw = await fsp.readFile(JOBS_FILE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeJobs(jobs) {
  await ensureJobsFile();
  await fsp.writeFile(JOBS_FILE_PATH, JSON.stringify(jobs, null, 2), "utf8");
}

async function appendJob(job) {
  const jobs = await readJobs();
  jobs.unshift(job);
  await writeJobs(jobs.slice(0, 50));
}

async function upsertJob(jobId, updater) {
  const jobs = await readJobs();
  const nextJobs = jobs.map((job) => (job.id === jobId ? updater(job) : job));
  await writeJobs(nextJobs);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function execFileAsync(command, args, cwd = WORKSPACE_ROOT) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message || "").trim() || "Command failed"));
        return;
      }
      resolve(stdout);
    });
  });
}

async function commandExists(command, args = ["--version"]) {
  try {
    await execFileAsync(command, args);
    return true;
  } catch {
    return false;
  }
}

async function getGitValue(args) {
  try {
    const result = await execFileAsync("git", args);
    return result.trim() || null;
  } catch {
    return null;
  }
}

async function parseComposeMetadata() {
  try {
    const raw = await fsp.readFile(COMPOSE_FILE_PATH, "utf8");
    const services = [];
    let inServices = false;
    let current = null;

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

async function getDockerRows() {
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
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function deriveServiceStatus(rawStatus) {
  if (!rawStatus) return "missing";
  if (rawStatus.startsWith("Up")) return "running";
  if (rawStatus.startsWith("Exited") || rawStatus.startsWith("Created")) return "stopped";
  return "unknown";
}

function deriveHealth(rawStatus) {
  if (!rawStatus) return null;
  const match = rawStatus.match(/\((healthy|unhealthy|health: starting)\)/i);
  return match ? match[1] : null;
}

function isTextBuffer(buffer) {
  return !buffer.includes(0);
}

async function listWorkspaceDirectory(relativePath = "") {
  const resolvedPath = resolveWorkspacePath(relativePath);
  const stats = await fsp.stat(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Error("Requested path is not a directory");
  }

  const dirEntries = await fsp.readdir(resolvedPath, { withFileTypes: true });
  const entries = [];

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

async function readWorkspaceFile(relativePath) {
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

async function writeWorkspaceFile(relativePath, content) {
  const resolvedPath = resolveWorkspacePath(relativePath);
  await fsp.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fsp.writeFile(resolvedPath, content, "utf8");
  return readWorkspaceFile(relativePath);
}

async function getOverview() {
  return {
    deploymentTarget: "vm",
    mode: "ops-agent",
    previewBaseUrl:
      process.env.APP_BASE_URL ||
      process.env.BASE_URL ||
      "https://demandgentic.ai",
    workspaceRoot: WORKSPACE_ROOT,
    currentBranch: await getGitValue(["branch", "--show-current"]),
    currentCommit: await getGitValue(["rev-parse", "--short", "HEAD"]),
    canEditWorkspace: true,
    canManageDeployments: true,
    composeFilePath: COMPOSE_FILE_PATH,
    opsAgentReachable: true,
  };
}

async function getDeployStatus() {
  const composeServices = await parseComposeMetadata();
  const dockerRows = await getDockerRows();
  const dockerAvailable = await commandExists("docker");
  const composeAvailable = dockerAvailable
    ? await commandExists("docker", ["compose", "version"])
    : false;
  const containerMap = new Map(dockerRows.map((row) => [row.Names, row]));

  const services = composeServices.map((service) => {
    const row = service.containerName ? containerMap.get(service.containerName) : undefined;
    return {
      serviceName: service.serviceName,
      containerName: service.containerName || null,
      status: deriveServiceStatus(row && row.Status),
      health: deriveHealth(row && row.Status),
      image: (row && row.Image) || null,
      ports: (row && row.Ports) || null,
      source: row ? "docker" : "compose",
    };
  });

  return {
    target: "vm",
    mode: "ops-agent",
    composeFilePath: COMPOSE_FILE_PATH,
    deployScriptPath: DEPLOY_SCRIPT_PATH,
    diagnostics: {
      dockerAvailable,
      composeAvailable,
      deployScriptAvailable: fs.existsSync(DEPLOY_SCRIPT_PATH),
      opsAgentReachable: true,
    },
    services,
    jobs: await readJobs(),
  };
}

async function startJob(action, command, args, target) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const job = {
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

  const child = spawn(command, args, {
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      APP_DIR: WORKSPACE_ROOT,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    outputSnippet = trimSnippet(outputSnippet + String(chunk));
  });

  child.stderr.on("data", (chunk) => {
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

  return job;
}

async function buildVmAction(body) {
  const services = new Set();
  if (body && body.service && body.service !== "all") {
    services.add(body.service);
  } else {
    services.add("api");
  }
  if (body && body.rebuildMediaBridge) {
    services.add("media-bridge");
  }

  return startJob(
    "build",
    "docker",
    ["compose", "-f", "vm-deploy/docker-compose.yml", "build", ...services],
    Array.from(services).join(", "),
  );
}

async function deployVmAction(body) {
  const args = ["vm-deploy/deploy.sh"];
  if (body && body.rebuildMediaBridge) {
    args.push("--rebuild-media-bridge");
  }
  return startJob("deploy", "bash", args, "vm-deploy");
}

async function restartVmAction(body) {
  if (!body || !body.service) {
    throw new Error("service is required");
  }
  return startJob(
    "restart",
    "docker",
    ["compose", "-f", "vm-deploy/docker-compose.yml", "restart", body.service],
    body.service,
  );
}

function isAuthorized(req) {
  if (!TOKEN) return true;
  return req.headers["x-ops-agent-token"] === TOKEN;
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (parsedUrl.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        timestamp: new Date().toISOString(),
      });
    }

    if (!isAuthorized(req)) {
      return json(res, 401, { error: "Unauthorized" });
    }

    if (req.method === "GET" && parsedUrl.pathname === "/overview") {
      return json(res, 200, await getOverview());
    }

    if (req.method === "GET" && parsedUrl.pathname === "/workspace") {
      return json(
        res,
        200,
        await listWorkspaceDirectory(parsedUrl.searchParams.get("path") || ""),
      );
    }

    if (req.method === "GET" && parsedUrl.pathname === "/workspace/file") {
      const requestedPath = parsedUrl.searchParams.get("path");
      if (!requestedPath) {
        return json(res, 400, { error: "path is required" });
      }
      return json(res, 200, await readWorkspaceFile(requestedPath));
    }

    if (req.method === "PUT" && parsedUrl.pathname === "/workspace/file") {
      const body = await readJsonBody(req);
      if (!body.path || typeof body.content !== "string") {
        return json(res, 400, { error: "path and content are required" });
      }
      return json(res, 200, await writeWorkspaceFile(body.path, body.content));
    }

    if (req.method === "GET" && parsedUrl.pathname === "/deploy/status") {
      return json(res, 200, await getDeployStatus());
    }

    if (req.method === "POST" && parsedUrl.pathname === "/deploy/build") {
      return json(res, 202, await buildVmAction(await readJsonBody(req)));
    }

    if (req.method === "POST" && parsedUrl.pathname === "/deploy/deploy") {
      return json(res, 202, await deployVmAction(await readJsonBody(req)));
    }

    if (req.method === "POST" && parsedUrl.pathname === "/deploy/restart") {
      return json(res, 202, await restartVmAction(await readJsonBody(req)));
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("[OpsAgent] Request failed:", error);
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Internal error",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[OpsAgent] Listening on http://${HOST}:${PORT}`);
});
