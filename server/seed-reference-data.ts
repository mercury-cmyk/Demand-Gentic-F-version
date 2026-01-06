import { db } from "./db";
import { 
  seniorityLevelReference, 
  jobFunctionReference, 
  departmentReference, 
  technologyReference, 
  countryReference, 
  stateReference, 
  cityReference 
} from "@shared/schema";

async function seedReferenceData() {
  console.log("🌱 Seeding reference data for filters...");

  try {
    // Seed Seniority Levels
    const seniorityLevels = [
      { id: 'c-level', name: 'C-Level', sortOrder: 1 },
      { id: 'vp', name: 'Vice President', sortOrder: 2 },
      { id: 'director', name: 'Director', sortOrder: 3 },
      { id: 'manager', name: 'Manager', sortOrder: 4 },
      { id: 'senior', name: 'Senior', sortOrder: 5 },
      { id: 'mid-level', name: 'Mid-Level', sortOrder: 6 },
      { id: 'junior', name: 'Junior', sortOrder: 7 },
      { id: 'entry-level', name: 'Entry Level', sortOrder: 8 }
    ];
    
    for (const level of seniorityLevels) {
      await db.insert(seniorityLevelReference).values(level).onConflictDoNothing();
    }
    console.log('✅ Seniority levels seeded');

    // Seed Job Functions
    const jobFunctions = [
      { id: 'sales', name: 'Sales', sortOrder: 1 },
      { id: 'marketing', name: 'Marketing', sortOrder: 2 },
      { id: 'engineering', name: 'Engineering', sortOrder: 3 },
      { id: 'product', name: 'Product Management', sortOrder: 4 },
      { id: 'operations', name: 'Operations', sortOrder: 5 },
      { id: 'finance', name: 'Finance', sortOrder: 6 },
      { id: 'hr', name: 'Human Resources', sortOrder: 7 },
      { id: 'legal', name: 'Legal', sortOrder: 8 },
      { id: 'it', name: 'Information Technology', sortOrder: 9 },
      { id: 'customer-success', name: 'Customer Success', sortOrder: 10 },
      { id: 'consulting', name: 'Consulting', sortOrder: 11 },
      { id: 'executive', name: 'Executive', sortOrder: 12 }
    ];
    
    for (const func of jobFunctions) {
      await db.insert(jobFunctionReference).values(func).onConflictDoNothing();
    }
    console.log('✅ Job functions seeded');

    // Seed Departments
    const departments = [
      { id: 'sales', name: 'Sales', sortOrder: 1 },
      { id: 'marketing', name: 'Marketing', sortOrder: 2 },
      { id: 'engineering', name: 'Engineering', sortOrder: 3 },
      { id: 'product', name: 'Product', sortOrder: 4 },
      { id: 'operations', name: 'Operations', sortOrder: 5 },
      { id: 'finance', name: 'Finance & Accounting', sortOrder: 6 },
      { id: 'hr', name: 'Human Resources', sortOrder: 7 },
      { id: 'legal', name: 'Legal & Compliance', sortOrder: 8 },
      { id: 'it', name: 'IT & Support', sortOrder: 9 },
      { id: 'customer-success', name: 'Customer Success', sortOrder: 10 },
      { id: 'rd', name: 'Research & Development', sortOrder: 11 },
      { id: 'exec', name: 'Executive', sortOrder: 12 }
    ];
    
    for (const dept of departments) {
      await db.insert(departmentReference).values(dept).onConflictDoNothing();
    }
    console.log('✅ Departments seeded');

    // Seed Technologies
    const technologies = [
      { id: 'salesforce', name: 'Salesforce', category: 'CRM', sortOrder: 1 },
      { id: 'hubspot', name: 'HubSpot', category: 'CRM', sortOrder: 2 },
      { id: 'microsoft-dynamics', name: 'Microsoft Dynamics', category: 'CRM', sortOrder: 3 },
      { id: 'aws', name: 'Amazon Web Services', category: 'Cloud', sortOrder: 4 },
      { id: 'azure', name: 'Microsoft Azure', category: 'Cloud', sortOrder: 5 },
      { id: 'gcp', name: 'Google Cloud Platform', category: 'Cloud', sortOrder: 6 },
      { id: 'tableau', name: 'Tableau', category: 'Analytics', sortOrder: 7 },
      { id: 'power-bi', name: 'Power BI', category: 'Analytics', sortOrder: 8 },
      { id: 'slack', name: 'Slack', category: 'Communication', sortOrder: 9 },
      { id: 'teams', name: 'Microsoft Teams', category: 'Communication', sortOrder: 10 },
      { id: 'jira', name: 'Jira', category: 'Project Management', sortOrder: 11 },
      { id: 'confluence', name: 'Confluence', category: 'Documentation', sortOrder: 12 },
      { id: 'github', name: 'GitHub', category: 'Development', sortOrder: 13 },
      { id: 'gitlab', name: 'GitLab', category: 'Development', sortOrder: 14 },
      { id: 'docker', name: 'Docker', category: 'DevOps', sortOrder: 15 },
      { id: 'kubernetes', name: 'Kubernetes', category: 'DevOps', sortOrder: 16 }
    ];
    
    for (const tech of technologies) {
      await db.insert(technologyReference).values(tech).onConflictDoNothing();
    }
    console.log('✅ Technologies seeded');

    // Seed Countries
    const countries = [
      { id: 'usa', name: 'United States', code: 'US', sortOrder: 1 },
      { id: 'canada', name: 'Canada', code: 'CA', sortOrder: 2 },
      { id: 'uk', name: 'United Kingdom', code: 'GB', sortOrder: 3 },
      { id: 'germany', name: 'Germany', code: 'DE', sortOrder: 4 },
      { id: 'france', name: 'France', code: 'FR', sortOrder: 5 },
      { id: 'australia', name: 'Australia', code: 'AU', sortOrder: 6 },
      { id: 'india', name: 'India', code: 'IN', sortOrder: 7 },
      { id: 'singapore', name: 'Singapore', code: 'SG', sortOrder: 8 },
      { id: 'japan', name: 'Japan', code: 'JP', sortOrder: 9 },
      { id: 'netherlands', name: 'Netherlands', code: 'NL', sortOrder: 10 }
    ];
    
    for (const country of countries) {
      await db.insert(countryReference).values(country).onConflictDoNothing();
    }
    console.log('✅ Countries seeded');

    // Seed US States
    const usStates = [
      { id: 'california', name: 'California', code: 'CA', countryId: 'usa', sortOrder: 1 },
      { id: 'texas', name: 'Texas', code: 'TX', countryId: 'usa', sortOrder: 2 },
      { id: 'florida', name: 'Florida', code: 'FL', countryId: 'usa', sortOrder: 3 },
      { id: 'new-york', name: 'New York', code: 'NY', countryId: 'usa', sortOrder: 4 },
      { id: 'pennsylvania', name: 'Pennsylvania', code: 'PA', countryId: 'usa', sortOrder: 5 },
      { id: 'illinois', name: 'Illinois', code: 'IL', countryId: 'usa', sortOrder: 6 },
      { id: 'ohio', name: 'Ohio', code: 'OH', countryId: 'usa', sortOrder: 7 },
      { id: 'georgia', name: 'Georgia', code: 'GA', countryId: 'usa', sortOrder: 8 },
      { id: 'north-carolina', name: 'North Carolina', code: 'NC', countryId: 'usa', sortOrder: 9 },
      { id: 'michigan', name: 'Michigan', code: 'MI', countryId: 'usa', sortOrder: 10 },
      { id: 'washington', name: 'Washington', code: 'WA', countryId: 'usa', sortOrder: 11 },
      { id: 'massachusetts', name: 'Massachusetts', code: 'MA', countryId: 'usa', sortOrder: 12 }
    ];
    
    for (const state of usStates) {
      await db.insert(stateReference).values(state).onConflictDoNothing();
    }
    console.log('✅ US states seeded');

    // Seed Canadian Provinces
    const canadianProvinces = [
      { id: 'ontario', name: 'Ontario', code: 'ON', countryId: 'canada', sortOrder: 1 },
      { id: 'quebec', name: 'Quebec', code: 'QC', countryId: 'canada', sortOrder: 2 },
      { id: 'british-columbia', name: 'British Columbia', code: 'BC', countryId: 'canada', sortOrder: 3 },
      { id: 'alberta', name: 'Alberta', code: 'AB', countryId: 'canada', sortOrder: 4 }
    ];
    
    for (const province of canadianProvinces) {
      await db.insert(stateReference).values(province).onConflictDoNothing();
    }
    console.log('✅ Canadian provinces seeded');

    // Seed Major US Cities
    const usCities = [
      { id: 'san-francisco', name: 'San Francisco', stateId: 'california', countryId: 'usa', sortOrder: 1 },
      { id: 'los-angeles', name: 'Los Angeles', stateId: 'california', countryId: 'usa', sortOrder: 2 },
      { id: 'san-diego', name: 'San Diego', stateId: 'california', countryId: 'usa', sortOrder: 3 },
      { id: 'austin', name: 'Austin', stateId: 'texas', countryId: 'usa', sortOrder: 4 },
      { id: 'houston', name: 'Houston', stateId: 'texas', countryId: 'usa', sortOrder: 5 },
      { id: 'dallas', name: 'Dallas', stateId: 'texas', countryId: 'usa', sortOrder: 6 },
      { id: 'miami', name: 'Miami', stateId: 'florida', countryId: 'usa', sortOrder: 7 },
      { id: 'orlando', name: 'Orlando', stateId: 'florida', countryId: 'usa', sortOrder: 8 },
      { id: 'new-york-city', name: 'New York City', stateId: 'new-york', countryId: 'usa', sortOrder: 9 },
      { id: 'chicago', name: 'Chicago', stateId: 'illinois', countryId: 'usa', sortOrder: 10 },
      { id: 'boston', name: 'Boston', stateId: 'massachusetts', countryId: 'usa', sortOrder: 11 },
      { id: 'seattle', name: 'Seattle', stateId: 'washington', countryId: 'usa', sortOrder: 12 },
      { id: 'atlanta', name: 'Atlanta', stateId: 'georgia', countryId: 'usa', sortOrder: 13 }
    ];
    
    for (const city of usCities) {
      await db.insert(cityReference).values(city).onConflictDoNothing();
    }
    console.log('✅ US cities seeded');

    // Seed Canadian Cities
    const canadianCities = [
      { id: 'toronto', name: 'Toronto', stateId: 'ontario', countryId: 'canada', sortOrder: 1 },
      { id: 'vancouver', name: 'Vancouver', stateId: 'british-columbia', countryId: 'canada', sortOrder: 2 },
      { id: 'montreal', name: 'Montreal', stateId: 'quebec', countryId: 'canada', sortOrder: 3 },
      { id: 'calgary', name: 'Calgary', stateId: 'alberta', countryId: 'canada', sortOrder: 4 }
    ];
    
    for (const city of canadianCities) {
      await db.insert(cityReference).values(city).onConflictDoNothing();
    }
    console.log('✅ Canadian cities seeded');

    console.log("\n✅ Reference data seeding complete!");
    console.log("   - Seniority Levels: 8 entries");
    console.log("   - Job Functions: 12 entries");
    console.log("   - Departments: 12 entries");
    console.log("   - Technologies: 16 entries");
    console.log("   - Countries: 10 entries");
    console.log("   - States/Provinces: 16 entries");
    console.log("   - Cities: 17 entries\n");
  } catch (error) {
    console.error("❌ Reference data seeding failed:", error);
    throw error;
  }
}

seedReferenceData()
  .catch(console.error)
  .finally(() => process.exit());
