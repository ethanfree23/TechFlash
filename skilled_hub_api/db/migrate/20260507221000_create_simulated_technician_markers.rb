class CreateSimulatedTechnicianMarkers < ActiveRecord::Migration[7.1]
  def change
    create_table :simulated_technician_markers do |t|
      t.string :name, null: false
      t.decimal :latitude, precision: 10, scale: 7, null: false
      t.decimal :longitude, precision: 10, scale: 7, null: false
      t.string :trade_label
      t.boolean :active, null: false, default: true
      t.timestamps
    end
  end
end
