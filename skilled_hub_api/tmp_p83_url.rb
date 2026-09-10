# frozen_string_literal: true

profile = TechnicianProfile.find(83)
att = profile.avatar
puts "attached=#{att.attached?}"
if att.attached?
  puts "attachment_id=#{ActiveStorage::Attachment.find_by(record: profile, name: "avatar")&.id}"
  puts "blob_id=#{att.blob.id} key=#{att.blob.key} service=#{att.blob.service_name}"
  puts "filename=#{att.blob.filename} content_type=#{att.blob.content_type} byte_size=#{att.blob.byte_size}"
end
puts "rails_root=#{Rails.root}"
puts "service_class=#{ActiveStorage::Blob.service.class.name}"
puts "service_root=#{ActiveStorage::Blob.service.root}" if ActiveStorage::Blob.service.respond_to?(:root)
puts "ACTIVE_STORAGE_ROOT=#{ENV["ACTIVE_STORAGE_ROOT"].inspect}"
puts "config.service=#{Rails.application.config.active_storage.service}"
include ActiveStorageUrlHelper
puts "avatar_url=#{absolute_blob_url(att)}"
puts "blob_path=#{Rails.application.routes.url_helpers.rails_blob_path(att, only_path: true, disposition: "inline")}"
if att.attached? && ActiveStorage::Blob.service.respond_to?(:path_for)
  path = ActiveStorage::Blob.service.path_for(att.blob.key)
  puts "path_for=#{path}"
  puts "file_exists_here=#{File.exist?(path)}"
end
