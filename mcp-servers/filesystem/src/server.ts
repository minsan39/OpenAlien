import * as readline from 'readline';
import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  MCPToolDefinition,
  MCPToolHandler,
  MCPResourceDefinition,
  MCPPromptDefinition,
  MCPServerInfo,
  MCPServerCapabilities,
} from './types';

export class MCPServer {
  private serverInfo: MCPServerInfo;
  private capabilities: MCPServerCapabilities;
  private tools: Map<string, { definition: MCPToolDefinition; handler: MCPToolHandler }> = new Map();
  private resources: Map<string, MCPResourceDefinition> = new Map();
  private prompts: Map<string, MCPPromptDefinition> = new Map();
  private allowedDirectories: string[] = [];
  private rl: readline.Interface | null = null;

  constructor(serverInfo: MCPServerInfo, capabilities?: MCPServerCapabilities) {
    this.serverInfo = serverInfo;
    this.capabilities = capabilities || {
      tools: { listChanged: false },
    };
  }

  setAllowedDirectories(dirs: string[]): void {
    this.allowedDirectories = dirs;
  }

  getAllowedDirectories(): string[] {
    return this.allowedDirectories;
  }

  registerTool(definition: MCPToolDefinition, handler: MCPToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  registerResource(definition: MCPResourceDefinition): void {
    this.resources.set(definition.uri, definition);
  }

  registerPrompt(definition: MCPPromptDefinition): void {
    this.prompts.set(definition.name, definition);
  }

  async start(): Promise<void> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.on('line', (line) => {
      this.handleLine(line);
    });

    this.rl.on('close', () => {
      process.exit(0);
    });

    process.stderr.write(`[${this.serverInfo.name}] MCP Server started\n`);
  }

  private async handleLine(line: string): Promise<void> {
    if (!line.trim()) return;

    try {
      const request: JSONRPCRequest = JSON.parse(line);
      await this.handleRequest(request);
    } catch (error: any) {
      this.sendError(null, -32700, `Parse error: ${error.message}`);
    }
  }

  private async handleRequest(request: JSONRPCRequest): Promise<void> {
    const { id, method, params } = request;

    try {
      let result: any;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params);
          break;

        case 'notifications/initialized':
          return;

        case 'tools/list':
          result = await this.handleToolsList();
          break;

        case 'tools/call':
          result = await this.handleToolsCall(params);
          break;

        case 'resources/list':
          result = await this.handleResourcesList();
          break;

        case 'resources/read':
          result = await this.handleResourcesRead(params);
          break;

        case 'prompts/list':
          result = await this.handlePromptsList();
          break;

        case 'prompts/get':
          result = await this.handlePromptsGet(params);
          break;

        case 'ping':
          result = {};
          break;

        default:
          this.sendError(id, -32601, `Method not found: ${method}`);
          return;
      }

      this.sendResult(id, result);
    } catch (error: any) {
      this.sendError(id, -32603, `Internal error: ${error.message}`);
    }
  }

  private async handleInitialize(params: any): Promise<any> {
    if (params?.capabilities?.roots?.listChanged) {
      if (params.roots && Array.isArray(params.roots)) {
        this.allowedDirectories = params.roots
          .filter((r: any) => r.uri && r.uri.startsWith('file://'))
          .map((r: any) => r.uri.replace('file://', ''));
      }
    }

    return {
      protocolVersion: '2024-11-05',
      capabilities: this.capabilities,
      serverInfo: this.serverInfo,
    };
  }

  private async handleToolsList(): Promise<any> {
    const tools = Array.from(this.tools.values()).map(({ definition }) => definition);
    return { tools };
  }

  private async handleToolsCall(params: any): Promise<any> {
    const { name, arguments: args } = params;

    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      const result = await tool.handler(args || {});
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleResourcesList(): Promise<any> {
    const resources = Array.from(this.resources.values());
    return { resources };
  }

  private async handleResourcesRead(params: any): Promise<any> {
    const { uri } = params;
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }
    return {
      contents: [
        {
          uri,
          mimeType: resource.mimeType || 'text/plain',
          text: 'Resource content placeholder',
        },
      ],
    };
  }

  private async handlePromptsList(): Promise<any> {
    const prompts = Array.from(this.prompts.values());
    return { prompts };
  }

  private async handlePromptsGet(params: any): Promise<any> {
    const { name, arguments: args } = params;
    const prompt = this.prompts.get(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Prompt: ${name}`,
          },
        },
      ],
    };
  }

  private sendResult(id: number | string | undefined, result: any): void {
    if (id === undefined) return;

    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };

    this.sendMessage(response);
  }

  private sendError(id: number | string | null | undefined, code: number, message: string): void {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: id ?? 0,
      error: { code, message },
    };

    this.sendMessage(response);
  }

  private sendNotification(method: string, params?: any): void {
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.sendMessage(notification);
  }

  private sendMessage(message: JSONRPCResponse | JSONRPCNotification): void {
    process.stdout.write(JSON.stringify(message) + '\n');
  }
}
