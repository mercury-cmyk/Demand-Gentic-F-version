import type {
  OpsDeploymentActionRequest,
  OpsDeploymentJob,
  OpsDeploymentLogs,
  OpsDeploymentStatus,
  OpsOverview,
  OpsWorkspaceDirectory,
  OpsWorkspaceFile,
} from "./types";
import {
  getLocalDeploymentStatus,
  getLocalDeploymentLogs,
  getLocalOverview,
  listLocalWorkspaceDirectory,
  readLocalWorkspaceFile,
  runLocalBuildAction,
  runLocalDeployAction,
  runLocalRestartAction,
  writeLocalWorkspaceFile,
  createLocalWorkspaceFolder,
  deleteLocalWorkspaceEntry,
  renameLocalWorkspaceEntry,
  writeMultipleLocalWorkspaceFiles,
} from "./local-runtime";

const OPS_AGENT_URL = (process.env.VM_OPS_AGENT_URL || "").trim().replace(/\/$/, "");
const OPS_AGENT_TOKEN = (process.env.OPS_AGENT_TOKEN || "").trim();

export class OpsAgentError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

function hasRemoteAgent(): boolean {
  return Boolean(OPS_AGENT_URL);
}

export function getOpsAgentRequestInfo(): {
  baseUrl: string | null;
  headers: Record<string, string>;
} {
  return {
    baseUrl: hasRemoteAgent() ? OPS_AGENT_URL : null,
    headers: OPS_AGENT_TOKEN ? { "x-ops-agent-token": OPS_AGENT_TOKEN } : {},
  };
}

async function requestOpsAgent<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${OPS_AGENT_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(OPS_AGENT_TOKEN ? { "x-ops-agent-token": OPS_AGENT_TOKEN } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new OpsAgentError(
      payload.error || `Ops agent request failed with HTTP ${response.status}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export async function getOpsOverview(): Promise<OpsOverview> {
  if (hasRemoteAgent()) {
    try {
      return await requestOpsAgent<OpsOverview>("/overview");
    } catch {
      const local = await getLocalOverview();
      return {
        ...local,
        mode: "ops-agent",
        canEditWorkspace: false,
        canManageDeployments: false,
        opsAgentReachable: false,
      };
    }
  }

  return getLocalOverview();
}

export async function listWorkspaceDirectory(relativePath = ""): Promise<OpsWorkspaceDirectory> {
  if (hasRemoteAgent()) {
    try {
      return await requestOpsAgent<OpsWorkspaceDirectory>(
        `/workspace?path=${encodeURIComponent(relativePath)}`,
      );
    } catch {
      return listLocalWorkspaceDirectory(relativePath);
    }
  }

  return listLocalWorkspaceDirectory(relativePath);
}

export async function readWorkspaceFile(relativePath: string): Promise<OpsWorkspaceFile> {
  if (hasRemoteAgent()) {
    try {
      return await requestOpsAgent<OpsWorkspaceFile>(
        `/workspace/file?path=${encodeURIComponent(relativePath)}`,
      );
    } catch {
      return readLocalWorkspaceFile(relativePath);
    }
  }

  return readLocalWorkspaceFile(relativePath);
}

export async function writeWorkspaceFile(relativePath: string, content: string): Promise<OpsWorkspaceFile> {
  if (hasRemoteAgent()) {
    try {
      return await requestOpsAgent<OpsWorkspaceFile>("/workspace/file", {
        method: "PUT",
        body: JSON.stringify({ path: relativePath, content }),
      });
    } catch {
      return writeLocalWorkspaceFile(relativePath, content);
    }
  }

  return writeLocalWorkspaceFile(relativePath, content);
}

export async function createWorkspaceFolder(relativePath: string): Promise<{ path: string; created: boolean }> {
  return createLocalWorkspaceFolder(relativePath);
}

export async function deleteWorkspaceEntry(relativePath: string): Promise<{ path: string; deleted: boolean }> {
  return deleteLocalWorkspaceEntry(relativePath);
}

export async function renameWorkspaceEntry(
  oldPath: string,
  newPath: string,
): Promise<{ oldPath: string; newPath: string; renamed: boolean }> {
  return renameLocalWorkspaceEntry(oldPath, newPath);
}

export async function writeMultipleWorkspaceFiles(
  files: Array<{ path: string; content: string }>,
): Promise<{ written: number; paths: string[] }> {
  return writeMultipleLocalWorkspaceFiles(files);
}

export async function getDeploymentStatus(): Promise<OpsDeploymentStatus> {
  if (hasRemoteAgent()) {
    try {
      return await requestOpsAgent<OpsDeploymentStatus>("/deploy/status");
    } catch {
      return getLocalDeploymentStatus();
    }
  }

  return getLocalDeploymentStatus();
}

export async function runDeploymentBuild(
  request: OpsDeploymentActionRequest = {},
): Promise<OpsDeploymentJob> {
  if (hasRemoteAgent()) {
    try {
      return await requestOpsAgent<OpsDeploymentJob>("/deploy/build", {
        method: "POST",
        body: JSON.stringify(request),
      });
    } catch {
      return runLocalBuildAction(request);
    }
  }

  return runLocalBuildAction(request);
}

export async function getDeploymentLogs(
  service: string,
  options: {
    tail?: number;
    since?: string;
    grep?: string;
  } = {},
): Promise<OpsDeploymentLogs> {
  if (hasRemoteAgent()) {
    try {
      const params = new URLSearchParams();
      if (typeof options.tail === "number") {
        params.set("tail", String(options.tail));
      }
      if (options.since) {
        params.set("since", options.since);
      }
      if (options.grep) {
        params.set("grep", options.grep);
      }

      const suffix = params.size > 0 ? `?${params.toString()}` : "";
      return await requestOpsAgent<OpsDeploymentLogs>(
        `/logs/${encodeURIComponent(service)}${suffix}`,
      );
    } catch {
      return getLocalDeploymentLogs(service, options);
    }
  }

  return getLocalDeploymentLogs(service, options);
}

export async function runDeployment(
  request: OpsDeploymentActionRequest = {},
): Promise<OpsDeploymentJob> {
  if (hasRemoteAgent()) {
    try {
      return await requestOpsAgent<OpsDeploymentJob>("/deploy/deploy", {
        method: "POST",
        body: JSON.stringify(request),
      });
    } catch {
      return runLocalDeployAction(request);
    }
  }

  return runLocalDeployAction(request);
}

export async function restartDeploymentService(service: string): Promise<OpsDeploymentJob> {
  if (hasRemoteAgent()) {
    try {
      return await requestOpsAgent<OpsDeploymentJob>("/deploy/restart", {
        method: "POST",
        body: JSON.stringify({ service }),
      });
    } catch {
      return runLocalRestartAction(service);
    }
  }

  return runLocalRestartAction(service);
}
