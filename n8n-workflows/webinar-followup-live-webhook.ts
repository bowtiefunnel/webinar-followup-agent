// Workflow: "Follow-Up Email: Webinar Event to Review Task"
// Live n8n link: https://jomarebalida.app.n8n.cloud/workflow/eILvgR3Pp3ez7uhZ
//
// Real-time path: one webinar attendee event in, one personalized follow-up
// email drafted and posted to Slack for human review. Nothing auto-sends.
//
// See docs/04-current-demo-state.md for what's real vs. simulated right now,
// and docs/05-setup-prerequisites.md for what to do before this handles
// production traffic.

import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const webinarEventWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Webinar Event Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'webinar-followup-event',
      authentication: 'none',
      responseMode: 'onReceived'
    }
  },
  output: [{ body: { attendee: { email: 'jane@acmeco.com', name: 'Jane Doe' }, session: { qa_question: 'Does this integrate with Salesforce?', poll_response: 'Yes, actively evaluating vendors', dwell_time_seconds: 2400 } } }]
});

const normalizeWebinarEvent = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Webinar Event',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'attendee-email', name: 'attendeeEmail', type: 'string', value: expr("{{ $('Webinar Event Webhook').item.json.body?.attendee?.email ?? '' }}") },
          { id: 'attendee-name', name: 'attendeeName', type: 'string', value: expr("{{ $('Webinar Event Webhook').item.json.body?.attendee?.name ?? '' }}") },
          { id: 'qa-question', name: 'qaQuestion', type: 'string', value: expr("{{ $('Webinar Event Webhook').item.json.body?.session?.qa_question ?? '' }}") },
          { id: 'poll-response', name: 'pollResponse', type: 'string', value: expr("{{ $('Webinar Event Webhook').item.json.body?.session?.poll_response ?? '' }}") },
          { id: 'dwell-time-seconds', name: 'dwellTimeSeconds', type: 'number', value: expr("{{ $('Webinar Event Webhook').item.json.body?.session?.dwell_time_seconds ?? 0 }}") }
        ]
      }
    }
  },
  output: [{ attendeeEmail: 'jane@acmeco.com', attendeeName: 'Jane Doe', qaQuestion: 'Does this integrate with Salesforce?', pollResponse: 'Yes, actively evaluating vendors', dwellTimeSeconds: 2400 }]
});

// NOTE: no live Bitscale/Clay credential exists yet, so this Set node stands
// in for the real waterfall-enrichment HTTP call. See docs/05 item 2.
const simulateEnrichment = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Simulate Enrichment (Bitscale placeholder)',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'verified-work-email', name: 'verifiedWorkEmail', type: 'string', value: expr("{{ $('Normalize Webinar Event').item.json.attendeeEmail }}") },
          { id: 'linkedin-url', name: 'linkedinUrl', type: 'string', value: 'https://www.linkedin.com/in/jane-doe-demo' },
          { id: 'company-name', name: 'companyName', type: 'string', value: 'Acme Co (Demo)' },
          { id: 'company-size', name: 'companySize', type: 'string', value: '201-500' }
        ]
      }
    }
  },
  output: [{ verifiedWorkEmail: 'jane@acmeco.com', linkedinUrl: 'https://www.linkedin.com/in/jane-doe-demo', companyName: 'Acme Co (Demo)', companySize: '201-500' }]
});

const claudeFollowUpEmailDraft = node({
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
      // claude-sonnet-4-5 (copied from the sibling Battlecard workflow) is NOT
      // a valid model id under this instance's Anthropic gateway credits -
      // confirmed via a live failing call. claude-sonnet-5 is the current
      // working model. Re-verify against your own account before reuse.
      modelId: { __rl: true, mode: 'list', value: 'claude-sonnet-5' },
      messages: {
        values: [
          {
            role: 'user',
            content: expr("{{ (() => { const event = $('Normalize Webinar Event').item.json; const enrichment = $('Simulate Enrichment (Bitscale placeholder)').item.json; return `Attendee: ${event.attendeeName} (${event.attendeeEmail}). Dwell time: ${event.dwellTimeSeconds} seconds. Live Q&A question asked during the webinar: \"${event.qaQuestion}\". Poll response: \"${event.pollResponse}\". Enrichment - verified work email: ${enrichment.verifiedWorkEmail}, LinkedIn: ${enrichment.linkedinUrl}, company: ${enrichment.companyName} (${enrichment.companySize} employees). Write a short, hyper-personalized post-webinar follow-up email that explicitly references the Q&A question and poll response above, under 150 words, sounding like a rep wrote it personally. Return ONLY a JSON object with two string fields named subject and body, no markdown fences, no extra prose.`; })() }}")
          }
        ]
      },
      options: {
        system: "You are a sales follow-up email assistant. You draft short, hyper-personalized post-webinar emails that explicitly cite the attendee's live Q&A question and poll response. Always respond with raw JSON only, never markdown code fences or extra prose.",
        maxTokens: 512,
        includeMergedResponse: true
      }
    }
  },
  output: [{ merged_response: '{"subject":"...","body":"..."}' }]
});

