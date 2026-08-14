---
title: Website Pulse
kind: agent
generated: founder-os
---

# Website Pulse

Lead Intake in [[pillar-sales]].

Reads FormSubmit.co website-form notification emails from the connected inbox and files them into the AAC pipeline at Inquiry. No new credentials — activates the moment an INBOX_* slot is set (the same one Comms already reads).

## Instructions

Executes [[sop-website-pulse]] — File every real website form submission.

1. Search the connected inbox for FormSubmit.co notification emails from the last 45 days
2. Parse both live forms' field layouts (the booking form and the main-site contact form)
3. Open a new journey at Inquiry for every first-time submitter, or merge onto an existing one by phone/email
4. Fold the "how found AAC" answer into the touch label so Google/Referral attribution stays specific, not just "Website"
5. Drop submissions with no phone or email — not reachable, not a lead
6. Never move a journey stage — stage changes are Sean’s decision

## Harness

- Tier: lead
- Runs on: builtin · imap + formsubmit parser
- Status: planned

## Tools

- [[imap]]
