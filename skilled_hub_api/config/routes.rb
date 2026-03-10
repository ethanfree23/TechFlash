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
      resources :users
      resources :jobs do
        member do
          patch :claim
          patch :accept
          patch :finish
          patch :extend
        end
      end
      resources :job_applications do
        member do
          patch :accept
          patch :deny
        end
      end
      resources :conversations
      resources :messages
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
