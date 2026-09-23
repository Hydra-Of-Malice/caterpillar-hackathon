/**
 * Two-way chat with the operator's own supervisor (`/tc/chat/{other_user_id}`), polled every
 * `POLL.chat`. Sending is optimistic: the bubble appears at once, and if the post fails the bubble
 * is removed and the words go back into the box, so nothing is lost silently.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { chatApi, errorText } from '../../api';
import { POLL } from '../../constants';
import { GmtTime, TcEmpty, TcError, TcLoading } from '../../components';
import { Button, Icon, cx } from '../../../components/ui';
import { useResource } from '../../../lib/hooks';
import type { ChatMessage, ChatThread } from '../../types';
import { Note, TOUCH_BIG } from './common';

/** A locally-added bubble, kept until the server echoes the same text back. */
interface Local {
  key: string;
  text: string;
  ts: number;
  sending: boolean;
}

let localSeq = 0;

function echoed(messages: ChatMessage[], local: Local, meId: string): boolean {
  return messages.some((m) => m.from_user_id === meId && m.text === local.text && Math.abs(m.ts - local.ts) < 180);
}

function Bubble({ mine, system, children }: { mine: boolean; system?: boolean; children: ReactNode }) {
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[85%] border-2 px-4 py-3 text-body-lg',
          system
            ? 'border-outline-variant bg-surface-container-low text-on-surface-variant'
            : mine
              ? 'border-cat-border bg-cat/15 text-on-surface'
              : 'border-outline bg-surface-container-high text-on-surface',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Thread({ supervisorId, meId, taskId }: { supervisorId: string; meId: string; taskId?: string }) {
  const r = useResource<ChatThread>(() => chatApi.thread(supervisorId), [supervisorId], POLL.chat);
  const [local, setLocal] = useState<Local[]>([]);
  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = [...(r.data?.messages ?? [])].sort((a, b) => a.ts - b.ts);
  const pending = local.filter((l) => !echoed(messages, l, meId));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    localSeq += 1;
    const entry: Local = { key: `local-${localSeq}`, text, ts: Date.now() / 1000, sending: true };
    setLocal((p) => [...p, entry]);
    setDraft('');
    setFailed(null);
    setBusy(true);
    try {
      await chatApi.send(supervisorId, text, taskId);
      setLocal((p) => p.map((l) => (l.key === entry.key ? { ...l, sending: false } : l)));
      r.reload();
    } catch (err) {
      setLocal((p) => p.filter((l) => l.key !== entry.key));
      setDraft(text);
      setFailed(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {r.loading && !r.data && <TcLoading label="Loading messages" />}
      {r.error && !r.data && <TcError error={r.error} what="Your messages" onRetry={r.reload} />}

      <div className="max-h-[52vh] space-y-3 overflow-y-auto" role="log" aria-live="polite" aria-label="Messages with your supervisor">
        {r.data && messages.length === 0 && pending.length === 0 && (
          <TcEmpty icon="forum" title="No messages yet">
            Anything you send here goes straight to your supervisor.
          </TcEmpty>
        )}
        {messages.map((m) => (
          <Bubble key={m.message_id} mine={m.from_user_id === meId} system={m.system}>
            {m.system && (
              <div className="mb-1 flex items-center gap-1 font-display text-label-sm uppercase text-on-surface-muted">
                <Icon name="smart_toy" size={16} /> Automatic message
              </div>
            )}
            <p className="whitespace-pre-wrap break-words">{m.text}</p>
            <div className="mt-1 font-display text-label-sm uppercase text-on-surface-muted">
              {m.from_user_id === meId ? 'Sent' : 'Received'} <GmtTime ts={m.ts} gmt={m.ts_gmt} />
            </div>
          </Bubble>
        ))}
        {pending.map((l) => (
          <Bubble key={l.key} mine>
            <p className="whitespace-pre-wrap break-words opacity-80">{l.text}</p>
            <div className="mt-1 flex items-center gap-1 font-display text-label-sm uppercase text-on-surface-muted">
              <Icon name={l.sending ? 'schedule' : 'check'} size={14} />
              {l.sending ? 'Sending…' : 'Sent'}
            </div>
          </Bubble>
        ))}
        <div ref={endRef} />
      </div>

      {failed && (
        <Note tone="danger" title="Message not sent" role="alert">
          {failed} Your words are back in the box — try again when you have signal.
        </Note>
      )}

      <form className="flex items-end gap-2" onSubmit={send}>
        <label className="sr-only" htmlFor="op-chat-input">
          Message your supervisor
        </label>
        <textarea
          id="op-chat-input"
          className="input h-auto min-h-[64px] resize-none py-3 text-body-lg"
          rows={2}
          value={draft}
          placeholder="Message your supervisor…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="primary" size="cab" icon="send" disabled={!draft.trim() || busy} className={TOUCH_BIG}>
          Send
        </Button>
      </form>
    </div>
  );
}

/**
 * Chat panel for the operator screens. With no supervisor on record it says so plainly rather than
 * showing an empty thread.
 */
export function ChatPanel({
  supervisorId,
  supervisorName,
  meId,
  taskId,
}: {
  supervisorId: string | null | undefined;
  supervisorName?: string | null;
  meId: string;
  taskId?: string;
}) {
  if (!supervisorId) {
    return (
      <Note tone="info" icon="person_off" title="No supervisor assigned yet">
        Once a supervisor is assigned to you, you can message them from here.
      </Note>
    );
  }
  return (
    <section className="panel p-4" aria-label={`Chat with ${supervisorName ?? 'your supervisor'}`}>
      <h2 className="mb-3 flex flex-wrap items-baseline gap-x-2 font-display text-headline-sm uppercase text-on-surface">
        <Icon name="forum" size={24} className="text-on-surface-muted" />
        {supervisorName ?? 'Your supervisor'}
        <span className="font-body text-label-sm normal-case text-on-surface-muted">times in GMT</span>
      </h2>
      <Thread supervisorId={supervisorId} meId={meId} taskId={taskId} />
    </section>
  );
}
