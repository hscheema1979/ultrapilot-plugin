#!/usr/bin/env nodejs
/**
 * Workspace Federation API
 * Shows mounted peer workspaces with machine labels
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

interface PeerWorkspace {
  hostname: string;
  mountPath: string;
  accessible: boolean;
  workspaceCount: number;
  local: boolean;
}

export async function getPeerWorkspaces(): Promise<PeerWorkspace[]> {
  const workspaces: PeerWorkspace[] = [];
  const homeDir = process.env.HOME || '/home/ubuntu';
  const remoteDir = join(homeDir, 'remote');

  // Get current hostname
  const thisHost = execSync('hostname', { encoding: 'utf-8' }).trim();

  // Check which Tailscale host this is
  let tailscaleHost = '';
  try {
    tailscaleHost = execSync('tailscale status --self 2>/dev/null | grep -v Status: | head -1 | awk \'{print $2}\' | cut -d. -f1', {
      encoding: 'utf-8'
    }).trim();
  } catch (e) {
    // Tailscale not available
  }

  const localName = tailscaleHost || thisHost;

  // Add local workspaces
  const localProjects = join(homeDir, 'projects');
  if (existsSync(localProjects)) {
    try {
      const items = readdirSync(localProjects);
      workspaces.push({
        hostname: localName,
        mountPath: localProjects,
        accessible: true,
        workspaceCount: items.filter(i => !i.startsWith('.')).length,
        local: true
      });
    } catch (e) {
      // Can't read
    }
  }

  // Check remote mounts
  if (existsSync(remoteDir)) {
    const peers = readdirSync(remoteDir);

    for (const peer of peers) {
      if (peer.startsWith('.')) continue; // Skip hidden

      const peerPath = join(remoteDir, peer);
      const peerProjects = join(peerPath, 'projects');

      // Check if mounted
      try {
        const isMounted = execSync(
          `mountpoint -q "${peerPath}" 2>/dev/null && echo "mounted" || echo "not mounted"`,
          { encoding: 'utf-8' }
        ).trim() === 'mounted';

        let workspaceCount = 0;
        if (existsSync(peerProjects)) {
          try {
            const items = readdirSync(peerProjects);
            workspaceCount = items.filter(i => !i.startsWith('.')).length;
          } catch (e) {
            // Can't count
          }
        }

        workspaces.push({
          hostname: peer,
          mountPath: peerPath,
          accessible: isMounted,
          workspaceCount,
          local: false
        });
      } catch (e) {
        // Mount check failed
        workspaces.push({
          hostname: peer,
          mountPath: peerPath,
          accessible: false,
          workspaceCount: 0,
          local: false
        });
      }
    }
  }

  return workspaces;
}

// CLI test
if (import.meta.url === `file://${process.argv[1]}`) {
  getPeerWorkspaces().then(workspaces => {
    console.log(JSON.stringify(workspaces, null, 2));
  });
}

export default getPeerWorkspaces;
