# frozen_string_literal: true

module ApplicationHelper
  def frontend_url(path = '')
    base = ENV.fetch('FRONTEND_URL', 'http://localhost:5173')
    base = base.chomp('/')
    path = path.to_s
    path = path.start_with?('/') ? path : "/#{path}"
    "#{base}#{path}"
  end
end
