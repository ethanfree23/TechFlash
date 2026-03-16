class AddRequiredCertificationsToJobs < ActiveRecord::Migration[7.1]
  def change
    add_column :jobs, :required_certifications, :text
  end
end
