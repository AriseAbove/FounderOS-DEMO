import { describe, expect, test } from 'vitest';
import { chaseTone, chaseEmailDraft } from '@/lib/invoice-chase';

const TODAY = new Date('2026-08-21T12:00:00Z');

const inv = (over: Partial<Parameters<typeof chaseEmailDraft>[0]> = {}) => ({
  id: '1',
  docNumber: '1042',
  customer: 'Tinholt Residence',
  balance: 4200,
  dueDate: '2026-07-01', // 51 days overdue as of TODAY
  ...over,
});

describe('chaseTone', () => {
  test('not yet due or unknown due date -> gentle', () => {
    expect(chaseTone(null)).toBe('gentle');
    expect(chaseTone(-3)).toBe('gentle');
    expect(chaseTone(0)).toBe('gentle');
  });

  test('1-30 days overdue -> gentle', () => {
    expect(chaseTone(1)).toBe('gentle');
    expect(chaseTone(30)).toBe('gentle');
  });

  test('31-60 days overdue -> firm', () => {
    expect(chaseTone(31)).toBe('firm');
    expect(chaseTone(60)).toBe('firm');
  });

  test('60+ days overdue -> urgent', () => {
    expect(chaseTone(61)).toBe('urgent');
    expect(chaseTone(500)).toBe('urgent');
  });
});

describe('chaseEmailDraft', () => {
  test('names the customer, invoice number, and dollar amount', () => {
    const draft = chaseEmailDraft(inv(), TODAY);
    expect(draft.subject).toContain('1042');
    expect(draft.body).toContain('Tinholt Residence');
    expect(draft.body).toContain('1042');
    expect(draft.body).toContain('$4,200');
  });

  test('tone follows the same thresholds as chaseTone', () => {
    expect(chaseEmailDraft(inv({ dueDate: '2026-08-25' }), TODAY).tone).toBe('gentle'); // not due yet
    expect(chaseEmailDraft(inv({ dueDate: '2026-08-10' }), TODAY).tone).toBe('gentle'); // 11 days
    expect(chaseEmailDraft(inv({ dueDate: '2026-07-01' }), TODAY).tone).toBe('firm'); // 51 days
    expect(chaseEmailDraft(inv({ dueDate: '2026-05-01' }), TODAY).tone).toBe('urgent'); // 112 days
  });

  test('gentle draft for a not-yet-due invoice reads as a heads-up, not a demand', () => {
    const draft = chaseEmailDraft(inv({ dueDate: '2026-08-28' }), TODAY);
    expect(draft.body.toLowerCase()).not.toMatch(/overdue|past due/);
  });

  test('firm and urgent drafts state the exact day count past due', () => {
    const firm = chaseEmailDraft(inv({ dueDate: '2026-07-01' }), TODAY); // 51 days
    expect(firm.body).toContain('51 days');
    const urgent = chaseEmailDraft(inv({ dueDate: '2026-05-01' }), TODAY); // 112 days
    expect(urgent.body).toContain('112 days');
  });

  test('an invoice with no due date on file is called out honestly, never invented', () => {
    const draft = chaseEmailDraft(inv({ dueDate: null }), TODAY);
    expect(draft.tone).toBe('gentle');
    expect(draft.body.toLowerCase()).toContain('no due date on file');
  });

  test('body never fabricates a day count it does not have', () => {
    const draft = chaseEmailDraft(inv({ dueDate: null }), TODAY);
    expect(draft.body).not.toMatch(/\d+ days? (past due|overdue)/);
  });
});
