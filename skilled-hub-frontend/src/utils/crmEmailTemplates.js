import { getPrimaryContactPreview } from './crmDisplayAdapter';

const SALES_CALL_BODY = `Hi {{contact_first_name}},

Thanks again for taking a few minutes to speak with me today. I wanted to get this more official email your way, helping describe what we do, in case you'd like to share this with a few of your colleagues.

I wanted to send over a quick summary of TechFlash and how it can help when your team is short on labor or needs temporary skilled trade help.

TechFlash is a marketplace for short-term skilled trades work. Companies can post a job, set the trade, rate, location, start date, and job details, then qualified technicians can apply or accept the work.

It is built for situations like:
- being down a person for a job
- needing extra electrical, HVAC, plumbing, maintenance, or construction help
- covering a short-term labor gap
- testing out a worker before committing to something longer term
- filling work without going through a traditional staffing process

The goal is simple: make it easier for companies to find reliable short-term technicians, and make it easier for technicians to pick up work that fits their schedule.

You can learn more or create an account [here]({{signup_url}}).

If you already have a job you want to test with TechFlash, you can post it [here]({{post_job_url}}).

Happy to help get the first job posted or walk you through how it works.

Best,

{{sender_name}}
TechFlash
{{sender_email}}
{{sender_phone}}`;

const SHORT_FOLLOW_UP_BODY = `Hi {{contact_first_name}},

Thanks again for speaking with me today.

Here is a quick link to TechFlash:
{{signup_url}}

The basic idea is simple: companies can post short-term skilled trade jobs, and available technicians can find and accept work that fits their schedule.

It can help when you are short a person, need extra coverage, or want temporary help without going through a traditional staffing process.

If you have a job you want to test with it, I can help get the first one posted.

Best,
{{sender_name}}`;

export const CRM_EMAIL_VARIABLES = [
  'contact_first_name',
  'contact_name',
  'company_name',
  'sender_name',
  'techflash_url',
  'signup_url',
  'post_job_url',
  'calendar_url',
  'sender_email',
  'sender_phone',
];

export const CRM_EMAIL_TEMPLATES = [
  {
    key: 'sales_call_follow_up',
    label: 'Sales call follow-up',
    enabled: true,
    defaultSubject: 'Thanks for speaking with me about TechFlash',
    defaultBody: SALES_CALL_BODY,
  },
  {
    key: 'short_follow_up',
    label: 'Short follow-up',
    enabled: true,
    defaultSubject: 'Good speaking with you — TechFlash info',
    defaultBody: SHORT_FOLLOW_UP_BODY,
  },
  {
    key: 'job_posting_follow_up',
    label: 'Job posting follow-up',
    enabled: false,
    defaultSubject: 'Ready to post your first job on TechFlash?',
    defaultBody: '',
  },
  {
    key: 'company_activation_follow_up',
    label: 'Company activation follow-up',
    enabled: false,
    defaultSubject: 'Finish setting up your TechFlash account',
    defaultBody: '',
  },
  {
    key: 'custom_email',
    label: 'Custom email',
    enabled: true,
    defaultSubject: '',
    defaultBody: '',
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function isValidEmail(value) {
  const s = String(value || '').trim();
  return s.length > 0 && EMAIL_RE.test(s);
}

export function getFrontendBaseUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FRONTEND_URL) {
    return String(import.meta.env.VITE_FRONTEND_URL).replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return 'http://localhost:5173';
}

export function buildTemplateContext(form, user) {
  const pc = getPrimaryContactPreview({
    contact_name: form?.contact_name,
    email: form?.email,
    contacts: form?.contacts,
  });
  const contactName = pc.name || form?.contact_name || '';
  const firstName = contactName.split(/\s+/).filter(Boolean)[0] || 'there';
  const senderName = [user?.first_name, user?.last_name]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ') || String(user?.email || '').trim() || 'TechFlash';
  const base = getFrontendBaseUrl();

  return {
    contact_first_name: firstName,
    contact_name: contactName || 'there',
    company_name: String(form?.name || '').trim() || 'your company',
    sender_name: senderName,
    sender_email: String(user?.email || '').trim(),
    sender_phone: String(user?.phone || '').trim(),
    techflash_url: `${base}/for-companies`,
    signup_url: `${base}/login?tab=signup&role=company`,
    post_job_url: `${base}/jobs/create`,
    calendar_url: '',
  };
}

export function interpolateTemplate(text, context) {
  let out = String(text ?? '');
  Object.entries(context || {}).forEach(([key, value]) => {
    if (key === 'calendar_url' && !value) return;
    out = out.split(`{{${key}}}`).join(String(value ?? ''));
  });
  return out;
}

export function getTemplateByKey(key) {
  return CRM_EMAIL_TEMPLATES.find((t) => t.key === key) || CRM_EMAIL_TEMPLATES[0];
}

export function getRecipientOptions(form) {
  const options = [];
  const seen = new Set();
  const add = (email, label) => {
    const e = String(email || '').trim().toLowerCase();
    if (!e || seen.has(e)) return;
    seen.add(e);
    options.push({ value: e, label: label || e });
  };

  const contacts = Array.isArray(form?.contacts) ? form.contacts : [];
  const primaryIdx = contacts.findIndex((c) => c?.is_primary === true || c?.is_primary === 'true');
  const ordered =
    primaryIdx >= 0
      ? [contacts[primaryIdx], ...contacts.filter((_, i) => i !== primaryIdx)]
      : contacts;

  ordered.forEach((c, i) => {
    const name = String(c?.name || '').trim();
    const email = String(c?.email || '').trim();
    if (email) add(email, name ? `${name} · ${email}` : email);
    else if (i === 0 && form?.email) add(form.email, `${form.contact_name || 'Primary'} · ${form.email}`);
  });

  if (!options.length && form?.email) {
    add(form.email, `${form.contact_name || 'Primary contact'} · ${form.email}`);
  }

  if (form?.company_email) {
    add(form.company_email, `Company · ${form.company_email}`);
  }

  return options;
}

export function buildDraftForTemplate(templateKey, form, user) {
  const template = getTemplateByKey(templateKey);
  const context = buildTemplateContext(form, user);
  const recipients = getRecipientOptions(form);
  return {
    templateKey: template.key,
    to: recipients[0]?.value || '',
    cc: '',
    bcc: '',
    subject: interpolateTemplate(template.defaultSubject, context),
    body: interpolateTemplate(template.defaultBody, context),
  };
}

export function isRecipientOnRecord(form, toEmail) {
  const e = String(toEmail || '').trim().toLowerCase();
  if (!e) return false;
  return getRecipientOptions(form).some((o) => o.value === e);
}
