# syntax = docker/dockerfile:1

# Make sure RUBY_VERSION matches the Ruby version in .ruby-version and Gemfile
ARG RUBY_VERSION=3.0.2
FROM registry.docker.com/library/ruby:$RUBY_VERSION-slim as base

# Rails app lives here
WORKDIR /rails

# Set production environment
ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development"

# ruby:3.0.2-slim is Debian 11 (bullseye). Regular support and LTS ended 2026-08-31,
# so deb.debian.org / security.debian.org 404 and Docker image builds fail at apt-get.
# Point apt at the archive mirrors and ignore expired Release dates.
RUN set -eux; \
    if [ -f /etc/apt/sources.list ]; then \
      sed -i \
        -e 's|http://deb.debian.org/debian|http://archive.debian.org/debian|g' \
        -e 's|https://deb.debian.org/debian|http://archive.debian.org/debian|g' \
        -e 's|http://security.debian.org[^ ]*|http://archive.debian.org/debian-security|g' \
        -e 's|https://security.debian.org[^ ]*|http://archive.debian.org/debian-security|g' \
        /etc/apt/sources.list; \
      sed -i '/bullseye-updates/d' /etc/apt/sources.list; \
    fi; \
    printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid-until


# Throw-away build stage to reduce size of final image
FROM base as build

# Install packages needed to build gems (libpq-dev for pg gem)
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git libvips42 pkg-config libpq-dev

# Install application gems
COPY Gemfile Gemfile.lock ./
RUN gem install bundler:2.5.23 && \
    bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile --gemfile

# Copy application code
COPY . .
RUN chmod +x bin/rails bin/rake bin/docker-entrypoint

# Precompile bootsnap code for faster boot times
RUN bundle exec bootsnap precompile app/ lib/


# Final stage for app image
FROM base

# Install packages needed for deployment (libpq5 for pg gem at runtime)
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl libsqlite3-0 libvips42 libpq5 && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Copy built artifacts: gems, application
COPY --from=build /usr/local/bundle /usr/local/bundle
COPY --from=build /rails /rails

# Run and own only the runtime files as a non-root user for security
RUN useradd rails --create-home --shell /bin/bash && \
    chown -R rails:rails /rails
USER rails:rails

# Entrypoint prepares the database.
ENTRYPOINT ["/rails/bin/docker-entrypoint"]

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD ["./bin/rails", "server"]
