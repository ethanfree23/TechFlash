class DocumentSerializer < ActiveModel::Serializer
  include ActiveStorageUrlHelper

  attributes :id, :uploadable_id, :uploadable_type, :doc_type, :status, :file_url,
             :issuer, :document_number, :issued_on, :valid_until, :reviewed_at,
             :rejection_reason, :metadata, :created_at, :updated_at

  def file_url
    absolute_blob_url(object.file)
  end
end
