import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import crypto from 'crypto';

export const uploadRoutes = new Hono();

// Allowed file types
const ALLOWED_TYPES: Record<string, string[]> = {
  'image': ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
  'document': ['application/pdf', 'text/plain', 'text/markdown'],
  'archive': ['application/zip', 'application/x-zip-compressed'],
};

const ALLOWED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'pdf', 'txt', 'md',
  'zip'
]);

/**
 * POST /upload
 * Upload a file to Blossom server
 */
uploadRoutes.post('/', authMiddleware, async (c) => {
  try {
    const blossomUrl = process.env.BLOSSOM_URL || 'http://blossom:3335';
    const maxUploadSize = parseInt(process.env.MAX_UPLOAD_SIZE || '52428800'); // 50MB default

    // Get the file from multipart form data
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Check file size
    if (file.size > maxUploadSize) {
      return c.json({ 
        error: `File too large. Maximum size is ${Math.round(maxUploadSize / 1024 / 1024)}MB` 
      }, 400);
    }

    // Check file type
    const mimeType = file.type;
    const isAllowedType = Object.values(ALLOWED_TYPES)
      .flat()
      .includes(mimeType);

    if (!isAllowedType) {
      return c.json({ error: `File type ${mimeType} not allowed` }, 400);
    }

    // Check file extension
    const filename = file.name;
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return c.json({ error: `File extension .${ext} not allowed` }, 400);
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Compute SHA-256 hash
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    const sha256 = hash.digest('hex');

    // Create Nostr auth event for Blossom
    const user = c.get('user');
    const serverPrivkeyHex = process.env.SERVER_PRIVKEY;
    
    if (!serverPrivkeyHex) {
      return c.json({ error: 'Server not configured for uploads' }, 500);
    }

    // Import nostr-tools for auth
    const { finalizeEvent, getPublicKey } = await import('nostr-tools');
    const serverPrivkey = Uint8Array.from(Buffer.from(serverPrivkeyHex, 'hex'));
    const serverPubkey = getPublicKey(serverPrivkey);

    // Create Blossom auth event (kind 24242)
    // Reference: https://github.com/hzrd149/blossom/blob/master/Server.md#authorization
    const authEvent = finalizeEvent({
      kind: 24242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'upload'],
        ['x', sha256],
        ['size', file.size.toString()],
        ['expiration', (Math.floor(Date.now() / 1000) + 60).toString()], // 60 second expiration
      ],
      content: '',
    }, serverPrivkey);

    // Upload to Blossom
    const uploadUrl = `${blossomUrl}/upload`;
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mimeType }), filename);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Nostr ${btoa(JSON.stringify(authEvent))}`,
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Blossom upload failed:', errorText);
      return c.json({ error: 'Upload to storage server failed' }, 500);
    }

    const uploadResult = await uploadResponse.json();

    // Blossom returns the URL to the uploaded blob
    const url = uploadResult.url || `${blossomUrl}/${sha256}`;

    return c.json({
      url,
      sha256,
      size: file.size,
      mimeType,
      filename,
    });

  } catch (err: any) {
    console.error('Upload error:', err);
    return c.json({ error: err.message || 'Upload failed' }, 500);
  }
});
