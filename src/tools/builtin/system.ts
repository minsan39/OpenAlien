import { UnifiedTool, ToolExecutor, ToolContext, ToolResult } from '../types';

const systemInfoExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const os = require('os');
  
  return {
    success: true,
    data: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024) + 'GB',
      homedir: os.homedir(),
      cwd: process.cwd(),
    },
  };
};

const currentTimeExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const now = new Date();
  const format = args.format || 'full';
  
  let result: string;
  switch (format) {
    case 'date':
      result = now.toLocaleDateString('zh-CN');
      break;
    case 'time':
      result = now.toLocaleTimeString('zh-CN');
      break;
    case 'iso':
      result = now.toISOString();
      break;
    default:
      result = now.toLocaleString('zh-CN');
  }

  return {
    success: true,
    data: {
      timestamp: now.getTime(),
      formatted: result,
      format,
    },
  };
};

const echoExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  return {
    success: true,
    data: {
      message: args.message || '',
      timestamp: Date.now(),
    },
  };
};

export const systemInfoTool: UnifiedTool = {
  id: 'builtin:system_info',
  name: 'system_info',
  description: '获取系统信息',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  source: 'builtin',
  executor: systemInfoExecutor,
  metadata: {
    tags: ['system', 'info'],
    capabilities: ['system:read'],
  },
};

export const currentTimeTool: UnifiedTool = {
  id: 'builtin:current_time',
  name: 'current_time',
  description: '获取当前时间',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['full', 'date', 'time', 'iso'],
        description: '时间格式',
      },
    },
  },
  source: 'builtin',
  executor: currentTimeExecutor,
  metadata: {
    tags: ['time', 'utility'],
    capabilities: ['utility:time'],
  },
};

export const echoTool: UnifiedTool = {
  id: 'builtin:echo',
  name: 'echo',
  description: '回显消息（用于测试）',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: '要回显的消息',
      },
    },
  },
  source: 'builtin',
  executor: echoExecutor,
  metadata: {
    tags: ['test', 'utility'],
    capabilities: ['utility:test'],
  },
};

export const systemTools: UnifiedTool[] = [
  systemInfoTool,
  currentTimeTool,
  echoTool,
];
