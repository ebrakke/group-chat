<script lang="ts">
  import { uploadFile, type UploadResult } from '$lib/api';
  
  interface Attachment extends UploadResult {
    uploading?: boolean;
    uploadProgress?: number;
    error?: string;
  }
  
  interface Props {
    attachments?: Attachment[];
    onAttachmentsChange?: (attachments: Attachment[]) => void;
  }
  
  let { attachments = $bindable([]), onAttachmentsChange }: Props = $props();
  
  let fileInput: HTMLInputElement;
  let isDragging = $state(false);
  
  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      // Create pending attachment
      const attachment: Attachment = {
        url: '',
        sha256: '',
        size: file.size,
        mimeType: file.type,
        filename: file.name,
        uploading: true,
        uploadProgress: 0,
      };
      
      attachments = [...attachments, attachment];
      const index = attachments.length - 1;
      
      try {
        // Upload file
        const result = await uploadFile(file, (percent) => {
          attachment.uploadProgress = percent;
          attachments = [...attachments]; // Trigger reactivity
        });
        
        // Update with result
        attachments[index] = {
          ...result,
          uploading: false,
          uploadProgress: 100,
        };
        attachments = [...attachments];
        
        if (onAttachmentsChange) {
          onAttachmentsChange(attachments.filter(a => !a.uploading && !a.error));
        }
      } catch (err: any) {
        // Mark as error
        attachment.error = err.message || 'Upload failed';
        attachment.uploading = false;
        attachments = [...attachments];
      }
    }
  }
  
  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      handleFiles(target.files);
    }
  }
  
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }
  
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
  }
  
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }
  
  function handlePaste(e: ClipboardEvent) {
    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      handleFiles(e.clipboardData.files);
    }
  }
  
  function removeAttachment(index: number) {
    attachments = attachments.filter((_, i) => i !== index);
    
    if (onAttachmentsChange) {
      onAttachmentsChange(attachments.filter(a => !a.uploading && !a.error));
    }
  }
  
  function openFileDialog() {
    fileInput.click();
  }
  
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  
  function isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }
</script>

<svelte:window onpaste={handlePaste} />

<input
  bind:this={fileInput}
  type="file"
  multiple
  onchange={handleFileSelect}
  class="hidden"
  accept="image/*,.pdf,.txt,.md,.zip"
/>

<!-- Upload button -->
<button
  type="button"
  onclick={openFileDialog}
  class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
  title="Attach file"
>
  📎
</button>

<!-- Drop zone overlay -->
{#if isDragging}
  <div
    class="fixed inset-0 z-50 bg-blue-500 bg-opacity-20 flex items-center justify-center pointer-events-none"
  >
    <div class="bg-white rounded-lg shadow-lg p-8 border-4 border-blue-500 border-dashed">
      <p class="text-2xl font-semibold text-blue-600">Drop files here to upload</p>
    </div>
  </div>
{/if}

<!-- Drag-and-drop overlay on input area -->
<div
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  class="absolute inset-0 {isDragging ? 'bg-blue-50 border-2 border-blue-500 border-dashed' : ''}"
></div>

<!-- Attachment previews -->
{#if attachments.length > 0}
  <div class="mt-2 flex flex-wrap gap-2">
    {#each attachments as attachment, index (index)}
      <div class="relative group bg-gray-100 rounded-lg p-2 max-w-xs">
        {#if attachment.uploading}
          <!-- Uploading state -->
          <div class="flex items-center gap-2">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-700 truncate">{attachment.filename}</p>
              <div class="mt-1 h-2 bg-gray-300 rounded-full overflow-hidden">
                <div
                  class="h-full bg-blue-600 transition-all duration-300"
                  style="width: {attachment.uploadProgress}%"
                ></div>
              </div>
              <p class="text-xs text-gray-500 mt-1">{attachment.uploadProgress}%</p>
            </div>
          </div>
        {:else if attachment.error}
          <!-- Error state -->
          <div class="flex items-center gap-2">
            <div class="flex-1">
              <p class="text-sm font-medium text-red-700 truncate">{attachment.filename}</p>
              <p class="text-xs text-red-600">{attachment.error}</p>
            </div>
            <button
              type="button"
              onclick={() => removeAttachment(index)}
              class="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        {:else if isImage(attachment.mimeType)}
          <!-- Image preview -->
          <div class="relative">
            <img
              src={attachment.url}
              alt={attachment.filename}
              class="max-w-xs max-h-40 rounded"
            />
            <button
              type="button"
              onclick={() => removeAttachment(index)}
              class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
            <p class="text-xs text-gray-600 mt-1 truncate">{attachment.filename}</p>
          </div>
        {:else}
          <!-- File preview -->
          <div class="flex items-center gap-2">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-700 truncate">{attachment.filename}</p>
              <p class="text-xs text-gray-500">{formatFileSize(attachment.size)}</p>
            </div>
            <button
              type="button"
              onclick={() => removeAttachment(index)}
              class="text-gray-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
