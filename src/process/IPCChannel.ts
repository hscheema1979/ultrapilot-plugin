/**
 * IPC Channel - Inter-Process Communication
 *
 * Implements bidirectional messaging between parent and child processes
 * using Node.js IPC with request-response and broadcast patterns.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  IPCChannel as IPCChannelInterface,
  IPCMessage,
  IPCMessageType,
  ProcessRole
} from './types.js';

/**
 * Pending request tracker
 */
interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * IPC Channel Implementation
 */
export class IPCChannel extends EventEmitter implements IPCChannelInterface {
  private channel: any;
  private role: ProcessRole;
  private connected: boolean = false;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private defaultTimeout: number = 30000; // 30 seconds
  private messageQueue: IPCMessage[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  /**
   * Create IPC channel
   *
   * @param channel - Node.js IPC channel (process.send or childProcess.send)
   * @param role - Process role identifier
   */
  constructor(channel: any, role: ProcessRole) {
    super();
    this.channel = channel;
    this.role = role;
    this.setupMessageHandler();
  }

  /**
   * Setup message handler
   */
  private setupMessageHandler(): void {
    if (!this.channel) {
      return;
    }

    // Handle incoming messages
    this.channel.on('message', (message: any) => {
      this.handleIncomingMessage(message);
    });

    // Handle channel disconnect
    this.channel.on('disconnect', () => {
      this.connected = false;
      this.emit('disconnect');
      this.attemptReconnect();
    });

    // Handle channel error
    this.channel.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.connected = true;
  }

  /**
   * Handle incoming message
   */
  private handleIncomingMessage(message: any): void {
    try {
      // Validate message format
      if (!message || typeof message !== 'object') {
        this.emit('error', new Error('Invalid message format'));
        return;
      }

      const ipcMessage: IPCMessage = {
        type: message.type || 'event',
        from: message.from,
        to: message.to,
        id: message.id,
        correlationId: message.correlationId,
        payload: message.payload,
        timestamp: message.timestamp ? new Date(message.timestamp) : new Date()
      };

      // Handle response to pending request
      if (ipcMessage.type === 'response' && ipcMessage.correlationId) {
        const pending = this.pendingRequests.get(ipcMessage.correlationId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(ipcMessage.correlationId);

          if (ipcMessage.payload.error) {
            pending.reject(new Error(ipcMessage.payload.error));
          } else {
            pending.resolve(ipcMessage.payload.data);
          }
          return;
        }
      }

      // Emit message for general listeners
      this.emit('message', ipcMessage);

      // Emit typed events
      this.emit(ipcMessage.type, ipcMessage);

    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Send message
   */
  async send(message: IPCMessage): Promise<void> {
    if (!this.connected || !this.channel) {
      throw new Error('IPC channel not connected');
    }

    // Add timestamp and from if not present
    const msg: IPCMessage = {
      ...message,
      from: message.from || this.role,
      timestamp: message.timestamp || new Date()
    };

    return new Promise<void>((resolve, reject) => {
      try {
        this.channel.send(msg);
        resolve();
      } catch (error) {
        // Queue message if channel not ready
        this.messageQueue.push(msg);
        reject(error);
      }
    });
  }

  /**
   * Request-response pattern
   */
  async request(payload: any, timeout: number = this.defaultTimeout): Promise<any> {
    const correlationId = randomUUID();
    const message: IPCMessage = {
      type: 'request',
      payload,
      id: randomUUID(),
      correlationId,
      timestamp: new Date()
    };

    return new Promise<any>((resolve, reject) => {
      // Set up timeout
      const timer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`IPC request timeout: ${correlationId}`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(correlationId, { resolve, reject, timeout: timer });

      // Send request
      this.send(message).catch((error) => {
        clearTimeout(timer);
        this.pendingRequests.delete(correlationId);
        reject(error);
      });
    });
  }

  /**
   * Broadcast message to all processes
   */
  async broadcast(message: IPCMessage): Promise<void> {
    const broadcastMsg: IPCMessage = {
      ...message,
      type: 'broadcast',
      to: undefined, // Broadcast = no specific recipient
      timestamp: message.timestamp || new Date()
    };

    return this.send(broadcastMsg);
  }

  /**
   * Subscribe to message type
   */
  subscribe(eventType: string, handler: (message: IPCMessage) => void): void {
    this.on(eventType, handler);
  }

  /**
   * Unsubscribe from message type
   */
  unsubscribe(eventType: string, handler: (message: IPCMessage) => void): void {
    this.off(eventType, handler);
  }

  /**
   * Reply to a request
   */
  async reply(originalMessage: IPCMessage, payload: any): Promise<void> {
    const reply: IPCMessage = {
      type: 'response',
      payload,
      correlationId: originalMessage.id || originalMessage.correlationId,
      timestamp: new Date()
    };

    return this.send(reply);
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      if (this.channel && !this.connected) {
        this.setupMessageHandler();
        if (this.connected) {
          this.reconnectAttempts = 0;
          this.flushMessageQueue();
        }
      }
    }, delay);
  }

  /**
   * Flush queued messages
   */
  private async flushMessageQueue(): Promise<void> {
    const messages = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of messages) {
      try {
        await this.send(message);
      } catch (error) {
        // Re-queue on failure
        this.messageQueue.push(message);
      }
    }
  }

