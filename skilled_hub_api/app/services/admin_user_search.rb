# frozen_string_literal: true

# Server-side Admin Users index search. Applied to the AR scope before mapping/pagination.
class AdminUserSearch
  def self.apply(scope, query)
    new(scope, query).apply
  end

  def initialize(scope, query)
    @scope = scope
    @query = query.to_s.strip
  end

  def apply
    return @scope if @query.blank?

    @scope.where(where_sql, binds)
  end

  private

  def where_sql
    [
      user_match_sql,
      technician_exists_sql,
      owned_company_exists_sql,
      shared_company_exists_sql
    ].join(" OR ")
  end

  def binds
    {
      like: like_value(@query.downcase),
      trade_like: like_value(trade_term)
    }.merge(phone_binds)
  end

  def user_match_sql
    clauses = [
      "LOWER(users.email) LIKE :like",
      "LOWER(COALESCE(users.first_name, '')) LIKE :like",
      "LOWER(COALESCE(users.last_name, '')) LIKE :like",
      "LOWER(TRIM(COALESCE(users.first_name, '') || ' ' || COALESCE(users.last_name, ''))) LIKE :like",
      "CAST(users.id AS TEXT) LIKE :like",
      "LOWER(COALESCE(users.phone, '')) LIKE :like"
    ]
    phone_ors = phone_column_match_sql("users.phone_normalized", digits_sql("users.phone"))
    clauses << phone_ors if phone_ors.present?
    clauses.join(" OR ")
  end

  def technician_exists_sql
    profile_clauses = [
      "LOWER(COALESCE(tp.trade_type, '')) LIKE :like",
      "LOWER(COALESCE(tp.trade_type, '')) LIKE :trade_like",
      "LOWER(COALESCE(CAST(tp.trade_qualifications AS TEXT), '')) LIKE :like",
      "LOWER(COALESCE(CAST(tp.trade_qualifications AS TEXT), '')) LIKE :trade_like",
      "LOWER(COALESCE(CAST(tp.specialties AS TEXT), '')) LIKE :like",
      "LOWER(COALESCE(tp.zip_code, '')) LIKE :like",
      "LOWER(COALESCE(tp.location, '')) LIKE :like",
      "LOWER(COALESCE(tp.city, '')) LIKE :like",
      "LOWER(COALESCE(tp.phone, '')) LIKE :like"
    ]
    phone_ors = phone_column_match_sql(digits_sql("tp.phone"))
    profile_clauses << phone_ors if phone_ors.present?

    <<~SQL.squish
      EXISTS (
        SELECT 1 FROM technician_profiles tp
        WHERE tp.user_id = users.id
          AND (#{profile_clauses.join(' OR ')})
      )
    SQL
  end

  def owned_company_exists_sql
    company_exists_sql(alias_name: "owned_co", id_clause: "owned_co.user_id = users.id")
  end

  def shared_company_exists_sql
    company_exists_sql(alias_name: "shared_co", id_clause: "shared_co.id = users.company_profile_id")
  end

  def company_exists_sql(alias_name:, id_clause:)
    company_clauses = [
      "LOWER(COALESCE(#{alias_name}.company_name, '')) LIKE :like",
      "LOWER(COALESCE(#{alias_name}.industry, '')) LIKE :like",
      "LOWER(COALESCE(#{alias_name}.location, '')) LIKE :like",
      "LOWER(COALESCE(CAST(#{alias_name}.service_trades AS TEXT), '')) LIKE :like",
      "LOWER(COALESCE(#{alias_name}.phone, '')) LIKE :like"
    ]
    phone_ors = phone_column_match_sql(digits_sql("#{alias_name}.phone"))
    company_clauses << phone_ors if phone_ors.present?

    <<~SQL.squish
      EXISTS (
        SELECT 1 FROM company_profiles #{alias_name}
        WHERE #{id_clause}
          AND (#{company_clauses.join(' OR ')})
      )
    SQL
  end

  def trade_term
    (TradeCatalog.normalized_label(@query) || @query).downcase
  end

  def phone_digit_variants
    @phone_digit_variants ||= GhlPhoneNormalizer.search_digit_variants(@query)
  end

  def phone_binds
    phone_digit_variants.each_with_index.with_object({}) do |(digits, index), hash|
      hash[:"phone_like_#{index}"] = like_value(digits)
    end
  end

  def phone_column_match_sql(*columns)
    return nil if phone_digit_variants.blank?

    parts = []
    phone_digit_variants.each_index do |index|
      placeholder = ":phone_like_#{index}"
      columns.each do |column|
        parts << "#{column} LIKE #{placeholder}"
      end
    end
    parts.join(" OR ")
  end

  def digits_sql(column)
    if postgresql?
      "regexp_replace(COALESCE(#{column}, ''), '[^0-9]', '', 'g')"
    else
      %w[+ - ( ) . / \\ x X].reduce("REPLACE(COALESCE(#{column}, ''), ' ', '')") do |expr, char|
        "REPLACE(#{expr}, #{connection.quote(char)}, '')"
      end
    end
  end

  def like_value(term)
    "%#{ActiveRecord::Base.sanitize_sql_like(term)}%"
  end

  def postgresql?
    connection.adapter_name.match?(/postg/i)
  end

  def connection
    ActiveRecord::Base.connection
  end
end
