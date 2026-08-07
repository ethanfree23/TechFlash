namespace :checkr do
  desc "Reconcile stale Checkr background checks in non-terminal states"
  task reconcile_stale: :environment do
    result = CheckrReconciliationService.new.run
    puts "Checkr stale reconciliation: #{result.to_json}"
  end
end
