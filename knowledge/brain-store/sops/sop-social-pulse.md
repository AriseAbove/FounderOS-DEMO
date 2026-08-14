---
title: Publish every queued post through OneUp
kind: sop
generated: founder-os
---

# Publish every queued post through OneUp

## Purpose

Social tab queue → real OneUp accounts, honest per-post outcomes.

## Owner

[[social-pulse]] — one worker, one job (monogamous by design).
Runs on: builtin · oneup rest api.

## Trigger

Kicks off when it is time to "pull every post queued on the social tab (status: queued)" — on cadence or on the upstream event, whichever lands first.

## Steps

1. Pull every post queued on the Social tab (status: queued)
2. Match each post's platforms to OneUp's real connected accounts
3. Publish via OneUp's scheduletextpost/scheduleimagepost API
4. Mark a post failed with the real reason on a platform mismatch or a rejected post — never silently drop it
5. Never post without ONEUP_CATEGORY_ID configured — no guessed category

## Definition of done

The run is complete when "never post without oneup_category_id configured — no guessed category" has verifiably happened and is logged to the run history.

## Escalation

If any step fails twice in a row, or the data looks wrong, stop and escalate to the operator. Never fake a green run.

## Pillar

[[pillar-marketing-growth]]
