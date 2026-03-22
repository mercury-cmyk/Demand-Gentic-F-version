export type OpsDeploymentTarget = "local" | "vm";
export type OpsRuntimeMode = "local" | "ops-agent";

export interface OpsWorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: string;
}

export interface OpsWorkspaceDirectory {
  currentPath: string;
  breadcrumbs: string[];
  entries: OpsWorkspaceEntry[];
}

export interface OpsWorkspaceFile {
  path: string;
  content: string;
  size: number;
  modifiedAt: string;
}

export interface OpsDeploymentService {
  serviceName: string;
  containerName: string | null;
  status: "running" | "stopped" | "missing" | "unknown";
  health: string | null;
  image: string | null;
  ports: string | null;
  source: "docker" | "compose";
}

export interface OpsDeploymentJob {
  id: string;
  action: "build" | "deploy" | "restart";
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  command: string;
  target?: string;
  outputSnippet?: string;
  exitCode?: number | null;
}

export interface OpsDeploymentStatus {
  target: OpsDeploymentTarget;
  mode: OpsRuntimeMode;
  composeFilePath: string;
  deployScriptPath: string;
  diagnostics: {
    dockerAvailable: boolean;
    composeAvailable: boolean;
    deployScriptAvailable: boolean;
    opsAgentReachable: boolean;
  };
  services: OpsDeploymentService[];
  jobs: OpsDeploymentJob[];
}

export interface OpsOverview {
  deploymentTarget: OpsDeploymentTarget;
  mode: OpsRuntimeMode;
  previewBaseUrl: string;
  workspaceRoot: string;
  currentBranch: string | null;
  currentCommit: string | null;
  canEditWorkspace: boolean;
  canManageDeployments: boolean;
  composeFilePath: string;
  opsAgentReachable: boolean;
}

export interface OpsDeploymentActionRequest {
  service?: string;
  rebuildMediaBridge?: boolean;
}

export interface OpsDeploymentLogs {
  service: string;
  lines: string[];
  count: number;
  timestamp: string;
  note?: string;
}