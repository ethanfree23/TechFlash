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

ActiveRecord::Schema[7.1].define(version: 2025_06_27_012447) do
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
    t.index ["user_id"], name: "index_company_profiles_on_user_id"
  end

  create_table "conversations", force: :cascade do |t|
    t.integer "job_id", null: false
    t.integer "technician_profile_id", null: false
    t.integer "company_profile_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["company_profile_id"], name: "index_conversations_on_company_profile_id"
    t.index ["job_id"], name: "index_conversations_on_job_id"
    t.index ["technician_profile_id"], name: "index_conversations_on_technician_profile_id"
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
    t.index ["company_profile_id"], name: "index_jobs_on_company_profile_id"
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
    t.index ["user_id"], name: "index_technician_profiles_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "email"
    t.string "password_digest"
    t.integer "role"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "stripe_customer_id"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "company_profiles", "users"
  add_foreign_key "conversations", "company_profiles"
  add_foreign_key "conversations", "jobs"
  add_foreign_key "conversations", "technician_profiles"
  add_foreign_key "job_applications", "jobs"
  add_foreign_key "job_applications", "technician_profiles"
  add_foreign_key "jobs", "company_profiles"
  add_foreign_key "messages", "conversations"
  add_foreign_key "payments", "jobs"
  add_foreign_key "ratings", "jobs"
  add_foreign_key "technician_profiles", "users"
end
