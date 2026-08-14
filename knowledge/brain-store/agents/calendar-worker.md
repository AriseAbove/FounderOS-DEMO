---
title: Calendar Worker
kind: agent
generated: founder-os
---

# Calendar Worker

Schedule Feed in [[pillar-communications]].

Upcoming events from ICS/CalDAV calendar feeds. Activates when CAL_* creds land.

## Instructions

Executes [[sop-calendar-worker]] — Surface the schedule.

1. Fetch the ICS/CalDAV feed for each configured calendar account
2. Merge events across calendars into one upcoming list
3. Extract join links so meetings are one click away
4. Report honestly when no calendar credentials are set
5. Skip cancelled events and expand recurring ones correctly

## Harness

- Tier: worker
- Runs on: builtin · node-ical
- Status: planned
- Reports to: [[comms-agent]]

## Tools

- [[calendar]]
