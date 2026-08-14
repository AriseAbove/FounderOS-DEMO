---
title: Data Agent
kind: agent
generated: founder-os
---

# Data Agent

Knowledge Search in [[pillar-tech]].

Answers questions from the knowledge layer through the brain provider abstraction. Honest stub until a provider is wired.

## Instructions

Executes [[sop-data-agent]] — Answer questions from the knowledge layer.

1. Parse the incoming question into a search query
2. Run the query through the configured brain provider
3. Report an honest empty result while no provider is wired
4. Return cited passages with their source notes, never invented ones
5. Log unanswerable questions as gaps to fill

## Harness

- Tier: lead
- Runs on: builtin · brain provider
- Status: planned

## Tools

- [[brain]]
