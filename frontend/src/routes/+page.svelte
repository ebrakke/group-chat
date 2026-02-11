<script lang="ts">
  // TODO: Check auth, redirect to /login if not authenticated
</script>

<div class="flex h-screen">
  <!-- Sidebar -->
  <aside class="w-60 border-r bg-muted/40 p-4">
    <h2 class="text-lg font-semibold mb-4">Relay Chat</h2>
    <nav class="space-y-1">
      <a href="/" class="block px-2 py-1 rounded bg-accent text-accent-foreground"># general</a>
    </nav>
  </aside>

  <!-- Main chat area -->
  <main class="flex-1 flex flex-col">
    <header class="border-b px-4 py-3">
      <h1 class="font-semibold"># general</h1>
    </header>
    <div class="flex-1 overflow-y-auto p-4">
      <p class="text-muted-foreground">No messages yet. Say something!</p>
    </div>
    <div class="border-t p-4">
      <input type="text" placeholder="Message #general" class="w-full rounded border px-3 py-2" />
    </div>
  </main>
</div>
