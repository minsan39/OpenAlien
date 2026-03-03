import { UnifiedTool, ToolExecutor, ToolContext, ToolResult, MCPToolDefinition } from '../types';
import { MCPClient } from '../../mcp/client';

export class MCPAdapter {
  adapt(mcpTool: MCPToolDefinition, client: MCPClient, serverId: string): UnifiedTool {
    const executor: ToolExecutor = async (
      args: Record<string, any>,
      context: ToolContext
    ): Promise<ToolResult> => {
      try {
        const result = await client.callTool(mcpTool.name, args);
        return {
          success: true,
          data: result,
          metadata: {
            serverId,
            toolName: mcpTool.name,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'MCP tool execution failed',
          metadata: {
            serverId,
            toolName: mcpTool.name,
          },
        };
      }
    };

    return {
      id: `mcp:${serverId}:${mcpTool.name}`,
      name: mcpTool.name,
      description: mcpTool.description,
      inputSchema: mcpTool.inputSchema,
      outputSchema: mcpTool.outputSchema,
      source: 'mcp',
      executor,
      metadata: {
        tags: ['mcp', serverId],
        capabilities: this.inferCapabilities(mcpTool),
      },
    };
  }

  adaptAll(tools: MCPToolDefinition[], client: MCPClient, serverId: string): UnifiedTool[] {
    return tools.map(tool => this.adapt(tool, client, serverId));
  }

  private inferCapabilities(tool: MCPToolDefinition): string[] {
    const capabilities: string[] = [];
    const name = tool.name.toLowerCase();
    const desc = tool.description.toLowerCase();

    if (name.includes('file') || desc.includes('file')) {
      capabilities.push('file:read', 'file:write');
    }
    if (name.includes('read') || desc.includes('read')) {
      capabilities.push('file:read');
    }
    if (name.includes('write') || desc.includes('write')) {
      capabilities.push('file:write');
    }
    if (name.includes('search') || desc.includes('search')) {
      capabilities.push('search');
    }
    if (name.includes('web') || desc.includes('web') || desc.includes('http')) {
      capabilities.push('web:request');
    }
    if (name.includes('database') || name.includes('db') || desc.includes('database')) {
      capabilities.push('database:query');
    }
    if (name.includes('git') || desc.includes('git')) {
      capabilities.push('git');
    }

    return capabilities;
  }
}
