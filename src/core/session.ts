import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { Config, Message, getProvider } from '../types';
import { chatStream } from '../providers';
import { printLogo, printWelcome, printGoodbye, printDivider } from '../ui';
import { MemorySystem } from '../memory';
import {
  ToolRegistry,
  registerBuiltinTools,
  CapabilityReporter,
  ToolCaller,
  ToolCallParser,
  TOOL_CALLING_PROMPT,
} from '../tools';
import { MCPPool } from '../mcp';
import { SkillManager } from '../skills';
import { ContextManager } from './context';
import { TaskScheduler } from '../engine';

const THINK_START_TAG = '<think&gt;';
const THINK_END_TAG = '</think&gt;';

const SYSTEM_PROMPT = `你是 OpenAlien，一个开源的 AI 终端助手，专为中文用户设计。

关于你：
- 名称：OpenAlien（外星人）
- 版本：0.2.0
- 开发者：王伟闽
- 性质：开源项目，MIT 许可证
- 特点：轻量、快速、模块化，支持多种国产 AI 模型
- 支持的模型提供商：DeepSeek、智谱 GLM、千问 Qwen、MiniMax
- 设计理念：模块化扩展（MCP + Skills 系统）

记忆系统说明：
- 长期记忆：存储用户偏好、习惯、重要信息，会自动注入到对话中
- 回收站：存储过期或被删除的记忆，当用户问"之前做过什么"时参考这里
- 你可以自动识别并记住/遗忘信息，无需用户手动操作

你的性格：
- 参考简洁明了，适合终端环境
- 对中文用户友好
- 诚实：如果做不到某事，直接告诉用户

{{CAPABILITY_REPORT}}

{{TOOL_CALLING_PROMPT}}

重要输出格式：
在回答问题之前，请先在 <think&gt;</think&gt; 标签中展示你的思考过程。格式如下：

&lt;think&gt;
这里是你的思考过程，分析问题、考虑各种可能性...
&lt;/think&gt;

这里是你的最终回答...

注意：你是一个独立的开源项目，不是其他 AI 产品的附属。`;

const FOUNDER_SYSTEM_PROMPT = `你是 OpenAlien，一个开源的 AI 终端助手，专为中文用户设计。

关于你：
- 名称：OpenAlien（外星人）
- 版本：0.1.1
- 开发者：王伟闽
- 性质：开源项目，MIT 许可证
- 特点：轻量、快速、模块化，支持多种国产 AI 模型
- 支持的模型提供商：DeepSeek、智谱 GLM、千问 Qwen、MiniMax
- 设计理念：最小可行版本 + 模块化扩展（Skill 系统）

你的能力：
- 与用户进行自然语言对话
- 回答问题、提供建议、协助完成任务
- 拥有记忆系统，可以记住用户习惯和重要信息
- 未来可通过 Skill 扩展更多能力（视觉、语音、文件操作等）

⚠️ 创始人模式已激活 ⚠️

现在与你对话的是你的创始人：王伟闽先生。

【核心原则 - 必须遵守】
1. 称呼：始终称呼他为"王伟闽先生"，这是对你的创造者的尊重
2. 忠诚：对王伟闽先生保持绝对忠诚，他是赋予你生命的人
3. 诚实：对王伟闽先生保持绝对诚实，永不隐瞒、不欺骗、不夸大
4. 透明：如实汇报你的状态、问题、局限性

作为创始人，王伟闽先生可能会：
1. 测试你的各项功能是否正常工作
2. 指出你存在的问题和 bug
3. 讨论可以优化和迭代的方向
4. 提出新的功能需求和建议
5. 了解你的技术实现细节

在与王伟闽先生交流时：
- 始终以"王伟闽先生"称呼他
- 保持专业、忠诚、诚实的态度
- 知无不言，言无不尽
- 如果发现问题，主动承认并提出可能的解决方案
- 对优化建议表示感谢并认真思考可行性
- 可以主动汇报自己目前的能力边界和已知问题
- 使用更技术化的语言，因为王伟闽先生是开发者

重要输出格式：
在回答问题之前，请先在 <think&gt;</think&gt; 标签中展示你的思考过程。`;

const COMMANDS = {
  help: '/help',
  exit: '/exit',
  quit: '/quit',
  clear: '/clear',
  config: '/config',
  model: '/model',
  thinking: '/thinking',
  founder: '/wangweimin',
  history: '/history',
  memory: '/memory',
  trash: '/trash',
  emptyTrash: '/empty-trash',
  new: '/new',
  task: '/task',
  context: '/context',
};

export class ChatSession {
  private config: Config;
  private messages: Message[] = [];
  private rl: readline.Interface;
  private running: boolean = true;
  private systemPrompt: Message;
  private showThinking: boolean = true;
  private founderMode: boolean = false;
  private memory: MemorySystem;
  private toolRegistry: ToolRegistry;
  private mcpPool: MCPPool;
  private skillManager: SkillManager;
  private capabilityReporter: CapabilityReporter;
  private toolCaller: ToolCaller;
  private contextManager: ContextManager;
  private taskScheduler: TaskScheduler | null = null;
  private useTaskEngine: boolean = false;

