import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaDownload, FaExpand, FaExternalLinkAlt, FaTimes, FaSearchPlus, FaSearchMinus, FaSyncAlt } from 'react-icons/fa';
import { adminTrustSafetyAPI } from '../../../api/api';
import { resolveMediaUrl } from '../../../utils/mediaUrl';
import { formatBytes } from '../../../utils/trustSafety';

function Lightbox({ src, alt, onClose }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.25));
      if (e.key === '-') setZoom((z) => Math.max(0.5, z - 0.25));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[140] bg-slate-950/90 flex flex-col" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="flex items-center justify-between px-4 py-2 text-white text-xs">
        <span className="truncate">{alt}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="p-2 rounded hover:bg-white/10" aria-label="Zoom out">
            <FaSearchMinus />
          </button>
          <span className="tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="p-2 rounded hover:bg-white/10" aria-label="Zoom in">
            <FaSearchPlus />
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded hover:bg-white/10" aria-label="Close preview">
            <FaTimes />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-4" onClick={onClose}>
        <img
          src={src}
          alt={alt}
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          className="max-h-full max-w-full object-contain transition-transform select-none"
        />
      </div>
    </div>,
    document.body
  );
}

/**
 * Renders a technician-uploaded file via a short-lived signed URL obtained from the
 * admin-only file endpoint. The URL is refreshed on demand once it expires.
 */
export default function DocumentPreview({ documentId, file: initialFile, technicianName, title }) {
  const [file, setFile] = useState(initialFile || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    setFile(initialFile || null);
    setImgBroken(false);
  }, [initialFile, documentId]);

  const expired = file?.expires_at ? Date.parse(file.expires_at) <= Date.now() : false;

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminTrustSafetyAPI.documentFile(documentId);
      setFile(res?.file || null);
      setImgBroken(false);
    } catch (e) {
      setError(e?.message || 'Could not load the file.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!file && documentId && !initialFile) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  if (loading && !file) {
    return <div className="h-48 rounded-lg bg-slate-100 animate-pulse" aria-busy="true" />;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-center justify-between gap-2">
        <span>{error}</span>
        <button type="button" onClick={refresh} className="font-semibold underline">Retry</button>
      </div>
    );
  }
  if (!file || !file.available) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
        <p className="text-xs font-semibold text-slate-700">No file attached</p>
        <p className="text-[11px] text-slate-500 mt-1">
          {file?.reason || 'The technician has not uploaded a file for this document.'} Nothing can be visually verified — request the document before deciding.
        </p>
      </div>
    );
  }
  if (expired) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-xs text-slate-700">The secure preview link expired.</p>
        <button type="button" onClick={refresh} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-tf-blue hover:underline">
          <FaSyncAlt className="h-3 w-3" /> Reload preview
        </button>
      </div>
    );
  }

  const src = resolveMediaUrl(file.url);
  const downloadHref = resolveMediaUrl(file.download_url || file.url);
  const alt = `${title || 'Document'} — ${technicianName || 'technician'}`;

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
        {file.kind === 'image' && !imgBroken ? (
          <button type="button" onClick={() => setOpen(true)} className="block w-full group" aria-label="Open full-size preview">
            <img src={src} alt={alt} onError={() => setImgBroken(true)} className="w-full max-h-72 object-contain bg-white" />
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-slate-900/80 px-2 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <FaExpand /> Zoom
            </span>
          </button>
        ) : file.kind === 'pdf' ? (
          <iframe src={`${src}#toolbar=0`} title={alt} className="w-full h-80 bg-white" />
        ) : (
          <div className="p-6 text-center">
            <p className="text-xs font-semibold text-slate-700">{file.filename}</p>
            <p className="text-[11px] text-slate-500 mt-1">{file.content_type || 'Unknown type'} · No inline preview for this file type. Open the original to review it.</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="truncate" title={file.filename}>
          {file.filename}
          {file.byte_size ? ` · ${formatBytes(file.byte_size)}` : ''}
          {file.content_type ? ` · ${file.content_type}` : ''}
        </span>
        <div className="flex items-center gap-3">
          <a href={src} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-tf-blue hover:underline">
            <FaExternalLinkAlt className="h-2.5 w-2.5" /> Open original
          </a>
          <a href={downloadHref} className="inline-flex items-center gap-1 font-medium text-tf-blue hover:underline">
            <FaDownload className="h-2.5 w-2.5" /> Download
          </a>
        </div>
      </div>
      <p className="text-[10px] text-slate-400">Secure link expires in {Math.max(1, Math.round((Date.parse(file.expires_at) - Date.now()) / 60000))} min and is issued to signed-in admins only — do not share it.</p>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </div>
  );
}
