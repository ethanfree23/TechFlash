Rails.application.routes.draw do
  # Health check endpoint (useful for uptime monitors)
  get "up" => "rails/health#show", as: :rails_health_check

  # API routes
  namespace :api do
    namespace :v1 do
      post "sessions", to: "sessions#create"
      post "auth/login", to: "sessions#create"
      post "auth/register", to: "users#create"
      post "password_resets", to: "password_resets#create"
      patch "password_resets", to: "password_resets#update"
      get 'technicians/profile', to: 'technicians#profile'
      get 'company_profiles/profile', to: 'company_profiles#profile'
      patch 'users/me', to: 'users#update_me'
      get 'feedback', to: 'feedback_submissions#index'
      post 'feedback', to: 'feedback_submissions#create'
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
      end
      post 'jobs/:job_id/create_payment_intent', to: 'payments#create_intent'
      post 'settings/create_setup_intent', to: 'settings#create_setup_intent'
      post 'settings/create_connect_account_link', to: 'settings#create_connect_account_link'
      resources :job_applications do
        member do
          patch :accept
          patch :deny
        end
      end
      resources :conversations, only: [:index, :show] do
        resources :messages, only: [:index, :create]
      end
      post 'jobs/:job_id/conversations', to: 'conversations#create', as: :job_conversations
      resources :documents
      resources :ratings do
        collection do
          get :review_categories
          get :reviewed_job_ids
        end
      end
      resources :company_profiles
      resources :technicians
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

      namespace :admin do
        get "location_suggestions", to: "location_suggestions#index"
        post "company_accounts", to: "company_accounts#create"
        get "company_accounts/search", to: "company_accounts#search"
        get "company_accounts/search_companies", to: "company_accounts#search_companies"
        get "platform_insights", to: "platform_insights#show"
        resources :users, only: %i[index show create] do
          member do
            post :password_setup
            patch :password, action: :set_password
          end
        end
        resources :crm_leads, only: %i[index show create update destroy]
        patch "referrals/:id/issue_reward", to: "referrals#issue_reward"
      end
    end
  end
end
