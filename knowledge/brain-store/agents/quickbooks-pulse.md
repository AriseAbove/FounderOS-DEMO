---
title: QuickBooks Pulse
kind: agent
generated: founder-os
---

# QuickBooks Pulse

Books Monitor in [[pillar-finances]].

Reports the QuickBooks connection state; month-to-date income and expenses once the OAuth grant lands.

## Instructions

Executes [[sop-quickbooks-pulse]] — Report the books truthfully.

1. Check the stored OAuth grant and refresh tokens before they expire
2. Pull month-to-date income and expenses from QuickBooks once connected
3. List open invoices with balances and due dates
4. Report not-configured honestly until the grant lands — no faked money
5. Surface token-refresh failures the moment they happen

## Harness

- Tier: lead
- Runs on: builtin · quickbooks api
- Status: planned

## Tools

- [[quickbooks]]
