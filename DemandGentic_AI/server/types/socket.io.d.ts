// Fallback ambient types for editor/project setups that fail to resolve
// socket.io package types through package exports.
declare module 'socket.io' {
  export interface Namespace {
    emit(event: string, ...args: any[]): void;
    on(event: string, listener: (...args: any[]) => void): this;
    to(room: string): Namespace;
  }

  export interface ServerOptions {
    cors?: {
      origin?: string | string[];
      methods?: string[];
    };
  }

  export class Server {
    constructor(server?: any, opts?: ServerOptions);
    of(name: string): Namespace;
    attach(server: any): void;
    emit(event: string, ...args: any[]): void;
  }
}