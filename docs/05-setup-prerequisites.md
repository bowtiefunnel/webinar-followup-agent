# Setup — how to build this out in your own n8n instance

## 1. Import the workflows

Each file in [`n8n-workflows/`](../n8n-workflows/) is `@n8n/workflow-sdk` TypeScript.
Either:

- **Via the n8n MCP server** (how these were built): pass the file contents to
  `validate_workflow`, then `create_workflow_from_code`. Then `get_workflow_details` and
  check the `connections` object matches the chain in the file — validation alone
  doesn't catch dropped wires.
- **By hand in the n8n UI**: recreate the nodes in order using the node types and
  parameters in the file as the spec.

## 2. Credentials (n8n UI only — can't be created via MCP)

| Credential | Type | Used by | Notes |
|---|---|---|---|
| Slack | `slackOAuth2Api` | Post Review Task to Slack, Post Batch Summary to Slack | Bot needs `chat:write`. It must be a **member** of the target channel. |
| Google Sheets | `googleSheetsOAuth2Api` | Read Attendees, Update Sheet Row | The sheet must be accessible to whichever Google account this credential authenticates as. |
| Anthropic | `anthropicApi` | Claude Follow-Up Email Draft | On n8n Cloud, "Gateway credits" may auto-assign. Otherwise add your own key. |
| Bitscale *(Workflow 1, not yet wired)* | `httpTemplatedCustomAuth` — `{"headers":{"X-API-KEY":"{{api_key}}"}}` | A real enrichment node, replacing `Simulate Enrichment` | Bitscale API access is an Enterprise-tier feature. |

The `.ts` files reference credentials with real IDs from the instance they were built
in (`newCredential('Label', 'id')`). Those IDs won't exist in your instance — rebind each
node to your own credential after import. A credential ID is a reference, not a secret,
so it's safe in source; the actual keys never leave n8n.

## 3. Slack channel

Create a channel (these workflows use `#webinar-email-followup`), make sure the bot is a
member, and set `channelId` to its **ID** (`mode: 'id'`), not its name.

Two failure modes hit while building this:
- `mode: 'name'` with a plain name like `general` failed to resolve.
- `@`-mentioning a specific person via `users.lookupByEmail` needs the
  `users:read.email` OAuth scope, which most bot tokens don't have. Either add the scope
  and reinstall the app, or hardcode the person's Slack member ID (`<@U0123ABC456>`).
  Don't fabricate a member ID — it either fails or pings the wrong person.

## 4. Google Sheet (Workflow 2)

Start from a real attendee export — [`sample-attendee-data.csv`](sample-attendee-data.csv)
shows the expected columns with fictional data. Then:

1. Import it into a Google Sheet.
2. **Add four empty header columns**: `Follow-Up Subject`, `Follow-Up Body`,
   `Draft Status`, `Drafted At`. The `update` operation matches existing headers; it
   won't create them.
3. Make sure `Email` is unique per row — it's the match key for the write-back.
4. Point `Read Attendees` and `Update Sheet Row` at the sheet and tab via the n8n picker.

## 5. Verify your model ID

`claude-sonnet-4-5` was invalid under the gateway credits this was built on;
`claude-sonnet-5` worked. Check what your Anthropic access actually supports before
assuming either.

## 6. Test properly

1. Run once with `execute_workflow` (manual mode).
2. **Read the actual node output** with `get_workflow_execution` + `includeData: true`.
   Don't stop at `status: success` — the parser bug documented in
   [`02-workflow-1-live-webhook.md`](02-workflow-1-live-webhook.md) reported success on
   every run while posting fallback text.
3. Check the Slack message and (for Workflow 2) the sheet rows by eye.

## 7. Before production traffic

- **Workflow 1:** confirm your webinar platform's *live* webhook actually carries
  verbatim Q&A/poll text. If it only sends counts (like Goldcast's summary export), port
  Workflow 2's prompt strategy over.
- Set a workflow-level **Error Workflow** in each workflow's settings so failures alert
  someone.
- Publish/activate.

## 8. Phase 2 (later): push approved drafts to a send tool

Once draft quality is trusted, add a node that reads rows where
`Draft Status = Approved` and pushes them onward. The shape depends on the destination:

- **Sales engagement (Outreach / Salesloft):** per-contact sequence enrollment, with the
  draft as a manual-review first step.
- **Marketing automation (HubSpot / Marketo):** contact update + campaign trigger.

Until then, the sheet → manual copy step *is* the human review gate the original design
calls for.
