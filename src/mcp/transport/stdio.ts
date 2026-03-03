import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
} from '../types';

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export class StdioTransport extends EventEmitter {
  private process: ChildProcess | null = null;
  private buffer: string = '';
  private requestId = 0;
  private pendingRequests: Map<number | string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = new Map();
  private options: StdioTransportOptions;

  constructor(options: StdioTransportOptions) {
    super();
    this.options = options;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.options.command, this.options.args || [], {
          cwd: this.options.cwd,
          env: { ...process.env, ...this.options.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
          throw new Error('Failed to create stdio streams');
        }

        this.process.stdout.on('data', (data: Buffer) => {
          this.handleData(data.toString());
        });

        this.process.stderr.on('data', (data: Buffer) => {
          this.emit('stderr', data.toString());
        });

        this.process.on('error', (error: Error) => {
          this.emit('error', error);
        });

        this.process.on('close', (code: number) => {
          this.emit('close', code);
          this.process = null;
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleData(data: string): void {
    this.buffer += data;
    
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          this.emit('error', new Error(`Failed to parse message: ${line}`));
        }
      }
    }
  }

  private handleMessage(message: JSONRPCResponse | JSONRPCNotification): void {
    if ('id' in message) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else {
      this.emit('notification', message);
    }
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('Transport not connected'));
        return;
      }

      const id = ++this.requestId;
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify(request) + '\n';
      this.process.stdin.write(message, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    });
  }

  isConnected(): boolean {
    return this.process !== null && !this.process.killed;
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.pendingRequests.clear();
    this.buffer = '';
  }
}
