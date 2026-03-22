Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins 'http://localhost:5173',
            'https://techflash.app',
            'https://www.techflash.app',
            %r{https://.*\.techflash\.app},
            %r{https://.*\.vercel\.app}
    resource '*',
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head],
      expose: ['Authorization']
  end
end
  