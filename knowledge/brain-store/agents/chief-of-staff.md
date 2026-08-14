---
title: Chief of Staff
kind: agent
generated: founder-os
---

# Chief of Staff

Proactive Monitor in [[pillar-tech]].

Watches the funnel, QuickBooks, and inboxes for hot leads, overdue invoices, and unread work mail; pushes only what is new via ntfy. Activates as each source connects — real even with zero sources configured (reports nothing outstanding, honestly).

## Instructions

Executes [[sop-chief-of-staff]] — Watch the playing field, push only what is new.

1. Gather hot/fading leads from the funnel's own attention model
2. Pull overdue and open QuickBooks invoices where the OAuth grant is connected
3. Pull unread work-lane email from the unified comms feed where an inbox is connected
4. Drop every signal already pushed on a prior run — dedupe by signal id in seed_meta
5. Push only genuinely new high-severity signals to NTFY_TOPIC; report honestly when nothing is outstanding

## Harness

- Tier: lead
- Runs on: builtin · signal engine + ntfy
- Status: planned

## Tools

- [[funnel]]
- [[quickbooks]]
- [[imap]]
- [[ntfy]]
