import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  adminEmailQaAPI,
  adminLicensingSettingsAPI,
  adminMailtrapAuditAPI,
  adminMembershipTierConfigsAPI,
} from '../../api/api';
import AlertModal from '../AlertModal';
import { auth } from '../../auth';
import SystemControlsCoupons from './SystemControlsCoupons';
import SystemControlsSimulatedMarkers from './SystemControlsSimulatedMarkers';
import AdminJobAccessSettings from './AdminJobAccessSettings';
import AdminBackendPlaceholder from '../settings/AdminBackendPlaceholder';
import SettingsCard from '../settings/SettingsCard';

/** Must match EmailQaRunner::CONFIRMATION_TEXT on the API. */
const EMAIL_QA_PHRASE = 'SEND_TEST_EMAILS';

/** Accepts SEND_TEST_EMAILS, common typo SEND TEST EMAILS (spaces), case-insensitive. */
function parseEmailQaConfirmation(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const t = raw.trim();
  const normalized = t.toUpperCase().replace(/\s+/g, '_').replace(/_+/g, '_');
  if (normalized === EMAIL_QA_PHRASE) return EMAIL_QA_PHRASE;
  return t;
}

const US_STATE_OPTIONS = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['DC', 'District of Columbia'],
];

const emptyNewTier = () => ({
  slug: '',
  display_name: '',
  monthly_fee_dollars: '0',
  commission_percent: '10',
  early_access_delay_hours: '0',
  sort_order: '0',
  stripe_price_id: '',
});

function tierToFormRow(t, audience) {
  return {
    id: t.id,
    slug: t.slug,
    display_name: t.display_name || '',
    monthly_fee_dollars: (t.monthly_fee_cents / 100).toFixed(2),
    commission_percent: String(t.commission_percent),
    early_access_delay_hours:
      audience === 'technician' ? String(t.early_access_delay_hours ?? 0) : '',
    sort_order: String(t.sort_order ?? 0),
    stripe_price_id: t.stripe_price_id || '',
  };
}