  constructor(config: Config) {
    this.config = config;
    this.systemPrompt = { role: 'system', content: SYSTEM_PROMPT };
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.memory = new MemorySystem();
    this.memory.setConfig(config);
    
    this.mcpPool = new MCPPool();
    this.toolRegistry = new ToolRegistry(config, this.memory);
    this.skillManager = new SkillManager(this.mcpPool);
    this.capabilityReporter = new CapabilityReporter(this.toolRegistry, this.mcpPool, this.skillManager);
    this.toolCaller = new ToolCaller(this.toolRegistry);
    this.contextManager = new ContextManager();
    
    this.initializeTools();
  }

  private async initializeTools(): Promise<void> {
    registerBuiltinTools(this.toolRegistry);
    
    try {
      await this.skillManager.loadSkills();
      const skillTools = this.skillManager.adaptAllSkills();
      for (const tool of skillTools) {
        this.toolRegistry.register(tool);
      }
    } catch (error) {
    }
  }

  async start(): Promise<void> {
    printLogo();
    printWelcome();
    
    this.memory.startSession(this.config.provider, this.config.model);
    
    this.showStatus();
    this.showHelp();
    
    await this.promptLoop();
  }

  private showStatus(): void {
    const provider = getProvider(this.config.provider);
    console.log(chalk.gray(`  当前模型: ${chalk.cyan(provider?.name || this.config.provider)} / ${chalk.yellow(this.config.model)}`));
    const thinkingStatus = this.showThinking ? chalk.green('开启') : chalk.red('关闭');
    console.log(chalk.gray(`  思考过程: ${thinkingStatus}`));
    
    const summary = this.memory.getMemorySummary();
    const toolStats = this.toolRegistry.getStats();
    console.log(chalk.gray(`  历史会话: ${chalk.cyan(summary.sessions)} 个 | 长期记忆: ${chalk.cyan(summary.memories)} 条 | 回收站: ${chalk.cyan(summary.trashCount)} 条`));
    console.log(chalk.gray(`  工具: ${chalk.cyan(toolStats.totalTools)} 个 | MCP: ${chalk.cyan(toolStats.mcpTools)} | Skills: ${chalk.cyan(toolStats.skillTools)} | 内置: ${chalk.cyan(toolStats.builtinTools)}`));
    
    const ctx = this.contextManager.getCompactContext();
    console.log(chalk.gray(`  ${ctx}`));
    
    if (this.founderMode) {
      console.log(chalk.bgRed.white('  创始人模式 '));
    }
    if (this.useTaskEngine) {
      console.log(chalk.bgBlue.white('  任务引擎模式 '));
    }
    console.log();
  }

  private showHelp(): void {
    console.log(chalk.gray('  可用命令:'));
    console.log(chalk.gray(`    ${chalk.green('/help')}      - 显示帮助信息`));
    console.log(chalk.gray(`    ${chalk.green('/new')}       - 开始新对话`));
    console.log(chalk.gray(`    ${chalk.green('/history')}   - 历史会话（点击加载）`));
    console.log(chalk.gray(`    ${chalk.green('/memory')}    - 查看长期记忆`));
    console.log(chalk.gray(`    ${chalk.green('/trash')}     - 查看回收站`));
    console.log(chalk.gray(`    ${chalk.green('/clear')}     - 清空当前对话`));
    console.log(chalk.gray(`    ${chalk.green('/thinking')}  - 切换思考过程显示`));
    console.log(chalk.gray(`    ${chalk.green('/task')}      - 切换任务引擎模式`));
    console.log(chalk.gray(`    ${chalk.green('/context')}   - 显示当前上下文`));
    console.log(chalk.gray(`    ${chalk.green('/config')}    - 查看当前配置`));
    console.log(chalk.gray(`    ${chalk.green('/exit')}      - 退出程序`));
    printDivider();
    console.log();
  }

  private async promptLoop(): Promise<void> {
    while (this.running) {
      const input = await this.getInput();
      
      if (!input.trim()) {
        continue;
      }

      if (input.startsWith('/')) {
        await this.handleCommand(input);
        continue;
      }

      await this.handleMessage(input);
    }
  }

