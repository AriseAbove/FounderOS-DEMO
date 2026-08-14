---
title: Answer questions from the knowledge layer
kind: sop
generated: founder-os
---

# Answer questions from the knowledge layer

## Purpose

Search through the provider abstraction, honest fallbacks.

## Owner

[[data-agent]] — one worker, one job (monogamous by design).
Runs on: builtin · brain provider.

## Trigger

Kicks off when it is time to "parse the incoming question into a search query" — on cadence or on the upstream event, whichever lands first.

## Steps

1. Parse the incoming question into a search query
2. Run the query through the configured brain provider
3. Report an honest empty result while no provider is wired
4. Return cited passages with their source notes, never invented ones
5. Log unanswerable questions as gaps to fill

## Definition of done

The run is complete when "log unanswerable questions as gaps to fill" has verifiably happened and is logged to the run history.

## Escalation

If any step fails twice in a row, or the data looks wrong, stop and escalate to the operator. Never fake a green run.

## Pillar

[[pillar-tech]]
