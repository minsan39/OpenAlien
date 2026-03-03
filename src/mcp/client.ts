import { EventEmitter } from 'events';
import { StdioTransport } from './transport/stdio';
import {
  MCPServerConfig,
  MCPServerCapabilities,
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPConnectionState,
} from './types';

export class MCPClient extends EventEmitter {
  private serverId: string;
  private config: MCPServerConfig;
  private transport: StdioTransport | null = null;
  private capabilities: MCPServerCapabilities | null = null;
  private state: MCPConnectionState = { status: 'disconnected' };
  private tools: MCPTool[] = [];
  private resources: MCPResource[] = [];
  private prompts: MCPPrompt[] = [];
  private referenceCount: number = 0;
  private lastUsedAt: number = 0;
  private idleTimeout: NodeJS.Timeout | null = null;
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000;

  constructor(serverId: string, config: MCPServerConfig) {
    super();
    this.serverId = serverId;
    this.config = config;
  }

  getServerId(): string {
    return this.serverId;
  }

  getState(): MCPConnectionState {
    return { ...this.state };
  }

  getTools(): MCPTool[] {
    return this.tools.map(t => ({ ...t }));
  }

  getResources(): MCPResource[] {
    return [...this.resources];
  }

  getPrompts(): MCPPrompt[] {
    return [...this.prompts];
  }

  getReferenceCount(): number {
    return this.referenceCount;
  }

  incrementReference(): void {
    this.referenceCount++;
    this.lastUsedAt = Date.now();
    this.clearIdleTimeout();
  }

  decrementReference(): void {
    this.referenceCount = Math.max(0, this.referenceCount - 1);
    if (this.referenceCount === 0) {
      this.setIdleTimeout();
    }
  }

  private setIdleTimeout(): void {
    this.clearIdleTimeout();
    this.idleTimeout = setTimeout(() => {
      if (this.referenceCount === 0) {
        this.disconnect();
      }
    }, this.IDLE_TIMEOUT_MS);
  }

  private clearIdleTimeout(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  async connect(): Promise<void> {
    if (this.config.disabled) {
      throw new Error(`MCP server ${this.serverId} is disabled`);
    }

    if (this.transport?.isConnected()) {
      return;
    }

    this.state = { status: 'connecting' };
    this.emit('stateChange', this.state);

    try {
      this.transport = new StdioTransport({
        command: this.config.command,
        args: this.config.args,
        env: this.config.env,
        cwd: this.config.cwd,
      });

      this.transport.on('notification', (notification) => {
        this.handleNotification(notification);
      });

      this.transport.on('error', (error) => {
        this.state = { status: 'error', error: error.message };
        this.emit('stateChange', this.state);
        this.emit('error', error);
      });

      this.transport.on('close', (code) => {
        this.state = { status: 'disconnected' };
        this.emit('stateChange', this.state);
        this.emit('close', code);
      });

      await this.transport.connect();

      await this.initialize();
      await this.loadCapabilities();

      this.state = { status: 'connected', lastConnected: Date.now() };
      this.emit('stateChange', this.state);
    } catch (error: any) {
      this.state = { status: 'error', error: error.message };
      this.emit('stateChange', this.state);
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    if (!this.transport) throw new Error('Transport not connected');

    const result = await this.transport.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
      },
      clientInfo: {
        name: 'openalien',
        version: '0.1.0',
      },
    });

    this.capabilities = result.capabilities || {};

    await this.transport.sendRequest('notifications/initialized');
  }

  private async loadCapabilities(): Promise<void> {
    if (!this.transport) return;

    if (this.capabilities?.tools) {
      await this.loadTools();
    }

    if (this.capabilities?.resources) {
      await this.loadResources();
    }

    if (this.capabilities?.prompts) {
      await this.loadPrompts();
    }
  }

  private async loadTools(): Promise<void> {
    if (!this.transport) return;

    try {
      const result = await this.transport.sendRequest('tools/list');
      this.tools = (result.tools || []).map((t: any) => ({
        ...t,
        _serverId: this.serverId,
      }));
      this.emit('toolsChanged', this.tools);
    } catch (error) {
      this.tools = [];
    }
  }

  private async loadResources(): Promise<void> {
    if (!this.transport) return;

    try {
      const result = await this.transport.sendRequest('resources/list');
      this.resources = result.resources || [];
      this.emit('resourcesChanged', this.resources);
    } catch (error) {
      this.resources = [];
    }
  }

  private async loadPrompts(): Promise<void> {
    if (!this.transport) return;

    try {
      const result = await this.transport.sendRequest('prompts/list');
      this.prompts = result.prompts || [];
      this.emit('promptsChanged', this.prompts);
    } catch (error) {
      this.prompts = [];
    }
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.transport) {
      throw new Error('Transport not connected');
    }

    this.incrementReference();

    try {
      const result = await this.transport.sendRequest('tools/call', {
        name,
        arguments: args,
      });

      if (result.isError) {
        const errorContent = result.content
          ?.filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n') || 'Unknown error';
        throw new Error(errorContent);
      }

      return this.extractContent(result.content);
    } finally {
      this.decrementReference();
    }
  }

  private extractContent(content: any[]): any {
    if (!content || content.length === 0) return null;

    if (content.length === 1 && content[0].type === 'text') {
      return content[0].text;
    }

    return content.map((item) => {
      switch (item.type) {
        case 'text':
          return { type: 'text', text: item.text };
        case 'image':
          return { type: 'image', data: item.data, mimeType: item.mimeType };
        case 'resource':
          return { type: 'resource', resource: item.resource };
        default:
          return item;
      }
    });
  }

  async readResource(uri: string): Promise<any> {
    if (!this.transport) {
      throw new Error('Transport not connected');
    }

    this.incrementReference();

    try {
      const result = await this.transport.sendRequest('resources/read', { uri });
      return result.contents;
    } finally {
      this.decrementReference();
    }
  }

  async getPrompt(name: string, args?: Record<string, any>): Promise<any> {
    if (!this.transport) {
      throw new Error('Transport not connected');
    }

    this.incrementReference();

    try {
      const result = await this.transport.sendRequest('prompts/get', {
        name,
        arguments: args,
      });
      return result;
    } finally {
      this.decrementReference();
    }
  }

  private handleNotification(notification: any): void {
    switch (notification.method) {
      case 'notifications/tools/list_changed':
        this.loadTools();
        break;
      case 'notifications/resources/list_changed':
        this.loadResources();
        break;
      case 'notifications/prompts/list_changed':
        this.loadPrompts();
        break;
      case 'notifications/resources/updated':
        this.emit('resourceUpdated', notification.params?.uri);
        break;
    }
  }

  async disconnect(): Promise<void> {
    this.clearIdleTimeout();
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.state = { status: 'disconnected' };
    this.emit('stateChange', this.state);
  }

  isConnected(): boolean {
    return this.state.status === 'connected' && this.transport?.isConnected() === true;
  }
}
