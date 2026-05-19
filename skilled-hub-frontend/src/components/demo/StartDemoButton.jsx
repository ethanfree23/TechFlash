import React from 'react';
import { FaPlay } from 'react-icons/fa';

export default function StartDemoButton({ onClick, className = '', floating = false }) {
  const base =
    'inline-flex items-center gap-2 rounded-lg bg-[#FE6711] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 shadow-sm';
  if (floating) {
    return (
      <button
        type="button"
        data-demo="walkthrough-start"
        onClick={onClick}
        className={`fixed bottom-6 right-6 z-[90] ${base} ${className}`}
      >
        <FaPlay className="text-xs" />
        Start Demo
      </button>
    );
  }
  return (
    <button type="button" data-demo="walkthrough-start" onClick={onClick} className={`${base} ${className}`}>
      <FaPlay className="text-xs" />
      Start Demo
    </button>
  );
}
