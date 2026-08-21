---
title: Broadcast directives across the fleet
kind: sop
generated: founder-os
---

# Broadcast directives across the fleet

## Purpose

One message in, every agent briefed, replies collected.

## Owner

[[conductor]] — one worker, one job (monogamous by design).
Runs on: builtin · fan-out runtime.

## Trigger

Kicks off when it is time to "receive the directive from the operator console" — on cadence or on the upstream event, whichever lands first.

## Steps

1. Receive the directive from the operator console
2. Resolve the target list: the whole fleet, or the pillar the directive names
3. Fan the message out to every target at once and stamp each send
4. Wait for every agent to answer and record each reply to broadcast_replies
5. Surface a failure as its own agent's honest error text, never a silent gap

## Definition of done

The run is complete when "surface a failure as its own agent's honest error text, never a silent gap" has verifiably happened and is logged to the run history.

## Escalation

If any step fails twice in a row, or the data looks wrong, stop and escalate to the operator. Never fake a green run.

## Pillar

[[pillar-tech]]
