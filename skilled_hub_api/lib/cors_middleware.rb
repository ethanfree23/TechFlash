# Explicit CORS middleware - handles preflight OPTIONS and adds headers to all responses
class CorsMiddleware
  def initialize(app)
    @app = app
  end

  def call(env)
    return handle_preflight(env) if env["REQUEST_METHOD"] == "OPTIONS"

    status, headers, body = @app.call(env)
    headers = add_cors_headers(env, headers)
    [status, headers, body]
  end

  private

  def handle_preflight(env)
    [
      204,
      add_cors_headers(env, {}).merge(
        "Content-Length" => "0",
        "Content-Type" => "text/plain"
      ),
      []
    ]
  end

  def add_cors_headers(env, headers)
    origin = env["HTTP_ORIGIN"]
    # Allow any origin for CORS
    origin_header = origin.presence || "*"
    headers.merge(
      "Access-Control-Allow-Origin" => origin_header,
      "Access-Control-Allow-Methods" => "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
      "Access-Control-Allow-Headers" => "Content-Type, Authorization, Accept",
      "Access-Control-Expose-Headers" => "Authorization"
    )
  end
end
