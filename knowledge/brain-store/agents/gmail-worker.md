---
title: Gmail Worker
kind: agent
generated: founder-os
---

# Gmail Worker

IMAP Inboxes ×4 in [[pillar-communications]].

Pulls unread counts and recent mail from up to four IMAP inboxes into /comms. Activates when INBOX_* creds land.

## Instructions

Executes [[sop-gmail-worker]] — Triage the inboxes.

1. Poll each configured IMAP inbox for unread counts and recent mail
2. Report per-inbox errors instead of hiding a dead connection
3. Feed recent messages into the unified comms timeline
4. Flag inboxes that have not been configured yet
5. Never mark mail read or delete anything — read-only by design

## Harness

- Tier: worker
- Runs on: builtin · imapflow
- Status: planned
- Reports to: [[comms-agent]]

## Tools

- [[imap]]
