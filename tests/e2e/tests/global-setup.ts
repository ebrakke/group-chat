import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const exec = promisify(execCallback);

async function globalSetup() {
  // In CI, docker-compose starts fresh (down -v + up --build), so no cleanup needed
  if (process.env.CI) {
    console.log('🧹 CI detected — skipping local cleanup (fresh containers)');
    return;
  }

  console.log('🧹 Cleaning up test environment...');
  
  const repoRoot = path.resolve(__dirname, '../../..');
  
  try {
    // Reset the frontend database by removing it and restarting the container
    await exec(`docker compose -f docker-compose.dev.yml exec -T frontend rm -f /app/relay-chat.db /app/relay-chat.db-shm /app/relay-chat.db-wal`, { cwd: repoRoot });
    console.log('  ✓ Removed database files');
    
    // Restart frontend container to initialize with fresh database
    await exec(`docker compose -f docker-compose.dev.yml restart frontend`, { cwd: repoRoot });
    console.log('  ✓ Restarted frontend container');
    
    // Wait for the service to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('  ✓ Waiting for services to stabilize...');
    
    console.log('✅ Test environment ready');
  } catch (error) {
    console.error('❌ Failed to setup test environment:', error);
    throw error;
  }
}

export default globalSetup;
