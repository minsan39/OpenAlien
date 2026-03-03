import * as fs from 'fs';
import * as path from 'path';
import { UnifiedTool, ToolExecutor, ToolContext, ToolResult } from '../types';

const readFileExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const { file_path, encoding = 'utf-8' } = args;
  
  if (!file_path) {
    return { success: false, error: '缺少文件路径参数' };
  }

  try {
    const absolutePath = path.resolve(context.workingDirectory || process.cwd(), file_path);
    
    if (!fs.existsSync(absolutePath)) {
      return { success: false, error: `文件不存在: ${file_path}` };
    }

    const content = fs.readFileSync(absolutePath, encoding as BufferEncoding);
    const stats = fs.statSync(absolutePath);
    
    return {
      success: true,
      data: {
        path: file_path,
        content,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

const writeFileExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const { file_path, content, encoding = 'utf-8', create_dirs = false } = args;
  
  if (!file_path) {
    return { success: false, error: '缺少文件路径参数' };
  }
  if (content === undefined) {
    return { success: false, error: '缺少内容参数' };
  }

  try {
    const absolutePath = path.resolve(context.workingDirectory || process.cwd(), file_path);
    
    if (create_dirs) {
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    fs.writeFileSync(absolutePath, content, encoding as BufferEncoding);
    
    return {
      success: true,
      data: {
        path: file_path,
        message: '文件写入成功',
        size: Buffer.byteLength(content, encoding as BufferEncoding),
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

const listDirExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const { dir_path, recursive = false } = args;
  
  if (!dir_path) {
    return { success: false, error: '缺少目录路径参数' };
  }

  try {
    const absolutePath = path.resolve(context.workingDirectory || process.cwd(), dir_path);
    
    if (!fs.existsSync(absolutePath)) {
      return { success: false, error: `目录不存在: ${dir_path}` };
    }

    if (!fs.statSync(absolutePath).isDirectory()) {
      return { success: false, error: `不是目录: ${dir_path}` };
    }

    const listDirRecursive = (dir: string, baseDir: string): any[] => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      const result: any[] = [];
      
      for (const item of items) {
        const relativePath = path.relative(baseDir, path.join(dir, item.name));
        const itemInfo: any = {
          name: item.name,
          path: relativePath,
          type: item.isDirectory() ? 'directory' : 'file',
        };
        
        if (item.isFile()) {
          try {
            const stats = fs.statSync(path.join(dir, item.name));
            itemInfo.size = stats.size;
          } catch (e) {}
        }
        
        result.push(itemInfo);
        
        if (recursive && item.isDirectory()) {
          const subItems = listDirRecursive(path.join(dir, item.name), baseDir);
          result.push(...subItems);
        }
      }
      
      return result;
    };

    const items = listDirRecursive(absolutePath, absolutePath);
    
    return {
      success: true,
      data: {
        path: dir_path,
        count: items.length,
        items: items.slice(0, 100),
        truncated: items.length > 100,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

const deleteFileExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const { file_path, recursive = false } = args;
  
  if (!file_path) {
    return { success: false, error: '缺少文件路径参数' };
  }

  try {
    const absolutePath = path.resolve(context.workingDirectory || process.cwd(), file_path);
    
    if (!fs.existsSync(absolutePath)) {
      return { success: false, error: `文件或目录不存在: ${file_path}` };
    }

    const stats = fs.statSync(absolutePath);
    
    if (stats.isDirectory()) {
      if (recursive) {
        fs.rmSync(absolutePath, { recursive: true });
      } else {
        fs.rmdirSync(absolutePath);
      }
    } else {
      fs.unlinkSync(absolutePath);
    }
    
    return {
      success: true,
      data: {
        path: file_path,
        message: '删除成功',
        type: stats.isDirectory() ? 'directory' : 'file',
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

const createDirExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const { dir_path } = args;
  
  if (!dir_path) {
    return { success: false, error: '缺少目录路径参数' };
  }

  try {
    const absolutePath = path.resolve(context.workingDirectory || process.cwd(), dir_path);
    
    fs.mkdirSync(absolutePath, { recursive: true });
    
    return {
      success: true,
      data: {
        path: dir_path,
        message: '目录创建成功',
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

const fileExistsExecutor: ToolExecutor = async (
  args: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> => {
  const { file_path } = args;
  
  if (!file_path) {
    return { success: false, error: '缺少文件路径参数' };
  }

  try {
    const absolutePath = path.resolve(context.workingDirectory || process.cwd(), file_path);
    const exists = fs.existsSync(absolutePath);
    
    if (exists) {
      const stats = fs.statSync(absolutePath);
      return {
        success: true,
        data: {
          exists: true,
          path: file_path,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
        },
      };
    } else {
      return {
        success: true,
        data: {
          exists: false,
          path: file_path,
        },
      };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const readFileTool: UnifiedTool = {
  id: 'builtin:read_file',
  name: 'read_file',
  description: '读取文件内容',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '文件路径（相对或绝对路径）',
      },
      encoding: {
        type: 'string',
        description: '文件编码，默认 utf-8',
      },
    },
    required: ['file_path'],
  },
  source: 'builtin',
  executor: readFileExecutor,
  metadata: {
    tags: ['file', 'read'],
    capabilities: ['file:read'],
  },
};

export const writeFileTool: UnifiedTool = {
  id: 'builtin:write_file',
  name: 'write_file',
  description: '写入文件内容，可自动创建目录',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '文件路径（相对或绝对路径）',
      },
      content: {
        type: 'string',
        description: '要写入的内容',
      },
      encoding: {
        type: 'string',
        description: '文件编码，默认 utf-8',
      },
      create_dirs: {
        type: 'boolean',
        description: '是否自动创建目录，默认 false',
      },
    },
    required: ['file_path', 'content'],
  },
  source: 'builtin',
  executor: writeFileExecutor,
  metadata: {
    tags: ['file', 'write'],
    capabilities: ['file:write'],
  },
};

export const listDirTool: UnifiedTool = {
  id: 'builtin:list_dir',
  name: 'list_dir',
  description: '列出目录内容',
  inputSchema: {
    type: 'object',
    properties: {
      dir_path: {
        type: 'string',
        description: '目录路径',
      },
      recursive: {
        type: 'boolean',
        description: '是否递归列出子目录，默认 false',
      },
    },
    required: ['dir_path'],
  },
  source: 'builtin',
  executor: listDirExecutor,
  metadata: {
    tags: ['file', 'directory'],
    capabilities: ['file:read'],
  },
};

export const deleteFileTool: UnifiedTool = {
  id: 'builtin:delete_file',
  name: 'delete_file',
  description: '删除文件或目录',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '文件或目录路径',
      },
      recursive: {
        type: 'boolean',
        description: '删除目录时是否递归删除内容，默认 false',
      },
    },
    required: ['file_path'],
  },
  source: 'builtin',
  executor: deleteFileExecutor,
  metadata: {
    tags: ['file', 'delete'],
    capabilities: ['file:write'],
  },
};

export const createDirTool: UnifiedTool = {
  id: 'builtin:create_dir',
  name: 'create_dir',
  description: '创建目录',
  inputSchema: {
    type: 'object',
    properties: {
      dir_path: {
        type: 'string',
        description: '目录路径',
      },
    },
    required: ['dir_path'],
  },
  source: 'builtin',
  executor: createDirExecutor,
  metadata: {
    tags: ['file', 'directory'],
    capabilities: ['file:write'],
  },
};

export const fileExistsTool: UnifiedTool = {
  id: 'builtin:file_exists',
  name: 'file_exists',
  description: '检查文件或目录是否存在',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '文件或目录路径',
      },
    },
    required: ['file_path'],
  },
  source: 'builtin',
  executor: fileExistsExecutor,
  metadata: {
    tags: ['file', 'check'],
    capabilities: ['file:read'],
  },
};

export const fileTools: UnifiedTool[] = [
  readFileTool,
  writeFileTool,
  listDirTool,
  deleteFileTool,
  createDirTool,
  fileExistsTool,
];
