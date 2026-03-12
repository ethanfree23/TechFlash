Rails.application.routes.draw do
  # Health check endpoint (useful for uptime monitors)
  get "up" => "rails/health#show", as: :rails_health_check

  # API routes
  namespace :api do
    namespace :v1 do
      post "sessions", to: "sessions#create"
      post "auth/login", to: "sessions#create"
      post "auth/register", to: "users#create"
      get 'technicians/profile', to: 'technicians#profile'
      get 'company_profiles/profile', to: 'company_profiles#profile'
      patch 'users/me', to: 'users#update_me'
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
      get 'dashboard/jobs', to: 'jobs#dashboard_jobs'
      get 'dashboard/technician_jobs', to: 'jobs#technician_dashboard_jobs'
    end
  end
end
