import chalk from 'chalk';
import ora from 'ora';

export const LOGO = `
${chalk.cyan('╭──────────────────────────────────────────────╮')}
${chalk.cyan('│')}   ${chalk.magenta('🚀')}  ${chalk.bold.cyan('OpenAlien')}  ${chalk.gray('v0.2.0')}            ${chalk.cyan('│')}
${chalk.cyan('│')}                                            ${chalk.cyan('│')}
${chalk.cyan('│')}   ${chalk.cyan('■')}  ${chalk.cyan('■■■')}  ${chalk.cyan('■■')}  ${chalk.cyan('■■■■■')}  ${chalk.cyan('■■')}  ${chalk.cyan('■■■')}  ${chalk.cyan('■')}       ${chalk.cyan('│')}
${chalk.cyan('│')}   ${chalk.blue('■')}  ${chalk.blue('■■')}  ${chalk.cyan('■')}  ${chalk.cyan('■■■')}  ${chalk.magenta('■')}  ${chalk.magenta('■■')}  ${chalk.magenta('■')}      ${chalk.cyan('│')}
${chalk.cyan('│')}   ${chalk.magenta('■')}  ${chalk.magenta('■■■')}  ${chalk.magenta('■■')}  ${chalk.magenta('■■■■■')}  ${chalk.magenta('■■')}  ${chalk.magenta('■■■')}  ${chalk.magenta('■')}     ${chalk.cyan('│')}
${chalk.cyan('│')}                                            ${chalk.cyan('│')}
${chalk.cyan('│')}  ${chalk.yellow('★')}  ${chalk.green('开源 AI 终端助手')}  ${chalk.yellow('★')}         ${chalk.cyan('│')}
${chalk.cyan('│')}      ${chalk.gray('专为中文用户设计')}                ${chalk.cyan('│')}
${chalk.cyan('╰──────────────────────────────────────────────╯')}
`;

export const SMALL_LOGO = `${chalk.magenta('🛸')} ${chalk.bold.cyan('OpenAlien')}`;

export function printLogo(): void {
  console.clear();
  console.log(LOGO);
  console.log();
}

export function printSmallLogo(): void {
  console.log(SMALL_LOGO);
}

export function printWelcome(): void {
  console.log();
  console.log(chalk.green('  ✨ 欢迎使用 OpenAlien！'));
  console.log(chalk.gray('  ────────────────────────────────────────'));
  console.log();
}

export function printGoodbye(): void {
  console.log();
  console.log(chalk.gray('  👋 ') + chalk.white('再见！感谢使用 OpenAlien'));
  console.log();
  console.log(chalk.cyan('  ══════════════════════════════════════════'));
}

export function printDivider(): void {
  console.log(chalk.gray('  ───────────────────────────────────────────'));
}