const buildReviewTaskPayload = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Build Review Task Payload',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'attendee-email', name: 'attendeeEmail', type: 'string', value: expr("{{ $('Normalize Webinar Event').item.json.attendeeEmail }}") },
          { id: 'attendee-name', name: 'attendeeName', type: 'string', value: expr("{{ $('Normalize Webinar Event').item.json.attendeeName }}") },
          { id: 'qa-question', name: 'qaQuestion', type: 'string', value: expr("{{ $('Normalize Webinar Event').item.json.qaQuestion }}") },
          { id: 'poll-response', name: 'pollResponse', type: 'string', value: expr("{{ $('Normalize Webinar Event').item.json.pollResponse }}") },
          { id: 'verified-work-email', name: 'verifiedWorkEmail', type: 'string', value: expr("{{ $('Simulate Enrichment (Bitscale placeholder)').item.json.verifiedWorkEmail ?? $('Normalize Webinar Event').item.json.attendeeEmail }}") },
          {
            id: 'draft-email',
            name: 'draftEmail',
            type: 'object',
            value: expr(
              "{{ (() => {\n" +
              "  const node = $('Claude Follow-Up Email Draft').item.json;\n" +
              "  // The Anthropic node returns merged_response (includeMergedResponse: true)\n" +
              "  // or a content[] array of blocks - never a top-level output/text field.\n" +
              "  // A prior version of this expression checked .output || .text || .content,\n" +
              "  // none of which exist, so it silently fell back to the placeholder every\n" +
              "  // single run despite the node reporting \"success\". Verify with includeData\n" +
              "  // on a real execution before trusting this kind of parser.\n" +
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
  output: [{ attendeeEmail: 'jane@acmeco.com', attendeeName: 'Jane Doe', qaQuestion: 'Does this integrate with Salesforce?', pollResponse: 'Yes, actively evaluating vendors', verifiedWorkEmail: 'jane@acmeco.com', draftEmail: { subject: 'Great connecting today', body: 'Hi Jane, ...' } }]
});

const postReviewTaskToSlack = node({
  type: 'n8n-nodes-base.slack',
  version: 2.7,
  config: {
    name: 'Post Review Task to Slack',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      resource: 'message',
      operation: 'post',
      authentication: 'oAuth2',
      select: 'channel',
      // Real, working channel in the bowtiefunnel workspace (the bot created
      // it, so it's already a member). channelId mode: 'name' with a plain
      // channel name did NOT resolve for this bot token (likely missing a
      // scope, or the bot wasn't a member) - use a real channel ID instead.
      channelId: { __rl: true, mode: 'id', value: 'C0C5E8BQF41', cachedResultName: 'webinar-email-followup' },
      messageType: 'text',
      text: expr("{{ ':email: *New webinar follow-up ready for review*\\n\\n*Contact:* ' + $('Build Review Task Payload').item.json.attendeeName + ' (' + $('Build Review Task Payload').item.json.verifiedWorkEmail + ')\\n*Live Q&A:* ' + $('Build Review Task Payload').item.json.qaQuestion + '\\n*Poll response:* ' + $('Build Review Task Payload').item.json.pollResponse + '\\n\\n*Subject:* ' + $('Build Review Task Payload').item.json.draftEmail.subject + '\\n*Draft body:*\\n' + $('Build Review Task Payload').item.json.draftEmail.body + '\\n\\n_Review, tweak tone if needed, then send manually. Nothing here auto-sends._' }}")
    },
    credentials: { slackOAuth2Api: newCredential('Slack OAuth2 API', 'FTCQEbwvU0X8b1N5') }
  },
  output: [{ ok: true, channel: 'C0C5E8BQF41' }]
});

const eventSignalsNote = sticky(
  "### 1-2. Event Signals & Middleware\nWebinar platform posts live dwell time, Q&A, and poll data to this webhook; n8n normalizes the JSON before enrichment. Swap the webhook path/shape for your real webinar platform (Zoom, Goldcast, Livestorm, etc.).",
  [webinarEventWebhook, normalizeWebinarEvent],
  { color: 5 }
);

const enrichSynthNote = sticky(
  "### 3. Enrich & Synth\nEnrichment is simulated here (no live Bitscale credential yet) - swap this Set node for a real Bitscale/Clay HTTP call when ready. Claude drafts the follow-up email, citing the attendee's live Q&A question and poll response.",
  [simulateEnrichment, claudeFollowUpEmailDraft],
  { color: 4 }
);

const reviewGateNote = sticky(
  "### 4-5. Review Gate & Sent\nPosts the drafted email to Slack for rep review: subject, body, and the Q&A/poll context that justify it. The rep reviews, tweaks tone if needed, and sends manually from their own inbox or CRM; n8n never sends automatically.",
  [buildReviewTaskPayload, postReviewTaskToSlack],
  { color: 7 }
);

export default workflow('webinar-followup-email-agent', 'Follow-Up Email: Webinar Event to Review Task')
  .add(webinarEventWebhook)
  .to(normalizeWebinarEvent)
  .to(simulateEnrichment)
  .to(claudeFollowUpEmailDraft)
  .to(buildReviewTaskPayload)
  .to(postReviewTaskToSlack)
  .add(eventSignalsNote)
  .add(enrichSynthNote)
  .add(reviewGateNote);
