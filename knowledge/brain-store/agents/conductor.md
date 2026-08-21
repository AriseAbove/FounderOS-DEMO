---
title: Conductor
kind: agent
generated: founder-os
---

# Conductor

Broadcast & Orchestration in [[pillar-tech]].

Fans a message out to every agent at once and reports fleet size and run history from the DB.

## Instructions

Executes [[sop-conductor]] — Broadcast directives across the fleet.

1. Receive the directive from the operator console
2. Resolve the target list: the whole fleet, or the pillar the directive names
3. Fan the message out to every target at once and stamp each send
4. Wait for every agent to answer and record each reply to broadcast_replies
5. Surface a failure as its own agent's honest error text, never a silent gap

## Harness

- Tier: lead
- Runs on: builtin · fan-out runtime
- Status: active

## Tools

- [[broadcast]]
