import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MCPServer } from './server';

const PATH_ALIASES: Record<string, string> = {
  '桌面': path.join(os.homedir(), 'Desktop'),
  'desktop': path.join(os.homedir(), 'Desktop'),
  '文档': path.join(os.homedir(), 'Documents'),
  'documents': path.join(os.homedir(), 'Documents'),
  '下载': path.join(os.homedir(), 'Downloads'),
  'downloads': path.join(os.homedir(), 'Downloads'),
  '图片': path.join(os.homedir(), 'Pictures'),
  'pictures': path.join(os.homedir(), 'Pictures'),
  '音乐': path.join(os.homedir(), 'Music'),
  'music': path.join(os.homedir(), 'Music'),
  '视频': path.join(os.homedir(), 'Videos'),
  'videos': path.join(os.homedir(), 'Videos'),
  '主目录': os.homedir(),
  '家目录': os.homedir(),
  'home': os.homedir(),
  '~': os.homedir(),
  '用户目录': os.homedir(),
};

function resolvePath(inputPath: string): string {
  const normalized = inputPath.trim();
  
  if (PATH_ALIASES[normalized.toLowerCase()] || PATH_ALIASES[normalized]) {
    return PATH_ALIASES[normalized.toLowerCase()] || PATH_ALIASES[normalized];
  }
  
  if (normalized.startsWith('~/')) {
    return path.join(os.homedir(), normalized.slice(2));
  }
  
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  
  return path.resolve(normalized);
}

