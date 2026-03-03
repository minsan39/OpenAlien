import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ToolRegistry } from '../tools/registry';
import { MCPPool } from '../mcp/pool';
import { SkillManager } from '../skills/manager';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'openalien-nodejs');
const CHANGELOG_FILE = path.join(CONFIG_DIR, 'changelog.json');

export interface ChangelogEntry {
  date: string;
  version: string;
  changes: string[];
}

export interface CapabilityReport {
  canDo: CapabilityCategory[];
  couldDo: CapabilityCategory[];
  cannotDo: string[];
  recentUpdates: ChangelogEntry[];
  stats: {
    totalTools: number;
    mcpServers: number;
    skills: number;
  };
}

export interface CapabilityCategory {
  category: string;
  description: string;
  tools: string[];
}

export class CapabilityReporter {
  private toolRegistry: ToolRegistry;
  private mcpPool: MCPPool;
  private skillManager: SkillManager;

  constructor(toolRegistry: ToolRegistry, mcpPool: MCPPool, skillManager: SkillManager) {
    this.toolRegistry = toolRegistry;
    this.mcpPool = mcpPool;
    this.skillManager = skillManager;
  }

  generateReport(): CapabilityReport {
    const tools = this.toolRegistry.getAll();
    const mcpStats = this.mcpPool.getStats();
    const skills = this.skillManager.getAllSkills();

    const canDo = this.categorizeCapabilities(tools.filter(t => t.source === 'builtin'));
    const couldDo = this.categorizeMCPCapabilities();
    const cannotDo = this.identifyMissingCapabilities();

    return {
      canDo,
      couldDo,
      cannotDo,
      recentUpdates: this.getRecentUpdates(),
      stats: {
        totalTools: tools.length,
        mcpServers: mcpStats.connectedServers,
        skills: skills.filter(s => s.status === 'loaded').length,
      },
    };
  }

  private categorizeCapabilities(tools: any[]): CapabilityCategory[] {
    const categories: Map<string, CapabilityCategory> = new Map();

    const categoryDefinitions: Record<string, { description: string; capabilities: string[] }> = {
      '文件操作': {
        description: '读取、写入、创建、删除文件和目录',
        capabilities: ['file:read', 'file:write'],
      },
      '记忆管理': {
        description: '搜索、添加、删除、列出长期记忆',
        capabilities: ['memory:read', 'memory:write'],
      },
      '系统信息': {
        description: '获取系统信息和当前时间',
        capabilities: ['system:read', 'utility:time'],
      },
    };

    for (const [categoryName, def] of Object.entries(categoryDefinitions)) {
      const matchingTools = tools.filter(tool =>
        tool.metadata?.capabilities?.some((cap: string) => def.capabilities.includes(cap))
      );

      if (matchingTools.length > 0) {
        categories.set(categoryName, {
          category: categoryName,
          description: def.description,
          tools: matchingTools.map(t => t.name),
        });
      }
    }

    const categorizedTools = new Set<string>();
    for (const cat of categories.values()) {
      cat.tools.forEach(t => categorizedTools.add(t));
    }

    const uncategorizedTools = tools.filter(t => !categorizedTools.has(t.name));
    if (uncategorizedTools.length > 0) {
      categories.set('其他内置工具', {
        category: '其他内置工具',
        description: '其他可用的内置工具',
        tools: uncategorizedTools.map(t => t.name),
      });
    }

    return Array.from(categories.values());
  }

  private categorizeMCPCapabilities(): CapabilityCategory[] {
    const categories: CapabilityCategory[] = [];
    const serverConfigs = this.mcpPool.getAllServerConfigs();

    const mcpCategoryMap: Record<string, { category: string; description: string }> = {
      'filesystem': {
        category: '文件操作 (MCP)',
        description: '通过 MCP 服务器提供完整的文件系统操作能力',
      },
    };

    for (const [serverId, config] of Object.entries(serverConfigs)) {
      if (config.disabled) continue;

      const client = this.mcpPool.get(serverId);
      const isConnected = client?.isConnected();

      const categoryInfo = mcpCategoryMap[serverId] || {
        category: `MCP: ${serverId}`,
        description: config.name || config.args?.join(' ') || config.command,
      };

      const tools = isConnected ? client!.getTools().map(t => t.name) : [];
      
      if (tools.length > 0 || !mcpCategoryMap[serverId]) {
        categories.push({
          category: categoryInfo.category,
          description: categoryInfo.description,
          tools: tools.length > 0 ? tools : ['(未连接)'],
        });
      }
    }

    return categories;
  }

