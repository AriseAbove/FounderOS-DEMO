---
title: Report the books truthfully
kind: sop
generated: founder-os
---

# Report the books truthfully

## Purpose

QuickBooks connection state, income and expenses.

## Owner

[[quickbooks-pulse]] — one worker, one job (monogamous by design).
Runs on: builtin · quickbooks api.

## Trigger

Kicks off when it is time to "check the stored oauth grant and refresh tokens before they expire" — on cadence or on the upstream event, whichever lands first.

## Steps

1. Check the stored OAuth grant and refresh tokens before they expire
2. Pull month-to-date income and expenses from QuickBooks once connected
3. List open invoices with balances and due dates
4. Report not-configured honestly until the grant lands — no faked money
5. Surface token-refresh failures the moment they happen

## Definition of done

The run is complete when "surface token-refresh failures the moment they happen" has verifiably happened and is logged to the run history.

## Escalation

If any step fails twice in a row, or the data looks wrong, stop and escalate to the operator. Never fake a green run.

## Pillar

[[pillar-finances]]