export function registerFilesystemTools(server: MCPServer): void {
  server.registerTool(
    {
      name: 'resolve_path',
      description: `解析路径别名。将常见路径别名转换为绝对路径。
支持的别名：
- 桌面/Desktop: 用户桌面目录
- 文档/Documents: 用户文档目录  
- 下载/Downloads: 用户下载目录
- 图片/Pictures: 用户图片目录
- 音乐/Music: 用户音乐目录
- 视频/Videos: 用户视频目录
- 主目录/家目录/home/~: 用户主目录
也可以解析相对路径为绝对路径。`,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要解析的路径或别名（如：桌面、文档、~/xxx 等）',
          },
        },
        required: ['path'],
      },
    },
    async (args) => {
      const inputPath = args.path;
      const resolved = resolvePath(inputPath);
      const exists = fs.existsSync(resolved);
      let type: string | null = null;
      
      if (exists) {
        const stats = fs.statSync(resolved);
        type = stats.isDirectory() ? 'directory' : 'file';
      }
      
      return {
        input: inputPath,
        resolved,
        exists,
        type,
      };
    }
  );

  server.registerTool(
    {
      name: 'read_file',
      description: `读取文件内容。读取指定路径的文件，返回文件内容。
路径支持别名：桌面、文档、下载、图片、音乐、视频、主目录、家目录、~ 等。
例如：桌面/test.txt 会被解析为 C:/Users/用户名/Desktop/test.txt`,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要读取的文件路径（支持别名，如：桌面/file.txt）',
          },
          encoding: {
            type: 'string',
            description: '文件编码，默认 utf-8。对于二进制文件使用 base64',
            default: 'utf-8',
          },
        },
        required: ['path'],
      },
    },
    async (args) => {
      const filePath = resolvePath(args.path);
      const encoding = args.encoding || 'utf-8';

      validatePath(filePath, server.getAllowedDirectories());

      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        throw new Error(`路径不是文件: ${filePath}`);
      }

      if (encoding === 'base64') {
        const content = fs.readFileSync(filePath);
        return {
          path: filePath,
          content: content.toString('base64'),
          size: content.length,
          encoding: 'base64',
        };
      }

      const content = fs.readFileSync(filePath, encoding as BufferEncoding);
      return {
        path: filePath,
        content,
        size: Buffer.byteLength(content, encoding as BufferEncoding),
        encoding,
      };
    }
  );

  server.registerTool(
    {
      name: 'write_file',
      description: `写入文件内容。创建新文件或覆盖现有文件。如果目录不存在会自动创建。
路径支持别名：桌面、文档、下载、图片、音乐、视频、主目录、家目录、~ 等。`,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要写入的文件路径（支持别名）',
          },
          content: {
            type: 'string',
            description: '要写入的内容',
          },
          encoding: {
            type: 'string',
            description: '文件编码，默认 utf-8。对于二进制内容使用 base64',
            default: 'utf-8',
          },
          append: {
            type: 'boolean',
            description: '是否追加模式，默认 false（覆盖）',
            default: false,
          },
        },
        required: ['path', 'content'],
      },
    },
    async (args) => {
      const filePath = resolvePath(args.path);
      const content = args.content;
      const encoding = args.encoding || 'utf-8';
      const append = args.append || false;

      validatePath(filePath, server.getAllowedDirectories());

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (encoding === 'base64') {
        const buffer = Buffer.from(content, 'base64');
        if (append) {
          fs.appendFileSync(filePath, buffer);
        } else {
          fs.writeFileSync(filePath, buffer);
        }
        return {
          path: filePath,
          size: buffer.length,
          encoding: 'base64',
          mode: append ? 'append' : 'write',
        };
      }

      if (append) {
        fs.appendFileSync(filePath, content, encoding as BufferEncoding);
      } else {
        fs.writeFileSync(filePath, content, encoding as BufferEncoding);
      }

      return {
        path: filePath,
        size: Buffer.byteLength(content, encoding as BufferEncoding),
        encoding,
        mode: append ? 'append' : 'write',
      };
    }
  );

  server.registerTool(
    {
      name: 'list_directory',
      description: `列出目录内容。返回目录中的文件和子目录列表。
路径支持别名：桌面、文档、下载、图片、音乐、视频、主目录、家目录、~ 等。
例如：使用 "桌面" 可以列出桌面目录内容。`,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要列出的目录路径（支持别名，如：桌面、文档）',
          },
          recursive: {
            type: 'boolean',
            description: '是否递归列出子目录，默认 false',
            default: false,
          },
        },
        required: ['path'],
      },
    },
    async (args) => {
      const dirPath = resolvePath(args.path);
      const recursive = args.recursive || false;

      validatePath(dirPath, server.getAllowedDirectories());

      if (!fs.existsSync(dirPath)) {
        throw new Error(`目录不存在: ${dirPath}`);
      }

      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        throw new Error(`路径不是目录: ${dirPath}`);
      }

      const items = listDirectory(dirPath, recursive);
      return {
        path: dirPath,
        items,
        count: items.length,
      };
    }
  );

  server.registerTool(
    {
      name: 'create_directory',
      description: `创建目录。递归创建目录结构，类似于 mkdir -p。
路径支持别名：桌面、文档、下载、图片、音乐、视频、主目录、家目录、~ 等。`,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要创建的目录路径（支持别名）',
          },
        },
        required: ['path'],
      },
    },
    async (args) => {
      const dirPath = resolvePath(args.path);

      validatePath(dirPath, server.getAllowedDirectories());

      if (fs.existsSync(dirPath)) {
        const stats = fs.statSync(dirPath);
        if (!stats.isDirectory()) {
          throw new Error(`路径已存在但不是目录: ${dirPath}`);
        }
        return {
          path: dirPath,
          created: false,
          message: '目录已存在',
        };
      }

      fs.mkdirSync(dirPath, { recursive: true });
      return {
        path: dirPath,
        created: true,
        message: '目录创建成功',
      };
    }
  );

  server.registerTool(
    {
      name: 'delete_file',
      description: `删除文件。删除指定路径的文件。
路径支持别名：桌面、文档、下载、图片、音乐、视频、主目录、家目录、~ 等。`,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要删除的文件路径（支持别名）',
          },
        },
        required: ['path'],
      },
    },
    async (args) => {
      const filePath = resolvePath(args.path);

      validatePath(filePath, server.getAllowedDirectories());

      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        throw new Error(`路径是目录，请使用 delete_directory: ${filePath}`);
      }

      fs.unlinkSync(filePath);
      return {
        path: filePath,
        deleted: true,
        message: '文件删除成功',
      };
    }
  );

  server.registerTool(
    {
      name: 'delete_directory',
      description: `删除目录。递归删除目录及其所有内容，类似于 rm -rf。请谨慎使用！
路径支持别名：桌面、文档、下载、图片、音乐、视频、主目录、家目录、~ 等。`,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要删除的目录路径（支持别名）',
          },
          recursive: {
            type: 'boolean',
            description: '是否递归删除，默认 true',
            default: true,
          },
        },
        required: ['path'],
      },
    },
    async (args) => {
      const dirPath = resolvePath(args.path);
      const recursive = args.recursive !== false;

      validatePath(dirPath, server.getAllowedDirectories());

      if (!fs.existsSync(dirPath)) {
        throw new Error(`目录不存在: ${dirPath}`);
      }

      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        throw new Error(`路径不是目录: ${dirPath}`);
      }

      if (recursive) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } else {
        fs.rmdirSync(dirPath);
      }

      return {
        path: dirPath,
        deleted: true,
        message: '目录删除成功',
      };
    }
  );

  server.registerTool(
    {
      name: 'move_file',
      description: `移动或重命名文件/目录。将源路径移动到目标路径。
路径支持别名：桌面、文档、下载、图片、音乐、视频、主目录、家目录、~ 等。`,
      inputSchema: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: '源文件/目录路径（支持别名）',
          },
          destination: {
            type: 'string',
            description: '目标路径（支持别名）',
          },
        },
        required: ['source', 'destination'],
      },
    },
    async (args) => {
      const sourcePath = resolvePath(args.source);
      const destPath = resolvePath(args.destination);

      validatePath(sourcePath, server.getAllowedDirectories());
      validatePath(destPath, server.getAllowedDirectories());

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`源路径不存在: ${sourcePath}`);
      }

      if (fs.existsSync(destPath)) {
        throw new Error(`目标路径已存在: ${destPath}`);
      }

      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.renameSync(sourcePath, destPath);
      return {
        source: sourcePath,
        destination: destPath,
        moved: true,
        message: '移动成功',
      };
    }
  );

  server.registerTool(
    {
      name: 'copy_file',
      description: `复制文件。将源文件复制到目标路径。
路径支持别名：桌面、文档、下载、图片、音乐、视频、主目录、家目录、~ 等。`,
      inputSchema: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: '源文件路径（支持别名）',
          },
          destination: {
            type: 'string',
            description: '目标路径（支持别名）',
          },
        },
        required: ['source', 'destination'],
      },
    },
    async (args) => {
      const sourcePath = resolvePath(args.source);
      const destPath = resolvePath(args.destination);

      validatePath(sourcePath, server.getAllowedDirectories());
      validatePath(destPath, server.getAllowedDirectories());

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`源文件不存在: ${sourcePath}`);
      }

      const stats = fs.statSync(sourcePath);
      if (stats.isDirectory()) {
        throw new Error(`源路径是目录，请使用 copy_directory: ${sourcePath}`);
      }

      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(sourcePath, destPath);
      return {
        source: sourcePath,
        destination: destPath,
        copied: true,
        message: '复制成功',
      };
    }
  );

  server.registerTool(
    {
      name: 'get_file_info',
      description: `获取文件/目录信息。返回文件大小、创建时间、修改时间等元数据。
路径支持别名：桌面、文档、下载、图片、音乐、视频、主目录、家目录、~ 等。`,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件/目录路径（支持别名）',
          },
        },
        required: ['path'],
      },
    },
    async (args) => {
      const filePath = resolvePath(args.path);

      validatePath(filePath, server.getAllowedDirectories());

      if (!fs.existsSync(filePath)) {
        throw new Error(`路径不存在: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isReadOnly: !(stats.mode & 0o200),
      };
    }
  );

  server.registerTool(
    {
      name: 'search_files',
      description: `搜索文件。在指定目录中搜索匹配模式的文件。
路径支持别名：桌面、文档、下载、图片、音乐、视频、主目录、家目录、~ 等。`,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '搜索的根目录（支持别名，如：桌面）',
          },
          pattern: {
            type: 'string',
            description: '搜索模式（支持 * 和 ? 通配符）',
          },
          excludePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: '要排除的模式列表',
          },
        },
        required: ['path', 'pattern'],
      },
    },
    async (args) => {
      const searchPath = resolvePath(args.path);
      const pattern = args.pattern;
      const excludePatterns = args.excludePatterns || [];

      validatePath(searchPath, server.getAllowedDirectories());

      if (!fs.existsSync(searchPath)) {
        throw new Error(`目录不存在: ${searchPath}`);
      }

      const matches = searchFiles(searchPath, pattern, excludePatterns);
      return {
        path: searchPath,
        pattern,
        matches,
        count: matches.length,
      };
    }
  );
}

function validatePath(filePath: string, allowedDirectories: string[]): void {
  const resolved = path.resolve(filePath);

  if (allowedDirectories.length === 0) {
    return;
  }

  const isAllowed = allowedDirectories.some((dir) => {
    const resolvedDir = path.resolve(dir);
    return resolved.startsWith(resolvedDir);
  });

  if (!isAllowed) {
    throw new Error(`路径不在允许的目录范围内: ${filePath}`);
  }
}

function listDirectory(dirPath: string, recursive: boolean): any[] {
  const items: any[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const item: any = {
      name: entry.name,
      path: fullPath,
      type: entry.isDirectory() ? 'directory' : 'file',
    };

    if (entry.isFile()) {
      const stats = fs.statSync(fullPath);
      item.size = stats.size;
    }

    items.push(item);

    if (recursive && entry.isDirectory()) {
      item.children = listDirectory(fullPath, true);
    }
  }

  return items;
}

function searchFiles(
  dirPath: string,
  pattern: string,
  excludePatterns: string[]
): string[] {
  const results: string[] = [];
  const regex = wildcardToRegex(pattern);
  const excludeRegexes = excludePatterns.map(wildcardToRegex);

  function search(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (excludeRegexes.some((re) => re.test(entry.name))) {
        continue;
      }

      if (regex.test(entry.name)) {
        results.push(fullPath);
      }

      if (entry.isDirectory()) {
        search(fullPath);
      }
    }
  }

  search(dirPath);
  return results;
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}
