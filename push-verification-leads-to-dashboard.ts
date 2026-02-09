/**
 * Push validated verification contacts (CAT & MST) to Client Dashboard
 *
 * For verification campaigns, delivery to the client portal works via:
 * 1. Creating a clientPortalOrder for each campaign
 * 2. Inserting validated contacts into clientPortalOrderContacts
 * 3. Marking contacts as submittedToClientAt
 * 4. Ensuring clientCampaignAccess exists so the client can see the campaign
 *
 * Usage: npx tsx push-verification-leads-to-dashboard.ts
 */

import { db } from './server/db';
import { sql } from 'drizzle-orm';

const LIGHTCAST_CLIENT_ID = '67b6f74d-0894-46c4-bf86-1dd047b57dd8';

const CAMPAIGNS = [
  { id: '9ed0de24-2e46-4881-958c-2d2e7017f60b', name: 'LC_CAT_Data Research_ REF-001' },
  { id: '0e956879-e99c-4d10-83b7-e2b31ea57689', name: 'NS1771 MST' },
];

async function pushVerificationLeads() {
  console.log('=== PUSH VALIDATED VERIFICATION LEADS TO CLIENT DASHBOARD ===\n');

  for (const camp of CAMPAIGNS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Campaign: ${camp.name}`);
    console.log(`ID: ${camp.id}`);
    console.log(`${'='.repeat(60)}`);

    // Step 1: Get counts
    const countsResult = await db.execute(
      sql`SELECT
            COUNT(*)::int as total,
            COUNT(CASE WHEN verification_status = 'Validated' THEN 1 END)::int as total_validated,
            COUNT(CASE WHEN verification_status = 'Validated' AND submitted_to_client_at IS NULL THEN 1 END)::int as to_push,
            COUNT(CASE WHEN submitted_to_client_at IS NOT NULL THEN 1 END)::int as already_submitted
          FROM verification_contacts
          WHERE campaign_id = ${camp.id}`
    );
    const counts = (countsResult.rows as any[])[0];

    console.log(`\nTotal contacts: ${counts.total}`);
    console.log(`Total validated: ${counts.total_validated}`);
    console.log(`Already submitted to client: ${counts.already_submitted}`);
    console.log(`Validated & ready to push: ${counts.to_push}`);

    if (counts.to_push === 0) {
      console.log('\nNo new validated contacts to push.');
      continue;
    }

    // Step 2: Get validated contact IDs to push
    const contactsResult = await db.execute(
      sql`SELECT id, full_name, email, title
          FROM verification_contacts
          WHERE campaign_id = ${camp.id}
            AND verification_status = 'Validated'
            AND submitted_to_client_at IS NULL
          ORDER BY comprehensive_priority_score DESC NULLS LAST`
    );
    const validatedContacts = contactsResult.rows as any[];

    console.log(`\nFetched ${validatedContacts.length} validated contacts to push`);

    // Step 3: Ensure client campaign access exists
    const accessResult = await db.execute(
      sql`SELECT id FROM client_campaign_access
          WHERE client_account_id = ${LIGHTCAST_CLIENT_ID}
            AND campaign_id = ${camp.id}
          LIMIT 1`
    );

    if ((accessResult.rows as any[]).length === 0) {
      await db.execute(
        sql`INSERT INTO client_campaign_access (client_account_id, campaign_id, created_at)
            VALUES (${LIGHTCAST_CLIENT_ID}, ${camp.id}, NOW())`
      );
      console.log(`Granted client campaign access for Lightcast`);
    } else {
      console.log(`Client campaign access already exists`);
    }

    // Step 4: Create or find a client portal order for this delivery
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const existingOrderResult = await db.execute(
      sql`SELECT id, order_number, delivered_quantity FROM client_portal_orders
          WHERE client_account_id = ${LIGHTCAST_CLIENT_ID}
            AND campaign_id = ${camp.id}
            AND order_month = ${month}
            AND order_year = ${year}
          LIMIT 1`
    );

    let orderId: string;
    let orderNumber: string;

    if ((existingOrderResult.rows as any[]).length > 0) {
      const existing = (existingOrderResult.rows as any[])[0];
      orderId = existing.id;
      orderNumber = existing.order_number;
      console.log(`Using existing order: ${orderNumber} (${orderId})`);
    } else {
      orderNumber = `ORD-${year}${String(month).padStart(2, '0')}-${camp.name.replace(/[^A-Z0-9]/gi, '').substring(0, 6).toUpperCase()}`;

      const orderResult = await db.execute(
        sql`INSERT INTO client_portal_orders
            (client_account_id, campaign_id, order_number, requested_quantity, approved_quantity,
             delivered_quantity, status, order_month, order_year, admin_notes, approved_at, submitted_at, created_at, updated_at)
            VALUES (${LIGHTCAST_CLIENT_ID}, ${camp.id}, ${orderNumber}, ${validatedContacts.length},
                    ${validatedContacts.length}, 0, 'in_fulfillment', ${month}, ${year},
                    ${'Auto-delivered validated contacts from ' + camp.name},
                    NOW(), NOW(), NOW(), NOW())
            RETURNING id, order_number`
      );
      const newOrder = (orderResult.rows as any[])[0];
      orderId = newOrder.id;
      console.log(`Created order: ${orderNumber} (${orderId})`);
    }

    // Step 5: Bulk insert validated contacts into the order using a single SQL statement
    // This is much faster than individual inserts for large datasets
    const insertResult = await db.execute(
      sql`INSERT INTO client_portal_order_contacts
          (order_id, verification_contact_id, selection_order, selected_at, is_delivered, delivered_at, created_at)
          SELECT
            ${orderId},
            vc.id,
            ROW_NUMBER() OVER (ORDER BY vc.comprehensive_priority_score DESC NULLS LAST),
            NOW(),
            true,
            NOW(),
            NOW()
          FROM verification_contacts vc
          WHERE vc.campaign_id = ${camp.id}
            AND vc.verification_status = 'Validated'
            AND vc.submitted_to_client_at IS NULL
          ON CONFLICT (order_id, verification_contact_id) DO NOTHING`
    );
    const insertedCount = validatedContacts.length;
    console.log(`Bulk inserted ${insertedCount} contacts into order`);

    // Step 6: Mark contacts as submitted to client (single bulk update)
    const submissionTime = new Date();
    const exclusionDate = new Date(submissionTime);
    exclusionDate.setFullYear(exclusionDate.getFullYear() + 2);

    await db.execute(
      sql`UPDATE verification_contacts
          SET submitted_to_client_at = ${submissionTime},
              client_delivery_excluded_until = ${exclusionDate},
              updated_at = ${submissionTime}
          WHERE campaign_id = ${camp.id}
            AND verification_status = 'Validated'
            AND submitted_to_client_at IS NULL`
    );

    console.log(`Marked contacts as submitted to client`);

    // Step 7: Update order delivered quantity and mark completed
    await db.execute(
      sql`UPDATE client_portal_orders
          SET delivered_quantity = delivered_quantity + ${insertedCount},
              status = 'completed',
              fulfilled_at = NOW(),
              updated_at = NOW()
          WHERE id = ${orderId}`
    );

    console.log(`Updated order ${orderNumber}: +${insertedCount} delivered`);

    // Final summary
    const finalResult = await db.execute(
      sql`SELECT
            COUNT(CASE WHEN verification_status = 'Validated' THEN 1 END)::int as total_validated,
            COUNT(CASE WHEN submitted_to_client_at IS NOT NULL THEN 1 END)::int as submitted
          FROM verification_contacts
          WHERE campaign_id = ${camp.id}`
    );
    const final = (finalResult.rows as any[])[0];

    console.log(`\n--- FINAL RESULT for ${camp.name} ---`);
    console.log(`  Total validated: ${final.total_validated}`);
    console.log(`  Submitted to client: ${final.submitted}`);
  }

  console.log('\n\nDone!');
  process.exit(0);
}

pushVerificationLeads().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
