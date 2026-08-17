# frozen_string_literal: true

module Jobs
  # Authoritative job-status KPI counts from canonical Job scopes.
  class StatusCounts
    def self.for(relation = Job.all)
      relation = relation.all if relation.respond_to?(:all)
      {
        total: relation.count,
        open: relation.merge(Job.effectively_open).count,
        claimed: relation.merge(Job.in_progress).count,
        active: relation.merge(Job.effectively_active).count,
        claimed_unstarted: relation.merge(Job.effectively_claimed).count,
        completed: relation.merge(Job.effectively_completed).count,
        expired: relation.merge(Job.expired_listings).count,
        counter_pending: relation.merge(Job.with_pending_counter_offer).distinct.count
      }
    end
  end
end
