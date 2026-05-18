import React, { useCallback, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';
import { FaImage } from 'react-icons/fa';

export default function CrmPasteScreenshotZone({ onTextExtracted, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const runOcr = useCallback(
    async (file) => {
      if (!file || disabled) return;
      setError('');
      setBusy(true);
      let worker;
      try {
        worker = await createWorker('eng');
        const { data } = await worker.recognize(file);
        const text = String(data?.text || '').trim();
        if (!text) {
          setError('No text found in image. Try a clearer screenshot.');
          return;
        }
        onTextExtracted?.(text);
      } catch (e) {
        setError(e?.message || 'Could not read image.');
      } finally {
        if (worker) await worker.terminate();
        setBusy(false);
      }
    },
    [disabled, onTextExtracted],
  );

  const onPaste = useCallback(
    (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type?.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) runOcr(file);
          return;
        }
      }
    },
    [runOcr],
  );

  return (
        <div
      className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-4"
      onPaste={onPaste}
    >
      <div className="flex items-start gap-3">
        <FaImage className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800">Paste screenshot of contact info</p>
          <p className="text-xs text-gray-500 mt-1">
            Copy a screenshot (Ctrl+C), click here and paste (Ctrl+V), or choose an image file. Text is extracted
            automatically.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled || busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) runOcr(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => fileRef.current?.click()}
            className="mt-2 text-xs px-2 py-1 rounded border border-violet-300 text-violet-800 hover:bg-violet-100 disabled:opacity-50"
          >
            {busy ? 'Reading image…' : 'Choose image file'}
          </button>
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
