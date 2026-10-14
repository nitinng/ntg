import React from 'react';
import { mrkdwnToHtml, mrkdwnToPlain } from './mrkdwn';

/**
 * Renders a Slack payload the way Slack renders it.
 *
 * Deliberately plain. Slack gives a message no background colour, no border,
 * no padding and no corner radius -- the only visual control a card has is the
 * 4px attachment bar. The gallery used to draw a rounded, panelled card that
 * looked better than anything the API can produce, so every comparison against
 * the real channel came up short. What is drawn here is what Slack can do, and
 * nothing more, which is the whole point: if it looks wrong in the preview it
 * will look wrong in the channel, and it can be fixed before anyone ships it.
 */

export type SlackTheme = 'light' | 'dark';

export interface SlackAttachment {
  color?: string;
  blocks?: any[];
  fallback?: string;
}

export interface SlackMessage {
  text?: string;
  blocks?: any[];
  attachments?: SlackAttachment[];
  plain_text?: string;
}

interface Props {
  payload: SlackMessage;
  theme?: SlackTheme;
  appName: string;
  timestamp?: string;
  /** Workflow Builder discards blocks; show the plain-text variant instead. */
  asWorkflowText?: boolean;
}

const Mrkdwn: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <div
    className={className}
    dangerouslySetInnerHTML={{ __html: mrkdwnToHtml(text) }}
  />
);

const Block: React.FC<{ block: any; theme: SlackTheme }> = ({ block, theme }) => {
  const muted = theme === 'dark' ? 'text-[#ABABAD]' : 'text-[#616061]';
  const body = theme === 'dark' ? 'text-[#D1D2D3]' : 'text-[#1D1C1D]';

  switch (block?.type) {
    case 'header':
      // Slack renders header blocks noticeably larger and heavier than body
      // text. This is the only type that reliably marks where a card begins.
      return (
        <div className={`slack-header text-[19px] leading-[1.3] font-black ${body} mb-2`}>
          {block.text?.text}
        </div>
      );

    case 'divider':
      return (
        <hr className={`my-2 border-0 h-px ${theme === 'dark' ? 'bg-[#35373B]' : 'bg-[#DDDDDD]'}`} />
      );

    case 'context':
      return (
        <div className={`flex flex-wrap items-center gap-1.5 text-[13px] leading-[1.4] ${muted} mt-2`}>
          {(block.elements || []).map((el: any, i: number) => (
            <Mrkdwn key={i} text={el.text || ''} className="slack-inline" />
          ))}
        </div>
      );

    case 'actions':
      return (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {(block.elements || []).map((el: any, i: number) => {
            const primary = el.style === 'primary';
            const danger = el.style === 'danger';
            const base =
              'px-3 py-[6px] rounded text-[14px] font-bold border transition-colors select-none';
            const look = primary
              ? 'bg-[#007A5A] hover:bg-[#148567] text-white border-transparent'
              : danger
              ? 'bg-[#E01E5A] hover:bg-[#C91A50] text-white border-transparent'
              : theme === 'dark'
              ? 'bg-transparent text-[#D1D2D3] border-[#868686] hover:bg-white/5'
              : 'bg-white text-[#1D1C1D] border-[#BBBABB] hover:bg-[#F8F8F8]';
            return (
              <span key={i} className={`${base} ${look}`}>
                {el.text?.text}
              </span>
            );
          })}
        </div>
      );

    case 'section':
      if (block.fields?.length) {
        // Slack lays fields out in two columns and wraps to a new row per pair.
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-2">
            {block.fields.map((f: any, i: number) => (
              <Mrkdwn
                key={i}
                text={f.text || ''}
                className={`text-[15px] leading-[1.46] ${body} slack-field`}
              />
            ))}
          </div>
        );
      }
      return (
        <Mrkdwn
          text={block.text?.text || ''}
          className={`text-[15px] leading-[1.46] ${body} mt-2`}
        />
      );

    default:
      return null;
  }
};

export const BlockKitPreview: React.FC<Props> = ({
  payload,
  theme = 'light',
  appName,
  timestamp = 'Today at 2:04 PM',
  asWorkflowText = false
}) => {
  const surface = theme === 'dark' ? 'bg-[#1A1D21]' : 'bg-white';
  const body = theme === 'dark' ? 'text-[#D1D2D3]' : 'text-[#1D1C1D]';
  const muted = theme === 'dark' ? 'text-[#ABABAD]' : 'text-[#616061]';

  const attachments = payload.attachments || [];
  const looseBlocks = !attachments.length ? payload.blocks || [] : [];

  return (
    <div className={`${surface} slack-surface slack-theme-${theme} px-4 py-3 font-sans`}>
      <div className="flex gap-2">
        <div className="w-9 h-9 rounded shrink-0 bg-[#4A154B] text-white grid place-items-center text-[15px] font-black">
          {appName.charAt(0)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className={`text-[15px] font-black ${body}`}>{appName}</span>
            <span
              className={`px-1 rounded-sm text-[10px] font-bold uppercase tracking-wide ${
                theme === 'dark' ? 'bg-[#35373B] text-[#ABABAD]' : 'bg-[#E8E8E8] text-[#616061]'
              }`}
            >
              {asWorkflowText ? 'Workflow' : 'App'}
            </span>
            <span className={`text-[12px] ${muted}`}>{timestamp}</span>
          </div>

          {asWorkflowText ? (
            <pre
              className={`mt-1 text-[15px] leading-[1.46] ${body} whitespace-pre-wrap font-sans`}
            >
              {mrkdwnToPlain(payload.plain_text || payload.text || '')}
            </pre>
          ) : (
            <>
              {looseBlocks.map((b: any, i: number) => (
                <Block key={i} block={b} theme={theme} />
              ))}

              {attachments.map((att, ai) => (
                <div key={ai} className="mt-1 flex gap-0 items-stretch">
                  {/* The entire visual frame Slack offers: a 4px bar. */}
                  <div
                    className="w-1 rounded-sm shrink-0"
                    style={{ backgroundColor: att.color || '#DDDDDD' }}
                  />
                  <div className="pl-3 min-w-0 flex-1">
                    {(att.blocks || []).map((b: any, i: number) => (
                      <Block key={i} block={b} theme={theme} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlockKitPreview;
