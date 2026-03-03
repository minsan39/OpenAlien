import { Config, Message, ChatResponse, StreamCallbacks, getProvider } from '../types';
import { BaseProvider } from './base';

export class DeepSeekProvider extends BaseProvider {
  constructor(config: Config) {
    super(config);
    this.setApiKey(config.apiKey);
  }

  setApiKey(apiKey: string): void {
    this.client.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
  }

  async chat(messages: Message[]): Promise<ChatResponse> {
    const model = this.config.model || this.provider.defaultModel;
    
    const response = await this.client.post('/chat/completions', {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
    });

    const data = response.data;
    const message = data.choices[0]?.message;
    
    return {
      content: message?.content || '',
      reasoning: message?.reasoning_content,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async chatStream(messages: Message[], callbacks: StreamCallbacks): Promise<ChatResponse> {
    const model = this.config.model || this.provider.defaultModel;
    
    const response = await this.client.post('/chat/completions', {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    }, {
      responseType: 'stream',
    });

    return new Promise((resolve, reject) => {
      let content = '';
      let reasoning = '';
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      const stream = response.data;
      
      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta;
              
              if (delta?.reasoning_content) {
                reasoning += delta.reasoning_content;
                callbacks.onReasoning?.(delta.reasoning_content);
              }
              
              if (delta?.content) {
                content += delta.content;
                callbacks.onContent?.(delta.content);
              }
              
              if (parsed.usage) {
                usage = {
                  promptTokens: parsed.usage.prompt_tokens || 0,
                  completionTokens: parsed.usage.completion_tokens || 0,
                  totalTokens: parsed.usage.total_tokens || 0,
                };
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      stream.on('end', () => {
        const response: ChatResponse = { content, reasoning, usage };
        callbacks.onComplete?.(response);
        resolve(response);
      });

      stream.on('error', (error: Error) => {
        callbacks.onError?.(error);
        reject(error);
      });
    });
  }
}
