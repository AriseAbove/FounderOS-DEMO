---
title: Watch the playing field, push only what is new
kind: sop
generated: founder-os
---

# Watch the playing field, push only what is new

## Purpose

Funnel + QuickBooks + inbox signals, deduped, pushed via ntfy.

## Owner

[[chief-of-staff]] — one worker, one job (monogamous by design).
Runs on: builtin · signal engine + ntfy.

## Trigger

Kicks off when it is time to "gather hot/fading leads from the funnel's own attention model" — on cadence or on the upstream event, whichever lands first.

## Steps

1. Gather hot/fading leads from the funnel's own attention model
2. Pull overdue and open QuickBooks invoices where the OAuth grant is connected
3. Pull unread work-lane email from the unified comms feed where an inbox is connected
4. Drop every signal already pushed on a prior run — dedupe by signal id in seed_meta
5. Push only genuinely new high-severity signals to NTFY_TOPIC; report honestly when nothing is outstanding

## Definition of done

The run is complete when "push only genuinely new high-severity signals to ntfy_topic; report honestly when nothing is outstanding" has verifiably happened and is logged to the run history.

## Escalation

If any step fails twice in a row, or the data looks wrong, stop and escalate to the operator. Never fake a green run.

## Pillar

[[pillar-tech]]
