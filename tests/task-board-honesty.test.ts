import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /tasks honesty fix (2026-08-21): the board's intro copy claimed "Agents
 * advance their own cards as they commit and finish" — untrue. No agent
 * run() in lib/agents/real.ts writes to the agent_tasks table; the seed
 * ships it permanently empty (lib/seed.ts's `agentTasks` array), and the
 * only writers were the drag handler here and the manual add-task form
 * previously hidden inside AgentWorkPanel.tsx's drawer on /agents.
 */
describe('lib/agents/real.ts — no agent run() writes to agentTasks', () => {
  test('the roster never calls db.agentTasks / getDb().agentTasks', () => {
    const src = read('lib/agents/real.ts');
    expect(src).not.toMatch(/agentTasks\.(insert|setStatus|remove)/);
  });
});

describe('lib/seed.ts — agentTasks ships permanently empty', () => {
  test('the seed array is empty', () => {
    const src = read('lib/seed.ts');
    expect(src).toMatch(/const agentTasks: AgentTask\[\] = \[\];/);
  });
});

describe('TaskBoard intro copy is honest about who moves cards today', () => {
  const src = read('components/TaskBoard.tsx');

  test('no longer claims agents advance their own cards', () => {
    expect(src).not.toMatch(/Agents advance their own cards as they commit and finish/);
  });

  test('says tasks are created/moved manually and no agent writes to the board yet', () => {
    expect(src).toMatch(/manually/i);
    expect(src).toMatch(/no agent writes to this board/i);
  });
});

describe('TaskBoard now has its own create-task affordance (not hidden in AgentWorkPanel)', () => {
  const src = read('components/TaskBoard.tsx');

  test('POSTs a new task to the same working /api/agents/work CRUD endpoint', () => {
    expect(src).toMatch(/fetch\('\/api\/agents\/work',\s*\{\s*method:\s*'POST'/);
    expect(src).toMatch(/kind:\s*'task',\s*agentId:\s*newAgentId,\s*title/);
  });

  test('lets the operator pick which agent the task belongs to', () => {
    expect(src).toMatch(/<select/);
  });

  test('also supports deleting a task via the same DELETE endpoint', () => {
    expect(src).toMatch(/method:\s*'DELETE'/);
  });
});
