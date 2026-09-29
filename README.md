# Webinar Follow-Up Agent

Turns webinar attendee engagement into a personalized follow-up email, drafted by
Claude and staged for a human to review and send. Nothing auto-sends.

This is **Phase 2: Context-Aware Drafting** from the original "Webinar Followup Play"
concept, built as two n8n workflows.

> **Source:** built from the webinar **"How To Build AI Agents for Your Event Workflows"**
> (September 29, 2026, 1:00–2:00 PM EDT). The 5-step architecture and the
> "Webinar Followup Play" framing come from that session; this repo is a working build of it. Sibling to the
[Webinar Battlecard Agent](https://github.com/bowtiefunnel/webinar-battlecard-agent),
which takes the same webinar signal to a Slack battlecard instead of an email draft.

## Live workflows

| Workflow | n8n link | Purpose |
|---|---|---|
| **Follow-Up Email: Webinar Event to Review Task** | [open in n8n](https://jomarebalida.app.n8n.cloud/workflow/eILvgR3Pp3ez7uhZ) | Real-time: one webhook event → Claude draft → Slack for review |
| **Webinar Follow-Up: Batch from Google Sheet** | [open in n8n](https://jomarebalida.app.n8n.cloud/workflow/h9CPAN8EkC8mRFNn) | Batch: attendee sheet → a draft per row, written back to the sheet → one Slack summary |

The source for both lives in [`n8n-workflows/`](n8n-workflows/) as `@n8n/workflow-sdk`
TypeScript. The source is the **template** (placeholders where your own sheet goes); the
live instance has real test values filled in. See
[`docs/04-current-demo-state.md`](docs/04-current-demo-state.md) for the difference.

## Read the docs in this order

1. [`docs/01-architecture.md`](docs/01-architecture.md) — the 5-step play, why it became two workflows
2. [`docs/02-workflow-1-live-webhook.md`](docs/02-workflow-1-live-webhook.md) — node-by-node, real-time path
3. [`docs/03-workflow-2-batch-from-sheet.md`](docs/03-workflow-2-batch-from-sheet.md) — node-by-node, batch path
4. [`docs/04-current-demo-state.md`](docs/04-current-demo-state.md) — what's real vs. simulated right now
5. [`docs/05-setup-prerequisites.md`](docs/05-setup-prerequisites.md) — **how to build this out yourself**

## TL;DR architecture

```
Workflow 1 — real-time
  Webhook (attendee + Q&A/poll text)
    → Normalize → Enrichment (simulated) → Claude draft → Build payload
    → Slack: #webinar-email-followup (rep reviews + sends manually)

Workflow 2 — batch
  Manual trigger
    → Read Google Sheet → Normalize row → Claude draft (branches: attended vs. no-show)
    → Parse → Write draft back to the same row
    → ONE Slack summary after the batch
```

## Key findings from building this

- **A real Goldcast event-summary export has no verbatim Q&A or poll text** — only
  counts and an engagement score. The batch workflow personalizes off those real
  signals and is told never to invent quotes.
- **`status: success` is not proof it worked.** The first several runs reported success
  while silently posting a fallback placeholder, because the parser read fields that
  don't exist on the Anthropic node's output. Always inspect real node output.
- **Slack:** use a channel ID, not a name, and make sure the bot is a member.

## Status

**Demo-proven, not yet production-live.** Both workflows have run end-to-end with real
Claude calls, a real Google Sheet, and real Slack posts. Enrichment in Workflow 1 is
still simulated, and neither workflow is published. See
[`docs/05-setup-prerequisites.md`](docs/05-setup-prerequisites.md).
