import { Config, Message, ChatResponse, StreamCallbacks } from '../types';
import { BaseProvider } from './base';
import { DeepSeekProvider } from './deepseek';
import { ZhipuProvider } from './zhipu';
import { QwenProvider } from './qwen';
import { MiniMaxProvider } from './minimax';

export { BaseProvider } from './base';
export { DeepSeekProvider } from './deepseek';
export { ZhipuProvider } from './zhipu';
export { QwenProvider } from './qwen';
export { MiniMaxProvider } from './minimax';

export function createProvider(config: Config): BaseProvider {
  switch (config.provider) {
    case 'deepseek':
      return new DeepSeekProvider(config);
    case 'zhipu':
      return new ZhipuProvider(config);
    case 'qwen':
      return new QwenProvider(config);
    case 'minimax':
      return new MiniMaxProvider(config);
    default:
      throw new Error(`不支持的模型提供商: ${config.provider}`);
  }
}

export async function chat(config: Config, messages: Message[]): Promise<ChatResponse> {
  const provider = createProvider(config);
  return provider.chat(messages);
}

export async function chatStream(
  config: Config, 
  messages: Message[], 
  callbacks: StreamCallbacks
): Promise<ChatResponse> {
  const provider = createProvider(config);
  return provider.chatStream(messages, callbacks);
}
