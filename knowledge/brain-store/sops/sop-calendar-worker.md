---
title: Surface the schedule
kind: sop
generated: founder-os
---

# Surface the schedule

## Purpose

Upcoming events from every connected calendar feed.

## Owner

[[calendar-worker]] — one worker, one job (monogamous by design).
Runs on: builtin · node-ical.

## Trigger

Kicks off when it is time to "fetch the ics/caldav feed for each configured calendar account" — on cadence or on the upstream event, whichever lands first.

## Steps

1. Fetch the ICS/CalDAV feed for each configured calendar account
2. Merge events across calendars into one upcoming list
3. Extract join links so meetings are one click away
4. Report honestly when no calendar credentials are set
5. Skip cancelled events and expand recurring ones correctly

## Definition of done

The run is complete when "skip cancelled events and expand recurring ones correctly" has verifiably happened and is logged to the run history.

## Escalation

If any step fails twice in a row, or the data looks wrong, stop and escalate to the operator. Never fake a green run.

## Pillar

[[pillar-communications]]
