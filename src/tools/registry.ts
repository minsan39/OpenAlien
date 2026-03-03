import {
  UnifiedTool,
  ToolContext,
  ToolResult,
  ToolCall,
  ToolCallResult,
  ToolRegistryStats,
  formatToolsForPrompt,
  toOpenAIFormat,
} from './types';
import { Config } from '../types';
import { MemorySystem } from '../memory';

export class ToolRegistry {
  private tools: Map<string, UnifiedTool> = new Map();
  private toolsByName: Map<string, UnifiedTool> = new Map();
  private config: Config;
  private memory: MemorySystem;
  private sessionId: string;

  constructor(config: Config, memory: MemorySystem) {
    this.config = config;
    this.memory = memory;
    this.sessionId = `session-${Date.now()}`;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  register(tool: UnifiedTool): void {
    this.tools.set(tool.id, tool);
    this.toolsByName.set(tool.name, tool);
  }

  unregister(toolId: string): void {
    const tool = this.tools.get(toolId);
    if (tool) {
      this.tools.delete(toolId);
      this.toolsByName.delete(tool.name);
    }
  }

  get(toolId: string): UnifiedTool | undefined {
    return this.tools.get(toolId);
  }

  getByName(name: string): UnifiedTool | undefined {
    return this.toolsByName.get(name);
  }

  getAll(): UnifiedTool[] {
    return Array.from(this.tools.values());
  }

  getBySource(source: UnifiedTool['source']): UnifiedTool[] {
    return this.getAll().filter(tool => tool.source === source);
  }

  getByCapability(capability: string): UnifiedTool[] {
    return this.getAll().filter(
      tool => tool.metadata?.capabilities?.includes(capability)
    );
  }

  search(query: string): UnifiedTool[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery) ||
      tool.metadata?.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  async execute(
    toolName: string,
    args: Record<string, any>,
    context?: Partial<ToolContext>
  ): Promise<ToolCallResult> {
    const tool = this.getByName(toolName);
    if (!tool) {
      return {
        success: false,
        error: `工具未找到: ${toolName}`,
        toolCall: { toolId: '', toolName, arguments: args },
        duration: 0,
      };
    }

    const fullContext: ToolContext = {
      memory: this.memory,
      config: this.config,
      sessionId: this.sessionId,
      ...context,
    };

    const startTime = Date.now();
    try {
      const result = await tool.executor(args, fullContext);
      return {
        ...result,
        toolCall: { toolId: tool.id, toolName: tool.name, arguments: args },
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '执行失败',
        toolCall: { toolId: tool.id, toolName: tool.name, arguments: args },
        duration: Date.now() - startTime,
      };
    }
  }

  async executeMultiple(
    calls: ToolCall[],
    context?: Partial<ToolContext>
  ): Promise<ToolCallResult[]> {
    return Promise.all(
      calls.map(call => this.execute(call.toolName, call.arguments, context))
    );
  }

  formatForPrompt(): string {
    return formatToolsForPrompt(this.getAll());
  }

  toOpenAIFormat(): ReturnType<typeof toOpenAIFormat> {
    return toOpenAIFormat(this.getAll());
  }

  getStats(): ToolRegistryStats {
    const tools = this.getAll();
    const servers = new Set<string>();
    
    for (const tool of tools) {
      if (tool.source === 'mcp') {
        const serverId = tool.id.split(':')[1];
        if (serverId) servers.add(serverId);
      }
    }

    return {
      totalTools: tools.length,
      mcpTools: tools.filter(t => t.source === 'mcp').length,
      skillTools: tools.filter(t => t.source === 'skill').length,
      builtinTools: tools.filter(t => t.source === 'builtin').length,
      servers: Array.from(servers),
    };
  }

  clear(): void {
    this.tools.clear();
    this.toolsByName.clear();
  }
}
