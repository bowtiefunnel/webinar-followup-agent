// Workflow: "Webinar Follow-Up: Batch from Google Sheet"
// Live n8n link: https://jomarebalida.app.n8n.cloud/workflow/h9CPAN8EkC8mRFNn
//
// Batch path: reads a post-webinar attendee export (Goldcast "event summary"
// shape), drafts one personalized follow-up per row, writes the draft back
// into the same sheet, then posts a single Slack summary when the whole
// batch finishes - not one Slack message per attendee.
//
// IMPORTANT: a real Goldcast event-summary export has NO verbatim Q&A
// question or poll-answer text - only counts (Number Of Questions Asked,
// Number Of Poll Participated) and a pre-computed Engagement Score. This
// workflow's prompt personalizes off those real signals (attendance mode,
// time spent, engagement score, counts) and is explicitly instructed not to
// invent quotes the data doesn't contain. See docs/01-architecture.md.
//
// See docs/04-current-demo-state.md for what's real vs. placeholder right
// now, and docs/05-setup-prerequisites.md for what to fill in before reuse.

import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const runBatchTrigger = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Run Batch' },
  output: [{}]
});

// documentId/sheetName are placeholders on purpose - never fabricate a real
// spreadsheet ID. Fill these in via the n8n UI picker, or see
// docs/05-setup-prerequisites.md for how this was tested against a real
// (fictional-sample) sheet.
const readAttendees = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Attendees',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      resource: 'sheet',
      operation: 'read',
      authentication: 'oAuth2',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'REPLACE_WITH_YOUR_SHEET (e.g. Beyond The Webinar - Aug 20 Event Summary)' },
      sheetName: { __rl: true, mode: 'list', value: '', cachedResultName: 'REPLACE_WITH_TAB_NAME (e.g. Sheet1)' }
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets OAuth2 API', 'nIzYNaWAfupqeSxv') }
  },
  output: [{
    'First Name': 'Jane', 'Last Name': 'Doe', 'Email': 'jane@acmeco.com', 'Company': 'Acme Co', 'Title': 'VP Sales',
    'Event Attendance Status': 'Live', 'Live Event Time Spent(Minutes)': 29.5, 'Clicked Event Call-to-Action': 'NO',
    'Number Of Poll Participated': 1, 'Number Of Questions Asked': 0, 'Number Of Chat Messages': 2, 'Engagement Score': 5, 'Number Of Survey Submitted': 0
  }]
});

const normalizeAttendeeRow = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Attendee Row',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'first-name', name: 'firstName', type: 'string', value: expr("{{ $('Read Attendees').item.json['First Name'] ?? '' }}") },
          { id: 'last-name', name: 'lastName', type: 'string', value: expr("{{ $('Read Attendees').item.json['Last Name'] ?? '' }}") },
          { id: 'email', name: 'email', type: 'string', value: expr("{{ $('Read Attendees').item.json['Email'] ?? '' }}") },
          { id: 'company', name: 'company', type: 'string', value: expr("{{ $('Read Attendees').item.json['Company'] ?? '' }}") },
          { id: 'title', name: 'title', type: 'string', value: expr("{{ $('Read Attendees').item.json['Title'] ?? '' }}") },
          { id: 'attendance-status', name: 'attendanceStatus', type: 'string', value: expr("{{ $('Read Attendees').item.json['Event Attendance Status'] ?? 'Unknown' }}") },
          { id: 'time-spent-minutes', name: 'timeSpentMinutes', type: 'number', value: expr("{{ Number($('Read Attendees').item.json['Live Event Time Spent(Minutes)']) || 0 }}") },
          { id: 'clicked-cta', name: 'clickedCta', type: 'string', value: expr("{{ $('Read Attendees').item.json['Clicked Event Call-to-Action'] ?? 'NO' }}") },
          { id: 'polls-participated', name: 'pollsParticipated', type: 'number', value: expr("{{ Number($('Read Attendees').item.json['Number Of Poll Participated']) || 0 }}") },
          { id: 'questions-asked', name: 'questionsAsked', type: 'number', value: expr("{{ Number($('Read Attendees').item.json['Number Of Questions Asked']) || 0 }}") },
          { id: 'chat-messages', name: 'chatMessages', type: 'number', value: expr("{{ Number($('Read Attendees').item.json['Number Of Chat Messages']) || 0 }}") },
          { id: 'engagement-score', name: 'engagementScore', type: 'number', value: expr("{{ Number($('Read Attendees').item.json['Engagement Score']) || 0 }}") },
          { id: 'surveys-submitted', name: 'surveysSubmitted', type: 'number', value: expr("{{ Number($('Read Attendees').item.json['Number Of Survey Submitted']) || 0 }}") }
        ]
      }
    }
  },
  output: [{ firstName: 'Jane', lastName: 'Doe', email: 'jane@acmeco.com', company: 'Acme Co', title: 'VP Sales', attendanceStatus: 'Live', timeSpentMinutes: 29.5, clickedCta: 'NO', pollsParticipated: 1, questionsAsked: 0, chatMessages: 2, engagementScore: 5, surveysSubmitted: 0 }]
});

