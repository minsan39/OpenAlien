import * as os from 'os';
import * as path from 'path';

export interface EnvironmentContext {
  platform: string;
  hostname: string;
  username: string;
  homedir: string;
  currentDir: string;
  shell: string;
  nodeVersion: string;
  arch: string;
  cpus: number;
  totalMemory: string;
  freeMemory: string;
}

export interface TimeContext {
  now: Date;
  timezone: string;
  locale: string;
  formatted: {
    date: string;
    time: string;
    datetime: string;
    weekday: string;
  };
  relative: {
    timeOfDay: '凌晨' | '上午' | '中午' | '下午' | '傍晚' | '晚上' | '深夜';
    isWeekend: boolean;
    season: '春' | '夏' | '秋' | '冬';
  };
}

export interface SessionContext {
  sessionId: string;
  sessionStartTime: number;
  messageCount: number;
  lastActivityTime: number;
  activeTools: string[];
  recentTopics: string[];
}

export interface SystemContext {
  provider: string;
  model: string;
  toolsAvailable: number;
  mcpServersConnected: number;
  memoryStats: {
    longTermCount: number;
    sessionCount: number;
    trashCount: number;
  };
}

export interface FullContext {
  environment: EnvironmentContext;
  time: TimeContext;
  session: SessionContext;
  system: SystemContext;
}

export class ContextManager {
  private sessionContext: SessionContext;
  private systemContext: SystemContext;
  private recentTopics: string[] = [];
  private maxTopics: number = 10;

  constructor() {
    this.sessionContext = {
      sessionId: this.generateSessionId(),
      sessionStartTime: Date.now(),
      messageCount: 0,
      lastActivityTime: Date.now(),
      activeTools: [],
      recentTopics: [],
    };

    this.systemContext = {
      provider: 'unknown',
      model: 'unknown',
      toolsAvailable: 0,
      mcpServersConnected: 0,
      memoryStats: {
        longTermCount: 0,
        sessionCount: 0,
        trashCount: 0,
      },
    };
  }

  private generateSessionId(): string {
    return `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  getEnvironmentContext(): EnvironmentContext {
    return {
      platform: process.platform,
      hostname: os.hostname(),
      username: os.userInfo().username,
      homedir: os.homedir(),
      currentDir: process.cwd(),
      shell: process.env.SHELL || process.env.ComSpec || 'unknown',
      nodeVersion: process.version,
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: this.formatBytes(os.totalmem()),
      freeMemory: this.formatBytes(os.freemem()),
    };
  }

  getTimeContext(): TimeContext {
    const now = new Date();
    const hour = now.getHours();

    let timeOfDay: TimeContext['relative']['timeOfDay'];
    if (hour >= 0 && hour < 6) timeOfDay = '凌晨';
    else if (hour >= 6 && hour < 9) timeOfDay = '上午';
    else if (hour >= 9 && hour < 12) timeOfDay = '上午';
    else if (hour >= 12 && hour < 14) timeOfDay = '中午';
    else if (hour >= 14 && hour < 17) timeOfDay = '下午';
    else if (hour >= 17 && hour < 19) timeOfDay = '傍晚';
    else if (hour >= 19 && hour < 22) timeOfDay = '晚上';
    else timeOfDay = '深夜';

    const month = now.getMonth() + 1;
    let season: TimeContext['relative']['season'];
    if (month >= 3 && month <= 5) season = '春';
    else if (month >= 6 && month <= 8) season = '夏';
    else if (month >= 9 && month <= 11) season = '秋';
    else season = '冬';

    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    return {
      now,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: 'zh-CN',
      formatted: {
        date: now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
        time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        datetime: now.toLocaleString('zh-CN'),
        weekday: weekdays[now.getDay()],
      },
      relative: {
        timeOfDay,
        isWeekend: now.getDay() === 0 || now.getDay() === 6,
        season,
      },
    };
  }

  getSessionContext(): SessionContext {
    return { ...this.sessionContext };
  }

  getSystemContext(): SystemContext {
    return { ...this.systemContext };
  }

  getFullContext(): FullContext {
    return {
      environment: this.getEnvironmentContext(),
      time: this.getTimeContext(),
      session: this.getSessionContext(),
      system: this.getSystemContext(),
    };
  }

  updateSystemContext(updates: Partial<SystemContext>): void {
    this.systemContext = { ...this.systemContext, ...updates };
  }

  updateMemoryStats(stats: SystemContext['memoryStats']): void {
    this.systemContext.memoryStats = stats;
  }

  incrementMessageCount(): void {
    this.sessionContext.messageCount++;
    this.sessionContext.lastActivityTime = Date.now();
  }

  recordToolUsage(toolName: string): void {
    if (!this.sessionContext.activeTools.includes(toolName)) {
      this.sessionContext.activeTools.push(toolName);
    }
  }

  addTopic(topic: string): void {
    if (!this.recentTopics.includes(topic)) {
      this.recentTopics.unshift(topic);
      if (this.recentTopics.length > this.maxTopics) {
        this.recentTopics.pop();
      }
      this.sessionContext.recentTopics = [...this.recentTopics];
    }
  }

  formatForPrompt(): string {
    const env = this.getEnvironmentContext();
    const time = this.getTimeContext();
    const session = this.getSessionContext();
    const system = this.getSystemContext();

    let output = '【当前上下文】\n\n';

    output += `📍 环境:\n`;
    output += `  系统: ${env.platform} (${env.arch})\n`;
    output += `  用户: ${env.username}@${env.hostname}\n`;
    output += `  目录: ${env.currentDir}\n`;
    output += `  CPU: ${env.cpus}核 | 内存: ${env.freeMemory}/${env.totalMemory}\n\n`;

    output += `🕐 时间:\n`;
    output += `  ${time.formatted.date} ${time.formatted.weekday} ${time.formatted.time}\n`;
    output += `  ${time.relative.timeOfDay} · ${time.relative.season}季${time.relative.isWeekend ? ' · 周末' : ''}\n\n`;

    output += `💬 会话:\n`;
    output += `  消息数: ${session.messageCount}\n`;
    output += `  活跃工具: ${session.activeTools.length > 0 ? session.activeTools.join(', ') : '无'}\n`;
    if (session.recentTopics.length > 0) {
      output += `  近期话题: ${session.recentTopics.slice(0, 3).join(', ')}\n`;
    }
    output += '\n';

    output += `⚙️ 系统:\n`;
    output += `  模型: ${system.provider}/${system.model}\n`;
    output += `  工具: ${system.toolsAvailable}个可用\n`;
    output += `  记忆: ${system.memoryStats.longTermCount}条长期 | ${system.memoryStats.sessionCount}个会话\n`;

    return output;
  }

  getCompactContext(): string {
    const time = this.getTimeContext();
    const env = this.getEnvironmentContext();

    return `[${time.formatted.time} ${time.relative.timeOfDay}] ${env.username}@${env.hostname} in ${env.currentDir}`;
  }

  private formatBytes(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) {
      return `${gb.toFixed(1)}GB`;
    }
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)}MB`;
  }
}
