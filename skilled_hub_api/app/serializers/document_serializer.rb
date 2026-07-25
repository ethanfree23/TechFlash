class DocumentSerializer < ActiveModel::Serializer
  include ActiveStorageUrlHelper

  attributes :id, :uploadable_id, :uploadable_type, :doc_type, :status, :file_url,
             :issuer, :document_number, :issued_on, :valid_until, :reviewed_at,
             :rejection_reason, :metadata, :created_at, :updated_at

  def file_url
    base_url = instance_options[:base_url].to_s.strip
    if base_url.present? && object.file.attached?
      begin
        uri = URI.parse(base_url)
        return Rails.application.routes.url_helpers.rails_blob_url(
          object.file,
          disposition: "inline",
          host: uri.host,
          port: uri.port,
          protocol: uri.scheme
        )
      rescue URI::InvalidURIError
        # Fall through to default helper behavior.
      end
    end

    absolute_blob_url(object.file)
  end
end