const claudeFollowUpDraft = node({
  type: '@n8n/n8n-nodes-langchain.anthropic',
  version: 1,
  config: {
    name: 'Claude Follow-Up Email Draft',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      resource: 'text',
      operation: 'message',
      modelId: { __rl: true, mode: 'list', value: 'claude-sonnet-5' },
      messages: {
        values: [
          {
            role: 'user',
            content: expr(
              "{{ (() => {\n" +
              "  const a = $('Normalize Attendee Row').item.json;\n" +
              "  const attended = a.attendanceStatus === 'Live' || a.attendanceStatus === 'Watched On Demand';\n" +
              "  const context = attended\n" +
              "    ? `${a.firstName} attended this webinar (status: ${a.attendanceStatus}), spent ${a.timeSpentMinutes} minutes live, participated in ${a.pollsParticipated} poll(s), asked ${a.questionsAsked} live question(s), sent ${a.chatMessages} chat message(s), and has an engagement score of ${a.engagementScore}. They ${a.clickedCta === 'YES' ? 'clicked' : 'did not click'} the event call-to-action. Company: ${a.company || 'unknown'}, Title: ${a.title || 'unknown'}.`\n" +
              "    : `${a.firstName} registered for this webinar but did not attend live or on-demand. Company: ${a.company || 'unknown'}, Title: ${a.title || 'unknown'}.`;\n" +
              "  const instructions = attended\n" +
              "    ? 'Write a short, warm post-webinar follow-up email personalized to their actual engagement level above. Do not invent quotes or specific questions/answers - we only have counts, not content. If engagement score or question/poll count is high, offer a short call. If low, keep it a light informational touch. Under 130 words.'\n" +
              "    : 'Write a short, friendly sorry-we-missed-you email. Acknowledge they registered but could not attend, offer the recording, and invite them to reach out with questions. Under 100 words.';\n" +
              "  return `${context} ${instructions} Return ONLY a JSON object with two string fields named subject and body, no markdown fences, no extra prose.`;\n" +
              "})() }}"
            )
          }
        ]
      },
      options: {
        system: "You are a sales/marketing follow-up email assistant. You personalize post-webinar emails based on real engagement signals (attendance, time spent, poll/question counts, engagement score) and never fabricate quotes or specifics the data doesn't contain. Always respond with raw JSON only, never markdown code fences or extra prose.",
        maxTokens: 512,
        includeMergedResponse: true
      }
    }
  },
  output: [{ merged_response: '{"subject":"...","body":"..."}' }]
});

const parseFollowUpDraft = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Parse Follow-Up Draft',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'email', name: 'email', type: 'string', value: expr("{{ $('Normalize Attendee Row').item.json.email }}") },
          {
            id: 'draft-email',
            name: 'draftEmail',
            type: 'object',
            value: expr(
              "{{ (() => {\n" +
              "  const node = $('Claude Follow-Up Email Draft').item.json;\n" +
              "  // The Anthropic node returns merged_response (includeMergedResponse: true)\n" +
              "  // or a content[] array of blocks - never a top-level output/text field.\n" +
              "  const raw = node.merged_response || (node.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';\n" +
              "  const cleaned = String(raw).trim().replace(/^```json\\n?/, '').replace(/```$/, '');\n" +
              "  try {\n" +
              "    return JSON.parse(cleaned);\n" +
              "  } catch (e) {\n" +
              "    return { subject: 'Following up after the webinar', body: 'Draft unavailable due to a parse error, please write this email manually.' };\n" +
              "  }\n" +
              "})() }}"
            )
          }
        ]
      }
    }
  },
  output: [{ email: 'jane@acmeco.com', draftEmail: { subject: 'Great to have you at the session', body: 'Hi Jane, thanks for joining...' } }]
});

