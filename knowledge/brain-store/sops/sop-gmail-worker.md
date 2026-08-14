---
title: Triage the inboxes
kind: sop
generated: founder-os
---

# Triage the inboxes

## Purpose

Up to four IMAP inboxes, honest unread counts.

## Owner

[[gmail-worker]] — one worker, one job (monogamous by design).
Runs on: builtin · imapflow.

## Trigger

Kicks off when it is time to "poll each configured imap inbox for unread counts and recent mail" — on cadence or on the upstream event, whichever lands first.

## Steps

1. Poll each configured IMAP inbox for unread counts and recent mail
2. Report per-inbox errors instead of hiding a dead connection
3. Feed recent messages into the unified comms timeline
4. Flag inboxes that have not been configured yet
5. Never mark mail read or delete anything — read-only by design

## Definition of done

The run is complete when "never mark mail read or delete anything — read-only by design" has verifiably happened and is logged to the run history.

## Escalation

If any step fails twice in a row, or the data looks wrong, stop and escalate to the operator. Never fake a green run.

## Pillar

[[pillar-communications]]
