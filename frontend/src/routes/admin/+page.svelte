<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  let loading = $state(true);
  let user: any = $state(null);
  let invites: any[] = $state([]);
  let generatingInvite = $state(false);
  let error = $state('');
  
  const API_URL = import.meta.env.VITE_API_URL || '';
  
  onMount(async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      goto('/login');
      return;
    }
    
    try {
      // Check if user is admin
      const response = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        goto('/login');
        return;
      }
      
      user = await response.json();
      
      if (user.role !== 'admin') {
        goto('/');
        return;
      }
      
      // Load invites
      await loadInvites(token);
      
      loading = false;
    } catch (err) {
      console.error('Error loading admin data:', err);
      goto('/login');
    }
  });
  
  async function loadInvites(token: string) {
    try {
      const response = await fetch(`${API_URL}/api/v1/invites`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        invites = await response.json();
      }
    } catch (err) {
      console.error('Error loading invites:', err);
    }
  }
  
  async function generateInvite() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    generatingInvite = true;
    error = '';
    
    try {
      const response = await fetch(`${API_URL}/api/v1/invites`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        const data = await response.json();
        error = data.error || 'Failed to generate invite';
        return;
      }
      
      await loadInvites(token);
    } catch (err: any) {
      error = err.message || 'Network error';
    } finally {
      generatingInvite = false;
    }
  }
  
  async function revokeInvite(code: string) {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    if (!confirm('Are you sure you want to revoke this invite?')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/v1/invites/${code}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        await loadInvites(token);
      }
    } catch (err) {
      console.error('Error revoking invite:', err);
    }
  }
  
  async function copyToClipboard(code: string) {
    try {
      const baseUrl = window.location.origin;
      const inviteUrl = `${baseUrl}/invite/${code}`;
      await navigator.clipboard.writeText(inviteUrl);
      // Show success feedback (could be enhanced with a toast notification)
      alert('Invite link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy invite link. Please try again.');
    }
  }
</script>

{#if loading}
  <div class="flex min-h-screen items-center justify-center">
    <p class="text-gray-600">Loading...</p>
  </div>
{:else}
  <div class="min-h-screen bg-gray-50">
    <div class="mx-auto max-w-4xl p-8">
      <div class="mb-8">
        <a href="/" class="text-blue-600 hover:text-blue-700 text-sm">
          ← Back to chat
        </a>
      </div>
      
      <div class="bg-white rounded-lg shadow-md p-6">
        <h1 class="text-2xl font-bold text-gray-900 mb-6">Admin Panel</h1>
        
        {#if error}
          <div class="mb-4 rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-800">{error}</p>
          </div>
        {/if}
        
        <div class="mb-8">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-gray-900">Invite Links</h2>
            <button
              onclick={generateInvite}
              disabled={generatingInvite}
              class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingInvite ? 'Generating...' : 'Generate Invite'}
            </button>
          </div>
          
          {#if invites.length === 0}
            <p class="text-gray-500 text-sm">No invites yet. Generate one to invite people.</p>
          {:else}
            <div class="space-y-3">
              {#each invites as invite}
                <div class="border rounded-md p-4 flex items-center justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center space-x-2 mb-1">
                      <code class="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                        {invite.code}
                      </code>
                      <button
                        onclick={() => copyToClipboard(invite.code)}
                        class="text-blue-600 hover:text-blue-700 text-xs"
                        title="Copy invite link"
                      >
                        Copy invite link
                      </button>
                    </div>
                    <p class="text-xs text-gray-500">
                      Uses: {invite.useCount}{invite.maxUses ? ` / ${invite.maxUses}` : ' (unlimited)'}
                      · Created {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onclick={() => revokeInvite(invite.code)}
                    class="ml-4 text-red-600 hover:text-red-700 text-sm"
                  >
                    Revoke
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        
        <div class="border-t pt-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h2>
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gray-50 rounded-md p-4">
              <p class="text-sm text-gray-600">Active Invites</p>
              <p class="text-2xl font-bold text-gray-900">{invites.length}</p>
            </div>
            <div class="bg-gray-50 rounded-md p-4">
              <p class="text-sm text-gray-600">Total Uses</p>
              <p class="text-2xl font-bold text-gray-900">
                {invites.reduce((sum, inv) => sum + inv.useCount, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
