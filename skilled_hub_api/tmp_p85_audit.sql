\pset pager off

\echo ===== technician profile 85 =====
SELECT id, user_id, phone, updated_at, created_at
FROM technician_profiles
WHERE id = 85;

\echo ===== user for profile 85 =====
SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.phone, u.ghl_contact_id, u.updated_at
FROM users u
JOIN technician_profiles tp ON tp.user_id = u.id
WHERE tp.id = 85;

\echo ===== attachments for TechnicianProfile 85 =====
SELECT id, name, record_type, record_id, blob_id, created_at
FROM active_storage_attachments
WHERE record_type = 'TechnicianProfile' AND record_id = 85
ORDER BY id DESC;

\echo ===== blobs =====
SELECT b.id, b.key, b.filename, b.content_type, b.byte_size, b.checksum, b.service_name, b.created_at, b.metadata
FROM active_storage_blobs b
JOIN active_storage_attachments a ON a.blob_id = b.id
WHERE a.record_type = 'TechnicianProfile' AND a.record_id = 85
ORDER BY b.id DESC;
