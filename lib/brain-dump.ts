/**
 * Brain dump: turn a voice/text capture into a real markdown memory file
 * inside the configured knowledge store (BRAIN_STORE). The file is the
 * source of truth; a future embedding provider picks it up from disk.
 */
import fs from 'node:fs';
import path from 'node:path';
import { brainStorePath } from '@/lib/brain';

export type CaptureInput = { text: string; title?: string; type?: string; slug?: string };
export type CaptureOutcome =
  | { ok: true; slug: string; contentHash: string }
  | { ok: false; error: string };

export type BrainDumpInput = {
  text: string;
  title?: string;
  folder: string; // top-level brain-store folder, e.g. 'inbox' | 'ideas'
  tags: string[]; // business tags etc. — #aac, #apps …
};

export type BrainDumpResult = { relPath: string; title: string };

export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'untitled';
}

export function writeBrainDump(input: BrainDumpInput, storePath?: string): BrainDumpResult {
  const store = storePath ?? brainStorePath();
  if (!store) throw new Error('no knowledge store configured — set BRAIN_STORE in .env.local');
  const text = input.text.trim();
  if (!text) throw new Error('brain dump is empty');
  if (!/^[a-z0-9-]+$/i.test(input.folder)) {
    throw new Error(`invalid folder: ${input.folder} — one top-level brain-store folder, no slashes`);
  }

  const title = input.title?.trim() || text.split(/\s+/).slice(0, 7).join(' ');
  const date = new Date().toISOString().slice(0, 10);
  const base = `${date}-${slugifyTitle(title)}`;

  const dir = path.join(store, input.folder);
  fs.mkdirSync(dir, { recursive: true });

  let slug = base;
  for (let n = 2; fs.existsSync(path.join(dir, `${slug}.md`)); n++) slug = `${base}-${n}`;

  const tags = input.tags.map((t) => t.trim()).filter(Boolean);
  const body = [
    '---',
    `created: ${new Date().toISOString()}`,
    'source: founder-os-brain-dump',
    `tags: [${tags.join(', ')}]`,
    '---',
    '',
    `# ${title}`,
    '',
    text,
    '',
  ].join('\n');

  const relPath = `${input.folder}/${slug}.md`;
  fs.writeFileSync(path.join(store, relPath), body, 'utf8');
  return { relPath, title };
}

export type BrainDumpDeps = {
  /** local markdown writer — defaults to writeBrainDump */
  writeLocal?: (input: BrainDumpInput, storePath?: string) => BrainDumpResult;
  /** optional embed hook for a future provider. Omit to write locally only. */
  capture?: (input: CaptureInput) => Promise<CaptureOutcome>;
  storePath?: string;
};

export type IngestResult = BrainDumpResult & {
  embedded: boolean;
  slug?: string;
  captureError?: string;
};

/**
 * Ingest a brain dump: always write the local markdown (source of truth),
 * then — when a capture() hook is wired — embed it immediately so agents can
 * retrieve it. A capture failure never loses the local write; it degrades to
 * `embedded: false` with the honest error.
 */
export async function ingestBrainDump(input: BrainDumpInput, deps: BrainDumpDeps = {}): Promise<IngestResult> {
  const writeLocal = deps.writeLocal ?? writeBrainDump;
  const local = writeLocal(input, deps.storePath);

  if (!deps.capture) return { ...local, embedded: false };

  const outcome = await deps.capture({ text: input.text, title: local.title });
  return outcome.ok
    ? { ...local, embedded: true, slug: outcome.slug }
    : { ...local, embedded: false, captureError: outcome.error };
}
