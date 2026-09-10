\pset pager off
SELECT id, email, ghl_contact_id FROM users WHERE id IN (104,105,106);
SELECT MAX(id) FROM users;
SELECT MAX(id) FROM technician_profiles;
SELECT MAX(id) FROM active_storage_blobs;
SELECT MAX(id) FROM active_storage_attachments;
SELECT id, user_id, processed_at FROM ghl_webhook_events WHERE id IN (31,32,33,34,35);
