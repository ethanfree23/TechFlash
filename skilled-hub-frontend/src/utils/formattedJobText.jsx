import React from 'react';

/** Inline **bold** segments (common in job descriptions edited as Markdown-like text). */
export function renderInlineJobMarkdown(text) {
  if (text == null || text === '') return null;
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) return <strong key={i} className="font-semibold text-gray-900">{m[1]}</strong>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/**
 * Renders job description with preserved structure: paragraphs, blank-line spacing,
 * `-` / `*` bullets, numbered lines (`1.`), and **bold**.
 */
export function FormattedJobDescription({ text, className = '' }) {
  if (text == null || String(text).trim() === '') return null;

  const lines = String(text).split(/\r?\n/);
  const out = [];
  let ulItems = [];
  let olItems = [];
  let key = 0;

  const flushUl = () => {
    if (!ulItems.length) return;
    out.push(
      <ul key={`ul-${key++}`} className="mb-3 list-disc space-y-1 pl-5 text-gray-700 last:mb-0">
        {ulItems.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {renderInlineJobMarkdown(item)}
          </li>
        ))}
      </ul>
    );
    ulItems = [];
  };

  const flushOl = () => {
    if (!olItems.length) return;
    out.push(
      <ol key={`ol-${key++}`} className="mb-3 list-decimal space-y-1 pl-5 text-gray-700 last:mb-0">
        {olItems.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {renderInlineJobMarkdown(item)}
          </li>
        ))}
      </ol>
    );
    olItems = [];
  };

  const flushLists = () => {
    flushUl();
    flushOl();
  };

  lines.forEach((line) => {
    if (line.trim() === '') {
      flushLists();
      out.push(<div key={`gap-${key++}`} className="h-3" aria-hidden />);
      return;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const olMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (ulMatch) {
      flushOl();
      ulItems.push(ulMatch[1]);
      return;
    }
    if (olMatch) {
      flushUl();
      olItems.push(olMatch[2]);
      return;
    }

    flushLists();
    out.push(
      <p key={`p-${key++}`} className="mb-3 text-gray-700 leading-relaxed last:mb-0">
        {renderInlineJobMarkdown(line)}
      </p>
    );
  });

  flushLists();

  return <div className={className}>{out}</div>;
}
