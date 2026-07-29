# frozen_string_literal: true

namespace :checkr do
  desc "Fetch Checkr packages and print sanitized name/slug list"
  task packages: :environment do
    config = CheckrConfiguration.new
    client = CheckrClient.new

    unless client.configured?
      reason = config.requests_block_reason || "Checkr client is not configured."
      puts "Checkr packages fetch skipped: #{reason}"
      exit(1)
    end

    packages = client.list_packages
    normalized = Array(packages).map do |pkg|
      {
        name: pkg["name"].to_s.strip,
        slug: (pkg["slug"] || pkg["name"] || pkg["id"]).to_s.strip
      }
    end

    puts "Checkr package fetch"
    puts "environment: #{config.environment}"
    puts "api_base_url: #{config.api_base_url}"
    puts "count: #{normalized.length}"
    puts "-" * 60

    normalized.each do |pkg|
      puts "name: #{pkg[:name]} | slug: #{pkg[:slug]}"
    end

    essential_candidates = normalized.select do |pkg|
      [pkg[:name], pkg[:slug]].any? { |field| field.to_s.downcase.include?("essential") }
    end

    puts "-" * 60
    if essential_candidates.any?
      puts "Essential candidate(s):"
      essential_candidates.each do |pkg|
        puts "name: #{pkg[:name]} | slug: #{pkg[:slug]}"
      end
    else
      puts "Essential candidate(s): none found in returned package names/slugs"
    end
  rescue CheckrClient::Error => e
    puts "Checkr packages fetch failed: #{e.message}"
    exit(1)
  end
end
