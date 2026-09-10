# frozen_string_literal: true

require "digest"
require "etc"
require "fileutils"
require "json"
require "securerandom"
require "socket"
require "stringio"

# TEMPORARY production diagnostic for ActiveStorage / Railway volume.
# Remove with the admin storage_diagnostic routes after the investigation.
class AdminStorageDiagnostic
  VOLUME_MOUNT = "/rails/storage"
  STATE_BASENAME = "techflash-storage-diagnostic-state.json"
  VOLUME_FILE_PREFIX = "techflash-storage-diagnostic-"
  BOOT_OBSERVED_AT = Time.now.utc.iso8601

  def self.capture
    new.capture
  end

  def self.check
    new.check
  end

  def self.error_payload(error)
    {
      error_class: error.class.name,
      error_message: error.message.to_s,
      backtrace: Array(error.backtrace).first(12)
    }
  end

  def capture
    volume = capture_section { volume_write_test }
    activestorage = capture_section { activestorage_upload_test }
    state_persist = persist_state(volume, activestorage)

    {
      ok: section_ok?(volume) && section_ok?(activestorage),
      observed_at: Time.now.utc.iso8601,
      runtime: runtime_identity,
      instance: instance_identity,
      paths: storage_paths,
      volume_mount: capture_section { volume_mount_stat },
      volume_write_test: volume,
      activestorage_test: activestorage,
      state_persist: state_persist,
      state_files: state_file_paths
    }
  end

  def check
    state = load_state
    volume_files = list_volume_diagnostic_files

    {
      ok: state.present? && files_still_present?(state),
      observed_at: Time.now.utc.iso8601,
      runtime: runtime_identity,
      instance: instance_identity,
      paths: storage_paths,
      volume_mount: capture_section { volume_mount_stat },
      state_found: state.present?,
      state_source: state && state[:source],
      state: state && state.except(:source),
      volume_files_present: volume_files,
      volume_file_check: capture_section { check_volume_file(state) },
      activestorage_check: capture_section { check_activestorage(state) }
    }
  end

  private

  def runtime_identity
    uid = Process.uid
    gid = Process.gid
    username =
      begin
        Etc.getpwuid(uid).name
      rescue ArgumentError, NotImplementedError => e
        "unavailable: #{e.class}: #{e.message}"
      end

    {
      uid: uid,
      gid: gid,
      euid: Process.euid,
      egid: Process.egid,
      username: username
    }
  end

  def instance_identity
    {
      hostname: Socket.gethostname,
      pid: Process.pid,
      boot_observed_at: BOOT_OBSERVED_AT,
      railway_replica_id: ENV["RAILWAY_REPLICA_ID"],
      railway_deployment_id: ENV["RAILWAY_DEPLOYMENT_ID"],
      railway_environment_name: ENV["RAILWAY_ENVIRONMENT_NAME"]
    }
  end

  def storage_paths
    service = ActiveStorage::Blob.service
    root =
      if service.respond_to?(:root)
        service.root.to_s
      end

    {
      rails_root: Rails.root.to_s,
      pwd: Dir.pwd,
      service_class: service.class.name,
      service_root: root,
      active_storage_root_env: ENV["ACTIVE_STORAGE_ROOT"],
      railway_volume_mount_path: ENV["RAILWAY_VOLUME_MOUNT_PATH"],
      railway_run_uid: ENV["RAILWAY_RUN_UID"],
      configured_volume_mount: VOLUME_MOUNT
    }
  end

  def volume_mount_stat
    path = VOLUME_MOUNT
    exists = File.exist?(path)
    payload = {
      path: path,
      exist: exists,
      directory: exists && File.directory?(path),
      readable: exists && File.readable?(path),
      writable: exists && File.writable?(path)
    }
    if exists
      stat = File.stat(path)
      payload.merge!(
        stat_uid: stat.uid,
        stat_gid: stat.gid,
        mode: format("%o", stat.mode),
        realpath: File.realpath(path)
      )
    end
    payload
  end

  def volume_write_test
    FileUtils.mkdir_p(VOLUME_MOUNT)
    stamp = Time.now.utc.strftime("%Y%m%d%H%M%S")
    path = File.join(VOLUME_MOUNT, "#{VOLUME_FILE_PREFIX}#{stamp}-#{SecureRandom.hex(4)}.txt")
    contents = "techflash-volume-diagnostic #{SecureRandom.hex(16)}"
    File.binwrite(path, contents)
    read_back = File.binread(path)

    {
      path: path,
      exist_after_write: File.exist?(path),
      bytes_written: contents.bytesize,
      bytes_read: read_back.bytesize,
      contents_match: read_back == contents,
      size: File.size(path)
    }
  end

  def activestorage_upload_test
    service = ActiveStorage::Blob.service
    key = "tfdiag#{SecureRandom.hex(12)}"
    contents = "techflash-as-diagnostic #{SecureRandom.hex(16)}"
    checksum = Digest::MD5.base64digest(contents)
    io = StringIO.new(contents)
    io.set_encoding(Encoding::BINARY)
    io.rewind

    service.upload(key, io, checksum: checksum)
    downloaded = service.download(key)

    expected_path =
      if service.respond_to?(:path_for)
        service.path_for(key).to_s
      end

    {
      key: key,
      exist_after_upload: service.exist?(key),
      downloaded_byte_count: downloaded.bytesize,
      expected_byte_count: contents.bytesize,
      checksum: checksum,
      checksum_match: Digest::MD5.base64digest(downloaded) == checksum,
      contents_match: downloaded == contents,
      expected_disk_path: expected_path,
      disk_path_exist: expected_path.present? && File.exist?(expected_path)
    }
  end

  def persist_state(volume, activestorage)
    state = {
      created_at: Time.now.utc.iso8601,
      hostname: Socket.gethostname,
      pid: Process.pid,
      railway_replica_id: ENV["RAILWAY_REPLICA_ID"],
      railway_deployment_id: ENV["RAILWAY_DEPLOYMENT_ID"],
      volume_file_path: volume.is_a?(Hash) ? volume[:path] : nil,
      volume_file_size: volume.is_a?(Hash) ? volume[:size] : nil,
      activestorage_key: activestorage.is_a?(Hash) ? activestorage[:key] : nil,
      activestorage_checksum: activestorage.is_a?(Hash) ? activestorage[:checksum] : nil,
      expected_disk_path: activestorage.is_a?(Hash) ? activestorage[:expected_disk_path] : nil
    }
    json = JSON.pretty_generate(state)

    state_file_paths.map do |path|
      FileUtils.mkdir_p(File.dirname(path))
      File.binwrite(path, json)
      { path: path, written: true, exist: File.exist?(path) }
    rescue StandardError => e
      { path: path, written: false }.merge(self.class.error_payload(e))
    end
  end

  def load_state
    state_file_paths.each do |path|
      next unless File.exist?(path)

      data = JSON.parse(File.binread(path)).transform_keys(&:to_sym)
      return data.merge(source: path)
    rescue JSON::ParserError, ArgumentError
      next
    end
    nil
  end

  def state_file_paths
    [
      File.join(VOLUME_MOUNT, STATE_BASENAME),
      Rails.root.join("tmp", STATE_BASENAME).to_s
    ].uniq
  end

  def list_volume_diagnostic_files
    return [] unless File.directory?(VOLUME_MOUNT)

    Dir.children(VOLUME_MOUNT).grep(/\A#{Regexp.escape(VOLUME_FILE_PREFIX)}.*\.txt\z/).sort.map do |name|
      path = File.join(VOLUME_MOUNT, name)
      { path: path, size: File.size(path), exist: true }
    end
  rescue StandardError
    []
  end

  def check_volume_file(state)
    path = state && state[:volume_file_path]
    raise "no volume diagnostic file recorded; run GET storage_diagnostic first" if path.blank?

    exists = File.exist?(path)
    payload = { path: path, exist: exists }
    payload[:size] = File.size(path) if exists
    payload[:readable] = File.readable?(path) if exists
    payload
  end

  def check_activestorage(state)
    key = state && state[:activestorage_key]
    raise "no ActiveStorage diagnostic key recorded; run GET storage_diagnostic first" if key.blank?

    service = ActiveStorage::Blob.service
    exists = service.exist?(key)
    payload = {
      key: key,
      exist: exists,
      expected_disk_path: state[:expected_disk_path]
    }

    if state[:expected_disk_path].present?
      payload[:disk_path_exist] = File.exist?(state[:expected_disk_path])
    end

    if exists
      downloaded = service.download(key)
      payload[:downloaded_byte_count] = downloaded.bytesize
      payload[:checksum_match] =
        if state[:activestorage_checksum].present?
          Digest::MD5.base64digest(downloaded) == state[:activestorage_checksum]
        end
    end

    payload
  end

  def files_still_present?(state)
    volume_ok = state[:volume_file_path].present? && File.exist?(state[:volume_file_path])
    as_ok =
      state[:activestorage_key].present? &&
      ActiveStorage::Blob.service.exist?(state[:activestorage_key])
    volume_ok && as_ok
  rescue StandardError
    false
  end

  def capture_section
    yield
  rescue StandardError => e
    { ok: false }.merge(self.class.error_payload(e))
  end

  def section_ok?(section)
    section.is_a?(Hash) && section[:error_class].blank?
  end
end
