import { useState } from 'react';
import type { Citation } from '../../lib/types';
import { Icon, cx } from '../ui';

/** "Site SOP-EX-04 §3.2, v1.2" */
export function citationLabel(c: Citation): string {
  const head = [c.doc_id, c.section].filter(Boolean).join(' ');
  return c.version ? `${head}, ${c.version}` : head;
}

const CHIP = 'inline-flex h-7 max-w-full items-center gap-1 whitespace-nowrap rounded border px-2 text-footnote font-semibold';

/** Citation chip "[Site SOP-EX-04 §3.2, v1.2]". Clickable when `onClick` is given (expands the passage). */
export function CitationChip({ citation, open, onClick, className }: { citation: Citation; open?: boolean; onClick?: () => void; className?: string }) {
  const label = `[${citationLabel(citation)}]`;
  const title = citation.title ? `${citation.title} — ${citationLabel(citation)}` : citationLabel(citation);
  if (!onClick) {
    return (
      <span className={cx(CHIP, 'border-outline-variant bg-surface-container-low text-notice-dark', className)} title={title}>
        <Icon name="description" size={14} />
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-expanded={!!open}
      onClick={onClick}
      title={`${title} — ${open ? 'hide' : 'show'} the quoted passage`}
      className={cx(
        CHIP,
        'transition-colors duration-quick',
        open ? 'border-notice-dark bg-notice/10 text-on-surface' : 'border-outline-variant bg-surface-container-low text-notice-dark hover:border-notice-dark',
        className,
      )}
    >
      <Icon name="description" size={14} />
      <span className="truncate">{label}</span>
      <Icon name={open ? 'expand_less' : 'expand_more'} size={14} />
    </button>
  );
}

/** Plain citation tag for content that only carries a citation string (e.g. content-review diffs). */
export function CitationTag({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'red' }) {
  return (
    <span
      className={cx(
        CHIP,
        'h-6',
        tone === 'red' ? 'border-danger bg-danger/10 text-danger-text' : 'border-outline-variant bg-surface-container-low text-notice-dark',
      )}
      title={text}
    >
      <Icon name={tone === 'red' ? 'link_off' : 'description'} size={14} />
      <span className="truncate">[{text}]</span>
    </span>
  );
}

/** The quoted source passage in a grey box. */
export function CitationPassage({ citation }: { citation: Citation }) {
  return (
    <blockquote className="border-l-2 border-outline-strong bg-surface-container-low px-4 py-3">
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-on-surface-muted">
        <span>{citation.title ?? citation.doc_id}</span>
        <span>·</span>
        <span>
          {citation.section} {citation.version}
        </span>
      </div>
      <p className="text-body-sm text-on-surface-variant">
        {citation.text ? `“${citation.text}”` : 'The passage text was not included with this citation. Open the approved document to read it.'}
      </p>
    </blockquote>
  );
}

/** Row of citation chips; clicking a chip expands its quoted passage below (one at a time). */
export function Citations({ citations, defaultOpen = null, className }: { citations: Citation[] | undefined | null; defaultOpen?: number | null; className?: string }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  if (!citations?.length) return null;
  const current = open !== null ? citations[open] : undefined;
  return (
    <div className={cx('space-y-2', className)}>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c, i) => (
          <CitationChip key={`${c.chunk_id ?? c.doc_id}-${c.section}-${i}`} citation={c} open={open === i} onClick={() => setOpen(open === i ? null : i)} />
        ))}
      </div>
      {current && <CitationPassage citation={current} />}
    </div>
  );
}
