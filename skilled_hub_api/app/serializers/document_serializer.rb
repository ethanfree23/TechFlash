class DocumentSerializer < ActiveModel::Serializer
  include Rails.application.routes.url_helpers

  attributes :id, :uploadable_id, :uploadable_type, :doc_type, :file_url, :created_at, :updated_at

  def file_url
    if object.file.attached?
      rails_blob_url(object.file, only_path: false)
    else
      nil
    end
  end
end