export default function SystemControlsPricing({ systemSubTab: controlledSubTab, onSystemSubTabChange }) {
  const [audience, setAudience] = useState('technician');
  const [uncontrolledSub, setUncontrolledSub] = useState('pricing');
  const systemSubTab = controlledSubTab != null ? controlledSubTab : uncontrolledSub;
  const setSystemSubTab = (next) => {
    onSystemSubTabChange?.(next);
    if (controlledSubTab == null) setUncontrolledSub(next);
  };
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newTier, setNewTier] = useState(emptyNewTier);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [provisionBusyId, setProvisionBusyId] = useState(null);
  const [localOnlyStateCodes, setLocalOnlyStateCodes] = useState([]);
  const [savingLicensing, setSavingLicensing] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  const [mailtrapAudit, setMailtrapAudit] = useState(null);
  const [mailtrapLoading, setMailtrapLoading] = useState(false);
  const [mailtrapError, setMailtrapError] = useState(null);
  const [emailQaTemplates, setEmailQaTemplates] = useState([]);
  const [emailQaLoading, setEmailQaLoading] = useState(false);
  const [emailQaError, setEmailQaError] = useState(null);
  const [emailQaPreview, setEmailQaPreview] = useState(null);
  const [emailQaBusyKey, setEmailQaBusyKey] = useState(null);
  const [emailQaConfirmation, setEmailQaConfirmation] = useState('');
  const [emailQaRecipient, setEmailQaRecipient] = useState('');
  const [emailQaLastSendSummary, setEmailQaLastSendSummary] = useState(null);
  const [emailQaSendAllProgress, setEmailQaSendAllProgress] = useState(null);
  const [emailQaSuccessAlert, setEmailQaSuccessAlert] = useState(null);
  const [emailQaSearch, setEmailQaSearch] = useState('');
  const previewPanelRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminMembershipTierConfigsAPI.list(audience);
      const list = res?.membership_tier_configs || [];
      setRows(list.map((t) => tierToFormRow(t, audience)));
    } catch (e) {
      setError(e.message || 'Failed to load tiers');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [audience]);

  useEffect(() => {
    load();
  }, [load]);

  const loadLicensing = useCallback(async () => {
    try {
      const res = await adminLicensingSettingsAPI.get();
      const codes = Array.isArray(res?.local_only_state_codes) ? res.local_only_state_codes : [];
      setLocalOnlyStateCodes(codes);
    } catch {
      setLocalOnlyStateCodes([]);
    }
  }, []);

  const toggleLocalOnlyState = (code) => {
    setLocalOnlyStateCodes((prev) => (
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code].sort()
    ));
  };

  const filteredStateOptions = US_STATE_OPTIONS.filter(([code, name]) => {
    const q = stateSearch.trim().toLowerCase();
    if (!q) return true;
    return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (systemSubTab !== 'licensing') return;
    loadLicensing();
  }, [systemSubTab, loadLicensing]);

  const loadMailtrapAudit = useCallback(async () => {
    setMailtrapLoading(true);
    setMailtrapError(null);
    try {
      const res = await adminMailtrapAuditAPI.get();
      setMailtrapAudit(res || null);
    } catch (e) {
      setMailtrapError(e.message || 'Failed to load mail audit');
      setMailtrapAudit(null);
    } finally {
      setMailtrapLoading(false);
    }
  }, []);

  useEffect(() => {
    if (systemSubTab !== 'mailtrap') return;
    loadMailtrapAudit();
  }, [systemSubTab, loadMailtrapAudit]);

  const loadEmailQaTemplates = useCallback(async () => {
    setEmailQaLoading(true);
    setEmailQaError(null);
    try {
      const res = await adminEmailQaAPI.listTemplates();
      const templates = Array.isArray(res?.templates) ? res.templates : [];
      setEmailQaTemplates(templates);
    } catch (e) {
      setEmailQaError(e.message || 'Failed to load email QA templates');
      setEmailQaTemplates([]);
    } finally {
      setEmailQaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (systemSubTab !== 'email_qa') return;
    loadEmailQaTemplates();
  }, [systemSubTab, loadEmailQaTemplates]);

  const emailQaDeliveryEmail = () => {
    const o = emailQaRecipient.trim();
    if (o) return o;
    return auth.getUser()?.email || 'your admin email';
  };

  const filteredEmailQaTemplates = useMemo(() => {
    const q = emailQaSearch.trim().toLowerCase();
    if (!q) return emailQaTemplates;
    return emailQaTemplates.filter((template) => (
      String(template.name || '').toLowerCase().includes(q) ||
      String(template.key || '').toLowerCase().includes(q) ||
      String(template.description || '').toLowerCase().includes(q) ||
      String(template.audience || '').toLowerCase().includes(q) ||
      String(template.trigger || '').toLowerCase().includes(q)
    ));
  }, [emailQaSearch, emailQaTemplates]);

  useEffect(() => {
    if (!emailQaPreview || !previewPanelRef.current) return;
    previewPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [emailQaPreview]);

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const pricingStats = useMemo(() => {
    const commVals = rows.map((r) => parseFloat(r.commission_percent)).filter((n) => !Number.isNaN(n));
    const missingStripe = rows.filter((r) => !String(r.stripe_price_id || '').trim()).length;
    const avgComm = commVals.length ? commVals.reduce((a, b) => a + b, 0) / commVals.length : 0;
    return {
      count: rows.length,
      missingStripe,
      avgComm: avgComm.toFixed(1),
    };
  }, [rows]);

  const handleSaveAll = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const r of rows) {
        const fee = parseFloat(r.monthly_fee_dollars);
        const comm = parseFloat(r.commission_percent);
        if (!String(r.slug || '').trim()) throw new Error('Each tier needs a slug');
        if (!String(r.display_name || '').trim()) throw new Error('Each tier needs a display name');
        if (Number.isNaN(fee) || fee < 0) throw new Error('Monthly fee cannot be negative');
        if (Number.isNaN(comm) || comm < 0 || comm > 100) throw new Error('Commission must be between 0 and 100');
        const early = audience === 'technician' ? parseInt(r.early_access_delay_hours, 10) : 0;
        if (audience === 'technician' && (Number.isNaN(early) || early < 0)) {
          throw new Error('Early access hours must be zero or positive');
        }
      }
      const originals = await adminMembershipTierConfigsAPI.list(audience);
      const byId = Object.fromEntries((originals.membership_tier_configs || []).map((t) => [t.id, t]));

      for (const r of rows) {
        const orig = byId[r.id];
        if (!orig) continue;
        const monthly_fee_cents = Math.round(parseFloat(r.monthly_fee_dollars) * 100) || 0;
        const commission_percent = parseFloat(r.commission_percent);
        const sort_order = parseInt(r.sort_order, 10) || 0;
        const stripe_price_id = r.stripe_price_id.trim() || null;
        const early =
          audience === 'technician'
            ? parseInt(r.early_access_delay_hours, 10)
            : null;

        const payload = {
          display_name: r.display_name.trim() || null,
          monthly_fee_cents,
          commission_percent,
          sort_order,
          stripe_price_id,
        };
        if (audience === 'technician') {
          payload.early_access_delay_hours = Number.isNaN(early) ? 0 : early;
        }

        const unchanged =
          (orig.display_name || '') === (r.display_name.trim() || '') &&
          orig.monthly_fee_cents === monthly_fee_cents &&
          Math.abs(orig.commission_percent - commission_percent) < 0.0001 &&
          orig.sort_order === sort_order &&
          (orig.stripe_price_id || '') === (stripe_price_id || '') &&
          (audience !== 'technician' ||
            (orig.early_access_delay_hours ?? 0) === (Number.isNaN(early) ? 0 : early));

        if (!unchanged) {
          await adminMembershipTierConfigsAPI.update(r.id, payload);
        }
      }
      await load();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTier = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const slug = newTier.slug.trim().toLowerCase();
      if (!slug) throw new Error('Slug is required');

      const monthly_fee_cents = Math.round(parseFloat(newTier.monthly_fee_dollars) * 100) || 0;
      const payload = {
        audience,
        slug,
        display_name: newTier.display_name.trim() || null,
        monthly_fee_cents,
        commission_percent: parseFloat(newTier.commission_percent) || 0,
        sort_order: parseInt(newTier.sort_order, 10) || 0,
        stripe_price_id: newTier.stripe_price_id.trim() || null,
      };
      if (audience === 'technician') {
        payload.early_access_delay_hours = parseInt(newTier.early_access_delay_hours, 10);
        if (Number.isNaN(payload.early_access_delay_hours)) payload.early_access_delay_hours = 0;
      }

      await adminMembershipTierConfigsAPI.create(payload);
      setAddOpen(false);
      setNewTier(emptyNewTier());
      await load();
    } catch (err) {
      setError(err.message || 'Could not create tier');
    } finally {
      setCreating(false);
    }
  };

  const handleProvisionStripe = async (rowId) => {
    setProvisionBusyId(rowId);
    setError(null);
    try {
      const res = await adminMembershipTierConfigsAPI.provisionStripe(rowId);
      if (res?.membership_tier_config) {
        setRows((prev) =>
          prev.map((r) => (r.id === rowId ? tierToFormRow(res.membership_tier_config, audience) : r))
        );
      }
    } catch (e) {
      setError(e.message || 'Failed to create Stripe price');
    } finally {
      setProvisionBusyId(null);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget || deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    setError(null);
    try {
      await adminMembershipTierConfigsAPI.remove(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteConfirmText('');
      await load();
    } catch (err) {
      setError(err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const previewEmailTemplate = async (templateKey) => {
    setEmailQaBusyKey(`preview:${templateKey}`);
    setEmailQaError(null);
    try {
      const res = await adminEmailQaAPI.preview(templateKey, emailQaRecipient);
      setEmailQaPreview(res || null);
    } catch (e) {
      setEmailQaError(e.message || 'Failed to preview template');
      setEmailQaPreview(null);
    } finally {
      setEmailQaBusyKey(null);
    }
  };

  const sendOneEmailTemplate = async (templateKey) => {
    const confirm = parseEmailQaConfirmation(emailQaConfirmation);
    if (confirm !== EMAIL_QA_PHRASE) {
      setEmailQaError(`Type ${EMAIL_QA_PHRASE} (underscores between words, not spaces).`);
      return;
    }
    setEmailQaBusyKey(`send:${templateKey}`);
    setEmailQaError(null);
    try {
      const recipientOpt = emailQaRecipient.trim();
      const res = await adminEmailQaAPI.sendOne(templateKey, confirm, recipientOpt || undefined);
      setEmailQaLastSendSummary({
        type: 'single',
        success: !!res?.delivered,
        templateKey,
        to: res?.to || [],
        mailError: res?.mail_error || null,
      });
      if (res?.delivered) {
        const tpl = emailQaTemplates.find((t) => t.key === templateKey);
        const toAddr = Array.isArray(res?.to) && res.to.length ? res.to[0] : emailQaDeliveryEmail();
        setEmailQaSuccessAlert({
          title: 'Test email sent',
          message: `"${tpl?.name || templateKey}" was sent successfully to ${toAddr}.`,
        });
      }
    } catch (e) {
      setEmailQaError(e.message || 'Failed to send test email');
      setEmailQaLastSendSummary(null);
    } finally {
      setEmailQaBusyKey(null);
    }
  };

  const sendAllEmailTemplates = async () => {
    const confirm = parseEmailQaConfirmation(emailQaConfirmation);
    if (confirm !== EMAIL_QA_PHRASE) {
      setEmailQaError(
        `Type ${EMAIL_QA_PHRASE} (underscores between words) before sending.`,
      );
      return;
    }
    if (!emailQaTemplates.length) {
      setEmailQaError('Load templates first (click Refresh).');
      return;
    }
    setEmailQaBusyKey('send_all');
    setEmailQaError(null);
    setEmailQaLastSendSummary(null);
    const errors = [];
    let deliveredCount = 0;
    const recipientOpt = emailQaRecipient.trim();
    try {
      for (let i = 0; i < emailQaTemplates.length; i += 1) {
        const t = emailQaTemplates[i];
        setEmailQaSendAllProgress({
          current: i + 1,
          total: emailQaTemplates.length,
          templateKey: t.key,
        });
        try {
          const res = await adminEmailQaAPI.sendOne(t.key, confirm, recipientOpt || undefined);
          if (res?.delivered) deliveredCount += 1;
          else {
            errors.push({
              key: t.key,
              message:
                res?.mail_error ||
                'Not delivered (no detail from API — redeploy API after updating mail env).',
            });
          }
        } catch (e) {
          errors.push({ key: t.key, message: e.message || 'Request failed' });
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      setEmailQaLastSendSummary({
        type: 'all',
        deliveredCount,
        totalCount: emailQaTemplates.length,
        errors,
      });
      if (deliveredCount > 0) {
        const allOk = deliveredCount === emailQaTemplates.length;
        setEmailQaSuccessAlert({
          title: allOk ? 'All test emails sent' : 'Some test emails sent',
          message: allOk
            ? `${deliveredCount} templates were sent successfully to your admin email.`
            : `${deliveredCount} of ${emailQaTemplates.length} templates were sent successfully. See failures below for the rest.`,
        });
      }
    } catch (e) {
      setEmailQaError(e.message || 'Send all stopped unexpectedly.');
    } finally {
      setEmailQaSendAllProgress(null);
      setEmailQaBusyKey(null);
    }
  };

  const subTabBtn = (id, label) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={systemSubTab === id}
      onClick={() => setSystemSubTab(id)}
      className={`shrink-0 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
        systemSubTab === id
          ? 'text-blue-600 border-blue-600 bg-blue-50/50'
          : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50/80'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="-mx-1 overflow-x-auto overscroll-x-contain pb-px" role="tablist" aria-label="System controls sections">
        <div className="flex min-w-min gap-0 border-b border-gray-200 px-1">
          {subTabBtn('pricing', 'Pricing')}
          {subTabBtn('licensing', 'Licensing')}
          {subTabBtn('mailtrap', 'Email delivery')}
          {subTabBtn('email_qa', 'Email QA')}
          {subTabBtn('coupons', 'Coupons')}
          {subTabBtn('map_markers', 'Map markers')}
          {subTabBtn('job_access', 'Job access')}
          {subTabBtn('ux_copy', 'UX copy')}
          {subTabBtn('marketplace_rules', 'Marketplace rules')}
          {subTabBtn('feature_flags', 'Feature flags')}
          {subTabBtn('referral_settings', 'Referral settings')}
          {subTabBtn('trust_safety', 'Trust and safety')}
        </div>
      </div>

      {systemSubTab === 'pricing' && (
        <div className="space-y-4">
          <SettingsCard
            title="How pricing works"
            description="Stripe price IDs, commissions, and subscription checkout."
            collapsible
            defaultOpen={false}
          >
            <div className="text-sm text-gray-600 space-y-2 max-w-3xl">
              <p>
                Configure membership tiers, monthly fees, and commission. New or edited paid tiers do not charge
                subscription checkout until a monthly recurring <span className="font-medium text-gray-800">Stripe</span>{' '}
                <code className="text-xs bg-gray-100 px-1 rounded">price_…</code> exists and is stored here (or a matching
                legacy <code className="text-xs bg-gray-100 px-1 rounded">STRIPE_*_PRICE_ID</code> environment variable
                is set and the row has no ID).
              </p>
              <p>
                Paste a price ID from the Stripe Dashboard, or use <span className="font-medium text-gray-800">Create in Stripe</span>{' '}
                to have TechFlash create a product and monthly price via the server (requires a Stripe secret key in the
                API). That action uses the <em>last saved</em> monthly fee—click <span className="font-medium">Save changes</span> first
                if you changed the amount.
              </p>
            </div>
          </SettingsCard>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active tiers</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{pricingStats.count}</p>
              <p className="text-xs text-gray-500 mt-1">{audience === 'technician' ? 'Technician' : 'Company'} audience</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Missing Stripe price</p>
              <p className="mt-1 text-2xl font-semibold text-amber-700">{pricingStats.missingStripe}</p>
              <p className="text-xs text-gray-500 mt-1">Rows without price_… ID</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg commission</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{pricingStats.avgComm}%</p>
              <p className="text-xs text-gray-500 mt-1">Across visible rows</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Preview</p>
              <p className="mt-1 text-sm text-gray-700 leading-snug">
                A Premium technician sees jobs immediately when delay hours are 0 and monthly fee matches the saved row.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Audience</span>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              <button
                type="button"
                onClick={() => setAudience('technician')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md ${
                  audience === 'technician' ? 'bg-white shadow text-blue-700' : 'text-gray-600'
                }`}
              >
                Tech
              </button>
              <button
                type="button"
                onClick={() => setAudience('company')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md ${
                  audience === 'company' ? 'bg-white shadow text-blue-700' : 'text-gray-600'
                }`}
              >
                Company
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="ml-auto px-3 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              Add tier
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Slug</th>
                      <th className="px-3 py-2 font-medium">Display name</th>
                      <th className="px-3 py-2 font-medium">Monthly fee ($)</th>
                      <th className="px-3 py-2 font-medium">Commission %</th>
                      {audience === 'technician' && (
                        <th className="px-3 py-2 font-medium">Early access (hrs)</th>
                      )}
                      <th className="px-3 py-2 font-medium">Sort</th>
                      <th className="px-3 py-2 font-medium min-w-[200px]">Stripe subscription (price_…)</th>
                      <th className="px-3 py-2 font-medium w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-mono text-xs text-gray-800">{r.slug}</td>
                        <td className="px-3 py-2">
                          <input
                            value={r.display_name}
                            onChange={(e) => updateRow(r.id, 'display_name', e.target.value)}
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={r.monthly_fee_dollars}
                            onChange={(e) => updateRow(r.id, 'monthly_fee_dollars', e.target.value)}
                            className="w-24 border rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={r.commission_percent}
                            onChange={(e) => updateRow(r.id, 'commission_percent', e.target.value)}
                            className="w-24 border rounded px-2 py-1 text-sm"
                          />
                        </td>
                        {audience === 'technician' && (
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={r.early_access_delay_hours}
                              onChange={(e) => updateRow(r.id, 'early_access_delay_hours', e.target.value)}
                              className="w-20 border rounded px-2 py-1 text-sm"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="1"
                            value={r.sort_order}
                            onChange={(e) => updateRow(r.id, 'sort_order', e.target.value)}
                            className="w-16 border rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="space-y-1.5 min-w-[180px] max-w-xs">
                            <input
                              value={r.stripe_price_id}
                              onChange={(e) => updateRow(r.id, 'stripe_price_id', e.target.value)}
                              className="w-full border rounded px-2 py-1 text-xs font-mono"
                              placeholder="price_…"
                              autoComplete="off"
                              title="Recurring price ID. Clear and create a new one in Stripe if the monthly fee changed."
                            />
                            <button
                              type="button"
                              className="w-full px-2 py-1 text-xs font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-45 disabled:cursor-not-allowed"
                              disabled={
                                saving ||
                                loading ||
                                provisionBusyId !== null ||
                                (parseFloat(r.monthly_fee_dollars) || 0) <= 0 ||
                                (r.stripe_price_id && String(r.stripe_price_id).trim() !== '')
                              }
                              title="Creates a product + monthly recurring price in Stripe using the fee last saved in TechFlash. Remove the price ID first if you need a different amount."
                              onClick={() => handleProvisionStripe(r.id)}
                            >
                              {provisionBusyId === r.id ? 'Creating in Stripe…' : 'Create in Stripe'}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget({ id: r.id, slug: r.slug });
                              setDeleteConfirmText('');
                            }}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                disabled={saving || loading || provisionBusyId !== null}
                onClick={handleSaveAll}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          )}
        </div>
      )}

      {systemSubTab === 'licensing' && (
        <div className="space-y-4">
          <SettingsCard
            title="Licensing rules"
            description="Default statewide electrical license vs local-only exceptions."
            collapsible
            defaultOpen={false}
          >
            <div className="text-sm text-gray-600 space-y-2 max-w-3xl">
              <p>
                Electrical license number is required by default for all company states. Use this list only for
                states where licensing is local/city-driven and a statewide number should not be mandatory.
              </p>
              <p>Select states where licensing is local-only.</p>
            </div>
          </SettingsCard>

          <div>
            <span className="text-sm font-medium text-gray-700">Local-only exception states</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={stateSearch}
                onChange={(e) => setStateSearch(e.target.value)}
                placeholder="Search state or code..."
                className="flex-1 min-w-[220px] border rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setLocalOnlyStateCodes(US_STATE_OPTIONS.map(([code]) => code))}
                className="px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setLocalOnlyStateCodes([])}
                className="px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Clear all
              </button>
            </div>
            <div className="mt-2 max-h-72 overflow-auto border border-gray-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredStateOptions.map(([code, name]) => (
                <label key={code} className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={localOnlyStateCodes.includes(code)}
                    onChange={() => toggleLocalOnlyState(code)}
                  />
                  <span>{name} ({code})</span>
                </label>
              ))}
              {filteredStateOptions.length === 0 && (
                <p className="text-sm text-gray-500 col-span-full py-6 text-center">No states match your search.</p>
              )}
            </div>
          </div>

          {localOnlyStateCodes.length > 0 && (
            <div className="text-sm text-gray-700">
              Current exceptions: {localOnlyStateCodes.join(', ')}
            </div>
          )}

          <button
            type="button"
            disabled={savingLicensing}
            onClick={async () => {
              setSavingLicensing(true);
              setError(null);
              try {
                const res = await adminLicensingSettingsAPI.update(localOnlyStateCodes);
                const nextCodes = Array.isArray(res?.local_only_state_codes) ? res.local_only_state_codes : [];
                setLocalOnlyStateCodes(nextCodes);
              } catch (e) {
                setError(e.message || 'Failed to save licensing exceptions');
              } finally {
                setSavingLicensing(false);
              }
            }}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {savingLicensing ? 'Saving…' : 'Save licensing exceptions'}
          </button>
        </div>
      )}

      {systemSubTab === 'mailtrap' && (
        <div className="space-y-4">
          <SettingsCard title="Email delivery overview" collapsible defaultOpen={false}>
            <div className="text-sm text-gray-600 space-y-2 max-w-3xl">
              <p>
                This panel shows the current outbound email delivery health and every automated
                transactional email currently wired in the app.
              </p>
              <p>
                Values are read-only and never expose credentials. Use this view to confirm what is live
                and what still needs environment configuration.
              </p>
            </div>
          </SettingsCard>

          {mailtrapError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {mailtrapError}
            </div>
          )}

          {mailtrapLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">Delivery configuration health</h3>
                  <button
                    type="button"
                    onClick={loadMailtrapAudit}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Refresh
                  </button>
                </div>
                <div className="text-sm text-gray-700">
                  <span className="font-medium">Mode:</span>{' '}
                  <span className="font-mono">{mailtrapAudit?.mail_delivery?.delivery_mode || 'unknown'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {[
                    ['MAILER_FROM', mailtrapAudit?.mail_delivery?.from_present],
                    ['SMTP_ADDRESS', mailtrapAudit?.mail_delivery?.smtp_address_present],
                    ['SMTP_USERNAME', mailtrapAudit?.mail_delivery?.smtp_username_present],
                    ['SMTP_PASSWORD', mailtrapAudit?.mail_delivery?.smtp_password_present],
                    ['MAILTRAP_API_TOKEN', mailtrapAudit?.mail_delivery?.mailtrap_token_present],
                    ['Can Send Mail', mailtrapAudit?.mail_delivery?.can_send],
                  ].map(([label, present]) => (
                    <div key={label} className="rounded-lg border border-gray-200 px-3 py-2 text-xs">
                      <div className="text-gray-500">{label}</div>
                      <div className={`font-semibold ${present ? 'text-green-700' : 'text-amber-700'}`}>
                        {present ? 'Present' : 'Missing'}
                      </div>
                    </div>
                  ))}
                </div>
                {!mailtrapAudit?.mail_delivery?.can_send && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                    Mail delivery cannot send yet. Configure required SMTP/Mailtrap variables before expecting transactional emails.
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Live automated emails</h3>
                <div className="space-y-2">
                  {(mailtrapAudit?.live_automations || []).map((item) => (
                    <div key={item.key} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{item.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {item.status}
                        </span>
                        <span className="font-mono text-xs text-gray-500">{item.key}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{item.trigger}</p>
                      <p className="text-xs text-gray-500 mt-1">Source: {item.source}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Implemented but inactive</h3>
                {(mailtrapAudit?.inactive_automations || []).length === 0 ? (
                  <p className="text-sm text-gray-600">No inactive automations found.</p>
                ) : (
                  <div className="space-y-2">
                    {(mailtrapAudit?.inactive_automations || []).map((item) => (
                      <div key={item.key} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900">{item.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300">
                            {item.status}
                          </span>
                          <span className="font-mono text-xs text-gray-500">{item.key}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">{item.trigger}</p>
                        <p className="text-xs text-gray-500 mt-1">Source: {item.source}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {systemSubTab === 'email_qa' && (
        <div className="space-y-4">
          <SettingsCard title="Email QA workflow" description="Preview and send test templates safely." collapsible defaultOpen>
            <p className="text-sm text-gray-600">
              Preview and send fixture-based test emails for every transactional template.
              Choose where test mail is delivered below (defaults to your signed-in admin if left blank).
            </p>
          </SettingsCard>

          <div className="text-sm text-gray-600 space-y-3 max-w-3xl">
            <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-gray-800 space-y-2">
              <label className="block font-semibold text-gray-900" htmlFor="email-qa-recipient">
                Deliver test sends to
              </label>
              <input
                id="email-qa-recipient"
                type="email"
                autoComplete="email"
                value={emailQaRecipient}
                onChange={(e) => setEmailQaRecipient(e.target.value)}
                placeholder={auth.getUser()?.email || 'you@example.com'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-white"
              />
              <p className="text-gray-600">
                Leave blank to use <span className="font-mono">{auth.getUser()?.email || '—'}</span>.
                Mailtrap may report delivered while the inbox still sorts mail — check spam and search by sender domain.
              </p>
            </div>
            <p className="text-sm">
              Sending requires explicit confirmation text each time to avoid accidental blasts.
            </p>
          </div>

          {emailQaError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {emailQaError}
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Send confirmation guard</h3>
            <p className="text-xs text-gray-600">
              Type <code className="bg-gray-100 px-1 rounded">SEND_TEST_EMAILS</code> — underscores required (not spaces). Case and extra spaces are OK; &quot;SEND TEST EMAILS&quot; is normalized automatically.
            </p>
            <p className="text-xs text-gray-500">
              Send all runs one template per request so production gateways do not time out on a single long call.
            </p>
            <input
              type="text"
              value={emailQaConfirmation}
              onChange={(e) => setEmailQaConfirmation(e.target.value)}
              placeholder="SEND_TEST_EMAILS"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            />
            <button
              type="button"
              onClick={sendAllEmailTemplates}
              disabled={emailQaBusyKey === 'send_all'}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {emailQaBusyKey === 'send_all' && emailQaSendAllProgress
                ? `Sending ${emailQaSendAllProgress.current} / ${emailQaSendAllProgress.total}…`
                : 'Send all test emails'}
            </button>
            {emailQaBusyKey === 'send_all' && emailQaSendAllProgress?.templateKey && (
              <p className="text-xs text-gray-600 font-mono">
                Current: {emailQaSendAllProgress.templateKey}
              </p>
            )}
            {emailQaLastSendSummary?.type === 'all' && (
              <div className="text-sm text-gray-700 space-y-2">
                <p>
                  Delivered {emailQaLastSendSummary.deliveredCount} / {emailQaLastSendSummary.totalCount} templates.
                </p>
                {Array.isArray(emailQaLastSendSummary.errors) && emailQaLastSendSummary.errors.length > 0 && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                    <p className="font-medium mb-1">Failures</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {emailQaLastSendSummary.errors.map((err) => (
                        <li key={err.key}>
                          <span className="font-mono">{err.key}</span>: {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {emailQaLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Templates</h3>
                  <button
                    type="button"
                    onClick={loadEmailQaTemplates}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Refresh
                  </button>
                </div>
                <input
                  type="text"
                  value={emailQaSearch}
                  onChange={(e) => setEmailQaSearch(e.target.value)}
                  placeholder="Search templates by name, key, audience, or trigger"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                  {filteredEmailQaTemplates.map((template) => (
                    <div key={template.key} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{template.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          template.active
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-gray-100 text-gray-700 border-gray-300'
                        }`}
                        >
                          {template.active ? 'active' : 'inactive'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{template.description}</p>
                      <p className="text-xs font-mono text-gray-500 mt-1">{template.key}</p>
                      {template.audience ? (
                        <p className="text-xs text-gray-500 mt-1">User type: {template.audience}</p>
                      ) : null}
                      {template.trigger ? (
                        <p className="text-xs text-gray-500 mt-1">When sent: {template.trigger}</p>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => previewEmailTemplate(template.key)}
                          disabled={emailQaBusyKey === `preview:${template.key}`}
                          className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                        >
                          {emailQaBusyKey === `preview:${template.key}` ? 'Loading…' : 'Preview'}
                        </button>
                        <button
                          type="button"
                          onClick={() => sendOneEmailTemplate(template.key)}
                          disabled={
                            emailQaBusyKey === `send:${template.key}` || emailQaBusyKey === 'send_all'
                          }
                          className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                        >
                          {emailQaBusyKey === `send:${template.key}` ? 'Sending…' : 'Send test'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {!filteredEmailQaTemplates.length ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No templates match your search.</p>
                  ) : null}
                </div>
                {emailQaLastSendSummary?.type === 'single' && (
                  <div className="text-sm text-gray-700 space-y-1">
                    <p>
                      {emailQaLastSendSummary.success ? 'Sent' : 'Failed'}: {emailQaLastSendSummary.templateKey}
                    </p>
                    {!emailQaLastSendSummary.success && emailQaLastSendSummary.mailError && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 whitespace-pre-wrap">
                        {emailQaLastSendSummary.mailError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div ref={previewPanelRef} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Preview</h3>
                {!emailQaPreview ? (
                  <p className="text-sm text-gray-600">Select a template and click Preview.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500">Template key</p>
                      <p className="font-mono text-xs text-gray-700">{emailQaPreview.template_key}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Subject</p>
                      <p className="text-sm text-gray-800">{emailQaPreview.subject}</p>
                    </div>
                    {emailQaPreview.audience ? (
                      <div>
                        <p className="text-xs text-gray-500">User type</p>
                        <p className="text-sm text-gray-800">{emailQaPreview.audience}</p>
                      </div>
                    ) : null}
                    {emailQaPreview.trigger ? (
                      <div>
                        <p className="text-xs text-gray-500">When sent</p>
                        <p className="text-sm text-gray-800">{emailQaPreview.trigger}</p>
                      </div>
                    ) : null}
                    {emailQaPreview.source ? (
                      <div>
                        <p className="text-xs text-gray-500">Source</p>
                        <p className="text-xs text-gray-700">{emailQaPreview.source}</p>
                      </div>
                    ) : null}
                    <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 inline-block">
                      Preview loaded for {emailQaPreview.template_key}
                    </p>
                    <div>
                      <p className="text-xs text-gray-500">Text body</p>
                      <pre className="text-xs whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-64 overflow-auto">
                        {emailQaPreview.text_body || '(no text body)'}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">HTML body</p>
                      <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-64 overflow-auto">
                        {emailQaPreview.html_body
                          ? <div dangerouslySetInnerHTML={{ __html: emailQaPreview.html_body }} />
                          : '(no html body)'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {systemSubTab === 'coupons' && <SystemControlsCoupons />}

      {systemSubTab === 'map_markers' && <SystemControlsSimulatedMarkers />}

      {systemSubTab === 'job_access' && <AdminJobAccessSettings />}

      {systemSubTab === 'ux_copy' && (
        <AdminBackendPlaceholder
          title="UX copy and content controls"
          description="Centralize headlines, empty states, onboarding checklist copy, and referral CTAs. Wire to a key-value store or CMS when ready."
          suggestedModel="Suggested: platform_settings(key, value_json, audience, updated_at)"
        />
      )}
      {systemSubTab === 'marketplace_rules' && (
        <AdminBackendPlaceholder
          title="Marketplace rules"
          description="Minimum rates, job visibility windows, application expiry, auto-close rules, and reminder schedules."
          suggestedModel="Suggested: marketplace_rules(rule_key, value_json, status, updated_at)"
        />
      )}
      {systemSubTab === 'feature_flags' && (
        <AdminBackendPlaceholder
          title="Feature flags"
          description="Toggle map, referrals, SMS, CRM, subscriptions, and experiments with rollout percentages."
          suggestedModel="Suggested: feature_flags(flag_key, enabled, rollout_percent, environment)"
        />
      )}
      {systemSubTab === 'referral_settings' && (
        <AdminBackendPlaceholder
          title="Referral program"
          description="Rewards, fraud checks, and landing copy for technician and company referrals."
          suggestedModel="Suggested: referral_settings JSON + audit log"
        />
      )}
      {systemSubTab === 'trust_safety' && (
        <AdminBackendPlaceholder
          title="Trust and safety"
          description="Required profile fields, dispute thresholds, suspension reasons, and retention policy notes."
          suggestedModel="Suggested: trust_policy_settings + admin_audit_entries"
        />
      )}

      {addOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">New tier</h3>
            <form onSubmit={handleCreateTier} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Slug (immutable after create)</label>
                <input
                  value={newTier.slug}
                  onChange={(e) => setNewTier((p) => ({ ...p, slug: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="e.g. enterprise"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Display name</label>
                <input
                  value={newTier.display_name}
                  onChange={(e) => setNewTier((p) => ({ ...p, display_name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Monthly fee ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newTier.monthly_fee_dollars}
                    onChange={(e) => setNewTier((p) => ({ ...p, monthly_fee_dollars: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Commission %</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={newTier.commission_percent}
                    onChange={(e) => setNewTier((p) => ({ ...p, commission_percent: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {audience === 'technician' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Early access delay (hours)</label>
                  <input
                    type="number"
                    min="0"
                    value={newTier.early_access_delay_hours}
                    onChange={(e) => setNewTier((p) => ({ ...p, early_access_delay_hours: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sort order</label>
                <input
                  type="number"
                  value={newTier.sort_order}
                  onChange={(e) => setNewTier((p) => ({ ...p, sort_order: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Stripe price ID (optional)</label>
                <input
                  value={newTier.stripe_price_id}
                  onChange={(e) => setNewTier((p) => ({ ...p, stripe_price_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-xs font-mono"
                  placeholder="price_…"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Paid tiers need a <code className="text-xs">price_…</code> for subscription checkout, or add the tier and use{' '}
                  <span className="font-medium">Create in Stripe</span> in the table (after saving the fee, if you edit it).
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setAddOpen(false)}
                  className="flex-1 py-2 border rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-red-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete tier?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently remove the <span className="font-mono font-medium">{deleteTarget.slug}</span>{' '}
              tier for this audience. Profiles must not be assigned to this tier. Type{' '}
              <span className="font-mono font-semibold">DELETE</span> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 font-mono"
              placeholder="DELETE"
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmText('');
                }}
                className="flex-1 py-2 border rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || deleteConfirmText !== 'DELETE'}
                onClick={executeDelete}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm disabled:opacity-40"
              >
                {deleting ? 'Deleting…' : 'Delete tier'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertModal
        isOpen={emailQaSuccessAlert != null}
        onClose={() => setEmailQaSuccessAlert(null)}
        title={emailQaSuccessAlert?.title ?? ''}
        message={emailQaSuccessAlert?.message ?? ''}
        variant="success"
      />
    </div>
  );
}
