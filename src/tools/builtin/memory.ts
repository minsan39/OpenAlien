import { UnifiedTool, ToolExecutor, ToolContext, ToolResult } from '../types';

const memorySearchExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const { query } = args;
  
  if (!query) {
    return { success: false, error: '缺少查询参数' };
  }

  try {
    const memories = context.memory.getLongTermMemories();
    const lowerQuery = query.toLowerCase();
    
    const results = memories.filter(m => 
      m.content.toLowerCase().includes(lowerQuery)
    );

    return {
      success: true,
      data: {
        query,
        count: results.length,
        results: results.slice(0, 10).map(m => ({
          type: m.type,
          content: m.content,
          createdAt: new Date(m.createdAt).toLocaleDateString('zh-CN'),
        })),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

const memoryAddExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const { type, content } = args;
  
  if (!content) {
    return { success: false, error: '缺少内容参数' };
  }

  try {
    context.memory.saveToLongTerm(type || 'important_info', content);
    return { success: true, data: { message: '记忆已添加', type, content } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

const memoryDeleteExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const { content } = args;
  
  if (!content) {
    return { success: false, error: '缺少内容参数' };
  }

  try {
    const deleted = context.memory.deleteMemoryByContent(content, 'user_request');
    return { 
      success: true, 
      data: { 
        message: deleted ? '记忆已删除' : '未找到匹配的记忆',
        deleted,
      } 
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

const memoryListExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const { type, limit = 20 } = args;

  try {
    let memories = context.memory.getLongTermMemories();
    
    if (type) {
      memories = memories.filter(m => m.type === type);
    }

    return {
      success: true,
      data: {
        count: memories.length,
        memories: memories.slice(0, limit).map(m => ({
          id: m.id,
          type: m.type,
          content: m.content,
          createdAt: new Date(m.createdAt).toLocaleDateString('zh-CN'),
        })),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const memorySearchTool: UnifiedTool = {
  id: 'builtin:memory_search',
  name: 'memory_search',
  description: '搜索长期记忆中的内容',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词',
      },
    },
    required: ['query'],
  },
  source: 'builtin',
  executor: memorySearchExecutor,
  metadata: {
    tags: ['memory', 'search'],
    capabilities: ['memory:read'],
  },
};

export const memoryAddTool: UnifiedTool = {
  id: 'builtin:memory_add',
  name: 'memory_add',
  description: '添加新的长期记忆',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['user_habit', 'important_info', 'preference', 'instruction'],
        description: '记忆类型',
      },
      content: {
        type: 'string',
        description: '记忆内容',
      },
    },
    required: ['content'],
  },
  source: 'builtin',
  executor: memoryAddExecutor,
  metadata: {
    tags: ['memory', 'add'],
    capabilities: ['memory:write'],
  },
};

export const memoryDeleteTool: UnifiedTool = {
  id: 'builtin:memory_delete',
  name: 'memory_delete',
  description: '删除长期记忆',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '要删除的记忆内容（模糊匹配）',
      },
    },
    required: ['content'],
  },
  source: 'builtin',
  executor: memoryDeleteExecutor,
  metadata: {
    tags: ['memory', 'delete'],
    capabilities: ['memory:write'],
  },
};

export const memoryListTool: UnifiedTool = {
  id: 'builtin:memory_list',
  name: 'memory_list',
  description: '列出长期记忆',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['user_habit', 'important_info', 'preference', 'instruction'],
        description: '按类型筛选',
      },
      limit: {
        type: 'number',
        description: '返回数量限制',
      },
    },
  },
  source: 'builtin',
  executor: memoryListExecutor,
  metadata: {
    tags: ['memory', 'list'],
    capabilities: ['memory:read'],
  },
};

export const memoryTools: UnifiedTool[] = [
  memorySearchTool,
  memoryAddTool,
  memoryDeleteTool,
  memoryListTool,
];
