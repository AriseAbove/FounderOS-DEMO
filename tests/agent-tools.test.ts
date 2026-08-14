import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { chatWithAgent } from '@/lib/agents/chat';
import { realAgents } from '@/lib/agents/real';

const prevLlm = process.env.LLM_PROVIDER;
const prevBrain = process.env.BRAIN_PROVIDER;
beforeAll(() => {
  process.env.LLM_PROVIDER = 'stub';
  process.env.BRAIN_PROVIDER = 'stub'; // deterministic, offline brain search
});
afterAll(() => {
  if (prevLlm === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = prevLlm;
  if (prevBrain === undefined) delete process.env.BRAIN_PROVIDER;
  else process.env.BRAIN_PROVIDER = prevBrain;
});

describe('agent chat tools', () => {
  test('data-agent exposes a read-only searchKnowledge tool', () => {
    const dataAgent = realAgents.find((a) => a.id === 'data-agent')!;
    expect(dataAgent.chatTools).toBeTypeOf('function');
    const tools = dataAgent.chatTools!();
    expect(tools.map((t) => t.name)).toContain('searchKnowledge');
  });

  test('a triggered tool call executes the connector and persists a tool turn', async () => {
    const db = openDb(':memory:');
    const res = await chatWithAgent(db, realAgents, 'data-agent', 'use-tool:searchKnowledge revenue split');
    const rows = db.agentMessages.byAgent('data-agent');
    expect(rows.map((m) => m.role)).toEqual(['user', 'tool', 'assistant']);
    const toolRow = rows.find((m) => m.role === 'tool')!;
    expect(toolRow.toolCalls.map((c) => c.name)).toContain('searchKnowledge');
    expect(Array.isArray(toolRow.toolCalls[0].result)).toBe(true); // connector actually ran
    expect(res.reply.length).toBeGreaterThan(0);
  });

  test('chief-of-staff exposes a read-only getBusinessSignals tool that actually runs gatherSignals', async () => {
    const cos = realAgents.find((a) => a.id === 'chief-of-staff')!;
    expect(cos.chatTools).toBeTypeOf('function');
    const tools = cos.chatTools!();
    expect(tools.map((t) => t.name)).toContain('getBusinessSignals');
    const result = await tools.find((t) => t.name === 'getBusinessSignals')!.execute({});
    expect(Array.isArray(result)).toBe(true); // no config in test env → empty, but never throws/invents
  });

  test('comms-agent exposes read-only getUnreadEmail and getUpcomingEvents tools', async () => {
    const comms = realAgents.find((a) => a.id === 'comms-agent')!;
    expect(comms.chatTools).toBeTypeOf('function');
    const tools = comms.chatTools!();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['getUnreadEmail', 'getUpcomingEvents']));
    const mail = await tools.find((t) => t.name === 'getUnreadEmail')!.execute({});
    expect(mail).toHaveProperty('ok');
    const cal = await tools.find((t) => t.name === 'getUpcomingEvents')!.execute({});
    expect(cal).toHaveProperty('ok');
  });

  test('quickbooks-pulse exposes a read-only getFinancialSnapshot tool', async () => {
    const qbo = realAgents.find((a) => a.id === 'quickbooks-pulse')!;
    expect(qbo.chatTools).toBeTypeOf('function');
    const tools = qbo.chatTools!();
    expect(tools.map((t) => t.name)).toContain('getFinancialSnapshot');
    const result = (await tools.find((t) => t.name === 'getFinancialSnapshot')!.execute({})) as Record<string, unknown>;
    expect(result).toHaveProperty('monthToDateIncome');
    expect(result).toHaveProperty('openInvoices');
  });
});
