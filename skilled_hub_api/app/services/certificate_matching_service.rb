# frozen_string_literal: true

# Heuristic match of job.required_certifications (free text) to technician certificate uploads (filenames).
class CertificateMatchingService
  def self.score_for_job_and_technician(job, technician_profile)
    required = parse_requirements(job&.required_certifications)
    if required.empty?
      return {
        matched: 0,
        total: 0,
        percent: 100,
        matched_labels: [],
        missing_labels: [],
        certificate_files: certificate_filenames(technician_profile)
      }
    end

    files_text = certificate_filenames(technician_profile).map(&:downcase).join(' ')
    matched = []
    missing = []

    required.each do |phrase|
      if phrase_matched?(phrase, files_text)
        matched << phrase
      else
        missing << phrase
      end
    end

    percent = ((matched.size.to_f / required.size) * 100).round

    {
      matched: matched.size,
      total: required.size,
      percent: percent,
      matched_labels: matched,
      missing_labels: missing,
      certificate_files: certificate_filenames(technician_profile)
    }
  end

  def self.parse_requirements(text)
    return [] if text.blank?

    text.split(/[,;\n]/).map { |s| s.to_s.strip }.reject(&:blank?).uniq
  end

  def self.certificate_filenames(technician_profile)
    return [] if technician_profile.blank?

    technician_profile.documents.select { |d| d.doc_type.to_s == 'certificate' }.filter_map do |d|
      d.file.attached? ? d.file.filename.to_s : nil
    end
  end

  def self.phrase_matched?(phrase, files_text_concat)
    p = phrase.downcase.strip
    return false if p.blank?

    return true if files_text_concat.include?(p)

    # Word overlap: e.g. "EPA 608" vs filename "epa608_cert.pdf"
    words = p.split(/\s+/).reject { |w| w.length < 2 }
    return false if words.empty?

    words.all? { |w| files_text_concat.include?(w.downcase.gsub(/[^a-z0-9]/i, '')) || files_text_concat.include?(w.downcase) }
  end
  private_class_method :phrase_matched?
end
