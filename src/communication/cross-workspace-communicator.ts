/**
 * Cross-Workspace Communication System
 *
 * Enables inter-domain communication via Tailscale VPN and Redis pub/sub
 * Allows UltraPilot (VPS5) to coordinate with trading-at (VPS4)
 */

import { createClient, RedisClientType } from 'redis';

export interface WorkspaceMessage {
  id: string;
  fromDomain: string;
  toDomain: string;
  type: 'command' | 'event' | 'query' | 'response';
  channel: string;
  payload: any;
  timestamp: Date;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface DomainConfig {
  domainId: string;
  name: string;
  vps: string;
  vpsIp: string;
  tailscaleIp?: string;
  communication: {
    tailscale: {
      enabled: boolean;
      networkId: string;
      peerDomains: string[];
    };
    messageBus: {
      type: 'redis' | 'rabbitmq' | 'http';
      host: string;
      port: number;
      channels: string[];
    };
  };
}

export class CrossWorkspaceCommunicator {
  private currentDomain: string;
  private domainConfigs: Map<string, DomainConfig>;
  private redisClient: RedisClientType | null = null;
  private subscribers: Map<string, Set<(message: WorkspaceMessage) => void>>;
  private messageQueue: WorkspaceMessage[] = [];
  private connected: boolean = false;

  constructor(currentDomain: string) {
    this.currentDomain = currentDomain;
    this.domainConfigs = new Map();
    this.subscribers = new Map();
  }

  /**
   * Initialize communication system
   */
  async initialize(): Promise<void> {
    try {
      // Load domain configurations
      await this.loadDomainConfigs();

      // Connect to Redis message bus
      await this.connectRedis();

      // Subscribe to channels
      await this.subscribeToChannels();

      this.connected = true;
      console.log(`✅ Cross-workspace communication initialized for ${this.currentDomain}`);
    } catch (error) {
      console.error('Failed to initialize cross-workspace communication:', error);
      throw error;
    }
  }

  /**
   * Load all domain configurations
   */
  private async loadDomainConfigs(): Promise<void> {
    // Load current domain config
    const currentConfig = await this.loadDomainConfig(this.currentDomain);
    if (!currentConfig) {
      throw new Error(`Current domain ${this.currentDomain} not found`);
    }
    this.domainConfigs.set(this.currentDomain, currentConfig);

    // Load peer domain configs
    if (currentConfig.communication.tailscale.peerDomains) {
      for (const peerDomain of currentConfig.communication.tailscale.peerDomains) {
        const peerConfig = await this.loadDomainConfig(peerDomain);
        if (peerConfig) {
          this.domainConfigs.set(peerDomain, peerConfig);
        }
      }
    }
  }

  /**
   * Load domain configuration from file
   */
  private async loadDomainConfig(domainName: string): Promise<DomainConfig | null> {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const configPath = path.join(
        __dirname,
        '../../.ultra/domains',
        `${domainName}.json`
      );

      const configContent = await fs.readFile(configPath, 'utf-8');
      const config: DomainConfig = JSON.parse(configContent);
      return config;
    } catch (error) {
      console.error(`Failed to load config for domain ${domainName}:`, error);
      return null;
    }
  }

  /**
   * Connect to Redis message bus
   */
  private async connectRedis(): Promise<void> {
    const currentConfig = this.domainConfigs.get(this.currentDomain);
    if (!currentConfig) {
      throw new Error('Current domain config not loaded');
    }

    if (currentConfig.communication.messageBus.type === 'redis') {
      const { host, port } = currentConfig.communication.messageBus;
      this.redisClient = createClient({
        socket: {
          host,
          port
        }
      });

      this.redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.connected = false;
      });

      await this.redisClient.connect();
      console.log(`✅ Connected to Redis at ${host}:${port}`);
    }
  }

  /**
   * Subscribe to domain channels
   */
  private async subscribeToChannels(): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    const currentConfig = this.domainConfigs.get(this.currentDomain);
    if (!currentConfig) {
      return;
    }

    const channels = currentConfig.communication.messageBus.channels || [];

    for (const channel of channels) {
      const subscriber = this.redisClient.duplicate();
      await subscriber.connect();

      await subscriber.subscribe(channel, (message) => {
        try {
          const parsed: WorkspaceMessage = JSON.parse(message);
          this.handleIncomingMessage(parsed);
        } catch (error) {
          console.error(`Failed to parse message from ${channel}:`, error);
        }
      });

      console.log(`✅ Subscribed to channel: ${channel}`);
    }
  }

  /**
   * Send message to another domain
   */
  async sendMessage(
    toDomain: string,
    channel: string,
    type: WorkspaceMessage['type'],
    payload: any,
    priority: WorkspaceMessage['priority'] = 'normal'
  ): Promise<void> {
    if (!this.connected) {
      // Queue message for later
      this.messageQueue.push({
        id: `${Date.now()}-${Math.random()}`,
        fromDomain: this.currentDomain,
        toDomain,
        type,
        channel,
        payload,
        timestamp: new Date(),
        priority
      });
      console.log(`📨 Message queued for ${toDomain}:${channel}`);
      return;
    }

    const message: WorkspaceMessage = {
      id: `${Date.now()}-${Math.random()}`,
      fromDomain: this.currentDomain,
      toDomain,
      type,
      channel,
      payload,
      timestamp: new Date(),
      priority
    };

    if (this.redisClient) {
      await this.redisClient.publish(channel, JSON.stringify(message));
      console.log(`📤 Sent message to ${toDomain}:${channel} (${type})`);
    }
  }

  /**
   * Send command to trading domain
   */
  async sendTradingCommand(command: string, params: any): Promise<void> {
    await this.sendMessage(
      'trading-at',
      'trading-commands',
      'command',
      { command, params },
      'high'
    );
  }

  /**
   * Query trading domain status
   */
  async queryTradingStatus(): Promise<void> {
    await this.sendMessage(
      'trading-at',
      'trading-queries',
      'query',
      { query: 'status' }
    );
  }

  /**
   * Handle incoming message
   */
  private handleIncomingMessage(message: WorkspaceMessage): void {
    console.log(`📥 Received message from ${message.fromDomain}:${message.channel}`);

    // Notify subscribers
    const subscribers = this.subscribers.get(message.channel);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(message);
        } catch (error) {
          console.error('Subscriber callback error:', error);
        }
      });
    }
  }

  /**
   * Subscribe to specific channel
   */
  on(channel: string, callback: (message: WorkspaceMessage) => void): void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(callback);
  }

  /**
   * Unsubscribe from channel
   */
  off(channel: string, callback: (message: WorkspaceMessage) => void): void {
    const subscribers = this.subscribers.get(channel);
    if (subscribers) {
      subscribers.delete(callback);
    }
  }

  /**
   * Process queued messages
   */
  async processQueue(): Promise<void> {
    if (!this.connected) {
      return;
    }

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      await this.sendMessage(
        message.toDomain,
        message.channel,
        message.type,
        message.payload,
        message.priority
      );
    }

    console.log(`✅ Processed ${queue.length} queued messages`);
  }

  /**
   * Disconnect from communication system
   */
  async disconnect(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
    }
    this.connected = false;
    console.log('🔌 Disconnected from cross-workspace communication');
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get all connected domains
   */
  getConnectedDomains(): string[] {
    return Array.from(this.domainConfigs.keys());
  }
}

/**
 * Create communicator instance for a domain
 */
export async function createCommunicator(domain: string): Promise<CrossWorkspaceCommunicator> {
  const communicator = new CrossWorkspaceCommunicator(domain);
  await communicator.initialize();
  return communicator;
}
