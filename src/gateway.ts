/**
 * UltraX Gateway
 *
 * Message router between interfaces (Web UI, Google Chat, CLI) and Ultrapilot plugin.
 * Provides unified session management across all interfaces.
 */

export interface UltraXMessage {
  sessionId: string;
  userId: string;
  interface: 'web' | 'chat' | 'cli';
  command: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface UltraXResponse {
  sessionId: string;
  interface: 'web' | 'chat' | 'cli';
  message: string;
  agent?: string;
  phase?: string;
  status?: 'running' | 'paused' | 'completed' | 'failed';
  hud?: string;
  timestamp: Date;
}

export interface UltraXSession {
  sessionId: string;
  userId: string;
  interface: 'web' | 'chat' | 'cli';
  startTime: Date;
  lastActivity: Date;
  activeAgents?: string[];
  currentPhase?: string;
  messages: UltraXMessage[];
  state: {
    autopilot?: string;
    ralph?: string;
    ultraqa?: string;
    validation?: string;
  };
}

export class UltraXGateway {
  private sessions: Map<string, UltraXSession>;
  private ulrapilotPath: string;
  private statePath: string;

  constructor(
    private options: {
      ulrapilotPath?: string;
      statePath?: string;
      sessionTimeout?: number;
    } = {}
  ) {
    this.sessions = new Map();
    this.ulrapilotPath = options.ulrapilotPath || `${process.env.HOME}/.claude/plugins/ultrapilot`;
    this.statePath = options.statePath || `${process.cwd()}/.ultra/state`;

    // Clean up expired sessions every 5 minutes
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
  }

  /**
   * Handle incoming message from any interface
   */
  async handleMessage(message: UltraXMessage): Promise<UltraXResponse> {
    let session = this.sessions.get(message.sessionId);

    if (!session) {
      session = await this.createSession(message.sessionId, message.userId, message.interface);
    }

    // Update session activity
    session.lastActivity = new Date();
    session.messages.push(message);

    // Route command to Ultrapilot
    const response = await this.routeToUltrapilot(message, session);

    // Update session state
    if (response.agent) {
      session.activeAgents = session.activeAgents || [];
      if (!session.activeAgents.includes(response.agent)) {
        session.activeAgents.push(response.agent);
      }
    }

    if (response.phase) {
      session.currentPhase = response.phase;
    }

    return response;
  }

  /**
   * Create new session
   */
  async createSession(
    sessionId: string,
    userId: string,
    interfaceType: 'web' | 'chat' | 'cli'
  ): Promise<UltraXSession> {
    const session: UltraXSession = {
      sessionId,
      userId,
      interface: interfaceType,
      startTime: new Date(),
      lastActivity: new Date(),
      messages: [],
      state: {}
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): UltraXSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Switch session to different interface
   */
  async switchSession(sessionId: string, targetInterface: 'web' | 'chat' | 'cli'): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.interface = targetInterface;
    session.lastActivity = new Date();

    // Send notification to target interface
    await this.notifyInterfaceSwitch(session);
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId: string): {
    exists: boolean;
    interface?: string;
    activeAgents?: string[];
    currentPhase?: string;
    messageCount: number;
    uptime: number;
  } {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { exists: false, messageCount: 0, uptime: 0 };
    }

    return {
      exists: true,
      interface: session.interface,
      activeAgents: session.activeAgents,
      currentPhase: session.currentPhase,
      messageCount: session.messages.length,
      uptime: Date.now() - session.startTime.getTime()
    };
  }

  /**
   * Terminate session
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Cancel any active Ultrapilot modes
    await this.cancelUltrapilotModes(session);

    // Remove session
    this.sessions.delete(sessionId);
  }

  /**
   * Route command to Ultrapilot plugin
   */
  private async routeToUltrapilot(
    message: UltraXMessage,
    session: UltraXSession
  ): Promise<UltraXResponse> {
    // Parse command
    const command = this.parseCommand(message.command);

    // Execute command through Ultrapilot
    const result = await this.executeUltrapilotCommand(command, session);

    // Format response for source interface
    return this.formatResponse(message, result);
  }

