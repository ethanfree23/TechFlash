# frozen_string_literal: true

# When a company posts their first job, promote linked CRM lead from prospect → customer.
module CrmProspectPromotion
  module_function

  def promote_after_job_created!(company_profile_id)
    cp = CompanyProfile.find_by(id: company_profile_id)
    return unless cp

    lead = CrmLead.find_by(linked_company_profile_id: cp.id) || CrmLead.find_by(linked_user_id: cp.user_id)
    return unless lead&.status == "prospect"

    lead.update!(status: "customer")
  end
end