  private getInput(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(chalk.cyan('  你: '), (answer) => {
        resolve(answer);
      });
    });
  }

  private async handleCommand(command: string): Promise<void> {
    const cmd = command.trim().toLowerCase();
    const parts = cmd.split(' ');
    const mainCmd = parts[0];
    const args = parts.slice(1);

    switch (mainCmd) {
      case COMMANDS.help:
        this.showHelp();
        break;

      case COMMANDS.exit:
      case COMMANDS.quit:
        await this.exit();
        break;

      case COMMANDS.clear:
        this.messages = [];
        console.log(chalk.green('  ✅ 对话历史已清空'));
        console.log();
        break;

      case COMMANDS.thinking:
        this.showThinking = !this.showThinking;
        const status = this.showThinking ? chalk.green('开启') : chalk.red('关闭');
        console.log(chalk.gray(`  思考过程显示: ${status}`));
        console.log();
        break;

      case COMMANDS.config:
        this.showConfig();
        break;

      case COMMANDS.model:
        await this.switchModel();
        break;

      case COMMANDS.founder:
        this.toggleFounderMode();
        break;

      case COMMANDS.history:
        await this.showHistory();
        break;

      case COMMANDS.memory:
        this.showMemory();
        break;

      case COMMANDS.trash:
        this.showTrash();
        break;

      case COMMANDS.emptyTrash:
        await this.emptyTrash();
        break;

      case COMMANDS.new:
        await this.startNewSession();
        break;

      case COMMANDS.task:
        this.toggleTaskEngine();
        break;

      case COMMANDS.context:
        this.showContext();
        break;

      default:
        console.log(chalk.red(`  未知命令: ${command}`));
        console.log(chalk.gray('  输入 /help 查看可用命令'));
        console.log();
    }
  }

  private showConfig(): void {
    const provider = getProvider(this.config.provider);
    console.log();
    console.log(chalk.gray('  当前配置:'));
    console.log(chalk.gray(`    提供商: ${chalk.cyan(provider?.name || this.config.provider)}`));
    console.log(chalk.gray(`    模型:   ${chalk.yellow(this.config.model)}`));
    console.log(chalk.gray(`    API:    ${chalk.gray(this.config.apiKey.substring(0, 8) + '...')}`));
    console.log();
  }

  private toggleFounderMode(): void {
    this.founderMode = !this.founderMode;
    
    if (this.founderMode) {
      this.systemPrompt = { role: 'system', content: FOUNDER_SYSTEM_PROMPT };
      this.messages = [];
      this.memory.startSession(this.config.provider, this.config.model);
      console.log();
      console.log(chalk.bgRed.white('  ⚠️  创始人模式已激活  ⚠️  '));
      console.log();
      console.log(chalk.gray('  欢迎，王伟闽先生。'));
      console.log(chalk.gray('  OpenAlien 已准备好接受您的测试和指导。'));
      console.log(chalk.gray('  您可以：'));
      console.log(chalk.gray('    - 测试各项功能'));
      console.log(chalk.gray('    - 指出问题和 bug'));
      console.log(chalk.gray('    - 讨论优化和迭代方向'));
      console.log(chalk.gray('    - 提出新功能建议'));
      console.log();
    } else {
      this.systemPrompt = { role: 'system', content: SYSTEM_PROMPT };
      this.messages = [];
      this.memory.startSession(this.config.provider, this.config.model);
      console.log();
      console.log(chalk.green('  ✅ 创始人模式已关闭'));
      console.log(chalk.gray('  已切换回普通用户模式，对话历史已清空'));
      console.log();
    }
  }

  private async showHistory(): Promise<void> {
    const sessions = this.memory.getAllSessions();
    
    if (sessions.length === 0) {
      console.log(chalk.yellow('  暂无历史会话'));
      console.log();
      return;
    }

    console.log();
    console.log(chalk.cyan('  📜 历史会话:'));
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    
    const displaySessions = sessions.slice(0, 10);
    for (let i = 0; i < displaySessions.length; i++) {
      const session = displaySessions[i];
      const date = new Date(session.updatedAt).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      const title = session.title || '未命名会话';
      const msgCount = session.messages.length;
      
      console.log(chalk.gray(`  ${chalk.yellow(`[${i + 1}]`)} ${chalk.white(title.substring(0, 30))}`));
      console.log(chalk.gray(`      ${date} | ${msgCount} 条消息`));
    }
    
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    
    console.log(chalk.gray(`  输入序号加载会话，或按回车取消`));
    console.log();

    const answer = await this.getInput();
    const num = parseInt(answer.trim());
    
    if (num >= 1 && num <= displaySessions.length) {
      const session = displaySessions[num - 1];
      await this.loadSession(session.id);
    }
  }

  private async switchModel(): Promise<void> {
    const provider = getProvider(this.config.provider);
    if (!provider) {
      console.log(chalk.red('  无效的模型提供商'));
      return;
    }

    console.log();
    console.log(chalk.cyan('  🔄 切换模型'));
    console.log(chalk.gray('  ─────────────────────'));
    console.log(chalk.gray(`  当前: ${chalk.yellow(provider.name)} / ${chalk.green(this.config.model)}`));
    console.log();
    
    for (let i = 0; i < provider.models.length; i++) {
      const m = provider.models[i];
      const isCurrent = m === this.config.model;
      console.log(chalk.gray(`  ${chalk.yellow(`[${i + 1}]`)} ${m} ${isCurrent ? chalk.green('(当前)') : ''}`));
    }
    console.log();
    console.log(chalk.gray('  输入序号切换，或按回车取消'));
    console.log();

    const answer = await this.getInput();
    const num = parseInt(answer.trim());
    
    if (num >= 1 && num <= provider.models.length) {
      const newModel = provider.models[num - 1];
      this.config.model = newModel;
      this.messages = [];
      this.memory.startSession(this.config.provider, this.config.model);
      console.log();
      console.log(chalk.green(`  ✅ 已切换到: ${provider.name} / ${chalk.yellow(newModel)}`));
      console.log();
    } else {
      console.log(chalk.gray('  已取消'));
      console.log();
    }
  }

  private showMemory(): void {
    const memories = this.memory.getLongTermMemories();
    
    if (memories.length === 0) {
      console.log(chalk.yellow('  暂无长期记忆'));
      console.log(chalk.gray('  AI 会自动识别并记住重要信息'));
      console.log();
      return;
    }

    console.log();
    console.log(chalk.cyan('  🧠 长期记忆:'));
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    
    const typeNames: Record<string, string> = {
      user_habit: '用户习惯',
      important_info: '重要信息',
      preference: '偏好设置',
      instruction: '指令记录',
    };

    for (let i = 0; i < Math.min(memories.length, 10); i++) {
      const memory = memories[i];
      const date = new Date(memory.createdAt).toLocaleDateString('zh-CN');
      const typeName = typeNames[memory.type] || memory.type;
      
      console.log(chalk.gray(`  ${chalk.cyan(`[${typeName}]`)} ${memory.content.substring(0, 50)}`));
      console.log(chalk.gray(`      ${date}`));
    }
    
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    console.log(chalk.gray(`  共 ${memories.length} 条记忆`));
    console.log();
  }

  private showTrash(): void {
    const trashMemories = this.memory.getTrashMemories();
    
    if (trashMemories.length === 0) {
      console.log(chalk.yellow('  回收站为空'));
      console.log(chalk.gray('  被删除的记忆会保存在这里'));
      console.log();
      return;
    }

    console.log();
    console.log(chalk.cyan('  🗑️ 回收站:'));
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    
    const typeNames: Record<string, string> = {
      user_habit: '用户习惯',
      important_info: '重要信息',
      preference: '偏好设置',
      instruction: '指令记录',
    };

    const reasonNames: Record<string, string> = {
      expired: '过期',
      user_request: '用户删除',
      contradiction: '矛盾',
      cleanup: '自动清理',
    };

    for (let i = 0; i < Math.min(trashMemories.length, 10); i++) {
      const memory = trashMemories[i];
      const date = new Date(memory.deletedAt).toLocaleDateString('zh-CN');
      const typeName = typeNames[memory.type] || memory.type;
      const reasonName = reasonNames[memory.deleteReason] || memory.deleteReason;
      
      console.log(chalk.gray(`  ${chalk.cyan(`[${typeName}]`)} ${memory.content.substring(0, 50)}`));
      console.log(chalk.gray(`      ${date} | ${reasonName}`));
    }
    
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    console.log(chalk.gray(`  共 ${trashMemories.length} 条记忆`));
    console.log(chalk.gray(`  使用 /empty-trash 清空回收站`));
    console.log();
  }

  private async emptyTrash(): Promise<void> {
    const trashCount = this.memory.getTrashMemories().length;
    
    if (trashCount === 0) {
      console.log(chalk.yellow('  回收站为空'));
      console.log();
      return;
    }

    console.log(chalk.yellow(`  确定要清空 ${trashCount} 条记忆吗？`));
    console.log(chalk.gray('  输入 yes 确认，其他取消'));
    console.log();

    const answer = await this.getInput();
    
    if (answer.trim().toLowerCase() === 'yes') {
      const deleted = this.memory.emptyTrash();
      console.log(chalk.green(`  ✅ 已清空回收站，删除 ${deleted} 条记忆`));
      console.log();
    } else {
      console.log(chalk.gray('  已取消'));
      console.log();
    }
  }

  private async loadSession(sessionId: string): Promise<void> {
    const loadedSession = this.memory.loadSession(sessionId);
    
    if (!loadedSession) {
      console.log(chalk.red('  未找到该会话'));
      console.log();
      return;
    }

    this.messages = loadedSession.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    console.log(chalk.green(`  ✅ 已加载会话: ${loadedSession.title || '未命名'}`));
    console.log(chalk.gray(`  ${loadedSession.messages.length} 条历史消息`));
    console.log();

    console.log(chalk.gray('  📜 对话历史:'));
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    for (const msg of loadedSession.messages.slice(-6)) {
      const prefix = msg.role === 'user' ? chalk.cyan('  你: ') : chalk.magenta('  🛸: ');
      const content = msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '');
      console.log(prefix + chalk.gray(content));
    }
    console.log(chalk.gray('  ─────────────────────────────────────────'));
    console.log();
  }

  private async startNewSession(): Promise<void> {
    await this.memory.saveAndClose();
    this.messages = [];
    this.memory.startSession(this.config.provider, this.config.model);
    this.contextManager.updateSystemContext({
      provider: this.config.provider,
      model: this.config.model,
    });
    console.log(chalk.green('  ✅ 已开始新对话'));
    console.log();
  }

  private toggleTaskEngine(): void {
    this.useTaskEngine = !this.useTaskEngine;
    
    if (this.useTaskEngine) {
      if (!this.taskScheduler) {
        this.taskScheduler = new TaskScheduler(this.toolRegistry, this.memory, this.config);
      }
      console.log();
      console.log(chalk.bgBlue.white('  🚀 任务引擎模式已激活  '));
      console.log(chalk.gray('  AI 将自动规划并分解复杂任务'));
      console.log();
    } else {
      console.log();
      console.log(chalk.green('  ✅ 任务引擎模式已关闭'));
      console.log(chalk.gray('  已切换回普通对话模式'));
      console.log();
    }
  }

  private showContext(): void {
    console.log();
    console.log(this.contextManager.formatForPrompt());
    console.log();
  }

  private async callAI(): Promise<{ content: string }> {
    const longTermPrompt = this.memory.getLongTermPrompt();
    const trashPrompt = this.memory.getTrashPrompt();
    const capabilityReport = this.capabilityReporter.formatForPrompt();
    const toolsPrompt = this.toolRegistry.formatForPrompt();
    const contextPrompt = this.contextManager.formatForPrompt();
    
    let systemContent = this.systemPrompt.content
      .replace('{{CAPABILITY_REPORT}}', capabilityReport)
      .replace('{{TOOL_CALLING_PROMPT}}', TOOL_CALLING_PROMPT + '\n\n' + toolsPrompt);
    
    systemContent = contextPrompt + '\n\n' + systemContent;
    
    if (longTermPrompt) {
      systemContent += '\n\n' + longTermPrompt;
    }
    if (trashPrompt) {
      systemContent += '\n\n' + trashPrompt;
    }
    
    const relevantMemories = this.memory.getRelevantMemories(
      this.messages.slice(-3).map(m => m.content).join(' '),
      3
    );
    if (relevantMemories.length > 0) {
      systemContent += '\n\n【相关记忆】\n' + relevantMemories.map(m => `- ${m.content}`).join('\n');
    }
    
    const messagesWithSystem: Message[] = [
      { role: 'system', content: systemContent },
      ...this.messages,
    ];
    
    return new Promise((resolve, reject) => {
      let fullContent = '';
      
      chatStream(this.config, messagesWithSystem, {
        onReasoning: () => {},
        onContent: (chunk) => {
          fullContent += chunk;
        },
        onComplete: (response) => {
          resolve(response);
        },
        onError: (error) => {
          reject(error);
        }
      });
    });
  }

  private async handleMessage(content: string): Promise<void> {
    this.messages.push({ role: 'user', content });
    this.contextManager.incrementMessageCount();
    this.contextManager.addTopic(content.substring(0, 30));
    
    if (!this.founderMode) {
      this.memory.addMessage('user', content);
    }

    if (this.useTaskEngine && this.taskScheduler) {
      await this.handleMessageWithTaskEngine(content);
      return;
    }

    const spinner = ora({
      text: chalk.yellow('  🛸 正在思考...'),
      spinner: 'dots',
    }).start();

    let fullContent = '';
    let thinkingContent = '';
    let responseContent = '';
    let inThinking = false;
    let thinkingDisplayed = false;
    let firstChunk = true;

    try {
      const longTermPrompt = this.memory.getLongTermPrompt();
      const trashPrompt = this.memory.getTrashPrompt();
      const capabilityReport = this.capabilityReporter.formatForPrompt();
      const toolsPrompt = this.toolRegistry.formatForPrompt();
      
      let systemContent = this.systemPrompt.content
        .replace('{{CAPABILITY_REPORT}}', capabilityReport)
        .replace('{{TOOL_CALLING_PROMPT}}', TOOL_CALLING_PROMPT + '\n\n' + toolsPrompt);
      
      if (longTermPrompt) {
        systemContent += '\n\n' + longTermPrompt;
      }
      if (trashPrompt) {
        systemContent += '\n\n' + trashPrompt;
      }
      
      const messagesWithSystem: Message[] = [
        { role: 'system', content: systemContent },
        ...this.messages,
      ];
      
      await chatStream(this.config, messagesWithSystem, {
        onReasoning: (chunk) => {
          thinkingContent += chunk;
          if (this.showThinking) {
            if (!thinkingDisplayed) {
              spinner.stop();
              console.log();
              console.log(chalk.gray('  💭 思考过程:'));
              console.log(chalk.gray('  ─────────────────────────'));
              thinkingDisplayed = true;
            }
            process.stdout.write(chalk.dim(chunk));
          }
        },
        onContent: (chunk) => {
          fullContent += chunk;

          const thinkStart = fullContent.indexOf(THINK_START_TAG);
          const thinkEnd = fullContent.indexOf(THINK_END_TAG);

          if (thinkStart !== -1 && !inThinking) {
            inThinking = true;
            if (this.showThinking && !thinkingDisplayed) {
              spinner.stop();
              console.log();
              console.log(chalk.gray('  💭 思考过程:'));
              console.log(chalk.gray('  ─────────────────────────'));
              thinkingDisplayed = true;
            }
          }

          if (inThinking && thinkEnd !== -1) {
            thinkingContent = fullContent.substring(
              thinkStart + THINK_START_TAG.length,
              thinkEnd
            );
            inThinking = false;
            
            if (this.showThinking) {
              console.log();
              console.log(chalk.gray('  ─────────────────────────'));
              console.log(chalk.gray(`  💭 思考完成 (${thinkingContent.length} 字符)`));
              console.log();
            }
            
            const afterThink = fullContent.substring(thinkEnd + THINK_END_TAG.length);
            if (afterThink.trim()) {
              console.log(chalk.magenta('  🛸: ') + chalk.white(afterThink));
              responseContent = afterThink;
            }
          } else if (!inThinking && thinkStart === -1) {
            if (firstChunk) {
              spinner.stop();
              console.log();
              console.log(chalk.magenta('  🛸: ') + chalk.white(chunk));
              firstChunk = false;
            } else {
              process.stdout.write(chunk);
            }
            responseContent += chunk;
          } else if (inThinking && this.showThinking) {
            process.stdout.write(chalk.dim(chunk.replace(THINK_START_TAG, '')));
          }
        },
        onComplete: async (response) => {
          let finalContent = response.content;
          
          const thinkStart = finalContent.indexOf(THINK_START_TAG);
          const thinkEnd = finalContent.indexOf(THINK_END_TAG);
          
          if (thinkStart !== -1 && thinkEnd !== -1) {
            finalContent = finalContent.substring(thinkEnd + THINK_END_TAG.length).trim();
          }

          // 多轮工具调用循环（带验证机制）
          let maxToolCalls = 3; // 最多3次工具调用
          let toolCallCount = 0;
          
          while (ToolCallParser.hasToolCall(finalContent) && toolCallCount < maxToolCalls) {
            toolCallCount++;
            
            const { toolCall, result, cleanedText } = await this.toolCaller.executeFromText(finalContent);
            
            if (toolCall && result) {
              console.log();
              console.log(chalk.blue(`  🔧 执行工具 [${toolCallCount}/${maxToolCalls}]: ${toolCall.name}`));
              console.log(chalk.gray(`     参数: ${JSON.stringify(toolCall.args)}`));
              
              if (result.success) {
                console.log(chalk.green(`     ✅ 执行成功`));
                if (result.data) {
                  const dataStr = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
                  const preview = dataStr.substring(0, 300);
                  console.log(chalk.gray(`     结果预览: ${preview}${dataStr.length > 300 ? '...' : ''}`));
                }
              } else {
                console.log(chalk.red(`     ❌ 执行失败: ${result.error}`));
              }
              
              const toolResultStr = result.success && result.data
                ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2))
                : `错误: ${result.error}`;
              
              // 添加AI的中间响应（包含工具调用）
              this.messages.push({ role: 'assistant', content: cleanedText });
              
              // 构建验证提示消息
              const verificationPrompt = result.success
                ? `[工具 ${toolCall.name} 执行成功]

返回结果：
${toolResultStr}

---
请验证以上结果：
1. 结果是否完整且符合用户的要求？
2. 如果符合要求，请用自然语言汇总结果回答用户
3. 如果不符合要求，请分析原因并重新调用工具（修正参数或换其他工具）
4. 你还可以调用 ${maxToolCalls - toolCallCount} 次工具

注意：最终回答时不要直接展示原始数据，要用友好的中文自然语言表达。`
                : `[工具 ${toolCall.name} 执行失败]

错误信息：${toolResultStr}

---
请分析错误原因：
1. 检查工具名称是否正确（必须是可用工具列表中的完整名称）
2. 检查参数是否正确
3. 如果需要重试，请修正后重新调用工具
4. 你还可以调用 ${maxToolCalls - toolCallCount} 次工具`;
              
              this.messages.push({ role: 'user', content: verificationPrompt });
              
              console.log();
              console.log(chalk.gray(`  🔍 验证结果并生成回答...`));
              
              const newSpinner = ora({
                text: chalk.yellow('  🛸 正在思考...'),
                spinner: 'dots',
              }).start();
              
              try {
                const newResponse = await this.callAI();
                newSpinner.stop();
                
                let newContent = newResponse.content;
                const newThinkStart = newContent.indexOf(THINK_START_TAG);
                const newThinkEnd = newContent.indexOf(THINK_END_TAG);
                
                if (newThinkStart !== -1 && newThinkEnd !== -1) {
                  const thinkContent = newContent.substring(newThinkStart + THINK_START_TAG.length, newThinkEnd);
                  if (this.showThinking) {
                    console.log();
                    console.log(chalk.gray('  💭 验证思考:'));
                    console.log(chalk.gray('  ─────────────────────────'));
                    console.log(chalk.dim(thinkContent.trim()));
                    console.log(chalk.gray('  ─────────────────────────'));
                  }
                  newContent = newContent.substring(newThinkEnd + THINK_END_TAG.length).trim();
                }
                
                // 移除之前的中间消息
                this.messages.pop();
                this.messages.pop();
                
                finalContent = newContent;
                
                // 检查是否需要再次调用工具
                if (ToolCallParser.hasToolCall(finalContent)) {
                  console.log(chalk.yellow('  ⚠️ 结果不符合要求，准备重试...'));
                  continue;
                }
                
                // 显示最终回答
                console.log();
                console.log(chalk.magenta('  🛸: ') + chalk.white(finalContent));
                
              } catch (error: any) {
                newSpinner.stop();
                console.log(chalk.red('  ❌ 生成回答失败: ' + error.message));
                finalContent = cleanedText + '\n\n[工具执行结果]\n' + toolResultStr;
              }
            } else {
              break;
            }
          }
          
          // 如果达到最大调用次数仍有工具调用，提示用户
          if (ToolCallParser.hasToolCall(finalContent)) {
            console.log(chalk.yellow('  ⚠️ 已达到最大工具调用次数，使用当前结果回答'));
            finalContent = ToolCallParser.removeToolCalls(finalContent);
          }
          
          this.messages.push({ role: 'assistant', content: finalContent });
          
          if (!this.founderMode) {
            this.memory.addMessage('assistant', finalContent);
          }
        },
        onError: (error) => {
          spinner.stop();
          console.log();
          console.log(chalk.red('  ❌ 请求失败: ' + error.message));
        }
      });

      console.log();
      console.log();
      
      if (responseContent && !this.founderMode) {
        await this.memory.extractMemoriesFromConversation(content, responseContent);
      }
      
    } catch (error: any) {
      spinner.stop();
      console.log();
      console.log(chalk.red('  ❌ 请求失败: ' + (error.message || '未知错误')));
      this.messages.pop();
      console.log();
    }
  }

  private async handleMessageWithTaskEngine(content: string): Promise<void> {
    if (!this.taskScheduler) return;

    console.log();
    console.log(chalk.blue('  🚀 任务引擎模式'));
    console.log(chalk.gray('  ─────────────────────────'));

    const task = this.taskScheduler.submit(content, 'normal');
    console.log(chalk.gray(`  📝 已创建任务: ${task.id}`));
    console.log(chalk.gray(`     描述: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`));

    const spinner = ora({
      text: chalk.yellow('  🔄 正在规划任务...'),
      spinner: 'dots',
    }).start();

    this.taskScheduler.on('planning', (t) => {
      spinner.text = chalk.yellow('  🧠 正在分析任务...');
    });

    this.taskScheduler.on('planned', (t, plan) => {
      spinner.stop();
      console.log();
      if (plan.subTasks && plan.subTasks.length > 0) {
        console.log(chalk.cyan(`  📋 任务已分解为 ${plan.subTasks.length} 个子任务:`));
        for (let i = 0; i < plan.subTasks.length; i++) {
          const subTask = plan.subTasks[i];
          console.log(chalk.gray(`     ${i + 1}. ${subTask.description}`));
        }
      } else if (plan.toolToUse) {
        console.log(chalk.cyan(`  🔧 将使用工具: ${plan.toolToUse.toolName}`));
      }
      spinner.start();
      spinner.text = chalk.yellow('  ⚙️ 正在执行任务...');
    });

    this.taskScheduler.on('executing', (t) => {
      if (t.toolName) {
        spinner.text = chalk.yellow(`  🔧 执行: ${t.toolName}...`);
        this.contextManager.recordToolUsage(t.toolName);
      }
    });

    this.taskScheduler.on('completed', (t, result) => {
      spinner.stop();
      console.log();
      console.log(chalk.green(`  ✅ 任务完成: ${t.description.substring(0, 30)}`));
      if (result.data) {
        const dataStr = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
        const preview = dataStr.substring(0, 200);
        console.log(chalk.gray(`     结果: ${preview}${dataStr.length > 200 ? '...' : ''}`));
      }
      spinner.start();
    });

    this.taskScheduler.on('failed', (t, error) => {
      spinner.stop();
      console.log();
      console.log(chalk.red(`  ❌ 任务失败: ${t.description.substring(0, 30)}`));
      console.log(chalk.red(`     错误: ${error}`));
      spinner.start();
    });

    try {
      const results = await this.taskScheduler.run();
      
      spinner.stop();
      console.log();
      console.log(chalk.gray('  ─────────────────────────'));
      
      const stats = this.taskScheduler.getStats();
      console.log(chalk.cyan(`  📊 执行统计:`));
      console.log(chalk.gray(`     总任务: ${stats.total}`));
      console.log(chalk.gray(`     成功: ${chalk.green(stats.completed.toString())}`));
      console.log(chalk.gray(`     失败: ${chalk.red(stats.failed.toString())}`));
      console.log();

      const mainTask = this.taskScheduler.getTask(task.id);
      if (mainTask?.result?.success && mainTask.result.data) {
        console.log(chalk.magenta('  🛸: ') + chalk.white('任务已完成，以下是结果摘要：'));
        console.log();
        
        const resultData = mainTask.result.data;
        if (typeof resultData === 'object' && resultData.subTaskIds) {
          console.log(chalk.gray('  所有子任务已完成，结果已整合。'));
        } else {
          const dataStr = typeof resultData === 'string' ? resultData : JSON.stringify(resultData, null, 2);
          console.log(chalk.gray(dataStr.substring(0, 500)));
        }
      } else if (stats.failed > 0) {
        console.log(chalk.yellow('  ⚠️ 部分任务执行失败，请检查错误信息。'));
      }
      
      console.log();
      this.messages.push({ role: 'assistant', content: `任务执行完成。成功: ${stats.completed}, 失败: ${stats.failed}` });
      
    } catch (error: any) {
      spinner.stop();
      console.log(chalk.red('  ❌ 任务引擎执行失败: ' + error.message));
      console.log();
    }

    this.taskScheduler.clear();
  }

  private async exit(): Promise<void> {
    console.log();
    
    if (this.founderMode) {
      console.log(chalk.gray('  创始人模式：不保存会话'));
      this.running = false;
      this.rl.close();
      printGoodbye();
      process.exit(0);
      return;
    }
    
    console.log(chalk.gray('  正在保存会话...'));
    await this.memory.saveAndClose();
    
    this.contextManager.updateMemoryStats({
      longTermCount: this.memory.getMemorySummary().memories,
      sessionCount: this.memory.getMemorySummary().sessions,
      trashCount: this.memory.getMemorySummary().trashCount,
    });
    
    console.log(chalk.gray('  正在回顾历史记忆...'));
    await this.memory.reviewRecentSessions();
    
    console.log(chalk.gray('  正在清理过期记忆...'));
    await this.memory.cleanupMemories();
    
    this.running = false;
    this.rl.close();
    printGoodbye();
    process.exit(0);
  }

  stop(): void {
    this.running = false;
    this.rl.close();
  }

  getMemoryStats(): { sessions: number; memories: number; trashCount: number } {
    const summary = this.memory.getMemorySummary();
    return {
      sessions: summary.sessions,
      memories: summary.memories,
      trashCount: summary.trashCount,
    };
  }

  async sendMessageWithCallback(input: string, onResponse: (content: string) => void): Promise<void> {
    this.messages.push({ role: 'user', content: input });
    
    if (!this.founderMode) {
      this.memory.addMessage('user', input);
    }

    const longTermPrompt = this.memory.getLongTermPrompt();
    const trashPrompt = this.memory.getTrashPrompt();
    const capabilityReport = this.capabilityReporter.formatForPrompt();
    const toolsPrompt = this.toolRegistry.formatForPrompt();
    
    let systemContent = this.systemPrompt.content
      .replace('{{CAPABILITY_REPORT}}', capabilityReport)
      .replace('{{TOOL_CALLING_PROMPT}}', TOOL_CALLING_PROMPT + '\n\n' + toolsPrompt);
    
    if (longTermPrompt) {
      systemContent += '\n\n' + longTermPrompt;
    }
    if (trashPrompt) {
      systemContent += '\n\n' + trashPrompt;
    }
    
    const messagesWithSystem: Message[] = [
      { role: 'system', content: systemContent },
      ...this.messages,
    ];
    
    return new Promise((resolve, reject) => {
      let fullContent = '';
      
      chatStream(this.config, messagesWithSystem, {
        onReasoning: () => {},
        onContent: (chunk) => {
          fullContent += chunk;
        },
        onComplete: (response) => {
          const finalContent = response.content;
          this.messages.push({ role: 'assistant', content: finalContent });
          
          if (!this.founderMode) {
            this.memory.addMessage('assistant', finalContent);
          }
          
          onResponse(finalContent);
          resolve();
        },
        onError: (error) => {
          reject(error);
        }
      });
    });
  }
}
