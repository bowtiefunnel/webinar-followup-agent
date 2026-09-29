# Workflow 2 walkthrough — Webinar Follow-Up: Batch from Google Sheet

Live n8n link: https://jomarebalida.app.n8n.cloud/workflow/h9CPAN8EkC8mRFNn
Source: [`n8n-workflows/webinar-followup-batch-from-sheet.ts`](../n8n-workflows/webinar-followup-batch-from-sheet.ts)

## Why this exists alongside Workflow 1

Workflow 1 assumes a live, per-attendee webhook. In practice, webinar platforms
(Goldcast included) more commonly hand you a **post-event attendee report** — one file,
every registrant, after the session ends. That's a batch job, not a real-time trigger,
and it needed a genuinely different shape rather than forcing the same webhook design to
fit.

## Nodes, in order

### 1. Run Batch (Manual Trigger)
Deliberately manual, not scheduled — this runs once per completed webinar, on demand,
not on a polling cadence.

### 2. Read Attendees (Google Sheets, `sheet: read`)
Reads every row from the attendee sheet. `documentId`/`sheetName` are resource-locator
placeholders in the source — never a fabricated spreadsheet ID. Point them at your real
sheet via the n8n UI picker.

### 3. Normalize Attendee Row (Set)
The real Goldcast export's column headers have spaces and punctuation
(`Event Attendance Status`, `Live Event Time Spent(Minutes)`, `Clicked Event Call-to-Action`)
— this node flattens them into clean camelCase fields (`attendanceStatus`,
`timeSpentMinutes`, `pollsParticipated`, etc.) referenced explicitly by node name
throughout.

### 4. Claude Follow-Up Email Draft
Same node type/config as Workflow 1, but a **different prompt strategy** — see
[`01-architecture.md`](01-architecture.md) for why. It branches on
`attendanceStatus`:

- **Attended** (`Live` or `Watched On Demand`): personalizes off real signals
  (time spent, poll/question counts, engagement score, CTA click) and is explicitly told
  **not** to invent a quote or specific Q&A the data doesn't contain. Offers a call only
  when engagement is genuinely high.
- **Did not attend**: a distinct, shorter "sorry we missed you" email offering the
  recording — never the same template as an attendee email.

### 5. Parse Follow-Up Draft (Set)
Same markdown-fence-stripping + try/catch JSON parse as Workflow 1, reading
`merged_response` (not `.output`/`.text` — see
[`02-workflow-1-live-webhook.md`](02-workflow-1-live-webhook.md) for why those don't
exist on this node's output).

### 6. Update Sheet Row (Google Sheets, `sheet: update`)
Writes the draft back into the **same row**, matched by `Email`
(`matchingColumns: ['Email']`), into four new columns: `Follow-Up Subject`,
`Follow-Up Body`, `Draft Status`, `Drafted At`. These columns must already exist as
headers in your real sheet — `update` doesn't invent new ones.

### 7. Post Batch Summary to Slack (`executeOnce: true`)
**One** message after the whole batch finishes — not one per attendee, which would flood
the channel for anything beyond a handful of rows. `executeOnce: true` is what makes a
node fire once total instead of once per input item; forgetting it here is the single
most common mistake with this pattern (see the `n8n-loops` skill's "Scenario 2" for the
general rule). Uses `$('Read Attendees').all().length` for the count.

## Why the sheet, not one Slack message per attendee

Staging drafts in the sheet and sending a single "N emails ready" ping lets a rep
sort/filter/triage the whole batch in one place, rather than jumping between systems or
scrolling a flooded channel. See [`01-architecture.md`](01-architecture.md) and
[`05-setup-prerequisites.md`](05-setup-prerequisites.md) for what a phase-2 push to a
sales engagement platform or marketing automation tool would look like once draft
quality is trusted.
