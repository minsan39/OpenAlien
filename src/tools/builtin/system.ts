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
  
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekday = weekdays[now.getDay()];
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();
  
  const period = hour < 6 ? '凌晨' : hour < 9 ? '早上' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 17 ? '下午' : hour < 19 ? '傍晚' : '晚上';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  
  const friendlyText = `今天是${year}年${month}月${day}日${weekday}，现在是${period}${hour12}点${minute}分`;
  
  let formatted: string;
  switch (format) {
    case 'date':
      formatted = `${year}年${month}月${day}日${weekday}`;
      break;
    case 'time':
      formatted = `${period}${hour12}点${minute}分${second}秒`;
      break;
    case 'iso':
      formatted = now.toISOString();
      break;
    default:
      formatted = `${year}年${month}月${day}日 ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
  }

  return {
    success: true,
    data: {
      timestamp: now.getTime(),
      formatted,
      friendly: friendlyText,
      details: {
        year,
        month,
        day,
        weekday,
        hour,
        minute,
        second,
        period,
      },
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
