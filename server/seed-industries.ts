// Seed script to populate industry reference with LinkedIn/NAICS standardized taxonomy
import { db } from './db';
import { industryReference } from '@shared/schema';

// Standardized Industry Master List (v1.0 – LinkedIn/NAICS Hybrid)
const industries = [
  "Accounting",
  "Advertising Services",
  "Aerospace & Defense",
  "Agriculture & Forestry",
  "Airlines & Aviation",
  "Alternative Dispute Resolution",
  "Alternative Medicine",
  "Animation",
  "Apparel & Fashion",
  "Architecture & Planning",
  "Arts & Crafts",
  "Automotive",
  "Aviation & Aerospace Components",
  "Banking",
  "Biotechnology Research",
  "Broadcast Media",
  "Building Materials",
  "Business Consulting & Services",
  "Capital Markets",
  "Chemical Manufacturing",
  "Civic & Social Organizations",
  "Civil Engineering",
  "Commercial Real Estate",
  "Computer & Network Security",
  "Computer Games",
  "Computer Hardware Manufacturing",
  "Computer Networking Products",
  "Computer Software",
  "Construction",
  "Consumer Electronics",
  "Consumer Goods",
  "Consumer Services",
  "Corporate Training & Coaching",
  "Cosmetics",
  "Dairy Product Manufacturing",
  "Defense & Space",
  "Design Services",
  "E-Learning Providers",
  "Education Administration Programs",
  "Electrical & Electronic Manufacturing",
  "Entertainment Providers",
  "Environmental Services",
  "Events Services",
  "Executive Offices",
  "Facilities Services",
  "Farming",
  "Financial Services",
  "Fine Art",
  "Fishery",
  "Food & Beverage Services",
  "Food Production",
  "Fundraising",
  "Furniture & Home Furnishings Manufacturing",
  "Gambling & Casinos",
  "Glass, Ceramics & Concrete Manufacturing",
  "Government Administration",
  "Government Relations Services",
  "Graphic Design",
  "Health & Fitness Services",
  "Higher Education",
  "Hospital & Health Care",
  "Hospitality",
  "Human Resources & Staffing",
  "Import & Export",
  "Individual & Family Services",
  "Industrial Automation",
  "Information Services",
  "Information Technology & Services",
  "Insurance",
  "International Affairs",
  "International Trade & Development",
  "Investment Banking",
  "Investment Management",
  "Journalism",
  "Judiciary",
  "Law Enforcement",
  "Law Practice",
  "Legal Services",
  "Legislative Offices",
  "Leisure, Travel & Tourism",
  "Libraries",
  "Logistics & Supply Chain",
  "Luxury Goods & Jewelry",
  "Machinery Manufacturing",
  "Management Consulting",
  "Marine Manufacturing",
  "Market Research",
  "Marketing & Advertising",
  "Mechanical or Industrial Engineering",
  "Media & Telecommunications",
  "Medical Devices",
  "Medical Practice",
  "Mental Health Care",
  "Military",
  "Mining & Metals",
  "Motion Pictures & Film",
  "Museums, Historical Sites & Zoos",
  "Music",
  "Nanotechnology",
  "Newspapers & Online News",
  "Nonprofit Organizations",
  "Oil & Gas",
  "Online Audio & Video Media",
  "Outsourcing & Offshoring Consulting",
  "Package & Freight Delivery",
  "Packaging & Containers Manufacturing",
  "Paper & Forest Products Manufacturing",
  "Performing Arts",
  "Pharmaceutical Manufacturing",
  "Philanthropic Fundraising Services",
  "Photography",
  "Plastics Manufacturing",
  "Political Organizations",
  "Primary & Secondary Education",
  "Printing Services",
  "Professional Training & Coaching",
  "Program Development",
  "Public Policy Offices",
  "Public Relations & Communications",
  "Public Safety",
  "Publishing",
  "Real Estate",
  "Recreational Facilities",
  "Religious Institutions",
  "Renewable Energy Semiconductor Manufacturing",
  "Research Services",
  "Restaurants",
  "Retail",
  "Security & Investigations",
  "Semiconductors",
  "Shipbuilding",
  "Sporting Goods Manufacturing",
  "Sports & Recreation",
  "Staffing & Recruiting",
  "Supermarkets",
  "Telecommunications",
  "Textiles Manufacturing",
  "Think Tanks",
  "Tobacco Manufacturing",
  "Translation & Localization",
  "Transportation, Trucking & Railroad",
  "Utilities",
  "Venture Capital & Private Equity",
  "Veterinary Services",
  "Warehousing & Storage",
  "Waste Management",
  "Wholesale Trade",
  "Wireless Services",
  "Writing & Editing",
  "Other / Unclassified"
];

export async function seedIndustries() {
  console.log('Seeding industry reference with standardized taxonomy...');
  
  // Check if industries already exist
  const existing = await db.select().from(industryReference).execute();
  
  if (existing.length > 0) {
    console.log(`ℹ Industry reference already seeded with ${existing.length} industries. Skipping.`);
    return;
  }
  
  // Insert all industry names
  const industryData = industries.map(name => ({
    name,
    naicsCode: null,
    synonyms: [],
    isActive: true,
  }));
  
  await db.insert(industryReference).values(industryData).execute();
  
  console.log(`✓ Seeded ${industries.length} standardized industries (LinkedIn/NAICS taxonomy)`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedIndustries()
    .then(() => {
      console.log('Industry seed complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Industry seed failed:', error);
      process.exit(1);
    });
}
