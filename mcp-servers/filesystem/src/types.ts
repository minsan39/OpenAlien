export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: number | string;
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

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolHandler {
  (args: Record<string, any>): Promise<any>;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPServerInfo {
  name: string;
  version: string;
}

export interface MCPServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
}
