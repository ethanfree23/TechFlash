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

ActiveRecord::Schema[7.1].define(version: 2026_04_25_210000) do
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
    t.index ["membership_level"], name: "index_company_profiles_on_membership_level"
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
    t.index ["company_profile_id"], name: "index_conversations_on_company_profile_id"
    t.index ["conversation_type"], name: "index_conversations_on_conversation_type"
    t.index ["feedback_submission_id"], name: "index_conversations_on_feedback_submission_id", unique: true
    t.index ["job_id"], name: "index_conversations_on_job_id"
    t.index ["technician_profile_id"], name: "index_conversations_on_technician_profile_id"
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
    t.index ["crm_lead_id", "created_at"], name: "index_crm_notes_on_crm_lead_id_and_created_at"
    t.index ["crm_lead_id"], name: "index_crm_notes_on_crm_lead_id"
    t.index ["parent_note_id"], name: "index_crm_notes_on_parent_note_id"
  end

  create_table "documents", force: :cascade do |t|
    t.string "uploadable_type", null: false
    t.integer "uploadable_id", null: false
    t.string "file"
    t.string "doc_type"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["uploadable_type", "uploadable_id"], name: "index_documents_on_uploadable"
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
    t.index ["company_profile_id"], name: "index_jobs_on_company_profile_id"
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
    t.index ["job_id"], name: "index_ratings_on_job_id"
    t.index ["reviewee_type", "reviewee_id"], name: "index_ratings_on_reviewee"
    t.index ["reviewer_type", "reviewer_id"], name: "index_ratings_on_reviewer"
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

  create_table "saved_job_searches", force: :cascade do |t|
    t.integer "technician_profile_id", null: false
    t.string "keyword"
    t.string "location"
    t.string "skill_class"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["technician_profile_id", "keyword", "location", "skill_class"], name: "index_saved_searches_on_tech_and_criteria", unique: true
    t.index ["technician_profile_id"], name: "index_saved_job_searches_on_technician_profile_id"
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
    t.index ["membership_level"], name: "index_technician_profiles_on_membership_level"
    t.index ["stripe_membership_subscription_id"], name: "index_technician_profiles_on_stripe_membership_subscription_id", unique: true
    t.index ["user_id"], name: "index_technician_profiles_on_user_id"
  end

  create_table "user_login_events", force: :cascade do |t|
    t.integer "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
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
    t.index ["company_profile_id"], name: "index_users_on_company_profile_id"
    t.index ["password_reset_token"], name: "index_users_on_password_reset_token", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "company_profiles", "users"
  add_foreign_key "conversations", "company_profiles"
  add_foreign_key "conversations", "feedback_submissions"
  add_foreign_key "conversations", "jobs"
  add_foreign_key "conversations", "technician_profiles"
  add_foreign_key "crm_leads", "company_profiles", column: "linked_company_profile_id"
  add_foreign_key "crm_leads", "users", column: "linked_user_id"
  add_foreign_key "crm_notes", "crm_leads"
  add_foreign_key "crm_notes", "crm_notes", column: "parent_note_id"
  add_foreign_key "favorite_technicians", "company_profiles"
  add_foreign_key "favorite_technicians", "technician_profiles"
  add_foreign_key "feedback_submissions", "users"
  add_foreign_key "job_applications", "jobs"
  add_foreign_key "job_applications", "technician_profiles"
  add_foreign_key "job_issue_reports", "jobs"
  add_foreign_key "job_issue_reports", "users"
  add_foreign_key "jobs", "company_profiles"
  add_foreign_key "messages", "conversations"
  add_foreign_key "payments", "jobs"
  add_foreign_key "ratings", "jobs"
  add_foreign_key "referral_submissions", "crm_leads"
  add_foreign_key "referral_submissions", "users", column: "referred_user_id"
  add_foreign_key "referral_submissions", "users", column: "referrer_user_id"
  add_foreign_key "saved_job_searches", "technician_profiles"
  add_foreign_key "technician_profiles", "users"
  add_foreign_key "user_login_events", "users"
  add_foreign_key "users", "company_profiles"
end