  /**
   * Parse user command
   */
  private parseCommand(command: string): {
    type: 'ultrapilot' | 'ultra-team' | 'ultra-ralph' | 'ultra-review' | 'status' | 'cancel' | 'hud';
    args: string[];
  } {
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === '/ultrapilot' || cmd === 'ultrapilot') {
      return { type: 'ultrapilot', args: parts.slice(1) };
    } else if (cmd === '/ultra-team' || cmd === 'ultra-team') {
      return { type: 'ultra-team', args: parts.slice(1) };
    } else if (cmd === '/ultra-ralph' || cmd === 'ultra-ralph') {
      return { type: 'ultra-ralph', args: parts.slice(1) };
    } else if (cmd === '/ultra-review' || cmd === 'ultra-review') {
      return { type: 'ultra-review', args: parts.slice(1) };
    } else if (cmd === 'status' || cmd === '/status') {
      return { type: 'status', args: [] };
    } else if (cmd === 'cancel' || cmd === '/cancel' || cmd === '/ultra-cancel') {
      return { type: 'cancel', args: [] };
    } else if (cmd === 'hud' || cmd === '/hud' || cmd === '/ultra-hud') {
      return { type: 'hud', args: [] };
    } else {
      // Default to autopilot
      return { type: 'ultrapilot', args: parts };
    }
  }

  /**
   * Execute Ultrapilot command
   */
  private async executeUltrapilotCommand(
    command: ReturnType<typeof this.parseCommand>,
    session: UltraXSession
  ): Promise<{
    message: string;
    agent?: string;
    phase?: string;
    status?: string;
    hud?: string;
  }> {
    // This will interface with the actual Ultrapilot plugin
    // For now, return mock response

    switch (command.type) {
      case 'ultrapilot':
        return {
          message: `Starting Ultrapilot: ${command.args.join(' ')}`,
          agent: 'ultra:analyst',
          phase: 'expansion',
          status: 'running'
        };

      case 'ultra-team':
        return {
          message: `Starting team mode with ${command.args[0] || 3} agents`,
          agent: 'ultra:team-lead',
          phase: 'planning',
          status: 'running'
        };

      case 'ultra-ralph':
        return {
          message: `Starting Ralph loop: ${command.args.join(' ')}`,
          agent: 'ultra:ralph',
          phase: 'execution',
          status: 'running'
        };

      case 'ultra-review':
        return {
          message: `Starting multi-dimensional review: ${command.args.join(' ')}`,
          agent: 'ultra:code-reviewer',
          phase: 'validation',
          status: 'running'
        };

      case 'status':
        return {
          message: `Session: ${session.sessionId}\nInterface: ${session.interface}\nActive Agents: ${session.activeAgents?.join(', ') || 'none'}\nPhase: ${session.currentPhase || 'idle'}`,
          status: 'paused'
        };

      case 'cancel':
        return {
          message: 'Cancelling active Ultrapilot modes...',
          status: 'cancelled'
        };

      case 'hud':
        return {
          message: this.generateHUD(session),
          hud: this.generateHUD(session),
          status: 'paused'
        };

      default:
        return {
          message: `Unknown command: ${command.type}`,
          status: 'failed'
        };
    }
  }

  /**
   * Format response for source interface
   */
  private formatResponse(
    message: UltraXMessage,
    result: { message: string; agent?: string; phase?: string; status?: string; hud?: string }
  ): UltraXResponse {
    const response = {
      sessionId: message.sessionId,
      interface: message.interface,
      message: result.message,
      timestamp: new Date(),
      agent: result.agent,
      phase: result.phase,
      status: result.status as any,
      hud: result.hud
    } as UltraXResponse;

    // Add HUD for chat interfaces
    if (message.interface === 'chat' && !result.hud) {
      const session = this.sessions.get(message.sessionId);
      if (session) {
        response.hud = this.generateHUD(session);
      }
    }

    return response;
  }

  /**
   * Generate HUD for session
   */
  private generateHUD(session: UltraXSession): string {
    const uptime = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
    const minutes = Math.floor(uptime / 60);
    const seconds = uptime % 60;

    return `[ULTRA] ${session.currentPhase?.toUpperCase() || 'IDLE'} | interface:${session.interface} | agents:${session.activeAgents?.length || 0} | uptime:${minutes}m${seconds}s`;
  }

  /**
   * Cancel active Ultrapilot modes for session
   */
  private async cancelUltrapilotModes(session: UltraXSession): Promise<void> {
    // Read state files and cancel active modes
    // This will interface with Ultrapilot's state management
  }

  /**
   * Notify interface switch
   */
  private async notifyInterfaceSwitch(session: UltraXSession): Promise<void> {
    // Send notification to target interface
    // This will use Relay WebSocket or Google Chat API
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const timeout = this.options.sessionTimeout || 60 * 60 * 1000; // 1 hour default

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > timeout) {
        console.log(`Cleaning up expired session: ${sessionId}`);
        this.sessions.delete(sessionId);
      }
    }
  }
}

/**
 * UltraX Gateway Server
 *
 * Express server for handling HTTP/WebSocket requests from Web UI and Google Chat webhooks
 */

export async function startGatewayServer(options: {
  port?: number;
  ulrapilotPath?: string;
  statePath?: string;
} = {}) {
  const gateway = new UltraXGateway(options);
  const port = options.port || 3001;

  // Express server will be set up here
  // For now, just log gateway initialization
  console.log(`UltraX Gateway initialized on port ${port}`);
  console.log(`Ultrapilot path: ${gateway['ulrapilotPath']}`);
  console.log(`State path: ${gateway['statePath']}`);

  return gateway;
}
