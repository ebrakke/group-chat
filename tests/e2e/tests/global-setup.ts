import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const exec = promisify(execCallback);

/**
 * Global setup for e2e tests
 * 
 * This runs once before all tests to ensure a clean database state.
 * 
 * Architecture Note:
 * - The frontend is a SvelteKit app that includes its own database and API routes
 * - Client-side requests go to the frontend (port 3002) which has /api/v1/* endpoints
 * - The database is in the frontend container at /data/relay-chat.db
 * 
 * Database location:
 * - Container: frontend
 * - Path: /data/relay-chat.db (in mounted volume)
 * 
 * Reset strategy:
 * - Delete the database files from the frontend container
 * - Restart the frontend container to trigger fresh database initialization
 * - Wait for services to stabilize
 */
async function globalSetup() {
  // In CI, docker-compose starts fresh (down -v + up --build), so no cleanup needed
  if (process.env.CI) {
    console.log('🧹 CI detected — skipping local cleanup (fresh containers)');
    return;
  }

  console.log('🧹 Cleaning up test environment...');
  
  const repoRoot = path.resolve(__dirname, '../../..');
  
  try {
    // Reset the database by removing it from the frontend container
    console.log('  → Removing database files from frontend container...');
    await exec(
      `docker compose -f docker-compose.dev.yml exec -T frontend rm -f /data/relay-chat.db /data/relay-chat.db-shm /data/relay-chat.db-wal`, 
      { cwd: repoRoot }
    );
    console.log('  ✓ Removed database files');
    
    // Restart frontend container to initialize with fresh database
    console.log('  → Restarting frontend container...');
    await exec(`docker compose -f docker-compose.dev.yml restart frontend`, { cwd: repoRoot });
    console.log('  ✓ Restarted frontend container');
    
    // Wait for the service to be ready
    console.log('  → Waiting for services to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Health check to verify frontend is responding
    console.log('  → Verifying frontend health...');
    const maxRetries = 15;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const { stdout } = await exec(`curl -f http://localhost:3002/api/v1/health`, { cwd: repoRoot });
        console.log('  ✓ Frontend API is healthy');
        break;
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new Error('Frontend API failed to become healthy after database reset');
        }
        console.log(`  ⏳ Waiting for frontend to be ready (attempt ${i + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Verify that there are no users in the database (clean state)
    console.log('  → Verifying clean database state...');
    try {
      const { stdout } = await exec(`curl -s http://localhost:3002/api/v1/auth/has-users`, { cwd: repoRoot });
      const data = JSON.parse(stdout);
      if (data.hasUsers) {
        console.warn('  ⚠️  Warning: Database still has users after reset. Tests may fail.');
      } else {
        console.log('  ✓ Database is clean (no users)');
      }
    } catch (error) {
      console.warn('  ⚠️  Could not verify database state:', error);
    }
    
    console.log('✅ Test environment ready');
  } catch (error) {
    console.error('❌ Failed to setup test environment:', error);
    throw error;
  }
}

export default globalSetup;
