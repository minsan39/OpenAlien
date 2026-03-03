import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { MCPClient } from './client';
import { MCPServerConfig, MCPConfig, DEFAULT_MCP_CONFIG } from './types';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'openalien-nodejs');
const MCP_CONFIG_FILE = path.join(CONFIG_DIR, 'mcp-config.json');

function getBuiltinFilesystemServer(): MCPServerConfig | null {
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'mcp-servers', 'filesystem', 'dist', 'index.js'),
    path.join(process.cwd(), 'mcp-servers', 'filesystem', 'dist', 'index.js'),
  ];

  for (const serverPath of possiblePaths) {
    if (fs.existsSync(serverPath)) {
      return {
        name: 'OpenAlien Filesystem',
        command: process.execPath,
        args: [serverPath, '--allow', os.homedir()],
      };
    }
  }
  return null;
}

export class MCPPool extends Map<string, MCPClient> {
  private config: MCPConfig;

  constructor() {
    super();
    this.config = this.loadConfig();
    this.ensureBuiltinServers();
  }

  private loadConfig(): MCPConfig {
    try {
      if (fs.existsSync(MCP_CONFIG_FILE)) {
        const content = fs.readFileSync(MCP_CONFIG_FILE, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to load MCP config:', error);
    }
    return { ...DEFAULT_MCP_CONFIG };
  }

  private ensureBuiltinServers(): void {
    const filesystemServer = getBuiltinFilesystemServer();
    if (filesystemServer && !this.config.mcpServers['filesystem']) {
      this.config.mcpServers['filesystem'] = filesystemServer;
      this.saveConfig();
    }
  }

  saveConfig(): void {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(MCP_CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save MCP config:', error);
    }
  }

  addServerConfig(serverId: string, config: MCPServerConfig): void {
    this.config.mcpServers[serverId] = config;
    this.saveConfig();
  }

  removeServerConfig(serverId: string): void {
    delete this.config.mcpServers[serverId];
    this.saveConfig();
  }

  getServerConfig(serverId: string): MCPServerConfig | undefined {
    return this.config.mcpServers[serverId];
  }

  getAllServerConfigs(): Record<string, MCPServerConfig> {
    return { ...this.config.mcpServers };
  }

  async getClient(serverId: string): Promise<MCPClient | undefined> {
    let client = this.get(serverId);
    
    if (!client) {
      const serverConfig = this.getServerConfig(serverId);
      if (!serverConfig) return undefined;
      
      client = new MCPClient(serverId, serverConfig);
      this.set(serverId, client);
    }

    if (!client.isConnected()) {
      await client.connect();
    }

    return client;
  }

  async connectAll(): Promise<Map<string, Error | null>> {
    const results = new Map<string, Error | null>();
    
    for (const [serverId, serverConfig] of Object.entries(this.config.mcpServers)) {
      if (serverConfig.disabled) {
        results.set(serverId, null);
        continue;
      }

      try {
        const client = new MCPClient(serverId, serverConfig);
        await client.connect();
        this.set(serverId, client);
        results.set(serverId, null);
      } catch (error: any) {
        results.set(serverId, error);
      }
    }

    return results;
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];
    
    for (const client of this.values()) {
      disconnectPromises.push(client.disconnect());
    }

    await Promise.all(disconnectPromises);
    this.clear();
  }

  getAllTools(): Array<{ serverId: string; tool: any }> {
    const tools: Array<{ serverId: string; tool: any }> = [];
    
    for (const [serverId, client] of this.entries()) {
      for (const tool of client.getTools()) {
        tools.push({ serverId, tool });
      }
    }

    return tools;
  }

  getStats(): {
    totalServers: number;
    connectedServers: number;
    totalTools: number;
    totalResources: number;
  } {
    let connectedServers = 0;
    let totalTools = 0;
    let totalResources = 0;

    for (const client of this.values()) {
      if (client.isConnected()) {
        connectedServers++;
        totalTools += client.getTools().length;
        totalResources += client.getResources().length;
      }
    }

    return {
      totalServers: this.size,
      connectedServers,
      totalTools,
      totalResources,
    };
  }
}
