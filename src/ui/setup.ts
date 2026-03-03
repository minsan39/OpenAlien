import inquirer from 'inquirer';
import chalk from 'chalk';
import { PROVIDERS, Config } from '../types';
import { setConfig, getConfigPath } from '../config';

export async function runSetup(): Promise<Config> {
  console.log();
  console.log(chalk.cyan('  📝 首次使用需要进行配置'));
  console.log(chalk.gray('  ─────────────────────────'));
  console.log();

  const providerChoices = PROVIDERS.map((p, index) => ({
    name: `${index + 1}. ${p.name} ${chalk.gray(`(${p.models.join(', ')})`)}`,
    value: p.id,
    short: p.name,
  }));

  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: '请选择 AI 模型提供商:',
      choices: providerChoices,
      pageSize: 10,
    },
  ]);

  const selectedProvider = PROVIDERS.find(p => p.id === provider)!;

  const { model } = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: '请选择模型:',
      choices: selectedProvider.models.map(m => ({
        name: m === selectedProvider.defaultModel 
          ? `${m} ${chalk.green('(推荐)')}` 
          : m,
        value: m,
        short: m,
      })),
      default: selectedProvider.defaultModel,
    },
  ]);

  const apiKeyHints: Record<string, string> = {
    deepseek: 'platform.deepseek.com',
    zhipu: 'open.bigmodel.cn',
    qwen: 'dashscope.console.aliyun.com',
    minimax: 'api.minimax.chat (格式: APIKey:GroupId)',
  };

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: '请输入 API Key:',
      mask: '*',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'API Key 不能为空';
        }
        return true;
      },
    },
  ]);

  console.log();
  console.log(chalk.gray(`  💡 API Key 获取地址: ${apiKeyHints[provider] || '官网'}`));

  const config: Config = {
    provider,
    model,
    apiKey: apiKey.trim(),
    baseUrl: selectedProvider.baseUrl,
  };

  setConfig(config);

  console.log();
  console.log(chalk.green('  ✅ 配置成功！'));
  console.log(chalk.gray(`  📁 配置文件: ${getConfigPath()}`));
  console.log();
  console.log(chalk.cyan('  现在可以开始对话了！'));
  console.log(chalk.gray('  输入 /help 查看可用命令'));
  console.log();

  return config;
}

export async function askForReconfigure(): Promise<boolean> {
  const { reconfigure } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'reconfigure',
      message: '是否重新配置？',
      default: false,
    },
  ]);
  return reconfigure;
}