  /**
   * Check if channel is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get channel role
   */
  getRole(): ProcessRole {
    return this.role;
  }

  /**
   * Get pending request count
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Clear all pending requests
   */
  clearPendingRequests(): void {
    for (const [correlationId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Channel closed'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Close channel
   */
  async close(): Promise<void> {
    this.connected = false;
    this.clearPendingRequests();
    this.messageQueue = [];
    this.removeAllListeners();
  }

  /**
   * Create child process IPC channel
   */
  static createForChild(childProcess: any, role: ProcessRole): IPCChannel {
    return new IPCChannel(childProcess, role);
  }

  /**
   * Create parent process IPC channel
   */
  static createForParent(role: ProcessRole): IPCChannel {
    return new IPCChannel(process, role);
  }
}

/**
 * IPC Message Router - Routes messages between processes
 */
export class IPCMessageRouter {
  private channels: Map<ProcessRole, IPCChannel> = new Map();
  private subscriptions: Map<string, Set<IPCChannel>> = new Map();

  /**
   * Register an IPC channel
   */
  register(channel: IPCChannel): void {
    const role = channel.getRole();
    this.channels.set(role, channel);

    // Setup message routing
    channel.on('message', (message: IPCMessage) => {
      this.routeMessage(channel, message);
    });
  }

  /**
   * Unregister an IPC channel
   */
  unregister(channel: IPCChannel): void {
    const role = channel.getRole();
    this.channels.delete(role);

    // Remove from subscriptions
    for (const [eventType, channels] of this.subscriptions) {
      channels.delete(channel);
    }
  }

  /**
   * Route message to destination
   */
  private routeMessage(fromChannel: IPCChannel, message: IPCMessage): void {
    // Broadcast to all subscribers if no specific destination
    if (!message.to) {
      this.broadcast(fromChannel, message);
      return;
    }

    // Route to specific destination
    const toChannel = this.channels.get(message.to);
    if (toChannel && toChannel !== fromChannel) {
      toChannel.send(message);
    }
  }

  /**
   * Broadcast message to all channels except sender
   */
  private broadcast(fromChannel: IPCChannel, message: IPCMessage): void {
    for (const [role, channel] of this.channels) {
      if (channel !== fromChannel) {
        channel.send(message).catch(() => {
          // Ignore send errors
        });
      }
    }
  }

  /**
   * Subscribe to message type
   */
  subscribe(channel: IPCChannel, eventType: string): void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType)!.add(channel);
  }

  /**
   * Get channel by role
   */
  getChannel(role: ProcessRole): IPCChannel | undefined {
    return this.channels.get(role);
  }

  /**
   * Get all registered channels
   */
  getAllChannels(): IPCChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Close all channels
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.channels.values()).map(
      channel => channel.close()
    );
    await Promise.all(closePromises);
    this.channels.clear();
    this.subscriptions.clear();
  }
}
