import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Clip } from '../audio/core/types';
import type { ProjectData } from '../state/projectStore';
import { compactProject, parseProject } from './projectFile';

// Share links carry the whole project (or one clip) compressed into the URL
// hash, so nothing is uploaded anywhere. Samples you loaded yourself live in
// your browser and aren't included.

export interface SharedClip {
  name: string;
  clip: Clip;
}

export type SharePayload = { kind: 'project'; project: ProjectData } | { kind: 'clip'; shared: SharedClip };

function baseUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

// Opens as its own saved project (?project=shared-…), so the receiver's work is never overwritten.
export function projectShareUrl(data: ProjectData): string {
  const encoded = compressToEncodedURIComponent(JSON.stringify(compactProject(data, { keepView: false })));
  const slot = `shared-${crypto.randomUUID().slice(0, 6)}`;
  return `${baseUrl()}?project=${slot}#project=${encoded}`;
}

export function clipShareUrl(shared: SharedClip): string {
  return `${baseUrl()}#clip=${compressToEncodedURIComponent(JSON.stringify(shared))}`;
}

export function readShareHash(hash: string): SharePayload | null {
  const match = /^#(project|clip)=(.+)$/.exec(hash);
  if (!match) return null;
  try {
    const json = decompressFromEncodedURIComponent(match[2]);
    if (!json) return null;
    const value: unknown = JSON.parse(json);
    if (match[1] === 'project') {
      const project = parseProject(value);
      return project ? { kind: 'project', project } : null;
    }
    const shared = value as Partial<SharedClip>;
    if (typeof shared?.name !== 'string' || (shared.clip?.kind !== 'drum' && shared.clip?.kind !== 'notes')) return null;
    return { kind: 'clip', shared: { name: shared.name, clip: shared.clip } };
  } catch {
    return null;
  }
}
