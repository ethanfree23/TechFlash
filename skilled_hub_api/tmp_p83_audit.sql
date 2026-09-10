\pset pager off

\echo ===== technician profile 83 =====
SELECT id, user_id, phone, updated_at, created_at
FROM technician_profiles
WHERE id = 83;

\echo ===== user 104 =====
SELECT id, email, role, first_name, last_name, phone, ghl_contact_id, updated_at
FROM users
WHERE id = 104;

\echo ===== attachments for TechnicianProfile 83 =====
SELECT id, name, record_type, record_id, blob_id, created_at
FROM active_storage_attachments
WHERE record_type = 'TechnicianProfile' AND record_id = 83
ORDER BY id DESC;

\echo ===== blobs =====
SELECT b.id, b.key, b.filename, b.content_type, b.byte_size, b.checksum, b.service_name, b.created_at, b.metadata
FROM active_storage_blobs b
JOIN active_storage_attachments a ON a.blob_id = b.id
WHERE a.record_type = 'TechnicianProfile' AND a.record_id = 83
ORDER BY b.id DESC;
