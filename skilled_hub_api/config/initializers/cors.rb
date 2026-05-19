# frozen_string_literal: true

# Cross-origin calls from the production site (e.g. www.techflash.app → Railway API)
# send Authorization and trigger a preflight OPTIONS request. A wildcard origin (`*`)
# or missing middleware headers often surfaces as "No 'Access-Control-Allow-Origin'".
#
# Optional Railway/env: CORS_ORIGINS="https://preview.example.com" (comma-separated).
default_origins = %w[
  http://localhost:3000
  http://localhost:5173
  http://127.0.0.1:5173
  https://www.techflash.app
  https://techflash.app
]
extra = ENV.fetch("CORS_ORIGINS", "").split(",").map(&:strip).reject(&:blank?)
origins_list = (default_origins + extra).uniq

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*origins_list)
    resource "*",
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head],
      expose: ["Authorization"]
  end
end
