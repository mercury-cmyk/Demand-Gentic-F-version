import type { Server as HTTPServer } from 'http';
import type { Server as HTTPSServer } from 'https';
import { Server as SocketIOServer, type Namespace } from 'socket.io';
import CloudBuildManager from '../services/gcp/cloud-build-manager.js';
import type { Request as ExpressRequest } from 'express';

export interface OpsWebSocketServer {
  io: Namespace;
  attach: (server: HTTPServer | HTTPSServer) => void;
  broadcast: (event: string, data: any) => void;
}

export function setupOpsWebSocket(server: HTTPServer | HTTPSServer): OpsWebSocketServer {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
    },
  });
  const opsNamespace = io.of('/ops');

  // Initialize managers
  const buildManager = new CloudBuildManager(process.env.GCP_PROJECT_ID || '');

  // Listen to build events
  buildManager.on('build:started', (data) => {
    opsNamespace.emit('build:started', data);
  });

  buildManager.on('build:status', (data) => {
    opsNamespace.emit('build:status', data);
  });

  buildManager.on('build:complete', (data) => {
    opsNamespace.emit('build:complete', data);
  });

  buildManager.on('build:error', (data) => {
    opsNamespace.emit('build:error', data);
  });

  buildManager.on('build:cancelled', (data) => {
    opsNamespace.emit('build:cancelled', data);
  });

  // Socket connection handler
  opsNamespace.on('connection', (socket: any) => {
    console.log(`[OpsWS] Client connected: ${socket.id}`);

    // Subscribe to build logs
    socket.on('subscribe:builds', (data: any) => {
      const { buildId } = data;
      socket.join(`build:${buildId}`);
      console.log(`[OpsWS] ${socket.id} subscribed to build:${buildId}`);
    });

    // Subscribe to deployments
    socket.on('subscribe:deployments', (data: any) => {
      const { serviceName } = data;
      socket.join(`service:${serviceName}`);
      console.log(`[OpsWS] ${socket.id} subscribed to service:${serviceName}`);
    });

    // Subscribe to domains
    socket.on('subscribe:domains', (data: any) => {
      const { domain } = data;
      socket.join(`domain:${domain}`);
      console.log(`[OpsWS] ${socket.id} subscribed to domain:${domain}`);
    });

    // Subscribe to cost updates
    socket.on('subscribe:costs', () => {
      socket.join('costs');
      console.log(`[OpsWS] ${socket.id} subscribed to costs`);
    });

    // Unsubscribe handlers
    socket.on('unsubscribe:builds', (data: any) => {
      const { buildId } = data;
      socket.leave(`build:${buildId}`);
    });

    socket.on('unsubscribe:deployments', (data: any) => {
      const { serviceName } = data;
      socket.leave(`service:${serviceName}`);
    });

    socket.on('unsubscribe:domains', (data: any) => {
      const { domain } = data;
      socket.leave(`domain:${domain}`);
    });

    socket.on('unsubscribe:costs', () => {
      socket.leave('costs');
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`[OpsWS] Client disconnected: ${socket.id}`);
    });

    // Error handler
    socket.on('error', (error: any) => {
      console.error(`[OpsWS] Socket error: ${error?.message || 'Unknown error'}`);
    });
  });

  return {
    io: opsNamespace,
    attach: (server) => {
      io.attach(server);
    },
    broadcast: (event: string, data: any) => {
      opsNamespace.emit(event, data);
    },
  };
}

// Emit functions for services to broadcast events
export function emitBuildEvent(
  io: Namespace,
  buildId: string,
  event: string,
  data: any
) {
  io.to(`build:${buildId}`).emit(event, data);
  io.emit(event, { ...data, buildId }); // Also broadcast to all
}

export function emitDeploymentEvent(
  io: Namespace,
  serviceName: string,
  event: string,
  data: any
) {
  io.to(`service:${serviceName}`).emit(event, data);
  io.emit(event, { ...data, serviceName });
}

export function emitDomainEvent(
  io: Namespace,
  domain: string,
  event: string,
  data: any
) {
  io.to(`domain:${domain}`).emit(event, data);
  io.emit(event, { ...data, domain });
}

export function emitCostEvent(io: Namespace, event: string, data: any) {
  io.to('costs').emit(event, data);
  io.emit(event, data);
}

export default setupOpsWebSocket;
