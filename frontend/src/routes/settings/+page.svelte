<script lang="ts">
  // TODO: Load user profile, handle updates
</script>

<div class="max-w-lg mx-auto p-8 space-y-6">
  <h1 class="text-2xl font-bold">Settings</h1>
  <form class="space-y-4">
    <div>
      <label for="displayName" class="block text-sm font-medium">Display Name</label>
      <input id="displayName" type="text" class="mt-1 w-full rounded border px-3 py-2" />
    </div>
    <div>
      <label for="avatar" class="block text-sm font-medium">Avatar</label>
      <input id="avatar" type="file" accept="image/*" class="mt-1" />
    </div>
    <button type="submit" class="rounded bg-primary px-4 py-2 text-primary-foreground">
      Save Changes
    </button>
  </form>
</div>
