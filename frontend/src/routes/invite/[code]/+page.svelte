<script lang="ts">
  import { page } from '$app/stores';
  // TODO: Validate invite code, show signup form
</script>

<div class="flex min-h-screen items-center justify-center">
  <div class="w-full max-w-sm space-y-6 p-8">
    <h1 class="text-2xl font-bold text-center">Join Relay Chat</h1>
    <p class="text-center text-muted-foreground">You've been invited!</p>
    <form class="space-y-4">
      <div>
        <label for="username" class="block text-sm font-medium">Username</label>
        <input id="username" type="text" class="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label for="displayName" class="block text-sm font-medium">Display Name</label>
        <input id="displayName" type="text" class="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label for="password" class="block text-sm font-medium">Password</label>
        <input id="password" type="password" class="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <button type="submit" class="w-full rounded bg-primary px-4 py-2 text-primary-foreground">
        Create Account
      </button>
    </form>
  </div>
</div>
