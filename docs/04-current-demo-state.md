# Current demo state — what's actually live in n8n right now

The `.ts` files in [`n8n-workflows/`](../n8n-workflows/) represent the **intended
template**: placeholders where you'd fill in your own sheet, credentials already wired by
reference. The live n8n instance has been toggled between real and test values while
building and debugging this. This doc is the honest account of the difference.

## Workflow 1 — live webhook

| Piece | State |
|---|---|
| Webhook trigger | Real, unpublished (test URL only until published) |
| Enrichment | **Simulated** — a Set node with hardcoded fake values; no Bitscale/Clay credential exists yet |
| Claude drafting | **Real** — live Anthropic call via n8n gateway credits, `claude-sonnet-5` |
| Slack post | **Real** — posts to `#webinar-email-followup` (`C0C5E8BQF41`) |

Verified end-to-end with a real Claude call and a real Slack post, and — critically —
verified by reading actual node output (`get_workflow_execution` with `includeData: true`),
not just execution status. The first several "successful" runs actually posted the
parser's fallback placeholder text instead of Claude's real draft; see
[`02-workflow-1-live-webhook.md`](02-workflow-1-live-webhook.md) for the bug.

## Workflow 2 — batch from sheet

| Piece | State |
|---|---|
| Manual trigger | Real |
| Google Sheet (read + write-back) | **Real** — tested against a real spreadsheet populated with a fictional 9-attendee sample (same column shape as a real Goldcast export) |
| Claude drafting | **Real** — 9 live Anthropic calls in one run |
| Slack summary | **Real** — one message to `#webinar-email-followup` |

In the live instance, `Read Attendees` and `Update Sheet Row` currently point at that
real test spreadsheet. In this repo's source they're placeholders again, because a real
spreadsheet ID shouldn't live in a public template.

### Sample run results (fictional data)

All 9 rows drafted in ~32 seconds. The prompt's tone-branching worked as designed:

- **No-shows** each got a distinct "sorry we missed you" email, personalized with name
  and role, offering the recording.
- **High-engagement attendee** (10 chat messages, 1 poll, engagement score 8) — offered a
  15-minute call.
- **Lower-engagement attendee** (2 chat messages, no poll, engagement score 5) — lighter
  informational touch, no call ask.

## Known limitations

- Workflow 1's "cite the exact Q&A/poll text" design is unverified against a real
  Goldcast **live webhook** — it's been validated against a hand-crafted payload only.
- Neither workflow is published/activated. Both run on demand via n8n's manual/test
  execution.
- No workflow-level error workflow is configured yet (UI-only setting in n8n).
