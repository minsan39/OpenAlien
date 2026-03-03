import axios, { AxiosInstance } from 'axios';
import { Config, Message, ChatResponse, StreamCallbacks, Provider, getProvider } from '../types';

export abstract class BaseProvider {
  protected client: AxiosInstance;
  protected provider: Provider;
  protected config: Config;

  constructor(config: Config) {
    this.config = config;
    this.provider = getProvider(config.provider)!;
    
    const baseUrl = config.baseUrl || this.provider.baseUrl;
    
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  abstract chat(messages: Message[]): Promise<ChatResponse>;
  abstract chatStream(messages: Message[], callbacks: StreamCallbacks): Promise<ChatResponse>;
  abstract setApiKey(apiKey: string): void;
}
