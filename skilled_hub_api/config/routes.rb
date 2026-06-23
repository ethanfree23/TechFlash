Rails.application.routes.draw do
  # Health check endpoint (useful for uptime monitors)
  get "up" => "rails/health#show", as: :rails_health_check

  # API routes
  namespace :api do
    namespace :v1 do
      get "meta", to: "meta#show"
      post "sessions", to: "sessions#create"
      post "auth/login", to: "sessions#create"
      post "auth/register", to: "users#create"
      post "password_resets", to: "password_resets#create"
      patch "password_resets", to: "password_resets#update"
      get "public/jobs/:share_token", to: "public_jobs#show", constraints: { share_token: %r{[^/]+} }
      post "marketing_leads", to: "marketing_leads#create"
      post "signup_payment_intents", to: "signup_payment_intents#create"
      get "membership_tier_configs", to: "membership_tier_configs#index"
      get "licensing_settings", to: "licensing_settings#show"
      get 'technicians/profile', to: 'technicians#profile'
      get 'company_profiles/profile', to: 'company_profiles#profile'
      patch 'users/me', to: 'users#update_me'
      delete 'users/me', to: 'users#destroy_me'
      get 'users/blocks', to: 'users#blocked_users'
      post 'users/blocks', to: 'users#block_user'
      delete 'users/blocks/:id', to: 'users#unblock_user'
      get 'feedback', to: 'feedback_submissions#index'
      post 'feedback', to: 'feedback_submissions#create'
      get 'address_suggestions', to: 'addresses#suggestions'
      get 'address_resolve', to: 'addresses#resolve'
      get 'tech_presence_markers', to: 'tech_presence_markers#index'
      resources :users
      resources :jobs do
        collection do
          get :locations
        end
        member do
          patch :claim
          patch :deny
          patch :finish
          patch :extend
        end
        resources :counter_offers, only: [:index, :create], controller: :job_counter_offers
      end
      resources :counter_offers, only: [] do
        member do
          patch :accept, controller: :job_counter_offers
          patch :decline, controller: :job_counter_offers
          patch :counter, controller: :job_counter_offers
        end
      end
      post 'jobs/:job_id/create_payment_intent', to: 'payments#create_intent'
      post 'settings/create_setup_intent', to: 'settings#create_setup_intent'
      post 'settings/create_connect_account_link', to: 'settings#create_connect_account_link'
      resource :membership, only: %i[show update], controller: :memberships
      resources :job_applications do
        member do
          patch :accept
          patch :deny
        end
      end
      resources :conversations, only: %i[index show update] do
        resources :messages, only: [:index, :create]
      end
      post 'jobs/:job_id/conversations', to: 'conversations#create', as: :job_conversations
      resources :documents
      resources :ratings do
        collection do
          get :review_categories
          get :reviewed_job_ids
          get :moderation_queue
        end
        member do
          patch :hide
          patch :restore
        end
      end
      resources :company_profiles do
        member do
          post :merge
        end
      end
      resources :technicians do
        member do
          post :merge
        end
      end
      resources :job_seekers
      resources :auth, only: [:index]
      resources :referrals, only: [:create]
      get 'dashboard/jobs', to: 'jobs#dashboard_jobs'
      get 'dashboard/technician_jobs', to: 'jobs#technician_dashboard_jobs'
      get 'dashboard/analytics', to: 'analytics#show'

      post 'jobs/:job_id/issue_reports', to: 'job_issue_reports#create'
      resources :saved_job_searches, only: %i[index create destroy]
      get 'favorite_technicians', to: 'favorite_technicians#index'
      post 'favorite_technicians', to: 'favorite_technicians#create'
      delete 'favorite_technicians/:id', to: 'favorite_technicians#destroy'
      post 'stripe/webhook', to: 'stripe_webhooks#create'
      post 'checkr/webhook', to: 'checkr_webhooks#create'
      resource :verification, only: [:show], controller: :verifications do
        post :start_background_check
        post :create_background_check_checkout
      end
      resources :verification_references, only: [:index, :create]
      post "verification_references/respond/:token", to: "verification_references#respond"
      post "coupons/redeem", to: "coupons#redeem"
      resource :job_alert_preference, only: %i[show update]
      resources :app_notifications, only: %i[index] do
        member do
          patch :mark_read
        end
      end

      namespace :admin do
        resources :reviews, only: [:index] do
          collection do
            get :flags
            get :analytics
          end
        end
        get "trust_safety/dashboard", to: "trust_safety#dashboard"
        patch "trust_safety/background_checks/:id/override", to: "trust_safety#override_background_check"
        patch "trust_safety/references/:id/review", to: "trust_safety#review_reference"
        patch "trust_safety/documents/:id/review", to: "trust_safety#review_document"
        patch "review_flags/:id", to: "reviews#update_flag"
        resources :membership_tier_configs, only: %i[index create update destroy] do
          member do
            post :provision_stripe
          end
        end
        resources :simulated_technician_markers, only: %i[index create update destroy]
        resources :coupons, only: %i[index show create update destroy]
        resources :coupon_assignments, only: %i[create update destroy]
        post "masquerade", to: "masquerades#create"
        get "location_suggestions", to: "location_suggestions#index"
        post "company_accounts", to: "company_accounts#create"
        post "company_accounts/bulk_crm", to: "company_accounts#bulk_crm_create"
        get "company_accounts/search", to: "company_accounts#search"
        get "company_accounts/search_companies", to: "company_accounts#search_companies"
        get "platform_insights", to: "platform_insights#show"
        resources :users, only: %i[index show create destroy] do
          member do
            post :password_setup
            post :ensure_profile
            patch :password, action: :set_password
            patch :company_membership
            patch :membership_pricing
            patch :profile, action: :update_profile
          end
        end
        resources :crm_leads, only: %i[index show create update destroy] do
          member do
            post :merge
            post :send_email
            post :preview_email
          end
          collection do
            post :import
            post :bulk_destroy
            post :enrich_from_url
            get :reminders
          end
          resources :crm_notes, only: %i[create update]
        end
        patch "referrals/:id/issue_reward", to: "referrals#issue_reward"
        get "licensing_settings", to: "licensing_settings#show"
        patch "licensing_settings", to: "licensing_settings#update"
        get "mailtrap_audit", to: "mailtrap_audits#show"
        get "email_qa/templates", to: "email_qa#templates"
        post "email_qa/preview", to: "email_qa#preview"
        post "email_qa/send", to: "email_qa#send_one"
        post "email_qa/send_all", to: "email_qa#send_all"
        post "demo_reset", to: "demo_resets#create"
      end
    end
  end
end
