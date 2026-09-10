# frozen_string_literal: true

require "test_helper"

class RasterImageInspectorTest < ActiveSupport::TestCase
  test "accepts jpeg png gif webp and bmp from magic bytes" do
    assert_accepted("image/jpeg", "\xFF\xD8\xFF\xE0".b + "JFIF")
    assert_accepted("image/png", png)
    assert_accepted("image/gif", "GIF89a\x01\x00\x01\x00\x00\x00\x00;".b)
    assert_accepted("image/webp", "RIFF".b + "\x08\x00\x00\x00".b + "WEBP".b + "xxxx".b)
    assert_accepted("image/bmp", "BM".b + ("\x00".b * 20))
  end

  test "rejects heic heif tiff svg and non-images with clear messages" do
    heic = RasterImageInspector.inspect("\x00\x00\x00\x18ftypheic".b + ("\x00".b * 8))
    refute heic.accepted
    assert_match(/HEIC\/HEIF/i, heic.error_message)

    heif = RasterImageInspector.inspect("\x00\x00\x00\x18ftypmif1".b + ("\x00".b * 8))
    refute heif.accepted
    assert_match(/HEIC\/HEIF/i, heif.error_message)

    tiff = RasterImageInspector.inspect("II*\x00".b + ("\x00".b * 8))
    refute tiff.accepted
    assert_match(/TIFF/i, tiff.error_message)

    svg = RasterImageInspector.inspect(%(<svg xmlns="http://www.w3.org/2000/svg"></svg>))
    refute svg.accepted
    assert_match(/SVG/i, svg.error_message)

    html = RasterImageInspector.inspect("<html><body>nope</body></html>")
    refute html.accepted
    assert_match(/not a supported image type/i, html.error_message)
  end

  test "does not trust a jpeg content-type on an html upload" do
    upload = fake_upload("<html>nope</html>", "photo.jpg")
    result = RasterImageInspector.inspect_upload(upload)
    refute result.accepted
  end

  private

  def assert_accepted(content_type, bytes)
    result = RasterImageInspector.inspect(bytes)
    assert result.accepted, "expected #{content_type} to be accepted"
    assert_equal content_type, result.content_type
  end

  def png
    Base64.decode64(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
    ).b
  end

  def fake_upload(bytes, filename)
    io = StringIO.new(bytes)
    io.define_singleton_method(:original_filename) { filename }
    io
  end
end
