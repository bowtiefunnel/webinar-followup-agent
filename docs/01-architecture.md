# Architecture — the 5-step play, mapped to two n8n workflows

This is **Phase 2: Context-Aware Drafting** from the original "Webinar Followup Play"
concept slide, presented in the webinar **"How To Build AI Agents for Your Event
Workflows"** (September 29, 2026, 1:00–2:00 PM EDT) — turn a webinar attendee's live engagement into a hyper-personalized
follow-up email, staged for a human to review and send. Sibling to the
[Account Intelligence & Dynamic Battlecard Agent](https://github.com/bowtiefunnel/webinar-battlecard-agent),
which handles the same webinar-event signal for a different destination (an interactive
Slack battlecard, not an email draft).

## The 5 steps from the original doc

| # | Step | What it does |
|---|---|---|
| 1 | **Event Signals** | Webinar platform emits dwell time, Q&A, poll data |
| 2 | **Middleware** | n8n catches the event, parses it, orchestrates downstream steps |
| 3 | **Enrich & Synth** | Waterfall enrichment (verified email, LinkedIn, firmographics) + AI drafts the copy |
| 4 | **Review Gate** | Staged for a human — rep inspects, tweaks tone, sends |
| 5 | **Sent** | Delivered from the rep's own inbox/CRM, not automated |

Two workflows implement this, because it turned out there are two genuinely different
ways a webinar attendee's data actually reaches you:

## Workflow 1: real-time, one event at a time

```
Webhook (webinar event: attendee + live Q&A/poll text)
  → Normalize Webinar Event
  → Simulate Enrichment (Bitscale/Clay placeholder)
  → Claude drafts subject + body, citing the Q&A/poll text
  → Build Review Task Payload
  → Post to Slack for rep review
```

Assumes the webinar platform fires a webhook **per attendee, in real time**, carrying
the actual text of what they asked and answered. See
[`n8n-workflows/webinar-followup-live-webhook.ts`](../n8n-workflows/webinar-followup-live-webhook.ts).

## Workflow 2: batch, from a post-event export

```
Manual trigger
  → Read Attendees (Google Sheet)
  → Normalize Attendee Row
  → Claude drafts subject + body, citing real engagement signals (not fabricated quotes)
  → Parse Follow-Up Draft
  → Update Sheet Row (write the draft back, matched by Email)
  → Post ONE Slack summary after the whole batch finishes
```

Built after checking a **real Goldcast event-summary export**
(`docs/sample-attendee-data.csv` in this repo is a fictional stand-in with the same
column shape). See [`n8n-workflows/webinar-followup-batch-from-sheet.ts`](../n8n-workflows/webinar-followup-batch-from-sheet.ts).

## The finding that split this into two workflows

The original concept assumes the webinar platform hands over **verbatim Q&A question
and poll-answer text** ("explicitly citing attendee Q&A and poll choices"). A real
Goldcast **event summary export** does not contain that — it only has:

- `Number Of Questions Asked`, `Number Of Poll Participated`, `Number Of Chat Messages` — **counts**, not verbatim text
- `Live Event Time Spent(Minutes)` — real dwell time
- `Engagement Score` — a pre-computed intent score
- `Event Attendance Status` — `Live` / `Watched On Demand` / `Did Not Attend`

So Workflow 2's prompt is explicitly instructed to personalize off those real signals
and **never invent a quote or specific question/answer the data doesn't contain** — a
Claude prompt that fabricates a fake Q&A quote to sound personalized would be worse than
one that's honestly generic. Workflow 1 keeps the original "cites the exact Q&A/poll
text" design, but that assumption is **unverified against Goldcast's real live
webhook/API** (which may carry different data than its summary export) — see
[`05-setup-prerequisites.md`](05-setup-prerequisites.md) before wiring it to production
traffic.

## Why the batch workflow also branches tone by attendance

A real attendee sheet contains registrants who never showed up. Drafting the same
"thanks for attending" email for a no-show would be an obvious, credibility-costing
mistake. Workflow 2's Claude prompt branches:

- **Attended** (Live or Watched On Demand): personalize off engagement signals; offer a
  call only if engagement score / question-and-poll counts are high, otherwise keep it a
  light informational touch.
- **Did not attend**: a distinct "sorry we missed you" email, offering the recording.
