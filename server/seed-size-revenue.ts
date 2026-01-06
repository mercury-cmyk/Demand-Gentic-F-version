import { db } from './db';
import { companySizeReference, revenueRangeReference } from '../shared/schema';

async function seedSizeAndRevenueReferences() {
  console.log('🌱 Seeding company size and revenue range reference data...');

  // Company Size Reference Data (9 ranges A-I)
  const companySizes = [
    { code: 'A', label: 'Self-Employed', minEmployees: 1, maxEmployees: 1, sortOrder: 1 },
    { code: 'B', label: '2–10', minEmployees: 2, maxEmployees: 10, sortOrder: 2 },
    { code: 'C', label: '11–50', minEmployees: 11, maxEmployees: 50, sortOrder: 3 },
    { code: 'D', label: '51–200', minEmployees: 51, maxEmployees: 200, sortOrder: 4 },
    { code: 'E', label: '201–500', minEmployees: 201, maxEmployees: 500, sortOrder: 5 },
    { code: 'F', label: '501–1000', minEmployees: 501, maxEmployees: 1000, sortOrder: 6 },
    { code: 'G', label: '1001–5000', minEmployees: 1001, maxEmployees: 5000, sortOrder: 7 },
    { code: 'H', label: '5001–10,000', minEmployees: 5001, maxEmployees: 10000, sortOrder: 8 },
    { code: 'I', label: '10,000+', minEmployees: 10001, maxEmployees: null, sortOrder: 9 },
  ];

  // Revenue Range Reference Data (10 brackets)
  const revenueRanges = [
    { 
      label: 'Less than $500K', 
      description: 'Early-stage / Micro', 
      minRevenue: '0', 
      maxRevenue: '500000', 
      sortOrder: 1 
    },
    { 
      label: '$500K – $1M', 
      description: 'Micro-Small Transition', 
      minRevenue: '500000', 
      maxRevenue: '1000000', 
      sortOrder: 2 
    },
    { 
      label: '$1M – $5M', 
      description: 'Small Business', 
      minRevenue: '1000000', 
      maxRevenue: '5000000', 
      sortOrder: 3 
    },
    { 
      label: '$5M – $10M', 
      description: 'Growing Small Enterprise', 
      minRevenue: '5000000', 
      maxRevenue: '10000000', 
      sortOrder: 4 
    },
    { 
      label: '$10M – $50M', 
      description: 'Lower Mid-Market', 
      minRevenue: '10000000', 
      maxRevenue: '50000000', 
      sortOrder: 5 
    },
    { 
      label: '$50M – $100M', 
      description: 'Upper Mid-Market', 
      minRevenue: '50000000', 
      maxRevenue: '100000000', 
      sortOrder: 6 
    },
    { 
      label: '$100M – $500M', 
      description: 'Large Enterprise (Lower Tier)', 
      minRevenue: '100000000', 
      maxRevenue: '500000000', 
      sortOrder: 7 
    },
    { 
      label: '$500M – $1B', 
      description: 'Large Enterprise (Upper Tier)', 
      minRevenue: '500000000', 
      maxRevenue: '1000000000', 
      sortOrder: 8 
    },
    { 
      label: '$1B – $5B', 
      description: 'Global Enterprise (Tier 1)', 
      minRevenue: '1000000000', 
      maxRevenue: '5000000000', 
      sortOrder: 9 
    },
    { 
      label: 'Over $5B', 
      description: 'Global Enterprise (Tier 0)', 
      minRevenue: '5000000000', 
      maxRevenue: null, 
      sortOrder: 10 
    },
  ];

  try {
    // Insert company sizes using upsert pattern (insert on conflict do nothing)
    for (const size of companySizes) {
      await db.insert(companySizeReference)
        .values(size)
        .onConflictDoNothing({ target: companySizeReference.code });
    }
    console.log(`✅ Seeded ${companySizes.length} company size ranges (A-I)`);

    // Insert revenue ranges using upsert pattern
    for (const range of revenueRanges) {
      await db.insert(revenueRangeReference)
        .values(range)
        .onConflictDoNothing({ target: revenueRangeReference.label });
    }
    console.log(`✅ Seeded ${revenueRanges.length} revenue range brackets`);

    console.log('✨ Reference data seeding complete!');
  } catch (error) {
    console.error('❌ Error seeding reference data:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedSizeAndRevenueReferences()
    .then(() => {
      console.log('Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedSizeAndRevenueReferences };
