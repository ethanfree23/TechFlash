# frozen_string_literal: true

# Detects raster image types from magic bytes. MIME type and file extension are ignored.
class RasterImageInspector
  Result = Struct.new(:content_type, :accepted, :error_code, :error_message, keyword_init: true) do
    def accepted?
      accepted
    end
  end

  ACCEPTED_TYPES = %w[image/jpeg image/png image/gif image/webp image/bmp].freeze

  UNSUPPORTED = {
    "image/heic" => "HEIC/HEIF images are not supported. Please upload a JPEG, PNG, WebP, GIF, or BMP.",
    "image/heif" => "HEIC/HEIF images are not supported. Please upload a JPEG, PNG, WebP, GIF, or BMP.",
    "image/tiff" => "TIFF images are not supported. Please upload a JPEG, PNG, WebP, GIF, or BMP.",
    "image/svg+xml" => "SVG files are not allowed.",
    "application/pdf" => "This file is not a supported image type. Please upload a JPEG, PNG, WebP, GIF, or BMP."
  }.freeze

  GENERIC_ERROR = "This file is not a supported image type. Please upload a JPEG, PNG, WebP, GIF, or BMP."

  HEIC_BRANDS = %w[heic heix heif hevc hevx mif1 msf1].freeze

  def self.inspect(bytes)
    new(bytes).inspect
  end

  def self.inspect_upload(upload)
    return inspect(nil) if upload.blank?

    io = upload.respond_to?(:tempfile) ? upload.tempfile : upload
    io.binmode if io.respond_to?(:binmode)
    io.rewind if io.respond_to?(:rewind)
    head = io.read(64)
    io.rewind if io.respond_to?(:rewind)
    inspect(head)
  end

  def initialize(bytes)
    @bytes = bytes.to_s.b
  end

  def inspect
    detected = detect
    if ACCEPTED_TYPES.include?(detected)
      return Result.new(content_type: detected, accepted: true, error_code: nil, error_message: nil)
    end

    Result.new(
      content_type: detected,
      accepted: false,
      error_code: detected || "unknown",
      error_message: UNSUPPORTED[detected] || GENERIC_ERROR
    )
  end

  private

  def detect
    head = @bytes.byteslice(0, 32).to_s.b
    return nil if head.blank?

    return "image/jpeg" if head.start_with?("\xFF\xD8\xFF".b)
    return "image/png" if head.start_with?("\x89PNG\r\n\x1A\n".b)
    return "image/gif" if head.start_with?("GIF87a".b) || head.start_with?("GIF89a".b)
    return "image/webp" if head.start_with?("RIFF".b) && @bytes.byteslice(8, 4) == "WEBP".b
    return "image/bmp" if head.start_with?("BM".b)
    return "image/tiff" if head.start_with?("II*\x00".b) || head.start_with?("MM\x00*".b)
    return heic_type if heic_brand(head)
    return "image/svg+xml" if svg?(head)
    return "application/pdf" if head.start_with?("%PDF".b)

    nil
  end

  def heic_brand(head)
    return nil unless head.bytesize >= 12
    return nil unless head.byteslice(4, 4) == "ftyp".b

    brand = head.byteslice(8, 4).to_s.downcase
    HEIC_BRANDS.include?(brand) ? brand : nil
  end

  def heic_type
    brand = heic_brand(@bytes.byteslice(0, 32).to_s.b)
    return "image/heif" if brand == "mif1" || brand == "msf1" || brand == "heif"

    "image/heic"
  end

  def svg?(head)
    stripped = head.sub(/\A\xEF\xBB\xBF/, "")
    stripped.start_with?("<svg".b, "<?xml".b) && stripped.downcase.include?("svg")
  end
end
