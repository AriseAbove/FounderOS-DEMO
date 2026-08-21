import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

/**
 * HONESTY (CLAUDE.md): "Empty states say why they're empty and what
 * connects them." These tests pin the explanatory copy on the pages that
 * were flagged as bare/unexplained stubs, so a future edit can't silently
 * regress a real explanation back into a bare "no data" placeholder.
 */
describe('honest empty states', () => {
  test('Workflows: the empty map explains what a workflow is, why it is empty, and how one gets added — not just "no workflows seeded"', () => {
    const src = read('components/WorkflowMap.tsx');
    expect(src).not.toMatch(/No workflows seeded yet\.?\s*$/m);
    expect(src).toMatch(/one real AAC\s+business process/);
    expect(src).toMatch(/lib\/seed\.ts/);
    expect(src).toMatch(/WorkflowSchema/);
  });

  test('Personas: the page never renders a fully blank body when the library is empty', () => {
    const src = read('app/personas/page.tsx');
    // must branch on personas.length, not unconditionally hand off to the
    // viewer (which silently returns null on an empty array)
    expect(src).toMatch(/personas\.length\s*[<>=!]/);
    expect(src).toMatch(/PersonaSchema/);
    expect(src).toMatch(/retired/i);
  });

  test('Personas: the smoke-tested page module actually renders explanatory copy when the DB has zero personas', async () => {
    const mod = await import('@/app/personas/page');
    const Page = mod.default as () => unknown;
    const rendered = JSON.stringify(await Promise.resolve(Page()));
    expect(rendered).toMatch(/No personas authored/);
  });

  test('Knowledge: the graph section explains its nodes are the operating model, not personal notes, and states the real-people count honestly', () => {
    const src = read('app/brain/page.tsx');
    const graphHeading = src.indexOf('Knowledge graph');
    const graphComponent = src.indexOf('<BrainGraphView');
    expect(graphComponent).toBeGreaterThan(graphHeading);
    const graphSection = src.slice(graphHeading, graphComponent);
    expect(graphSection).toMatch(/operating model describing itself/);
    expect(graphSection).toMatch(/realPeopleCount/);
  });

  test('Knowledge: the pipeline breaks store files into system-generated vs hand-written, not one undifferentiated "pages" count', () => {
    const src = read('app/brain/page.tsx');
    expect(src).toMatch(/generatedFiles/);
    expect(src).toMatch(/handWrittenFiles/);
    expect(src).toMatch(/hand-written/);
  });
});
