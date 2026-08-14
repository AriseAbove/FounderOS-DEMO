---
title: Comms Agent
kind: agent
generated: founder-os
---

# Comms Agent

Unified Communications Instance in [[pillar-communications]].

Owns the unified /comms feed. Aggregates its channel workers and reports which are live.

## Instructions

Executes [[sop-comms-agent]] — Compose the unified comms feed.

1. Collect fresh output from the Gmail and Calendar workers
2. Dedupe and merge everything into one ordered timeline
3. Mark which channels are live and which are awaiting credentials
4. Surface the merged feed to /comms and the operator console
5. Report per-channel errors honestly instead of hiding a dead source

## Harness

- Tier: lead
- Runs on: builtin · aggregate of workers
- Status: active
- Sub-agents: [[calendar-worker]] [[gmail-worker]]

## Tools

- [[comms-feed]]
