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
import { GENERATED_MARKER } from '@/lib/brain-docs';

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
    // Distinguishes the OS's own auto-generated reference docs (agents,
    // SOPs, tools, pillars — regenerated from the seed by `npm run
    // brain:docs`, carrying GENERATED_MARKER) from real hand-written notes
    // a person actually typed, so "N pages" never reads as "N notes I wrote".
    generatedFiles: number;
    handWrittenFiles: number;
  };
  doctor: {
    connected: boolean;
    status: string;
    healthScore: number | null;
    checks: DoctorCheck[];
    detail: string;
    // True only for a provider that actually does vector/semantic retrieval
    // (embeddings, a hybrid ranker, an external service). Both the local
    // markdown-grep provider and the test stub are keyword-only, so this is
    // `false` for both today — flip it in a future provider's overview(),
    // never here, so "vector search live" is never claimed until one exists.
    vector: boolean;
  };
};

export interface BrainProvider {
  name: string;
  status(): Promise<BrainStatus>;
  search(query: string): Promise<BrainSearchResult[]>;
  overview(): Promise<BrainOverview>;
}

/** Bundled starter content: real markdown generated from the honest seed
 *  data (agents, SOPs, tools, people, pillars) via `npm run brain:docs` —
 *  see scripts/generate-brain-docs.ts. Checked into the repo so Knowledge
 *  search has something real to search on day one, with zero required
 *  config. An operator's own BRAIN_STORE always overrides it. */
const BUNDLED_STORE = path.join(process.cwd(), 'knowledge', 'brain-store');

/** The configured markdown store directory, or the bundled starter store if
 *  it exists on disk and nothing was explicitly configured, or null. */
export function brainStorePath(): string | null {
  if (process.env.BRAIN_STORE) return process.env.BRAIN_STORE;
  if (process.env.GBRAIN_STORE) return process.env.GBRAIN_STORE;
  return fs.existsSync(BUNDLED_STORE) ? BUNDLED_STORE : null;
}

/** True when the bundled starter store ships on disk (it's checked into the
 *  repo, so this is normally true everywhere). Used by lib/keys.ts's API-keys
 *  panel to explain WHY Knowledge Store can honestly show CONNECTED on
 *  /integrations even while the BRAIN_STORE env var itself reads "not set" —
 *  without this the two facts (both individually true) read as a
 *  contradiction. */
export function bundledBrainStoreExists(env: Record<string, string | undefined> = process.env): boolean {
  return !env.BRAIN_STORE && !env.GBRAIN_STORE && fs.existsSync(BUNDLED_STORE);
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

/** Real per-file check, not a fabricated split: a file counts as generated
 *  only if it still carries GENERATED_MARKER in its frontmatter — the exact
 *  marker `scripts/generate-brain-docs.ts` writes and refuses to overwrite
 *  once removed. Anything else (including an unreadable file) counts as
 *  hand-written, the honest default when we can't prove otherwise. */
function storeOrigin(storePath: string): { generated: number; handWritten: number } {
  let generated = 0;
  let handWritten = 0;
  for (const file of walkMarkdown(storePath)) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes(GENERATED_MARKER)) generated += 1;
      else handWritten += 1;
    } catch {
      handWritten += 1;
    }
  }
  return { generated, handWritten };
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

const EMPTY_STORE = {
  path: '',
  totalFiles: 0,
  folders: [] as { name: string; files: number }[],
  generatedFiles: 0,
  handWrittenFiles: 0,
};

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
          doctor: {
            connected: false,
            status: 'not_configured',
            healthScore: null,
            checks: [],
            detail: NOT_CONFIGURED,
            vector: false,
          },
        };
      }
      const folders = storeFolders(storePath);
      const totalFiles = folders.reduce((sum, f) => sum + f.files, 0);
      const { generated, handWritten } = storeOrigin(storePath);
      return {
        store: { path: storePath, totalFiles, folders, generatedFiles: generated, handWrittenFiles: handWritten },
        doctor: {
          connected: totalFiles > 0,
          status: totalFiles > 0 ? 'ok' : 'empty',
          healthScore: null,
          checks: [],
          detail: totalFiles > 0 ? `${totalFiles} pages on disk` : `no markdown found at ${storePath}`,
          vector: false,
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
      doctor: { connected: false, status: 'stub', healthScore: null, checks: [], detail: 'stub provider', vector: false },
    };
  },
};

export type DoctorSummary = {
  /** `offline` — the store itself is unreachable. `not_scored` — the store
   *  is reachable but nothing has produced a real health number/checks yet
   *  (today's honest baseline: `healthScore` is never computed). `warnings`
   *  — connected with real checks and at least one non-ok. `ok` — connected,
   *  checks ran, all green, AND a real score exists to back that claim. */
  state: 'offline' | 'not_scored' | 'warnings' | 'ok';
  label: string;
};

/**
 * The single source of truth for "is the knowledge doctor okay" text, used
 * everywhere a page renders that word next to a health number — so a null
 * score can never sit next to "ok"/"all green" again (2026-08-21 fix: it
 * used to, on both /brain and the home page, because each page derived its
 * own "ok" independently of whether a score actually existed).
 */
export function summarizeDoctor(input: {
  connected: boolean;
  healthScore: number | null;
  checks: DoctorCheck[];
}): DoctorSummary {
  if (!input.connected) return { state: 'offline', label: 'offline' };
  const warnings = input.checks.filter((c) => c.status !== 'ok');
  if (warnings.length > 0) {
    return { state: 'warnings', label: `${warnings.length} warning${warnings.length === 1 ? '' : 's'}` };
  }
  // Connected and nothing flagged — but "all green" implies a real score
  // backed that claim. Without one, the honest word is "not yet scored",
  // never "ok".
  if (input.healthScore == null) return { state: 'not_scored', label: 'not yet scored' };
  return { state: 'ok', label: 'all green' };
}

export function getBrainProvider(): BrainProvider {
  const name = process.env.BRAIN_PROVIDER ?? 'local-store';
  if (name === 'stub') return stubProvider;
  return createLocalStoreProvider();
}
