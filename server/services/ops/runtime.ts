import type {
  OpsDeploymentActionRequest,
  OpsDeploymentJob,
  OpsDeploymentStatus,
  OpsOverview,
  OpsWorkspaceDirectory,
  OpsWorkspaceFile,
} from "./types";
import {
  getLocalDeploymentStatus,
  getLocalOverview,
  listLocalWorkspaceDirectory,
  readLocalWorkspaceFile,
  runLocalBuildAction,
  runLocalDeployAction,
  runLocalRestartAction,
  writeLocalWorkspaceFile,
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
    return requestOpsAgent<OpsWorkspaceDirectory>(
      `/workspace?path=${encodeURIComponent(relativePath)}`,
    );
  }

  return listLocalWorkspaceDirectory(relativePath);
}

export async function readWorkspaceFile(relativePath: string): Promise<OpsWorkspaceFile> {
  if (hasRemoteAgent()) {
    return requestOpsAgent<OpsWorkspaceFile>(
      `/workspace/file?path=${encodeURIComponent(relativePath)}`,
    );
  }

  return readLocalWorkspaceFile(relativePath);
}

export async function writeWorkspaceFile(relativePath: string, content: string): Promise<OpsWorkspaceFile> {
  if (hasRemoteAgent()) {
    return requestOpsAgent<OpsWorkspaceFile>("/workspace/file", {
      method: "PUT",
      body: JSON.stringify({ path: relativePath, content }),
    });
  }

  return writeLocalWorkspaceFile(relativePath, content);
}

export async function getDeploymentStatus(): Promise<OpsDeploymentStatus> {
  if (hasRemoteAgent()) {
    return requestOpsAgent<OpsDeploymentStatus>("/deploy/status");
  }

  return getLocalDeploymentStatus();
}

export async function runDeploymentBuild(
  request: OpsDeploymentActionRequest = {},
): Promise<OpsDeploymentJob> {
  if (hasRemoteAgent()) {
    return requestOpsAgent<OpsDeploymentJob>("/deploy/build", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  return runLocalBuildAction(request);
}

export async function runDeployment(
  request: OpsDeploymentActionRequest = {},
): Promise<OpsDeploymentJob> {
  if (hasRemoteAgent()) {
    return requestOpsAgent<OpsDeploymentJob>("/deploy/deploy", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  return runLocalDeployAction(request);
}

export async function restartDeploymentService(service: string): Promise<OpsDeploymentJob> {
  if (hasRemoteAgent()) {
    return requestOpsAgent<OpsDeploymentJob>("/deploy/restart", {
      method: "POST",
      body: JSON.stringify({ service }),
    });
  }

  return runLocalRestartAction(service);
}
