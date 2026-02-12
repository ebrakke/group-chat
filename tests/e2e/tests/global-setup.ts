import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

async function globalSetup() {
  console.log('🧹 Cleaning up test environment...');
  
  try {
    // Reset the frontend database by removing it and restarting the container
    await exec('cd /root/.openclaw/workspace-acid_burn/relay-chat && docker compose -f docker-compose.dev.yml exec -T frontend rm -f /app/relay-chat.db /app/relay-chat.db-shm /app/relay-chat.db-wal');
    console.log('  ✓ Removed database files');
    
    // Restart frontend container to initialize with fresh database
    await exec('cd /root/.openclaw/workspace-acid_burn/relay-chat && docker compose -f docker-compose.dev.yml restart frontend');
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
