import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Zap, ArrowUp, Rewind, FileText, Plus } from 'lucide-react';

interface Deployment {
  id: string;
  service: string;
  environment: 'dev' | 'staging' | 'prod';
  version: string;
  status: 'RUNNING' | 'DEPLOYING' | 'FAILED';
  instances: number;
  lastUpdated: Date;
  imageUrl: string;
}

interface Build {
  id: string;
  service: string;
  status: 'SUCCESS' | 'IN_PROGRESS' | 'FAILED';
  createdAt: Date;
  duration?: number;
}

export default function DeploymentsTab() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEnvironment, setSelectedEnvironment] = useState('prod');
  const [showBuildDialog, setShowBuildDialog] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);
  const [buildOutput, setBuildOutput] = useState('');

  useEffect(() => {
    fetchDeployments();
    fetchBuilds();
  }, []);

  const fetchDeployments = async () => {
    try {
      const mockDeployments: Deployment[] = [
        {
          id: '1',
          service: 'demandgentic-api',
          environment: 'prod',
          version: 'v2.15.3',
          status: 'RUNNING',
          instances: 5,
          lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000),
          imageUrl: 'gcr.io/project-id/demandgentic-api:v2.15.3',
        },
        {
          id: '2',
          service: 'demandgentic-api',
          environment: 'staging',
          version: 'v2.15.1',
          status: 'RUNNING',
          instances: 2,
          lastUpdated: new Date(Date.now() - 5 * 60 * 60 * 1000),
          imageUrl: 'gcr.io/project-id/demandgentic-api:v2.15.1',
        },
        {
          id: '3',
          service: 'demandgentic-api',
          environment: 'dev',
          version: 'v2.15.0-beta',
          status: 'RUNNING',
          instances: 1,
          lastUpdated: new Date(Date.now() - 10 * 60 * 60 * 1000),
          imageUrl: 'gcr.io/project-id/demandgentic-api:v2.15.0-beta',
        },
      ];

      setDeployments(mockDeployments);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch deployments:', error);
      setIsLoading(false);
    }
  };

  const fetchBuilds = async () => {
    try {
      const mockBuilds: Build[] = [
        {
          id: '1',
          service: 'demandgentic-api',
          status: 'SUCCESS',
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          duration: 450,
        },
        {
          id: '2',
          service: 'demandgentic-api',
          status: 'SUCCESS',
          createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
          duration: 480,
        },
        {
          id: '3',
          service: 'demandgentic-api',
          status: 'SUCCESS',
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          duration: 420,
        },
      ];

      setBuilds(mockBuilds);
    } catch (error) {
      console.error('Failed to fetch builds:', error);
    }
  };

  const handleTriggerBuild = async () => {
    setBuildOutput('Starting build...\n');

    try {
      const response = await fetch('/api/ops/deployments/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'main' }),
      });

      if (response.ok) {
        const data = await response.json();
        setBuildOutput((prev) => prev + `Build triggered: ${data.buildId}\n`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await fetchBuilds();
        setShowBuildDialog(false);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setBuildOutput((prev) => prev + `Error: ${errorMessage}\n`);
    }
  };

  const handleRollback = async () => {
    if (!selectedDeployment) return;

    try {
      const response = await fetch(
        `/api/ops/deployments/service/${selectedDeployment.service}/rollback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revisionName: 'previous-version' }),
        }
      );

      if (response.ok) {
        await fetchDeployments();
        setShowRollbackDialog(false);
      }
    } catch (error) {
      console.error('Failed to rollback:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return 'bg-green-500/20 text-green-400';
      case 'DEPLOYING':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'FAILED':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const currentEnvDeployment = deployments.find((d) => d.environment === selectedEnvironment);

  return (
    <div className="space-y-6">
      {/* Current Deployment Status */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>Current Deployments</CardTitle>
          <CardDescription>Status of services across environments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {deployments.map((deployment) => (
              <Card
                key={deployment.id}
                className={`bg-slate-700 border-slate-600 cursor-pointer hover:border-slate-500 transition ${
                  selectedEnvironment === deployment.environment ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => setSelectedEnvironment(deployment.environment)}
              >
                <CardContent className="pt-4">
                  <h3 className="font-semibold text-slate-200 mb-2 capitalize">
                    {deployment.environment}
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-slate-400">Version</p>
                      <p className="text-sm font-mono text-slate-200">{deployment.version}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Status</p>
                      <Badge className={getStatusColor(deployment.status)}>
                        {deployment.status}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Instances</p>
                      <p className="text-sm text-slate-200">{deployment.instances}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Build & Deploy Controls */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>Build & Deploy</CardTitle>
          <CardDescription>Trigger builds and manage deployments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Dialog open={showBuildDialog} onOpenChange={setShowBuildDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2 w-full">
                  <Zap className="w-4 h-4" />
                  Trigger Build
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Trigger Cloud Build</DialogTitle>
                  <DialogDescription>Start a new build from main branch</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <Button onClick={handleTriggerBuild} className="w-full">
                    Start Build
                  </Button>
                  <div className="bg-slate-900 border border-slate-700 rounded p-4">
                    <p className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                      {buildOutput}
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
              <SelectTrigger className="bg-slate-700 border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                <SelectItem value="dev">Deploy to Dev</SelectItem>
                <SelectItem value="staging">Deploy to Staging</SelectItem>
                <SelectItem value="prod">Deploy to Production</SelectItem>
              </SelectContent>
            </Select>

            <AlertDialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setSelectedDeployment(currentEnvDeployment || null);
                  setShowRollbackDialog(true);
                }}
              >
                <Rewind className="w-4 h-4" />
                Rollback
              </Button>

              <AlertDialogContent className="bg-slate-800 border-slate-700">
                <AlertDialogTitle>Rollback Deployment</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to rollback {selectedDeployment?.service} in{' '}
                  {selectedDeployment?.environment} environment?
                </AlertDialogDescription>
                <div className="flex justify-end gap-2 mt-4">
                  <AlertDialogCancel className="bg-slate-700">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRollback} className="bg-orange-600">
                    Rollback
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Build History */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>Build History</CardTitle>
          <CardDescription>Recent builds and their status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-transparent">
                  <TableHead className="text-slate-300">Build ID</TableHead>
                  <TableHead className="text-slate-300">Service</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">Duration</TableHead>
                  <TableHead className="text-slate-300">Created</TableHead>
                  <TableHead className="text-slate-300">Logs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {builds.map((build) => (
                  <TableRow
                    key={build.id}
                    className="border-slate-700 hover:bg-slate-700/50 transition"
                  >
                    <TableCell className="font-mono text-sm text-slate-300">
                      {build.id}
                    </TableCell>
                    <TableCell className="text-slate-200">{build.service}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(build.status)}>{build.status}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {build.duration ? `${(build.duration / 60).toFixed(1)}m` : '-'}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {build.createdAt.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <FileText className="w-4 h-4" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
