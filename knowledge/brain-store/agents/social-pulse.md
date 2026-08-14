---
title: Social Pulse
kind: agent
generated: founder-os
---

# Social Pulse

Publishing in [[pillar-marketing-growth]].

Publishes posts queued on the Social tab through OneUp's real API. Activates when ONEUP_API_KEY + ONEUP_CATEGORY_ID land.

## Instructions

Executes [[sop-social-pulse]] — Publish every queued post through OneUp.

1. Pull every post queued on the Social tab (status: queued)
2. Match each post's platforms to OneUp's real connected accounts
3. Publish via OneUp's scheduletextpost/scheduleimagepost API
4. Mark a post failed with the real reason on a platform mismatch or a rejected post — never silently drop it
5. Never post without ONEUP_CATEGORY_ID configured — no guessed category

## Harness

- Tier: lead
- Runs on: builtin · oneup rest api
- Status: planned

## Tools

- [[oneup]]
