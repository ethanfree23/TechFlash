# frozen_string_literal: true

module Demo
  module MarketData
    DEMO_PASSWORD = "DemoPassword123!"

    DEMO_EMAILS = {
      admin: "demo.admin@techflash.app",
      company: "demo.company@techflash.app",
      technician: "demo.tech@techflash.app"
    }.freeze

    MARKETS = {
      houston: {
        city: "Houston",
        state: "TX",
        lat: BigDecimal("29.7604"),
        lng: BigDecimal("-95.3698"),
        area_code: "713",
        companies: [
          "Bayou City Mechanical",
          "Gulf Coast Electrical Services",
          "Lone Star Facility Solutions",
          "Space City HVAC Group",
          "Harris County Maintenance Co.",
          "Magnolia Plumbing & Drain",
          "Houston Commercial Roofing",
          "East End Industrial Services"
        ],
        neighborhoods: %w[
          Midtown The\ Heights East\ Downtown Galleria Spring\ Branch Pasadena
          Sugar\ Land Katy The\ Woodlands Pearland Cypress Energy\ Corridor
        ]
      },
      austin: {
        city: "Austin",
        state: "TX",
        lat: BigDecimal("30.2672"),
        lng: BigDecimal("-97.7431"),
        area_code: "512",
        companies: [
          "Capital City Mechanical",
          "Hill Country Electrical",
          "Barton Creek Facility Services",
          "South Congress HVAC",
          "Austin Build & Repair",
          "Travis County Plumbing Pros",
          "ATX Maintenance Group",
          "Round Rock Industrial Services"
        ],
        neighborhoods: %w[
          Downtown\ Austin South\ Congress East\ Austin North\ Austin Round\ Rock
          Cedar\ Park Pflugerville Georgetown Buda Kyle
        ]
      },
      dallas: {
        city: "Dallas",
        state: "TX",
        lat: BigDecimal("32.7767"),
        lng: BigDecimal("-96.7970"),
        area_code: "214",
        companies: [
          "Metroplex Mechanical",
          "North Texas Electrical Group",
          "Dallas Facility Partners",
          "Trinity HVAC Services",
          "Deep Ellum Maintenance Co.",
          "DFW Plumbing & Service",
          "Oak Cliff Commercial Roofing",
          "Plano Industrial Repair"
        ],
        neighborhoods: %w[
          Downtown\ Dallas Deep\ Ellum Oak\ Cliff Uptown Plano Irving Garland
          Richardson Frisco Arlington Mesquite
        ]
      }
    }.freeze

    SKILL_CLASSES = [
      "Electrical",
      "HVAC",
      "Plumbing",
      "Refrigeration",
      "Facility Maintenance",
      "Construction",
      "Roofing",
      "General Maintenance",
      "Appliance Repair",
      "Fire Protection"
    ].freeze

    TECH_FIRST_NAMES = %w[
      Marcus Elena Diego Priya James Sofia Andre Keisha Ryan Mei Carlos
      Nathan Brittany Omar Jasmine Tyler Lauren Kevin Amanda Brandon
      Rachel Daniel Michelle Gregory Patricia
    ].freeze

    TECH_LAST_NAMES = %w[
      Alvarez Nguyen Patel Brooks Chen Ortiz Johnson Williams Garcia
      Robinson Martinez Anderson Taylor Thomas Jackson White Harris
      Martin Thompson Moore Young Allen King Wright Scott Green
    ].freeze

    CONTACT_FIRST_NAMES = %w[Alex Jordan Casey Morgan Riley Taylor Cameron Jamie Avery Quinn].freeze
    CONTACT_LAST_NAMES = %w[Reed Shaw Hayes Morgan Blake Ellis Ford Nash Pierce Holt].freeze

    JOB_TITLES = {
      "Electrical" => [
        "Commercial panel upgrade — short coverage",
        "Emergency lighting repair — retail build-out",
        "480V motor control troubleshooting"
      ],
      "HVAC" => [
        "Rooftop unit PM — multi-zone office",
        "Chiller loop inspection — data hall",
        "Urgent cooling outage — restaurant kitchen"
      ],
      "Plumbing" => [
        "Backflow test and repair — medical suite",
        "Sewer line camera and jetting — industrial",
        "Domestic water repipe — 2-day window"
      ],
      "Refrigeration" => [
        "Walk-in cooler compressor swap",
        "Reach-in freezer leak diagnosis",
        "Ice machine line freeze repair"
      ],
      "Facility Maintenance" => [
        "Weekend facilities coverage — Class A tower",
        "Loading dock door and dock leveler PM",
        "Building envelope punch list closeout"
      ],
      "Construction" => [
        "Concrete pour support — carpentry assist",
        "Tenant improvement rough-in support",
        "Steel erection bolt-up crew add-on"
      ],
      "Roofing" => [
        "TPO membrane patch — active leak",
        "Parapet wall flashing repair",
        "Storm damage tarp and inspection"
      ],
      "General Maintenance" => [
        "Handyman coverage — property management",
        "Interior repaint and drywall touch-up",
        "Furniture assembly and minor repairs"
      ],
      "Appliance Repair" => [
        "Commercial dishwasher down — line 2",
        "Range hood motor replacement",
        "Laundry equipment belt and bearing service"
      ],
      "Fire Protection" => [
        "Fire sprinkler head replacement — warehouse",
        "Alarm panel trouble signal clear",
        "Annual fire pump run and log"
      ]
    }.freeze

    MEMBERSHIP_LEVELS = %w[basic pro premium].freeze
  end
end
