# Certificates Feature – Current & Future

## Current (Phase 1 – Simple)

- **Company side**: Jobs have a `required_certifications` field (comma-separated text, e.g. "OSHA 10, EPA 608, HVAC certification"). Companies add this when creating or editing jobs.
- **Tech side**: Technicians upload certificate images in Profile & Settings. Documents use `doc_type: 'certificate'` and are stored on their TechnicianProfile.
- **Verification**: Companies manually verify that the tech’s certificate images match their job requirements when viewing the technician profile (e.g. via "View Technician Profile" on a claimed job).

## Future Phases

### Phase 2 – Software matching (confidence scale)

- Use software to compare required certifications with the tech’s uploaded certificates.
- Return a confidence score (e.g. 0–100%) for how well the tech’s certs match the job.
- Show this score to companies when reviewing applicants.

### Phase 3 – AI document recognition

- After the database has many certificate images, use them as reference data.
- Use AI/OCR to recognize and classify uploaded certificate documents.
- Match recognized certs to job requirements automatically.
