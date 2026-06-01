import { formatPhoneInput } from './phone';

/** Merge inferred import row into CRM form without overwriting non-empty user values. */
export function mergeInferredRowIntoForm(form, row, { formatPhone = formatPhoneInput } = {}) {
  if (!row || typeof row !== 'object') return form;

  const pick = (incoming, existing) => {
    const inc = String(incoming ?? '').trim();
    const ex = String(existing ?? '').trim();
    return inc && !ex ? inc : existing;
  };

  const next = { ...form };
  next.name = pick(row.name, form.name);
  next.website = pick(row.website, form.website);
  next.bio = pick(row.bio, form.bio);
  next.company_email = pick(row.company_email, form.company_email);
  next.street_address = pick(row.street_address, form.street_address);
  next.city = pick(row.city, form.city);
  next.state = pick(row.state, form.state);
  next.zip = pick(row.zip, form.zip);
  if (row.company_phone && !String(form.company_phone || '').trim()) {
    next.company_phone = formatPhone(String(row.company_phone).trim());
  }
  next.instagram_url = pick(row.instagram_url, form.instagram_url);
  next.facebook_url = pick(row.facebook_url, form.facebook_url);
  next.linkedin_url = pick(row.linkedin_url, form.linkedin_url);

  if (row.contact_name || row.email || row.phone) {
    const contacts = Array.isArray(form.contacts) ? [...form.contacts] : [];
    const first = contacts[0] || { is_primary: true };
    contacts[0] = {
      ...first,
      is_primary: true,
      name: pick(row.contact_name, first.name || form.contact_name),
      email: pick(row.email, first.email || form.email),
      phone: row.phone && !String(first.phone || form.phone || '').trim()
        ? formatPhone(String(row.phone).trim())
        : first.phone || form.phone,
    };
    next.contacts = contacts;
    next.contact_name = contacts[0].name || form.contact_name;
    next.email = contacts[0].email || form.email;
    next.phone = contacts[0].phone || form.phone;
  }

  return next;
}

export function mergeEnrichmentIntoForm(form, enrichment) {
  if (!enrichment) return form;
  return mergeInferredRowIntoForm(form, {
    name: enrichment.name,
    website: enrichment.website,
    bio: enrichment.bio,
    company_email: enrichment.company_email,
    company_phone: enrichment.company_phone,
    street_address: enrichment.street_address || enrichment.address,
    city: enrichment.city,
    state: enrichment.state,
    zip: enrichment.zip || enrichment.zip_code,
    instagram_url: enrichment.instagram_url,
    facebook_url: enrichment.facebook_url,
    linkedin_url: enrichment.linkedin_url,
  });
}
