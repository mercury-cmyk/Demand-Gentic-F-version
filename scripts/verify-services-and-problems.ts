import { getServiceCatalog } from '../server/services/problem-intelligence/service-catalog-service.js';
import { getProblemDefinitions } from '../server/services/problem-intelligence/problem-definition-service.js';
import { getSuperOrganization } from '../server/services/super-organization-service.js';

async function verify() {
  const superOrg = await getSuperOrganization();
  
  console.log('\n📦 Services Catalog:');
  const services = await getServiceCatalog(superOrg!.id);
  services.forEach((s, i) => {
    console.log(`  ${i+1}. ${s.serviceName} (${s.serviceCategory})`);
    console.log(`     - ${s.problemsSolved.length} problems solved`);
    console.log(`     - ${s.differentiators.length} differentiators`);
    console.log(`     - ${s.valuePropositions.length} value propositions`);
  });
  console.log(`\n  Total: ${services.length} services\n`);
  
  console.log('🧩 Problem Framework:');
  const problems = await getProblemDefinitions(superOrg!.id);
  problems.forEach((p, i) => {
    console.log(`  ${i+1}. ${p.problemStatement.substring(0, 80)}...`);
    console.log(`     - Category: ${p.problemCategory}`);
    console.log(`     - ${p.symptoms.length} symptoms`);
    console.log(`     - ${p.impactAreas.length} impact areas`);
    console.log(`     - ${p.messagingAngles.length} messaging angles`);
  });
  console.log(`\n  Total: ${problems.length} problem definitions\n`);
  
  process.exit(0);
}

verify().catch(console.error);
