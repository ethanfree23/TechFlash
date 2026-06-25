# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[7.1].define(version: 2026_06_25_223000) do
  create_table "active_storage_attachments", force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.bigint "record_id", null: false
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "app_notifications", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "category", null: false
    t.string "title", null: false
    t.text "body"
    t.json "metadata", default: {}, null: false
    t.datetime "read_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_app_notifications_on_user_id"
  end

  create_table "background_checks", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "provider", default: "checkr", null: false
    t.string "provider_candidate_id"
    t.string "provider_invitation_id"
    t.string "provider_report_id"
    t.string "package_name"
    t.integer "status", default: 0, null: false
    t.string "result"
    t.integer "payment_status", default: 0, null: false
    t.string "paid_by", default: "technician", null: false
    t.datetime "started_at"
    t.datetime "completed_at"
    t.datetime "expires_at"
    t.integer "admin_override_status", default: 0, null: false
    t.text "admin_notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "payment_amount_cents"
    t.string "stripe_checkout_session_id"
    t.string "stripe_payment_intent_id"
    t.datetime "paid_at"
    t.index ["expires_at"], name: "index_background_checks_on_expires_at"
    t.index ["provider_candidate_id"], name: "index_background_checks_on_provider_candidate_id"
    t.index ["provider_invitation_id"], name: "index_background_checks_on_provider_invitation_id"
    t.index ["provider_report_id"], name: "index_background_checks_on_provider_report_id"
    t.index ["status"], name: "index_background_checks_on_status"
    t.index ["stripe_checkout_session_id"], name: "index_background_checks_on_stripe_checkout_session_id"
    t.index ["stripe_payment_intent_id"], name: "index_background_checks_on_stripe_payment_intent_id"
    t.index ["user_id"], name: "index_background_checks_on_user_id"
  end

  create_table "checkr_webhook_events", force: :cascade do |t|
    t.string "checkr_event_id", null: false
    t.string "event_type"
    t.text "payload"
    t.datetime "processed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["checkr_event_id"], name: "index_checkr_webhook_events_on_checkr_event_id", unique: true
    t.index ["processed_at"], name: "index_checkr_webhook_events_on_processed_at"
  end

  create_table "company_profiles", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "company_name"
    t.string "industry"
    t.string "location"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "bio"
    t.string "phone"
    t.string "website_url"
    t.string "facebook_url"
    t.string "instagram_url"
    t.string "linkedin_url"
    t.json "service_cities", default: []
    t.string "membership_level", default: "basic", null: false
    t.integer "membership_fee_override_cents"
    t.decimal "commission_override_percent", precision: 5, scale: 2
    t.boolean "membership_fee_waived", default: false, null: false
    t.string "stripe_membership_subscription_id"
    t.string "membership_status"
    t.datetime "membership_current_period_end_at"
    t.string "state"
    t.string "electrical_license_number"
    t.string "primary_hiring_need"
    t.index ["membership_level"], name: "index_company_profiles_on_membership_level"
    t.index ["state"], name: "index_company_profiles_on_state"
    t.index ["stripe_membership_subscription_id"], name: "index_company_profiles_on_stripe_membership_subscription_id", unique: true
    t.index ["user_id"], name: "index_company_profiles_on_user_id"
  end

  create_table "conversations", force: :cascade do |t|
    t.integer "job_id"
    t.integer "technician_profile_id"
    t.integer "company_profile_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "conversation_type", default: "job", null: false
    t.integer "feedback_submission_id"
    t.string "inbox_status", default: "open", null: false
    t.string "priority", default: "normal", null: false
    t.integer "assigned_to_id"
    t.datetime "admin_read_at"
    t.index ["assigned_to_id"], name: "index_conversations_on_assigned_to_id"
    t.index ["company_profile_id"], name: "index_conversations_on_company_profile_id"
    t.index ["conversation_type", "admin_read_at"], name: "index_conversations_on_type_and_admin_read_at"
    t.index ["conversation_type"], name: "index_conversations_on_conversation_type"
    t.index ["feedback_submission_id"], name: "index_conversations_on_feedback_submission_id", unique: true
    t.index ["inbox_status"], name: "index_conversations_on_inbox_status"
    t.index ["job_id"], name: "index_conversations_on_job_id"
    t.index ["technician_profile_id"], name: "index_conversations_on_technician_profile_id"
  end

  create_table "coupon_assignments", force: :cascade do |t|
    t.integer "coupon_id", null: false
    t.integer "user_id", null: false
    t.integer "assigned_by_id"
    t.string "status", default: "active", null: false
    t.boolean "auto_renew", default: false, null: false
    t.datetime "activated_at"
    t.datetime "starts_at"
    t.datetime "expires_at"
    t.datetime "last_extended_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["assigned_by_id"], name: "index_coupon_assignments_on_assigned_by_id"
    t.index ["coupon_id", "user_id"], name: "index_coupon_assignments_on_coupon_id_and_user_id"
    t.index ["coupon_id"], name: "index_coupon_assignments_on_coupon_id"
    t.index ["user_id"], name: "index_coupon_assignments_on_user_id"
  end

  create_table "coupons", force: :cascade do |t|
    t.string "name", null: false
    t.string "code", null: false
    t.string "discount_kind", default: "percent", null: false
    t.integer "discount_value", default: 0, null: false
    t.boolean "active", default: true, null: false
    t.datetime "starts_at"
    t.datetime "ends_at"
    t.string "duration_template", default: "fixed_window", null: false
    t.integer "duration_days"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["code"], name: "index_coupons_on_code", unique: true
  end

  create_table "crm_leads", force: :cascade do |t|
    t.string "name", null: false
    t.string "contact_name"
    t.string "email"
    t.string "phone"
    t.string "website"
    t.string "status", default: "lead", null: false
    t.text "notes"
    t.integer "linked_user_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "linked_company_profile_id"
    t.json "company_types", default: [], null: false
    t.string "street_address"
    t.string "city"
    t.string "state"
    t.string "zip"
    t.string "instagram_url"
    t.string "facebook_url"
    t.string "linkedin_url"
    t.json "contacts", default: [], null: false
    t.text "bio"
    t.string "company_email"
    t.string "company_phone"
    t.index ["linked_company_profile_id"], name: "index_crm_leads_on_linked_company_profile_id"
    t.index ["linked_user_id"], name: "index_crm_leads_on_linked_user_id"
    t.index ["status"], name: "index_crm_leads_on_status"
  end

  create_table "crm_notes", force: :cascade do |t|
    t.integer "crm_lead_id", null: false
    t.integer "parent_note_id"
    t.string "contact_method", default: "note", null: false
    t.string "title"
    t.text "body", null: false
    t.boolean "made_contact", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "remind_at"
    t.index ["crm_lead_id", "created_at"], name: "index_crm_notes_on_crm_lead_id_and_created_at"
    t.index ["crm_lead_id"], name: "index_crm_notes_on_crm_lead_id"
    t.index ["parent_note_id"], name: "index_crm_notes_on_parent_note_id"
    t.index ["remind_at"], name: "index_crm_notes_on_remind_at"
  end

  create_table "documents", force: :cascade do |t|
    t.string "uploadable_type", null: false
    t.integer "uploadable_id", null: false
    t.string "file"
    t.string "doc_type"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "status", default: 0, null: false
    t.integer "reviewed_by_user_id"
    t.datetime "reviewed_at"
    t.text "rejection_reason"
    t.datetime "expires_at"
    t.string "issuer"
    t.string "document_number"
    t.date "issued_on"
    t.date "valid_until"
    t.json "metadata", default: {}
    t.index ["reviewed_by_user_id"], name: "index_documents_on_reviewed_by_user_id"
    t.index ["status"], name: "index_documents_on_status"
    t.index ["uploadable_type", "uploadable_id"], name: "index_documents_on_uploadable"
    t.index ["valid_until"], name: "index_documents_on_valid_until"
  end

  create_table "email_delivery_logs", force: :cascade do |t|
    t.integer "user_id"
    t.string "to_email", null: false
    t.string "mailer_class", null: false
    t.string "mailer_action", null: false
    t.text "subject"
    t.datetime "created_at", null: false
    t.index ["to_email"], name: "index_email_delivery_logs_on_to_email"
    t.index ["user_id", "created_at"], name: "index_email_delivery_logs_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_email_delivery_logs_on_user_id"
  end

  create_table "favorite_technicians", force: :cascade do |t|
    t.integer "company_profile_id", null: false
    t.integer "technician_profile_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["company_profile_id", "technician_profile_id"], name: "index_favorites_company_tech_unique", unique: true
    t.index ["company_profile_id"], name: "index_favorite_technicians_on_company_profile_id"
    t.index ["technician_profile_id"], name: "index_favorite_technicians_on_technician_profile_id"
  end

  create_table "feedback_submissions", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "kind", null: false
    t.text "body", null: false
    t.string "page_path"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_feedback_submissions_on_user_id"
  end

  create_table "job_alert_preferences", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "trade_label"
    t.integer "min_hourly_rate_cents", default: 0, null: false
    t.integer "max_distance_miles", default: 200, null: false
    t.boolean "email_enabled", default: true, null: false
    t.boolean "sms_enabled", default: true, null: false
    t.boolean "app_enabled", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "min_duration_weeks"
    t.integer "max_duration_weeks"
    t.index ["user_id"], name: "index_job_alert_preferences_on_user_id", unique: true
  end

  create_table "job_applications", force: :cascade do |t|
    t.integer "job_id", null: false
    t.integer "technician_profile_id", null: false
    t.integer "status"
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["job_id"], name: "index_job_applications_on_job_id"
    t.index ["technician_profile_id"], name: "index_job_applications_on_technician_profile_id"
  end

  create_table "job_counter_offers", force: :cascade do |t|
    t.integer "job_id", null: false
    t.integer "technician_profile_id", null: false
    t.integer "company_profile_id", null: false
    t.integer "parent_offer_id"
    t.integer "status", default: 0, null: false
    t.integer "created_by_role", null: false
    t.integer "proposed_hourly_rate_cents"
    t.integer "proposed_hours_per_day"
    t.integer "proposed_days"
    t.datetime "proposed_start_at"
    t.datetime "proposed_end_at"
    t.integer "proposed_start_mode", default: 0, null: false
    t.datetime "responded_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["company_profile_id"], name: "index_job_counter_offers_on_company_profile_id"
    t.index ["job_id", "created_at"], name: "index_job_counter_offers_on_job_id_and_created_at"
    t.index ["job_id"], name: "index_job_counter_offers_on_job_id"
    t.index ["parent_offer_id"], name: "index_job_counter_offers_on_parent_offer_id"
    t.index ["status"], name: "index_job_counter_offers_on_status"
    t.index ["technician_profile_id"], name: "index_job_counter_offers_on_technician_profile_id"
  end

  create_table "job_issue_reports", force: :cascade do |t|
    t.integer "job_id", null: false
    t.integer "user_id", null: false
    t.string "category", default: "general"
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["job_id"], name: "index_job_issue_reports_on_job_id"
    t.index ["user_id"], name: "index_job_issue_reports_on_user_id"
  end

  create_table "jobs", force: :cascade do |t|
    t.integer "company_profile_id", null: false
    t.string "title"
    t.text "description"
    t.text "required_documents"
    t.string "location"
    t.integer "status"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "timeline"
    t.datetime "finished_at"
    t.datetime "scheduled_start_at"
    t.datetime "scheduled_end_at"
    t.integer "price_cents"
    t.integer "hourly_rate_cents"
    t.integer "hours_per_day", default: 8
    t.integer "days"
    t.string "address"
    t.string "city"
    t.string "state"
    t.string "zip_code"
    t.string "country"
    t.decimal "latitude", precision: 10, scale: 7
    t.decimal "longitude", precision: 10, scale: 7
    t.text "required_certifications"
    t.string "skill_class"
    t.integer "minimum_years_experience"
    t.text "notes"
    t.datetime "go_live_at"
    t.integer "start_mode", default: 0, null: false
    t.integer "rolling_start_rule_type", default: 0, null: false
    t.datetime "rolling_start_exact_start_at"
    t.integer "rolling_start_days_after_acceptance"
    t.integer "rolling_start_weekday"
    t.string "rolling_start_weekday_time"
    t.string "share_token", null: false
    t.boolean "require_background_check", default: false, null: false
    t.boolean "require_identity_verification", default: false, null: false
    t.integer "minimum_verified_references", default: 0, null: false
    t.boolean "require_insurance_verification", default: false, null: false
    t.index ["company_profile_id"], name: "index_jobs_on_company_profile_id"
    t.index ["rolling_start_rule_type"], name: "index_jobs_on_rolling_start_rule_type"
    t.index ["share_token"], name: "index_jobs_on_share_token", unique: true
    t.index ["start_mode"], name: "index_jobs_on_start_mode"
  end

  create_table "marketing_leads", force: :cascade do |t|
    t.string "email", null: false
    t.string "role_view", default: "technician", null: false
    t.string "source", default: "landing_page", null: false
    t.boolean "honeypot_triggered", default: false, null: false
    t.datetime "blocked_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_marketing_leads_on_email", unique: true
  end

  create_table "membership_tier_configs", force: :cascade do |t|
    t.string "audience", null: false
    t.string "slug", null: false
    t.string "display_name"
    t.integer "monthly_fee_cents", default: 0, null: false
    t.decimal "commission_percent", precision: 6, scale: 3, null: false
    t.integer "early_access_delay_hours"
    t.integer "sort_order", default: 0, null: false
    t.string "stripe_price_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "job_access_min_experience_years"
    t.integer "job_access_min_jobs_completed"
    t.integer "job_access_min_successful_jobs"
    t.integer "job_access_min_profile_completeness_percent"
    t.boolean "job_access_requires_verified_background", default: false, null: false
    t.integer "yearly_fee_cents", default: 0, null: false
    t.string "yearly_savings_label"
    t.json "feature_bullets", default: [], null: false
    t.text "job_access_summary"
    t.text "commission_summary"
    t.boolean "is_highlighted", default: false, null: false
    t.boolean "active", default: true, null: false
    t.index ["audience", "slug"], name: "index_membership_tier_configs_on_audience_and_slug", unique: true
    t.index ["audience", "sort_order"], name: "index_membership_tier_configs_on_audience_and_sort_order"
  end

  create_table "messages", force: :cascade do |t|
    t.integer "conversation_id", null: false
    t.string "sender_type", null: false
    t.integer "sender_id", null: false
    t.text "content"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "internal", default: false, null: false
    t.index ["conversation_id"], name: "index_messages_on_conversation_id"
    t.index ["sender_type", "sender_id"], name: "index_messages_on_sender"
  end

  create_table "payments", force: :cascade do |t|
    t.integer "job_id", null: false
    t.integer "amount_cents", null: false
    t.string "status", default: "pending", null: false
    t.string "stripe_payment_intent_id"
    t.string "stripe_transfer_id"
    t.datetime "held_at"
    t.datetime "released_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["job_id"], name: "index_payments_on_job_id"
    t.index ["status"], name: "index_payments_on_status"
    t.index ["stripe_payment_intent_id"], name: "index_payments_on_stripe_payment_intent_id"
  end

  create_table "platform_settings", force: :cascade do |t|
    t.string "key", null: false
    t.json "value_json", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_platform_settings_on_key", unique: true
  end

  create_table "ratings", force: :cascade do |t|
    t.integer "job_id", null: false
    t.string "reviewer_type", null: false
    t.integer "reviewer_id", null: false
    t.string "reviewee_type", null: false
    t.integer "reviewee_id", null: false
    t.decimal "score", precision: 3, scale: 2
    t.text "comment"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.json "category_scores", default: {}
    t.boolean "would_hire_again"
    t.boolean "would_recommend"
    t.integer "on_time_status"
    t.boolean "request_again"
    t.boolean "would_work_again"
    t.boolean "payment_on_time"
    t.integer "job_description_match"
    t.datetime "review_window_expires_at"
    t.datetime "visible_at"
    t.integer "moderation_status", default: 0, null: false
    t.datetime "hidden_at"
    t.integer "hidden_by_user_id"
    t.text "moderation_notes"
    t.decimal "review_quality_weight", precision: 4, scale: 2, default: "1.0", null: false
    t.index ["hidden_by_user_id"], name: "index_ratings_on_hidden_by_user_id"
    t.index ["job_id", "reviewer_type"], name: "index_ratings_on_job_and_reviewer_type"
    t.index ["job_id"], name: "index_ratings_on_job_id"
    t.index ["moderation_status"], name: "index_ratings_on_moderation_status"
    t.index ["reviewee_type", "reviewee_id"], name: "index_ratings_on_reviewee"
    t.index ["reviewer_type", "reviewer_id"], name: "index_ratings_on_reviewer"
    t.index ["visible_at"], name: "index_ratings_on_visible_at"
  end

  create_table "referral_submissions", force: :cascade do |t|
    t.integer "referrer_user_id", null: false
    t.integer "referred_user_id"
    t.integer "crm_lead_id"
    t.string "first_name", null: false
    t.string "last_name", null: false
    t.string "cell_phone"
    t.string "referred_type", null: false
    t.string "email", null: false
    t.string "location"
    t.text "extra_info"
    t.datetime "reward_eligible_at"
    t.datetime "reward_issued_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["crm_lead_id"], name: "index_referral_submissions_on_crm_lead_id"
    t.index ["email"], name: "index_referral_submissions_on_email"
    t.index ["referred_type"], name: "index_referral_submissions_on_referred_type"
    t.index ["referred_user_id"], name: "index_referral_submissions_on_referred_user_id"
    t.index ["referrer_user_id"], name: "index_referral_submissions_on_referrer_user_id"
    t.index ["reward_eligible_at"], name: "index_referral_submissions_on_reward_eligible_at"
  end

  create_table "review_flags", force: :cascade do |t|
    t.integer "rating_id", null: false
    t.string "reason", null: false
    t.integer "risk_score", default: 0, null: false
    t.json "details", default: {}, null: false
    t.integer "status", default: 0, null: false
    t.integer "reviewed_by_id"
    t.datetime "reviewed_at"
    t.text "review_notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["rating_id"], name: "index_review_flags_on_rating_id"
    t.index ["reason"], name: "index_review_flags_on_reason"
    t.index ["reviewed_by_id"], name: "index_review_flags_on_reviewed_by_id"
    t.index ["status"], name: "index_review_flags_on_status"
  end

  create_table "saved_job_searches", force: :cascade do |t|
    t.integer "technician_profile_id", null: false
    t.string "keyword"
    t.string "location"
    t.string "skill_class"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "max_distance_miles"
    t.integer "min_hourly_rate_cents"
    t.integer "max_required_years_experience"
    t.text "required_certifications"
    t.index ["technician_profile_id", "keyword", "location", "skill_class", "max_distance_miles", "min_hourly_rate_cents", "max_required_years_experience", "required_certifications"], name: "index_saved_searches_on_tech_and_template_criteria", unique: true
    t.index ["technician_profile_id"], name: "index_saved_job_searches_on_technician_profile_id"
  end

  create_table "simulated_technician_markers", force: :cascade do |t|
    t.string "name", null: false
    t.decimal "latitude", precision: 10, scale: 7, null: false
    t.decimal "longitude", precision: 10, scale: 7, null: false
    t.string "trade_label"
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "sms_delivery_logs", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "category", null: false
    t.string "destination", null: false
    t.text "message"
    t.string "status", default: "queued", null: false
    t.text "error_message"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_sms_delivery_logs_on_user_id"
  end

  create_table "stripe_webhook_events", force: :cascade do |t|
    t.string "stripe_event_id", null: false
    t.string "event_type"
    t.text "payload"
    t.datetime "processed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["stripe_event_id"], name: "index_stripe_webhook_events_on_stripe_event_id", unique: true
  end

  create_table "technician_profiles", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "trade_type"
    t.integer "experience_years"
    t.string "availability"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "stripe_account_id"
    t.text "bio"
    t.string "location"
    t.string "address"
    t.string "city"
    t.string "state"
    t.string "zip_code"
    t.string "country"
    t.decimal "latitude", precision: 10, scale: 7
    t.decimal "longitude", precision: 10, scale: 7
    t.string "membership_level", default: "basic", null: false
    t.integer "membership_fee_override_cents"
    t.decimal "commission_override_percent", precision: 5, scale: 2
    t.boolean "membership_fee_waived", default: false, null: false
    t.string "stripe_membership_subscription_id"
    t.string "membership_status"
    t.datetime "membership_current_period_end_at"
    t.string "phone"
    t.boolean "background_verified", default: false, null: false
    t.json "specialties", default: [], null: false
    t.index ["membership_level"], name: "index_technician_profiles_on_membership_level"
    t.index ["stripe_membership_subscription_id"], name: "index_technician_profiles_on_stripe_membership_subscription_id", unique: true
    t.index ["user_id"], name: "index_technician_profiles_on_user_id"
  end

  create_table "user_login_events", force: :cascade do |t|
    t.integer "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "via_masquerade", default: false, null: false
    t.index ["user_id", "created_at"], name: "index_user_login_events_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_user_login_events_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "email"
    t.string "password_digest"
    t.integer "role"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "stripe_customer_id"
    t.string "password_reset_token"
    t.datetime "password_reset_sent_at"
    t.integer "company_profile_id"
    t.string "first_name"
    t.string "last_name"
    t.string "phone"
    t.datetime "password_set_at"
    t.string "password_set_by"
    t.boolean "email_notifications_enabled", default: true, null: false
    t.boolean "job_alert_notifications_enabled", default: true, null: false
    t.text "email_notification_preferences", default: "{\"messages\":true,\"job_lifecycle\":true,\"reviews\":true,\"membership_updates\":true}", null: false
    t.json "ui_preferences", default: {}, null: false
    t.index ["company_profile_id"], name: "index_users_on_company_profile_id"
    t.index ["password_reset_token"], name: "index_users_on_password_reset_token", unique: true
    t.index ["password_set_by"], name: "index_users_on_password_set_by"
  end

  create_table "verification_audit_logs", force: :cascade do |t|
    t.integer "user_id", null: false
    t.integer "actor_user_id", null: false
    t.string "entity_type", null: false
    t.bigint "entity_id", null: false
    t.string "action", null: false
    t.json "details", default: {}
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["action"], name: "index_verification_audit_logs_on_action"
    t.index ["actor_user_id"], name: "index_verification_audit_logs_on_actor_user_id"
    t.index ["created_at"], name: "index_verification_audit_logs_on_created_at"
    t.index ["entity_type", "entity_id"], name: "index_verification_audit_logs_on_entity_type_and_entity_id"
    t.index ["user_id"], name: "index_verification_audit_logs_on_user_id"
  end

  create_table "verification_badges", force: :cascade do |t|
    t.integer "user_id", null: false
    t.string "badge_type", null: false
    t.string "source_type"
    t.bigint "source_id"
    t.integer "status", default: 0, null: false
    t.datetime "earned_at"
    t.datetime "expires_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_verification_badges_on_expires_at"
    t.index ["source_type", "source_id"], name: "index_verification_badges_on_source_type_and_source_id"
    t.index ["status"], name: "index_verification_badges_on_status"
    t.index ["user_id", "badge_type"], name: "index_verification_badges_on_user_id_and_badge_type", unique: true
    t.index ["user_id"], name: "index_verification_badges_on_user_id"
  end

  create_table "verification_profiles", force: :cascade do |t|
    t.integer "user_id", null: false
    t.boolean "email_verified", default: false, null: false
    t.boolean "phone_verified", default: false, null: false
    t.integer "identity_status", default: 0, null: false
    t.integer "background_status", default: 0, null: false
    t.integer "references_status", default: 0, null: false
    t.integer "licenses_status", default: 0, null: false
    t.integer "insurance_status", default: 0, null: false
    t.datetime "last_verified_at"
    t.integer "overall_completion_percentage", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_verification_profiles_on_user_id", unique: true
  end

  create_table "verification_references", force: :cascade do |t|
    t.integer "technician_user_id", null: false
    t.string "full_name", null: false
    t.string "email", null: false
    t.string "phone"
    t.string "company_name"
    t.string "relationship", null: false
    t.integer "status", default: 0, null: false
    t.string "request_token", null: false
    t.datetime "requested_at"
    t.datetime "responded_at"
    t.integer "reviewed_by_user_id"
    t.datetime "reviewed_at"
    t.text "review_notes"
    t.json "answers", default: {}
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "email_normalized"
    t.string "phone_normalized"
    t.index ["request_token"], name: "index_verification_references_on_request_token", unique: true
    t.index ["reviewed_by_user_id"], name: "index_verification_references_on_reviewed_by_user_id"
    t.index ["status"], name: "index_verification_references_on_status"
    t.index ["technician_user_id", "email_normalized"], name: "index_verification_references_on_tech_and_email_normalized", unique: true
    t.index ["technician_user_id", "phone_normalized"], name: "index_verification_references_on_tech_and_phone_normalized", unique: true
    t.index ["technician_user_id"], name: "index_verification_references_on_technician_user_id"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "app_notifications", "users"
  add_foreign_key "background_checks", "users"
  add_foreign_key "company_profiles", "users"
  add_foreign_key "conversations", "company_profiles"
  add_foreign_key "conversations", "feedback_submissions"
  add_foreign_key "conversations", "jobs"
  add_foreign_key "conversations", "technician_profiles"
  add_foreign_key "conversations", "users", column: "assigned_to_id"
  add_foreign_key "coupon_assignments", "coupons"
  add_foreign_key "coupon_assignments", "users"
  add_foreign_key "coupon_assignments", "users", column: "assigned_by_id"
  add_foreign_key "crm_leads", "company_profiles", column: "linked_company_profile_id"
  add_foreign_key "crm_leads", "users", column: "linked_user_id"
  add_foreign_key "crm_notes", "crm_leads"
  add_foreign_key "crm_notes", "crm_notes", column: "parent_note_id"
  add_foreign_key "documents", "users", column: "reviewed_by_user_id"
  add_foreign_key "email_delivery_logs", "users"
  add_foreign_key "favorite_technicians", "company_profiles"
  add_foreign_key "favorite_technicians", "technician_profiles"
  add_foreign_key "feedback_submissions", "users"
  add_foreign_key "job_alert_preferences", "users"
  add_foreign_key "job_applications", "jobs"
  add_foreign_key "job_applications", "technician_profiles"
  add_foreign_key "job_counter_offers", "company_profiles"
  add_foreign_key "job_counter_offers", "job_counter_offers", column: "parent_offer_id"
  add_foreign_key "job_counter_offers", "jobs"
  add_foreign_key "job_counter_offers", "technician_profiles"
  add_foreign_key "job_issue_reports", "jobs"
  add_foreign_key "job_issue_reports", "users"
  add_foreign_key "jobs", "company_profiles"
  add_foreign_key "messages", "conversations"
  add_foreign_key "payments", "jobs"
  add_foreign_key "ratings", "jobs"
  add_foreign_key "ratings", "users", column: "hidden_by_user_id"
  add_foreign_key "referral_submissions", "crm_leads"
  add_foreign_key "referral_submissions", "users", column: "referred_user_id"
  add_foreign_key "referral_submissions", "users", column: "referrer_user_id"
  add_foreign_key "review_flags", "ratings"
  add_foreign_key "review_flags", "users", column: "reviewed_by_id"
  add_foreign_key "saved_job_searches", "technician_profiles"
  add_foreign_key "sms_delivery_logs", "users"
  add_foreign_key "technician_profiles", "users"
  add_foreign_key "user_login_events", "users"
  add_foreign_key "users", "company_profiles"
  add_foreign_key "verification_audit_logs", "users"
  add_foreign_key "verification_audit_logs", "users", column: "actor_user_id"
  add_foreign_key "verification_badges", "users"
  add_foreign_key "verification_profiles", "users"
  add_foreign_key "verification_references", "users", column: "reviewed_by_user_id"
  add_foreign_key "verification_references", "users", column: "technician_user_id"
end
