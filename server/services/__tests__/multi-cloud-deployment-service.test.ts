import { describe, expect, it } from "vitest";
import { multiCloudDeploymentService } from "../multi-cloud-deployment-service";
import type { MultiCloudDeploymentPlanRequest } from "@shared/multi-cloud-deployment";

function makeRequest(
  overrides: Partial<MultiCloudDeploymentPlanRequest> = {},
): MultiCloudDeploymentPlanRequest {
  return {
    appName: "DemandGentic API",
    containerImage: "ghcr.io/demandgentic/api:latest",
    environment: "production",
    workloadType: "api",
    monthlyRequests: 250000,
    averageRequestDurationMs: 250,
    monthlyTrafficGb: 30,
    peakConcurrentUsers: 20,
    requiredCpuCores: 1,
    requiredMemoryGb: 1,
    requiredStorageGb: 20,
    backgroundWorkerHours: 0,
    scheduledJobRunsPerMonth: 0,
    maxMonthlyBudgetUsd: 60,
    preferredRegion: "us-central1",
    opsTeamExperience: "low",
    costPreference: "lowest-cost",
    capabilities: {
      webSockets: false,
      rawTcpUdp: false,
      backgroundWorkers: false,
      cronJobs: false,
      managedDatabase: true,
      persistentDisk: false,
      customDomains: true,
      dockerCompose: false,
      multiRegion: false,
      privateNetworking: true,
      gpu: false,
    },
    ...overrides,
  };
}

describe("multi-cloud deployment service", () => {
  it("prefers Cloud Run for simple stateless APIs with low ops capacity", () => {
    const plan = multiCloudDeploymentService.planDeployment(makeRequest());

    expect(plan.selectedProviderId).toBe("google-cloud-run");
    expect(plan.providers[0]?.providerId).toBe("google-cloud-run");
  });

  it("falls back to self-hosted VM for docker-compose and raw network workloads", () => {
    const plan = multiCloudDeploymentService.planDeployment(makeRequest({
      appName: "DemandGentic SIP Gateway",
      workloadType: "realtime-voice",
      averageRequestDurationMs: 4000,
      monthlyTrafficGb: 300,
      peakConcurrentUsers: 30,
      requiredCpuCores: 2,
      requiredMemoryGb: 4,
      capabilities: {
        webSockets: true,
        rawTcpUdp: true,
        backgroundWorkers: false,
        cronJobs: false,
        managedDatabase: false,
        persistentDisk: false,
        customDomains: false,
        dockerCompose: true,
        multiRegion: false,
        privateNetworking: true,
        gpu: false,
      },
    }));

    expect(plan.selectedProviderId).toBe("self-hosted-vm");
    expect(plan.providers[0]?.providerId).toBe("self-hosted-vm");
    expect(plan.providers[0]?.blockers).toEqual([]);
  });

  it("keeps AWS Fargate as a blueprint option for multi-region networking-heavy apps", () => {
    const plan = multiCloudDeploymentService.planDeployment(makeRequest({
      appName: "DemandGentic Edge Worker",
      workloadType: "realtime-websocket",
      monthlyRequests: 2200000,
      averageRequestDurationMs: 1200,
      monthlyTrafficGb: 900,
      peakConcurrentUsers: 900,
      requiredCpuCores: 2,
      requiredMemoryGb: 4,
      backgroundWorkerHours: 320,
      maxMonthlyBudgetUsd: 600,
      opsTeamExperience: "medium",
      costPreference: "balanced",
      capabilities: {
        webSockets: true,
        rawTcpUdp: false,
        backgroundWorkers: true,
        cronJobs: true,
        managedDatabase: true,
        persistentDisk: false,
        customDomains: true,
        dockerCompose: false,
        multiRegion: true,
        privateNetworking: true,
        gpu: false,
      },
    }));

    const awsOption = plan.providers.find((provider) => provider.providerId === "aws-fargate");

    expect(awsOption).toBeTruthy();
    expect(awsOption?.automationLevel).toBe("blueprint");
    expect(awsOption?.capabilityCoveragePercent).toBeGreaterThan(70);
    expect(awsOption?.blueprint.filename).toContain(".fargate.json");
  });
});
