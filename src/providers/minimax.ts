import { Config, Message, ChatResponse, StreamCallbacks } from '../types';
import { BaseProvider } from './base';

export class MiniMaxProvider extends BaseProvider {
  private groupId: string = '';

  constructor(config: Config) {
    super(config);
    this.setApiKey(config.apiKey);
  }

  setApiKey(apiKey: string): void {
    const parts = apiKey.split(':');
    if (parts.length === 2) {
      this.client.defaults.headers['Authorization'] = `Bearer ${parts[0]}`;
      this.groupId = parts[1];
    } else {
      this.client.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  async chat(messages: Message[]): Promise<ChatResponse> {
    const model = this.config.model || this.provider.defaultModel;
    
    const endpoint = this.groupId 
      ? `/chat/completions?GroupId=${this.groupId}`
      : '/chat/completions';

    const response = await this.client.post(endpoint, {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
    });

    const data = response.data;
    
    return {
      content: data.choices[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async chatStream(messages: Message[], callbacks: StreamCallbacks): Promise<ChatResponse> {
    const model = this.config.model || this.provider.defaultModel;
    
    const endpoint = this.groupId 
      ? `/chat/completions?GroupId=${this.groupId}`
      : '/chat/completions';

    const response = await this.client.post(endpoint, {
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
        const response: ChatResponse = { content, usage };
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
