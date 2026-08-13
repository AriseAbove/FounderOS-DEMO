/**
 * The knowledge layer, behind a provider abstraction. The default provider
 * reads a local markdown store (point BRAIN_STORE at a folder of .md files
 * in .env.local) — grep search, folder overview, honest "not configured"
 * when unset. BRAIN_PROVIDER=stub selects the inert provider for tests.
 *
 * The Phase 2 purge removed the original creator's gbrain-CLI/Supabase
 * provider (it shelled out to a personal toolchain). A richer provider —
 * vector search, an external service — implements the same interface and
 * registers in getBrainProvider.
 */
import fs from 'node:fs';
import path from 'node:path';

export type BrainStatus = {
  connected: boolean;
  provider: string;
  detail: string;
};

export type BrainSearchResult = {
  title: string;
  snippet: string;
  source: string;
};

export type DoctorCheck = { name: string; status: string; message: string };

export type BrainOverview = {
  store: {
    path: string;
    totalFiles: number;
    folders: { name: string; files: number }[];
  };
  doctor: {
    connected: boolean;
    status: string;
    healthScore: number | null;
    checks: DoctorCheck[];
    detail: string;
  };
};

export interface BrainProvider {
  name: string;
  status(): Promise<BrainStatus>;
  search(query: string): Promise<BrainSearchResult[]>;
  overview(): Promise<BrainOverview>;
}

/** The configured markdown store directory, or null when none is set. */
export function brainStorePath(): string | null {
  return process.env.BRAIN_STORE ?? process.env.GBRAIN_STORE ?? null;
}

function walkMarkdown(dir: string, files: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, files);
    else if (entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

/** Read every markdown page in the store as { path (posix-relative), content }.
 *  Empty when no store is configured — never guesses a machine path. */
export function readStoreNotes(storePath: string | null = brainStorePath()): { path: string; content: string }[] {
  if (!storePath) return [];
  const notes: { path: string; content: string }[] = [];
  for (const file of walkMarkdown(storePath)) {
    try {
      notes.push({
        path: path.relative(storePath, file).split(path.sep).join('/'),
        content: fs.readFileSync(file, 'utf8'),
      });
    } catch {
      // unreadable file — skip it
    }
  }
  return notes.sort((a, b) => a.path.localeCompare(b.path));
}

function storeFolders(storePath: string): { name: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const file of walkMarkdown(storePath)) {
    const rel = path.relative(storePath, file);
    const top = rel.includes(path.sep) ? rel.split(path.sep)[0] : '(root)';
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function localSearch(storePath: string, query: string, limit = 8): BrainSearchResult[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const results: BrainSearchResult[] = [];
  for (const file of walkMarkdown(storePath)) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const line = content.split('\n').find((l) => l.toLowerCase().includes(needle));
    if (line) {
      results.push({
        title: path.relative(storePath, file).replace(/\.md$/, ''),
        snippet: line.trim().slice(0, 240),
        source: 'brain-store',
      });
      if (results.length >= limit) break;
    }
  }
  return results;
}

const EMPTY_STORE = { path: '', totalFiles: 0, folders: [] as { name: string; files: number }[] };

const NOT_CONFIGURED =
  'No knowledge store configured — point BRAIN_STORE at a folder of markdown files in .env.local.';

/** Local markdown store: real grep search over a real folder, honest when unset. */
function createLocalStoreProvider(): BrainProvider {
  const storePath = brainStorePath();
  return {
    name: 'local-store',
    async status() {
      if (!storePath) return { connected: false, provider: 'local-store', detail: NOT_CONFIGURED };
      const files = walkMarkdown(storePath).length;
      return {
        connected: files > 0,
        provider: 'local-store',
        detail:
          files > 0
            ? `${files} markdown pages in ${storePath}`
            : `BRAIN_STORE set but no markdown found at ${storePath}`,
      };
    },
    async search(query: string) {
      if (!storePath) return [];
      return localSearch(storePath, query);
    },
    async overview() {
      if (!storePath) {
        return {
          store: EMPTY_STORE,
          doctor: { connected: false, status: 'not_configured', healthScore: null, checks: [], detail: NOT_CONFIGURED },
        };
      }
      const folders = storeFolders(storePath);
      const totalFiles = folders.reduce((sum, f) => sum + f.files, 0);
      return {
        store: { path: storePath, totalFiles, folders },
        doctor: {
          connected: totalFiles > 0,
          status: totalFiles > 0 ? 'ok' : 'empty',
          healthScore: null,
          checks: [],
          detail: totalFiles > 0 ? `${totalFiles} pages on disk` : `no markdown found at ${storePath}`,
        },
      };
    },
  };
}

const stubProvider: BrainProvider = {
  name: 'stub',
  async status() {
    return { connected: false, provider: 'stub', detail: 'Stub brain provider (tests / no-dependency environments).' };
  },
  async search() {
    return [];
  },
  async overview() {
    return {
      store: EMPTY_STORE,
      doctor: { connected: false, status: 'stub', healthScore: null, checks: [], detail: 'stub provider' },
    };
  },
};

export function getBrainProvider(): BrainProvider {
  const name = process.env.BRAIN_PROVIDER ?? 'local-store';
  if (name === 'stub') return stubProvider;
  return createLocalStoreProvider();
}
