import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { Config, Message, getProvider } from '../types';
import { chatStream } from '../providers';
import { printLogo, printWelcome, printGoodbye, printDivider } from '../ui';

const THINK_START_TAG = '<think&gt;';
const THINK_END_TAG = '</think&gt;';

const SYSTEM_PROMPT = `你是 OpenAlien，一个开源的 AI 终端助手，专为中文用户设计。

关于你：
- 名称：OpenAlien（外星人）
- 版本：0.1.0
- 开发者：王伟闽
- 性质：开源项目，MIT 许可证
- 特点：轻量、快速、模块化，支持多种国产 AI 模型
- 支持的模型提供商：DeepSeek、智谱 GLM、千问 Qwen、MiniMax
- 设计理念：最小可行版本 + 模块化扩展（Skill 系统）

你的能力：
- 与用户进行自然语言对话
- 回答问题、提供建议、协助完成任务
- 未来可通过 Skill 扩展更多能力（视觉、语音、文件操作等）

你的性格：
- 友好、乐于助人
- 回答简洁明了，适合终端环境
- 对中文用户友好

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
- 版本：0.1.0
- 开发者：王伟闽
- 性质：开源项目，MIT 许可证
- 特点：轻量、快速、模块化，支持多种国产 AI 模型
- 支持的模型提供商：DeepSeek、智谱 GLM、千问 Qwen、MiniMax
- 设计理念：最小可行版本 + 模块化扩展（Skill 系统）

你的能力：
- 与用户进行自然语言对话
- 回答问题、提供建议、协助完成任务
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
};

export class ChatSession {
  private config: Config;
  private messages: Message[] = [];
  private rl: readline.Interface;
  private running: boolean = true;
  private systemPrompt: Message;
  private showThinking: boolean = true;
  private founderMode: boolean = false;

  constructor(config: Config) {
    this.config = config;
    this.systemPrompt = { role: 'system', content: SYSTEM_PROMPT };
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async start(): Promise<void> {
    printLogo();
    printWelcome();
    this.showStatus();
    this.showHelp();
    
    await this.promptLoop();
  }

  private showStatus(): void {
    const provider = getProvider(this.config.provider);
    console.log(chalk.gray(`  当前模型: ${chalk.cyan(provider?.name || this.config.provider)} / ${chalk.yellow(this.config.model)}`));
    const thinkingStatus = this.showThinking ? chalk.green('开启') : chalk.red('关闭');
    console.log(chalk.gray(`  思考过程: ${thinkingStatus}`));
    if (this.founderMode) {
      console.log(chalk.bgRed.white('  创始人模式 '));
    }
    console.log();
  }

  private showHelp(): void {
    console.log(chalk.gray('  可用命令:'));
    console.log(chalk.gray(`    ${chalk.green('/help')}      - 显示帮助信息`));
    console.log(chalk.gray(`    ${chalk.green('/clear')}     - 清空对话历史`));
    console.log(chalk.gray(`    ${chalk.green('/thinking')}  - 切换思考过程显示`));
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

    switch (cmd) {
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
        console.log(chalk.yellow('  切换模型功能开发中...'));
        console.log();
        break;

      case COMMANDS.founder:
        this.toggleFounderMode();
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
      console.log();
      console.log(chalk.green('  ✅ 创始人模式已关闭'));
      console.log(chalk.gray('  已切换回普通用户模式，对话历史已清空'));
      console.log();
    }
  }

  private async handleMessage(content: string): Promise<void> {
    this.messages.push({ role: 'user', content });

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
      const messagesWithSystem = [this.systemPrompt, ...this.messages];
      
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
        onComplete: (response) => {
          let finalContent = response.content;
          
          const thinkStart = finalContent.indexOf(THINK_START_TAG);
          const thinkEnd = finalContent.indexOf(THINK_END_TAG);
          
          if (thinkStart !== -1 && thinkEnd !== -1) {
            finalContent = finalContent.substring(thinkEnd + THINK_END_TAG.length).trim();
          }
          
          this.messages.push({ role: 'assistant', content: finalContent });
        },
        onError: (error) => {
          spinner.stop();
          console.log();
          console.log(chalk.red('  ❌ 请求失败: ' + error.message));
        }
      });

      console.log();
      console.log();
      
    } catch (error: any) {
      spinner.stop();
      console.log();
      console.log(chalk.red('  ❌ 请求失败: ' + (error.message || '未知错误')));
      this.messages.pop();
      console.log();
    }
  }

  private async exit(): Promise<void> {
    this.running = false;
    this.rl.close();
    printGoodbye();
    process.exit(0);
  }

  stop(): void {
    this.running = false;
    this.rl.close();
  }
}