  private identifyMissingCapabilities(): string[] {
    const missing: string[] = [];
    const tools = this.toolRegistry.getAll();
    const capabilities = new Set<string>();

    for (const tool of tools) {
      tool.metadata?.capabilities?.forEach(cap => capabilities.add(cap));
    }

    const commonCapabilities = [
      { cap: 'web:request', name: '网络请求（需要安装 MCP）' },
      { cap: 'database:query', name: '数据库操作（需要安装 MCP）' },
      { cap: 'git', name: 'Git 操作（需要安装 MCP）' },
      { cap: 'code:execute', name: '代码执行（需要安装 MCP）' },
      { cap: 'image:process', name: '图像处理（需要安装 Skill）' },
      { cap: 'audio:process', name: '音频处理（需要安装 Skill）' },
    ];

    for (const { cap, name } of commonCapabilities) {
      if (!capabilities.has(cap)) {
        missing.push(name);
      }
    }

    return missing;
  }

  formatForPrompt(): string {
    const report = this.generateReport();
    
    let output = '════════════════════════════════════════════════════════════\n';
    output += '                    🤖 AI 能力报告\n';
    output += '════════════════════════════════════════════════════════════\n\n';

    output += `📊 状态: ${report.stats.totalTools} 个工具 | ${report.stats.mcpServers} 个 MCP 服务器 | ${report.stats.skills} 个 Skills\n\n`;

    output += '✅ 【我可以做的】\n';
    output += '────────────────────────────────────────────────────────────\n';
    for (const cat of report.canDo) {
      output += `\n📁 ${cat.category}\n`;
      output += `   ${cat.description}\n`;
      output += `   工具: ${cat.tools.join(', ')}\n`;
    }

    if (report.couldDo.length > 0) {
      output += '\n\n⚡ 【我可以学会的】(需要连接 MCP 服务器)\n';
      output += '────────────────────────────────────────────────────────────\n';
      for (const cat of report.couldDo) {
        output += `\n🔌 ${cat.category}\n`;
        output += `   ${cat.description}\n`;
        if (cat.tools.length > 0 && cat.tools[0] !== '(未连接)') {
          output += `   工具: ${cat.tools.slice(0, 5).join(', ')}${cat.tools.length > 5 ? '...' : ''}\n`;
        }
      }
    }

    if (report.cannotDo.length > 0) {
      output += '\n\n❌ 【我暂时做不到的】\n';
      output += '────────────────────────────────────────────────────────────\n';
      for (const item of report.cannotDo) {
        output += `   • ${item}\n`;
      }
    }

    const updates = report.recentUpdates.slice(0, 3);
    if (updates.length > 0) {
      output += '\n\n📝 【最近更新】\n';
      output += '────────────────────────────────────────────────────────────\n';
      for (const update of updates) {
        output += `\n📅 ${update.date} (${update.version})\n`;
        for (const change of update.changes.slice(0, 3)) {
          output += `   • ${change}\n`;
        }
      }
    }

    output += '\n════════════════════════════════════════════════════════════\n';
    
    return output;
  }

  private getRecentUpdates(): ChangelogEntry[] {
    try {
      if (fs.existsSync(CHANGELOG_FILE)) {
        const content = fs.readFileSync(CHANGELOG_FILE, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
    }

    return [
      {
        date: new Date().toISOString().split('T')[0],
        version: '0.2.0',
        changes: [
          '新增 MCP 文件系统服务器 (@openalien/mcp-server-filesystem)',
          'MCP 服务器提供 11 个文件操作工具，支持路径别名（桌面、文档、下载等）',
          '新增 resolve_path 工具，可将 "桌面" 等别名解析为实际路径',
          '新增 MCP 和 Skills 框架支持，兼容市面上大部分 MCP 服务器',
          '新增记忆管理工具 (memory_search, memory_add, memory_delete, memory_list)',
          '新增系统工具 (system_info, current_time, echo)',
        ],
      },
    ];
  }

  addChangelogEntry(version: string, changes: string[]): void {
    const entries = this.getRecentUpdates();
    entries.unshift({
      date: new Date().toISOString().split('T')[0],
      version,
      changes,
    });

    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(CHANGELOG_FILE, JSON.stringify(entries.slice(0, 20), null, 2));
    } catch (error) {
      console.error('Failed to save changelog:', error);
    }
  }
}
