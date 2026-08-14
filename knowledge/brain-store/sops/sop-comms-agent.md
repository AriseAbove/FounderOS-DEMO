---
title: Compose the unified comms feed
kind: sop
generated: founder-os
---

# Compose the unified comms feed

## Purpose

Email and calendar, one timeline at /comms.

## Owner

[[comms-agent]] — one worker, one job (monogamous by design).
Runs on: builtin · aggregate of workers.

## Trigger

Kicks off when it is time to "collect fresh output from the gmail and calendar workers" — on cadence or on the upstream event, whichever lands first.

## Steps

1. Collect fresh output from the Gmail and Calendar workers
2. Dedupe and merge everything into one ordered timeline
3. Mark which channels are live and which are awaiting credentials
4. Surface the merged feed to /comms and the operator console
5. Report per-channel errors honestly instead of hiding a dead source

## Definition of done

The run is complete when "report per-channel errors honestly instead of hiding a dead source" has verifiably happened and is logged to the run history.

## Escalation

If any step fails twice in a row, or the data looks wrong, stop and escalate to the operator. Never fake a green run.

## Pillar

[[pillar-communications]]
