\pset pager off

\echo ===== latest technician_profiles =====
SELECT id, user_id, phone, created_at, updated_at
FROM technician_profiles
ORDER BY id DESC
LIMIT 15;

\echo ===== blob 43 =====
SELECT id, key, filename, content_type, byte_size, checksum, service_name, created_at, metadata
FROM active_storage_blobs
WHERE id = 43;

\echo ===== attachments for blob 43 =====
SELECT id, name, record_type, record_id, blob_id, created_at
FROM active_storage_attachments
WHERE blob_id = 43;

\echo ===== recent avatar attachments =====
SELECT id, name, record_type, record_id, blob_id, created_at
FROM active_storage_attachments
WHERE name = 'avatar'
ORDER BY id DESC
LIMIT 10;

\echo ===== recent blobs =====
SELECT id, key, filename, content_type, byte_size, checksum, service_name, created_at
FROM active_storage_blobs
ORDER BY id DESC
LIMIT 10;

\echo ===== lookup by blob key from HTTP 404 =====
SELECT id, key, filename, byte_size, service_name, created_at
FROM active_storage_blobs
WHERE key = 'yvh1g5a5fnh8j5o6tcjp4gf86hjh';

\echo ===== counts =====
SELECT (SELECT COUNT(*) FROM technician_profiles) AS technician_profiles,
       (SELECT MAX(id) FROM technician_profiles) AS max_tp_id,
       (SELECT MAX(id) FROM users) AS max_user_id,
       (SELECT MAX(id) FROM active_storage_blobs) AS max_blob_id,
       (SELECT MAX(id) FROM active_storage_attachments) AS max_att_id;

\echo ===== recent ghl webhook events =====
SELECT id, idempotency_key, ghl_contact_id, event_type, user_id, processed_at, processing_error, attempt_count, created_at
FROM ghl_webhook_events
ORDER BY id DESC
LIMIT 10;

\echo ===== profile 83 still there? =====
SELECT id, user_id, updated_at FROM technician_profiles WHERE id IN (81,83,84,85,86);

