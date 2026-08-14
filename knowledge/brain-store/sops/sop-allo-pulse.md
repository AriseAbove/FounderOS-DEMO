---
title: File every real lead call
kind: sop
generated: founder-os
---

# File every real lead call

## Purpose

Allo call log → AAC pipeline, spam stays out.

## Owner

[[allo-pulse]] — one worker, one job (monogamous by design).
Runs on: builtin · allo rest api.

## Trigger

Kicks off when it is time to "pull the call log from the allo rest api with the scoped key" — on cadence or on the upstream event, whichever lands first.

## Steps

1. Pull the call log from the Allo REST API with the scoped key
2. Open a new journey at Inquiry for every first-time legitimate caller
3. Append a touch to the existing journey on repeat calls — idempotent by call id
4. Keep spam, hangups, and outbound legs out of the pipeline
5. Never move a journey stage — stage changes are Sean’s decision

## Definition of done

The run is complete when "never move a journey stage — stage changes are sean’s decision" has verifiably happened and is logged to the run history.

## Escalation

If any step fails twice in a row, or the data looks wrong, stop and escalate to the operator. Never fake a green run.

## Pillar

[[pillar-sales]]
