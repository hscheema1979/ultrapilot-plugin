/**
 * Access Control for UltraX Gateway
 * Controls which Relay instances can access the Gateway
 */

export interface AccessControlEntry {
  relayId: string;
  hostname: string;
  allowed: boolean;
  note?: string;
}

export class GatewayAccessControl {
  private accessList: Map<string, AccessControlEntry> = new Map();

  constructor() {
    this.initializeDefaultACL();
  }

  /**
   * Initialize default access control list
   * Allow local Relay by default
   */
  private initializeDefaultACL(): void {
    // Allow localhost
    this.addEntry({
      relayId: 'local',
      hostname: 'localhost',
      allowed: true,
      note: 'Local Relay instance'
    });
  }

  /**
   * Add or update an access control entry
   */
  addEntry(entry: AccessControlEntry): void {
    const key = `${entry.relayId}:${entry.hostname}`;
    this.accessList.set(key, entry);
  }

  /**
   * Remove an access control entry
   */
  removeEntry(relayId: string, hostname: string): void {
    const key = `${relayId}:${hostname}`;
    this.accessList.delete(key);
  }

  /**
   * Check if a Relay instance is allowed access
   */
  isAllowed(relayId: string, hostname: string): boolean {
    const key = `${relayId}:${hostname}`;
    const entry = this.accessList.get(key);

    // Default deny
    if (!entry) {
      return false;
    }

    return entry.allowed;
  }

  /**
   * Get all access control entries
   */
  getAllEntries(): AccessControlEntry[] {
    return Array.from(this.accessList.values());
  }

  /**
   * Allow a Relay instance
   */
  allow(relayId: string, hostname: string, note?: string): void {
    this.addEntry({
      relayId,
      hostname,
      allowed: true,
      note
    });
  }

  /**
   * Deny a Relay instance
   */
  deny(relayId: string, hostname: string, note?: string): void {
    this.addEntry({
      relayId,
      hostname,
      allowed: false,
      note
    });
  }

  /**
   * Load ACL from configuration file
   */
  loadFromFile(configPath: string): void {
    try {
      const fs = require('fs');
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (data.accessList && Array.isArray(data.accessList)) {
          data.accessList.forEach((entry: AccessControlEntry) => {
            const key = `${entry.relayId}:${entry.hostname}`;
            this.accessList.set(key, entry);
          });
        }
      }
    } catch (error) {
      console.error('Failed to load ACL:', error);
    }
  }

  /**
   * Save ACL to configuration file
   */
  saveToFile(configPath: string): void {
    try {
      const fs = require('fs');
      const data = {
        accessList: this.getAllEntries(),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save ACL:', error);
    }
  }
}

// Singleton instance
const acl = new GatewayAccessControl();

export default acl;
