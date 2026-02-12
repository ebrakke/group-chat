import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default async function globalSetup() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const composeFile = path.join(repoRoot, 'docker-compose.dev.yml');

  const resetScript = `
    const Database = require('better-sqlite3');
    const db = new Database('/app/relay-chat.db');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    const deleteOrder = ['message_reactions', 'thread_replies', 'messages', 'invites', 'sessions', 'users'];
    db.pragma('foreign_keys = OFF');
    for (const name of deleteOrder) {
      if (tables.includes(name)) db.prepare('DELETE FROM ' + name).run();
    }
    db.pragma('foreign_keys = ON');
  `;

  execFileSync(
    'docker',
    ['compose', '-f', composeFile, 'exec', '-T', 'frontend', 'node', '-e', resetScript],
    { stdio: 'pipe' }
  );
}