const updateSheetRow = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Update Sheet Row',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      resource: 'sheet',
      operation: 'update',
      authentication: 'oAuth2',
      documentId: { __rl: true, mode: 'list', value: '', cachedResultName: 'REPLACE_WITH_YOUR_SHEET (e.g. Beyond The Webinar - Aug 20 Event Summary)' },
      sheetName: { __rl: true, mode: 'list', value: '', cachedResultName: 'REPLACE_WITH_TAB_NAME (e.g. Sheet1)' },
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: ['Email'],
        schema: [
          { id: 'Email', displayName: 'Email', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'Follow-Up Subject', displayName: 'Follow-Up Subject', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'Follow-Up Body', displayName: 'Follow-Up Body', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'Draft Status', displayName: 'Draft Status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'Drafted At', displayName: 'Drafted At', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false }
        ],
        value: {
          'Email': expr("{{ $('Parse Follow-Up Draft').item.json.email }}"),
          'Follow-Up Subject': expr("{{ $('Parse Follow-Up Draft').item.json.draftEmail.subject }}"),
          'Follow-Up Body': expr("{{ $('Parse Follow-Up Draft').item.json.draftEmail.body }}"),
          'Draft Status': 'Drafted',
          'Drafted At': expr('{{ $now.toISO() }}')
        }
      }
    },
    credentials: { googleSheetsOAuth2Api: newCredential('Google Sheets OAuth2 API', 'nIzYNaWAfupqeSxv') }
  },
  output: [{ Email: 'jane@acmeco.com', 'Follow-Up Subject': 'Great to have you at the session', 'Draft Status': 'Drafted' }]
});

const postBatchSummaryToSlack = node({
  type: 'n8n-nodes-base.slack',
  version: 2.7,
  config: {
    name: 'Post Batch Summary to Slack',
    executeOnce: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      resource: 'message',
      operation: 'post',
      authentication: 'oAuth2',
      select: 'channel',
      channelId: { __rl: true, mode: 'id', value: 'C0C5E8BQF41', cachedResultName: 'webinar-email-followup' },
      messageType: 'text',
      text: expr("{{ ':white_check_mark: *' + $('Read Attendees').all().length + ' webinar follow-up emails drafted and saved to the sheet.*\\nReady for rep review \\u2014 open the sheet and filter Draft Status = Drafted.' }}")
    },
    credentials: { slackOAuth2Api: newCredential('Slack OAuth2 API', 'FTCQEbwvU0X8b1N5') }
  },
  output: [{ ok: true, channel: 'C0C5E8BQF41' }]
});

const sourceNote = sticky(
  "### 1. Source & Normalize\nManual trigger reads the whole attendee sheet (a Goldcast event-summary export), then flattens the raw column headers into clean fields per attendee.",
  [runBatchTrigger, readAttendees, normalizeAttendeeRow],
  { color: 5 }
);

const draftNote = sticky(
  "### 2. Draft\nClaude personalizes off real signals only (attendance, time spent, poll/question counts, engagement score) - this export has no actual Q&A/poll text, so it never fabricates quotes. No-shows get a different \"sorry we missed you\" email.",
  [claudeFollowUpDraft, parseFollowUpDraft],
  { color: 4 }
);

const writeBackNote = sticky(
  "### 3. Write-back & Notify\nEach draft is saved back into the same sheet (matched by Email) instead of posting one Slack message per attendee. One summary message fires after the whole batch finishes.",
  [updateSheetRow, postBatchSummaryToSlack],
  { color: 7 }
);

export default workflow('webinar-followup-batch-from-sheet', 'Webinar Follow-Up: Batch from Google Sheet')
  .add(runBatchTrigger)
  .to(readAttendees)
  .to(normalizeAttendeeRow)
  .to(claudeFollowUpDraft)
  .to(parseFollowUpDraft)
  .to(updateSheetRow)
  .to(postBatchSummaryToSlack)
  .add(sourceNote)
  .add(draftNote)
  .add(writeBackNote);
