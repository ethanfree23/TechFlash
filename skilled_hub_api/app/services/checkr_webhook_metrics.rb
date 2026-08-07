class CheckrWebhookMetrics
  def self.increment(metric_name, tags: {})
    safe_tags = tags.to_h.transform_values { |v| v.to_s[0, 120] }
    Rails.logger.info("[checkr_webhook_metric] metric=#{metric_name} tags=#{safe_tags.to_json}")
  rescue StandardError
    nil
  end
end
