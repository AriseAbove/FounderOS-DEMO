---
title: Allo Pulse
kind: agent
generated: founder-os
---

# Allo Pulse

Lead Intake in [[pillar-sales]].

Pulls the Allo (248) 717-1417 call log and files inbound lead calls into the AAC pipeline at Inquiry. Activates when ALLO_API_KEY lands.

## Instructions

Executes [[sop-allo-pulse]] — File every real lead call.

1. Pull the call log from the Allo REST API with the scoped key
2. Open a new journey at Inquiry for every first-time legitimate caller
3. Append a touch to the existing journey on repeat calls — idempotent by call id
4. Keep spam, hangups, and outbound legs out of the pipeline
5. Never move a journey stage — stage changes are Sean’s decision

## Harness

- Tier: lead
- Runs on: builtin · allo rest api
- Status: planned

## Tools

- [[allo]]
