class AddSkillAndNotesToJobs < ActiveRecord::Migration[7.1]
  def change
    add_column :jobs, :skill_class, :string
    add_column :jobs, :minimum_years_experience, :integer
    add_column :jobs, :notes, :text
  end
end
