import React from 'react';
import StatusBadge from '../command-center/StatusBadge';
import VerificationCellPopover from './VerificationCellPopover';
import { formatLicenseUploadedDate, licenseStatusLabel } from '../../../utils/licenseCredentials';
import { formatPhoneInput } from '../../../utils/phone';

const LICENSE_VARIANT = {
  yes: 'success',
  no: 'orange',
  na: 'neutral',
};

const REFERENCE_VARIANT = {
  0: 'danger',
  1: 'orange',
  2: 'warning',
};

const BACKGROUND_VARIANT = {
  incomplete: 'danger',
  processing: 'warning',
  passed: 'success',
  review: 'orange',
  canceled: 'neutral',
  failed: 'danger',
};

function SendSmsButton({ onSendSms, suggestion }) {
  if (!onSendSms) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSendSms(suggestion || '');
      }}
      className="mt-3 inline-flex items-center rounded-md bg-tf-blue px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-tf-blue-dark"
    >
      Send SMS
    </button>
  );
}

function Field({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between gap-3 text-[11px]">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-800 text-right break-all">{value}</span>
    </div>
  );
}

export function TradeLicenseCell({ inventory, onSendSms, onViewDocument }) {
  const trade = inventory?.trade_license;
  if (!trade) return <span className="text-[10px] text-slate-400">—</span>;

  const label = trade.state === 'yes' ? 'YES' : trade.state === 'no' ? 'NO' : trade.state === 'na' ? 'N/A' : null;
  const trigger = label ? (
    <StatusBadge variant={LICENSE_VARIANT[trade.state] || 'warning'}>{label}</StatusBadge>
  ) : (
    <span className="text-[10px] text-slate-400" title="Credential status unknown">—</span>
  );

  return (
    <VerificationCellPopover ariaLabel="Trade license details" trigger={trigger}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Trade license</p>
      {trade.state === 'na' ? (
        <p className="mt-2 text-xs text-slate-700">
          Technician reported that they do not currently hold a trade license or credential.
        </p>
      ) : null}
      {trade.state === 'unknown' ? (
        <p className="mt-2 text-xs text-slate-700">
          Technician has not answered whether they hold a trade license or credential.
        </p>
      ) : null}
      {trade.state === 'no' && trade.missing?.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs text-slate-700">Technician reported holding a credential.</p>
          <p className="mt-1 text-[11px] font-semibold text-orange-800">Missing:</p>
          <ul className="mt-0.5 list-disc pl-4 text-[11px] text-orange-900">
            {trade.missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {(trade.documents || []).map((doc) => (
        <div key={doc.id} className="mt-2 rounded-md border border-slate-100 bg-slate-50/80 p-2">
          <Field label="Title" value={doc.issuer} />
          <Field label="Number" value={doc.document_number} />
          <Field label="Status" value={licenseStatusLabel(doc.status)} />
          <Field label="Uploaded" value={formatLicenseUploadedDate(doc.created_at)} />
          {doc.has_file && doc.file_url ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewDocument?.(doc);
              }}
              className="mt-2 block"
            >
              <img src={doc.file_url} alt="" className="h-16 w-auto max-w-full rounded border border-slate-200 object-cover" />
            </button>
          ) : (
            <p className="mt-1 text-[11px] text-slate-500">No image uploaded</p>
          )}
        </div>
      ))}
      <SendSmsButton onSendSms={onSendSms} suggestion={inventory?.suggested_sms?.trade_license} />
    </VerificationCellPopover>
  );
}

export function ReferencesCell({ inventory, onSendSms }) {
  const refs = inventory?.professional_references;
  if (!refs) return <span className="text-[10px] text-slate-400">—</span>;

  const count = Number(refs.count || 0);
  const display = refs.display_count || String(count);
  const variant = count >= 3 ? 'success' : REFERENCE_VARIANT[count] || 'warning';

  return (
    <VerificationCellPopover
      ariaLabel="Professional references"
      trigger={<StatusBadge variant={variant}>{display}</StatusBadge>}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Professional references</p>
      <p className="mt-1 text-xs text-slate-700">{count} stored{count >= 3 ? ' · complete' : ` · ${refs.missing_count} still needed`}</p>
      {(refs.references || []).length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">No professional references stored.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {refs.references.map((ref) => (
            <div key={ref.id} className="rounded-md border border-slate-100 bg-slate-50/80 p-2 space-y-0.5">
              <Field label="Name" value={ref.full_name} />
              <Field label="Company" value={ref.company_name} />
              <Field label="Phone" value={ref.phone ? formatPhoneInput(ref.phone) : ''} />
              <Field label="Email" value={ref.email} />
              <Field label="Status" value={ref.status} />
            </div>
          ))}
        </div>
      )}
      <SendSmsButton onSendSms={onSendSms} suggestion={inventory?.suggested_sms?.professional_references} />
    </VerificationCellPopover>
  );
}

export function BackgroundCheckCell({ inventory, onSendSms }) {
  const bg = inventory?.background_check;
  if (!bg) return <span className="text-[10px] text-slate-400">—</span>;

  const variant = BACKGROUND_VARIANT[bg.color_bucket] || 'warning';
  const details = bg.details || {};

  return (
    <VerificationCellPopover
      ariaLabel="Background check details"
      trigger={<StatusBadge variant={variant}>{bg.label || 'Incomplete'}</StatusBadge>}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Background check</p>
      <div className="mt-2 space-y-0.5">
        <Field label="Status" value={bg.label} />
        <Field label="Package" value={details.package_name} />
        <Field label="Initiated" value={details.started_at ? formatLicenseUploadedDate(details.started_at) : ''} />
        <Field label="Completed" value={details.completed_at ? formatLicenseUploadedDate(details.completed_at) : ''} />
        <Field
          label="Admin override"
          value={details.admin_override_status && details.admin_override_status !== 'none' ? details.admin_override_status.replace(/_/g, ' ') : ''}
        />
      </div>
      <SendSmsButton onSendSms={onSendSms} suggestion={inventory?.suggested_sms?.background_check} />
    </VerificationCellPopover>
  );
}
