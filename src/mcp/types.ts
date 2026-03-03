import { MCPToolDefinition, JSONSchema } from '../tools/types';

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
}

export interface MCPClientCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
}

export interface MCPServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPTool extends MCPToolDefinition {
  _serverId: string;
}

export interface MCPConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  lastConnected?: number;
}

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export const DEFAULT_MCP_CONFIG: MCPConfig = {
  mcpServers: {},
};
