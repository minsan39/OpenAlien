import { Config } from '../types';
import { MemorySystem } from '../memory';

export type ToolSource = 'mcp' | 'skill' | 'builtin';

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  enum?: string[];
  items?: JSONSchema;
  [key: string]: any;
}

export interface ToolMetadata {
  version?: string;
  author?: string;
  tags?: string[];
  capabilities?: string[];
  dependencies?: ToolDependency[];
}

export interface ToolDependency {
  type: 'mcp' | 'skill';
  name: string;
  required: boolean;
  autoInstall?: boolean;
}

export interface UnifiedTool {
  id: string;
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  source: ToolSource;
  executor: ToolExecutor;
  metadata?: ToolMetadata;
}

export type ToolExecutor = (
  args: Record<string, any>,
  context: ToolContext
) => Promise<ToolResult>;

export interface ToolContext {
  memory: MemorySystem;
  config: Config;
  sessionId: string;
  parentTaskId?: string;
  workingDirectory?: string;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ToolCall {
  toolId: string;
  toolName: string;
  arguments: Record<string, any>;
  callId?: string;
}

export interface ToolCallResult extends ToolResult {
  toolCall: ToolCall;
  duration: number;
}

export interface ToolRegistryStats {
  totalTools: number;
  mcpTools: number;
  skillTools: number;
  builtinTools: number;
  servers: string[];
}

export interface MCPToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  
  inputs?: JSONSchema;
  parameters?: JSONSchema;
  inputSchema?: JSONSchema;
  
  main?: string;
  handler?: string;
  
  triggers?: {
    commands?: string[];
    patterns?: string[];
    keywords?: string[];
  };
  
  dependencies?: {
    mcp?: Array<{
      name: string;
      package: string;
      required: boolean;
      autoInstall?: boolean;
    }>;
    skills?: string[];
  };
  
  metadata?: {
    author?: string;
    tags?: string[];
    capabilities?: string[];
  };
}

export interface OpenAIFunctionDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

export function toOpenAIFormat(tools: UnifiedTool[]): OpenAIFunctionDefinition[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export function formatToolsForPrompt(tools: UnifiedTool[]): string {
  if (tools.length === 0) return '';
  
  let output = '【可用工具列表】\n\n';
  
  for (const tool of tools) {
    output += `### ${tool.name}\n`;
    output += `${tool.description}\n`;
    output += `来源: ${tool.source}\n`;
    
    if (tool.inputSchema.properties) {
      output += `参数:\n`;
      for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
        const required = tool.inputSchema.required?.includes(key);
        output += `  - ${key}${required ? '(必需)' : '(可选)'}: ${(schema as JSONSchema).description || (schema as JSONSchema).type}\n`;
      }
    }
    output += '\n';
  }
  
  return output;
}
