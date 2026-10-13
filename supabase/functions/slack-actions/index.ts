// Supabase Edge Function: slack-actions
// Handles Slack Block Kit button interactions (e.g. Acknowledge, Retry)
// Updates the database and returns a collapsed single-line resolved card in-place.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let payload: any = null;
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      const payloadStr = formData.get('payload');
      if (typeof payloadStr === 'string') {
        payload = JSON.parse(payloadStr);
      }
    } else {
      payload = await req.json();
    }

    if (!payload) {
      return new Response(JSON.stringify({ error: 'Missing interaction payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const action = payload.actions?.[0];
    const actionId = action?.action_id || '';
    const actionValue = action?.value || '';
    const user = payload.user || {};
    const userName = user.name || user.username || user.id || 'Slack User';
    const channelId = payload.channel?.id;
    const messageTs = payload.message?.ts;
    const responseUrl = payload.response_url;

    // Handle "Acknowledge" button
    if (actionId === 'ack' || actionId === 'sos_ack') {
      let alertTitle = 'Travel Desk Alert';

      // Check if actionValue is a UUID alert ID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actionValue);

      if (isUuid) {
        const { data } = await supabase.rpc('acknowledge_sos_from_slack', {
          p_alert_id: actionValue,
          p_actor_name: userName,
        });
        if (data?.title) alertTitle = data.title;
      } else {
        // Fallback: search by code
        const { data } = await supabase
          .from('sos_alerts')
          .update({
            status: 'Acknowledged',
            acknowledged_by: userName,
            acknowledged_at: new Date().toISOString(),
          })
          .eq('code', actionValue)
          .eq('status', 'Open')
          .order('last_seen_at', { ascending: false })
          .limit(1)
          .select('title')
          .maybeSingle();

        if (data?.title) alertTitle = data.title;
      }

      const nowTime = new Date().toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      });

      // Compact collapsed single-line card
      const resolvedResponse = {
        replace_original: true,
        attachments: [
          {
            color: '#64748B',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `:white_check_mark: *Resolved* — ${alertTitle}\n_Acknowledged by @${userName} · ${nowTime} IST_`,
                },
              },
            ],
          },
        ],
      };

      // Also call chat.update if SLACK_BOT_TOKEN is present
      const slackBotToken = Deno.env.get('SLACK_BOT_TOKEN');
      if (slackBotToken && channelId && messageTs) {
        try {
          await fetch('https://slack.com/api/chat.update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${slackBotToken}`,
            },
            body: JSON.stringify({
              channel: channelId,
              ts: messageTs,
              ...resolvedResponse,
            }),
          });
        } catch (slackErr) {
          console.warn('[Slack Interactivity] chat.update call failed:', slackErr);
        }
      }

      // If response_url is available, notify response_url
      if (responseUrl) {
        try {
          await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(resolvedResponse),
          });
        } catch (hookErr) {
          console.warn('[Slack Interactivity] response_url call failed:', hookErr);
        }
      }

      return new Response(JSON.stringify(resolvedResponse), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle "Retry" button
    if (actionId === 'retry') {
      // Trigger process-email-queue function if applicable
      const emailWorkerUrl = `${supabaseUrl}/functions/v1/process-email-queue`;
      try {
        await fetch(emailWorkerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ trigger: 'slack_retry', actor: userName }),
        });
      } catch (retryErr) {
        console.warn('[Slack Interactivity] Worker retry trigger failed:', retryErr);
      }

      const retryResponse = {
        replace_original: true,
        attachments: [
          {
            color: '#EF9F27',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `:arrows_counterclockwise: *Retrying Job* — Triggered by @${userName}`,
                },
              },
            ],
          },
        ],
      };

      if (responseUrl) {
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(retryResponse),
        });
      }

      return new Response(JSON.stringify(retryResponse), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, action: actionId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Slack Interactivity] Exception:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
