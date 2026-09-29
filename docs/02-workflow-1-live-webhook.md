# Workflow 1 walkthrough — Follow-Up Email: Webinar Event to Review Task

Live n8n link: https://jomarebalida.app.n8n.cloud/workflow/eILvgR3Pp3ez7uhZ
Source: [`n8n-workflows/webinar-followup-live-webhook.ts`](../n8n-workflows/webinar-followup-live-webhook.ts)

## Nodes, in order

### 1. Webinar Event Webhook
`POST /webinar-followup-event`, no auth, responds immediately (`onReceived`) so the
webinar platform never waits on the rest of the chain. Expects:

```json
{
  "attendee": { "email": "jane@acmeco.com", "name": "Jane Doe" },
  "session": {
    "qa_question": "Does this integrate with Salesforce?",
    "poll_response": "Yes, actively evaluating vendors",
    "dwell_time_seconds": 2400
  }
}
```

### 2. Normalize Webinar Event (Set)
Flattens the nested webhook body into flat fields (`attendeeEmail`, `attendeeName`,
`qaQuestion`, `pollResponse`, `dwellTimeSeconds`) referenced explicitly by node name
throughout the rest of the chain — never bare `$json` — so inserting a node later
doesn't silently break a downstream expression.

### 3. Simulate Enrichment (Bitscale placeholder) (Set)
Stands in for a real Bitscale/Clay waterfall-enrichment HTTP call (verified work email,
LinkedIn URL, company name/size). No live Bitscale credential exists yet — see
[`05-setup-prerequisites.md`](05-setup-prerequisites.md).

### 4. Claude Follow-Up Email Draft
`@n8n/n8n-nodes-langchain.anthropic`, `resource: text`, `operation: message`,
`includeMergedResponse: true`. The prompt explicitly cites the attendee's Q&A question
and poll response, and instructs Claude to return raw JSON (`{subject, body}`) with no
markdown fences.

**Gotcha that cost real debugging time:** this node's response has no top-level
`.output` or `.text` field. With `includeMergedResponse: true` it's `.merged_response`
(a string); otherwise it's a `.content[]` array of blocks (`{type: 'thinking' | 'text', ...}`).
An earlier version of the downstream parser checked `.output || .text || .content`, all
of which are wrong, so it silently returned the fallback placeholder on **every single
run** while the node itself reported `"success"`. Caught only by pulling
`get_workflow_execution` with `includeData: true` and reading the actual node output —
execution status alone said nothing was wrong. See
[`04-current-demo-state.md`](04-current-demo-state.md).

### 5. Build Review Task Payload (Set)
Consolidates fields from three upstream nodes (event, enrichment, Claude draft) into one
clean shape. Parses Claude's JSON with a markdown-fence-stripping regex and a try/catch
fallback (`{ subject: 'Following up after the webinar', body: '...manually.' }`) so a
malformed LLM response degrades gracefully instead of throwing.

### 6. Post Review Task to Slack
Posts subject, body, and the Q&A/poll context that justifies the draft — plainly, not
via interactive Block Kit — to a real Slack channel. The rep reviews, tweaks tone if
needed, and sends manually from their own inbox or CRM. **Nothing here auto-sends.**

**Gotcha:** `channelId` with `mode: 'name'` and a plain channel name (e.g. `'general'`)
did not resolve for this bot token — likely a missing scope or the bot not being a
member. Using a real channel **ID** (`mode: 'id'`) for a channel the bot is already in
worked immediately. If you hit the same failure, don't assume the workflow is broken —
check channel membership/scopes first.

## Model ID gotcha

`modelId.value` is `claude-sonnet-5`, not `claude-sonnet-4-5`. The latter was copied from
the sibling Battlecard workflow and is not a valid model id under this instance's
Anthropic gateway credits — confirmed via a live failing call before the fix. Re-verify
against your own account/gateway before reusing this value.
