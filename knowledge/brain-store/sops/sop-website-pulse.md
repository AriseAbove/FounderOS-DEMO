---
title: File every real website form submission
kind: sop
generated: founder-os
---

# File every real website form submission

## Purpose

FormSubmit.co notification emails → AAC pipeline, specific attribution kept.

## Owner

[[website-pulse]] — one worker, one job (monogamous by design).
Runs on: builtin · imap + formsubmit parser.

## Trigger

Kicks off when it is time to "search the connected inbox for formsubmit.co notification emails from the last 45 days" — on cadence or on the upstream event, whichever lands first.

## Steps

1. Search the connected inbox for FormSubmit.co notification emails from the last 45 days
2. Parse both live forms' field layouts (the booking form and the main-site contact form)
3. Open a new journey at Inquiry for every first-time submitter, or merge onto an existing one by phone/email
4. Fold the "how found AAC" answer into the touch label so Google/Referral attribution stays specific, not just "Website"
5. Drop submissions with no phone or email — not reachable, not a lead
6. Never move a journey stage — stage changes are Sean’s decision

## Definition of done

The run is complete when "never move a journey stage — stage changes are sean’s decision" has verifiably happened and is logged to the run history.

## Escalation

If any step fails twice in a row, or the data looks wrong, stop and escalate to the operator. Never fake a green run.

## Pillar

[[pillar-sales]]
