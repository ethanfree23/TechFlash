# frozen_string_literal: true

module Jobs
  # Authoritative job-status KPI counts from canonical Job scopes.
  class StatusCounts
    def self.for(relation = Job.all)
      relation = relation.all if relation.respond_to?(:all)
      {
        total: count_rows(relation),
        open: count_rows(relation.merge(Job.effectively_open)),
        claimed: count_rows(relation.merge(Job.in_progress)),
        active: count_rows(relation.merge(Job.effectively_active)),
        claimed_unstarted: count_rows(relation.merge(Job.effectively_claimed)),
        completed: count_rows(relation.merge(Job.effectively_completed)),
        ended_early: count_rows(relation.merge(Job.effectively_ended_early)),
        expired: count_rows(relation.merge(Job.expired_listings)),
        counter_pending: count_rows(relation.merge(Job.with_pending_counter_offer).select("jobs.id").distinct)
      }
    end

    def self.count_rows(relation)
      value = relation.except(:includes, :eager_load, :preload, :offset, :limit).count
      value.is_a?(Hash) ? value.values.sum : value.to_i
    end
    private_class_method :count_rows
  end
end
