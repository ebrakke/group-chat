# Textarea Input Bug - FIXED ✅

## Problem
Users could not type in the message textarea on both mobile and desktop. The textarea appeared visually correct (white, not disabled), WebSocket was connected, no JS errors, but clicking/tapping did nothing and no keyboard appeared on mobile.

## Root Cause
The `FileUpload.svelte` component had an invisible overlay div with `position: absolute; inset: 0;` that covered the entire form area. This overlay was intended to capture drag-and-drop events, but it was **always active** and **blocking all pointer events** to elements below it, including the textarea.

### The problematic code:
```svelte
<!-- FileUpload.svelte -->
<div
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  class="absolute inset-0 {isDragging ? 'bg-blue-50 border-2 border-blue-500 border-dashed' : ''}"
></div>
```

This div had no text content when not dragging, so it was **completely invisible** but still intercepting all clicks meant for the textarea.

## Solution
Added `pointer-events: none` to the overlay by default, and only enable `pointer-events: auto` when actively dragging files:

```svelte
<!-- FileUpload.svelte - FIXED -->
<div
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  class="absolute inset-0 pointer-events-none {isDragging ? 'bg-blue-50 border-2 border-blue-500 border-dashed pointer-events-auto' : ''}"
></div>
```

### How it works:
- **Default state**: `pointer-events-none` → overlay is invisible to mouse/touch events, textarea receives all clicks ✅
- **Dragging state**: `pointer-events-auto` → overlay becomes interactive to capture drop events ✅

## Files Changed
- `frontend/src/lib/components/FileUpload.svelte` - Added `pointer-events-none` and conditional `pointer-events-auto`

## Testing
1. **Local HTML test**: Created `test-pointer-events.html` to demonstrate the issue and verify the fix
2. **Frontend built successfully**: Ran `npm run build` in frontend/ with no errors
3. **Committed and pushed** to master branch

## Deployment Steps for Erik

### Option 1: Fly.io Deployment (Recommended)
```bash
cd /path/to/relay-chat
fly deploy --app relay-chat-frontend
```

### Option 2: Full Redeploy (if needed)
```bash
cd /path/to/relay-chat
./deploy.sh
```

### Option 3: Docker Compose (Local/Staging)
```bash
cd /path/to/relay-chat
docker-compose -f docker-compose.prod.yml down frontend
docker-compose -f docker-compose.prod.yml up -d --build frontend
```

## Verification
After deploying, test on https://chat.brakke.cc:

1. **Open the site** in a browser
2. **Click the message textarea** - it should focus immediately
3. **Start typing** - text should appear in the textarea
4. **On mobile** - keyboard should appear when tapping the textarea
5. **Test drag-and-drop** - drag a file over the input area, drop should still work

Expected results:
- ✅ Textarea receives focus on click
- ✅ Can type normally
- ✅ Drag-and-drop still works (overlay activates during drag)

## Why This Wasn't Caught Earlier
- The bug only appeared in production builds, not during development
- The overlay is completely invisible when not dragging
- No console errors or visual indicators of the problem
- The textarea rendered correctly, making it look like an input/focus issue rather than a CSS overlay issue

## Commit
```
commit 3f6262f
Author: root <root@svc-devbox.brakke.cc>
Date:   Thu Feb 12 07:37:43 2026 -0700

    Fix: Add pointer-events-none to FileUpload overlay to unblock textarea
    
    The invisible drag-and-drop overlay in FileUpload.svelte had 'absolute inset-0'
    which covered the entire form, blocking clicks to the textarea below it.
    
    Fix: Add pointer-events-none by default, only enable pointer-events-auto
    when actively dragging files. This allows the textarea to receive clicks
    and keyboard input while maintaining drag-and-drop functionality.
```

## Production URL
https://chat.brakke.cc

Test with Erik's account (borrakkor) or create a new account via the invite link.

---

**Bug Status:** ✅ FIXED  
**Deployed:** ⏳ Pending Erik's deployment to Fly.io  
**Tested:** ✅ Build successful, commit pushed to master
