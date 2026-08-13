import { describe, expect, it } from 'vitest';
import { openDb } from '@/lib/db';
import { buildEmailList } from '@/lib/email-list';

describe('buildEmailList', () => {
  it('is honestly empty when no subscriber source has recorded snapshots', () => {
    const db = openDb(':memory:');
    const list = buildEmailList(db);
    expect(list.subscribers).toBeNull();
    expect(list.asOf).toBeNull();
    expect(list.series).toEqual([]);
    db.close();
  });

  it('reads real recorded snapshots newest-last with growth windows', () => {
    const db = openDb(':memory:');
    db.emailList.insertSnapshot({ capturedAt: '2026-06-10', subscribers: 100, source: 'manual' });
    db.emailList.insertSnapshot({ capturedAt: '2026-06-19', subscribers: 110, source: 'manual' });
    const list = buildEmailList(db);
    expect(list.subscribers).toBe(110);
    expect(list.asOf).toBe('2026-06-19');
    expect(list.series.at(-1)).toEqual({ date: '2026-06-19', subscribers: 110 });
    db.close();
  });
});
