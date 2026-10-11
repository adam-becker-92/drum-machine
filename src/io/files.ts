import { showToast } from '../state/toastStore';
import { putSample } from './sampleStore';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'untitled';
}

// Opens the browser's file picker; resolves null if the user cancels.
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// Checks the file decodes as audio, then keeps it in the browser's sample library.
export async function importAudioFile(file: File, ctx: BaseAudioContext): Promise<{ id: string; name: string }> {
  const data = await file.arrayBuffer();
  await ctx.decodeAudioData(data.slice(0));
  const id = `user:${crypto.randomUUID().slice(0, 12)}`;
  await putSample({ id, name: file.name, data, added: Date.now() });
  return { id, name: file.name };
}

// Copies a share link; resolves false if the clipboard isn't available (show the link instead).
export async function copyLink(url: string, what: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    showToast(`${what} link copied to the clipboard.`);
    return true;
  } catch {
    return false;
  }
}
