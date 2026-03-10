import { EventEmitter } from 'events';

/**
 * WebSocketMock - Mock WebSocket implementation for testing
 *
 * Simulates WebSocket behavior with event emission support.
 * Used in AgentMessageBus integration tests.
 */
export class WebSocketMock extends EventEmitter {
  public readyState: number;
  public sentMessages: string[] = [];
  public url: string;

  // WebSocket ready states
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor(url: string) {
    super();
    this.url = url;
    this.readyState = WebSocketMock.CONNECTING;

    // Simulate connection established
    process.nextTick(() => {
      this.readyState = WebSocketMock.OPEN;
      this.emit('open');
    });
  }

  /**
   * Send data through WebSocket
   */
  send(data: string): void {
    if (this.readyState !== WebSocketMock.OPEN) {
      throw new Error('WebSocket is not open');
    }

    this.sentMessages.push(data);
  }

  /**
   * Close WebSocket connection
   */
  close(code?: number, reason?: string): void {
    this.readyState = WebSocketMock.CLOSING;

    process.nextTick(() => {
      this.readyState = WebSocketMock.CLOSED;
      this.emit('close', { code, reason });
    });
  }

  /**
   * Simulate receiving a message from server
   */
  simulateMessage(data: string): void {
    if (this.readyState === WebSocketMock.OPEN) {
      this.emit('message', { data });
    }
  }

  /**
   * Simulate WebSocket error
   */
  simulateError(error: Error): void {
    this.emit('error', error);
  }

  /**
   * Simulate disconnection
   */
  simulateDisconnect(): void {
    this.readyState = WebSocketMock.CLOSED;
    this.emit('close');
  }

  /**
   * Simulate reconnection
   */
  simulateReconnect(): void {
    this.readyState = WebSocketMock.CONNECTING;

    process.nextTick(() => {
      this.readyState = WebSocketMock.OPEN;
      this.emit('open');
    });
  }

  /**
   * Get all sent messages
   */
  getSentMessages(): string[] {
    return [...this.sentMessages];
  }

  /**
   * Clear sent messages (for test isolation)
   */
  clearSentMessages(): void {
    this.sentMessages = [];
  }

  /**
   * Reset mock state (for test isolation)
   */
  reset(): void {
    this.sentMessages = [];
    this.readyState = WebSocketMock.CONNECTING;
    this.removeAllListeners();
  }
}

/**
 * Create a WebSocket mock for testing
 */
export function createWebSocketMock(url: string = 'ws://localhost:8080'): WebSocketMock {
  return new WebSocketMock(url);
}

/**
 * Stub global WebSocket for tests
 */
export function stubWebSocket(): void {
  // @ts-ignore
  global.WebSocket = WebSocketMock;
}

/**
 * Restore global WebSocket
 */
export function restoreWebSocket(): void {
  // @ts-ignore
  delete global.WebSocket;
}
