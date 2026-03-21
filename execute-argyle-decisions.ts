import "./server/env";
import { pool, db } from "./server/db";
import { sql } from "drizzle-orm";

// ============================================================
// TRANSCRIPT EVALUATION DECISIONS
// Campaign: Argyle Executive Forum - Appointment Setting
// Criteria: Marketing/DemGen leaders interested in CIO/CISO forum sponsorships
// Required: Permission given, content interest, min_score 70
// ============================================================

interface LeadDecision {
  leadId: string;
  contact: string;
  account: string;
  action: 'approve' | 'reject';
  reason: string;
}

const decisions: LeadDecision[] = [
  // ==========================================
  // APPROVED - Leads showing genuine interest, callback requests, or referrals
  // ==========================================

  // Divya Venkataramu @ Microsoft - CALLBACK REQUESTED for May/June (maternity leave)
  // Strong: Confirmed identity, polite, requested specific callback timeframe (mid-May)
  {
    leadId: "2dc031b5-ebea-4e5d-b267-b36fece52d6c",
    contact: "Divya Venkataramu",
    account: "Microsoft USA",
    action: "approve",
    reason: "Callback requested — prospect on maternity leave, asked to reconnect May/June. Identity confirmed. Strong account fit (Microsoft)."
  },

  // Taryn Cunningham @ gmicloud - ASKED FOR EMAIL
  // Showed interest: asked for elaboration, then requested email follow-up
  {
    leadId: "6839981b-d7a3-4cf6-86f1-e20c903c339e",
    contact: "Taryn Cunningham",
    account: "gmicloud",
    action: "approve",
    reason: "Prospect asked for elaboration on the offering, then requested email follow-up. Shows receptiveness and interest in learning more."
  },

  // Ellis Mass @ Labor Finders - ENGAGED EXTENSIVELY despite AI concern
  // 21 turns, 207s call, asked about regions, business model, confirmed marketing leader
  {
    leadId: "11f6c5fc-cb36-4da9-a942-5ff5ff116f3c",
    contact: "Ellis Mass",
    account: "Labor Finders",
    action: "approve",
    reason: "Extensive engagement (207s, 21 turns). Asked about regions, business model. Confirmed 'I am a marketing leader'. Despite AI concern, stayed on call and engaged substantively. High curiosity."
  },

  // Michael Griffiths @ Databricks - REFERRAL PROVIDED
  // Said his team does CIO forums/roundtables, referred to internal events team. Confirmed interest.
  {
    leadId: "b3aeddcc-1c7e-4ee4-ab4f-d49e54092587",
    contact: "Michael Griffiths",
    account: "Databricks",
    action: "approve",
    reason: "Referred to internal executive events team. Confirmed they do CIO forums/roundtables and would be interested. Strong B2B tech fit (Databricks). Follow up with the events team."
  },

  // Mithila Wegapitiya @ potenza.sg - Already approved, callback requested, AI score 78
  // Already PM-approved and published but not submitted to client
  {
    leadId: "2c4f2ffe-0855-40c0-a8be-5b0f9c7a94c3",
    contact: "Mithila Wegapitiya",
    account: "potenza.sg",
    action: "approve",
    reason: "Already approved with AI score 78. Callback requested. Ready for client submission."
  },

  // ==========================================
  // REJECTED - No interest, wrong person, no conversation, explicit refusal
  // ==========================================

  // Shalva Alexander @ The LCF Group - No meaningful conversation, only asked where calling from
  {
    leadId: "e8f4fa64-c6ce-42a3-821f-ede9476f3ae1",
    contact: "Shalva Alexander",
    account: "The LCF Group",
    action: "reject",
    reason: "No meaningful conversation. Contact only asked where agent was calling from. No engagement with pitch. 8 turns, ~40s."
  },

  // Lloyd Lopez @ Viskase - Non-English responses, no engagement
  {
    leadId: "afd1b794-0399-4c42-bd6d-fcb896c33b9c",
    contact: "Lloyd Lopez",
    account: "viskase",
    action: "reject",
    reason: "No meaningful conversation. Contact responded in non-English, zero engagement. 6 turns."
  },

  // Paul Ross @ Affinity.co - Gatekeeper said 'send more information', no direct contact
  {
    leadId: "c0195d01-800c-40ce-84c8-f9bea1501f1d",
    contact: "Paul Ross",
    account: "Affinity.co",
    action: "reject",
    reason: "Never reached target contact. Gatekeeper said 'send more information'. No direct engagement."
  },

  // Samuel Jong @ Grazitti - Questioned legality, not interested
  {
    leadId: "f779dc17-4506-462c-8b58-c6544b8d05e2",
    contact: "Samuel Jong",
    account: "grazitti",
    action: "reject",
    reason: "Contact was skeptical, repeatedly asked for website, questioned call legality. Stated call was illegal. Clear rejection."
  },

  // James Pencek @ Vatic Outsourcing - Questioned data source, not interested
  {
    leadId: "b76d566c-aabd-4288-9bae-4b2e7cd4e49f",
    contact: "James Pencek",
    account: "Vatic Outsourcing",
    action: "reject",
    reason: "No interest shown. Asked 'How did you get my info?' and call ended. No engagement with pitch."
  },

  // Eric Bogard @ Copyleaks - No meaningful conversation, call cut short
  {
    leadId: "cc9e70b9-a7d9-4919-9d26-79a2dd5e856b",
    contact: "Eric Bogard",
    account: "copyleaks",
    action: "reject",
    reason: "No meaningful conversation. Contact asked 'What could I help you with?' but call ended before any response to pitch. 5 turns, 31s."
  },

  // Frank Jackson @ BioCatch - No conversation at all (2 turns)
  {
    leadId: "d2deb02c-3de9-494e-82ee-9ff3d936b52a",
    contact: "Frank Jackson",
    account: "BioCatch",
    action: "reject",
    reason: "No conversation. Only 2 turns, contact said their name and nothing else. No engagement."
  },

  // David Sim @ RethinkFirst - Explicit not interested
  {
    leadId: "b4290dd8-8dfe-428e-b41b-a25bfabe0206",
    contact: "David Sim",
    account: "RethinkFirst",
    action: "reject",
    reason: "Explicitly said 'No, it is not' relevant to their team. Clear rejection."
  },

  // Tom Angelucci @ Ivanti - Wrong person, no longer at company
  {
    leadId: "f27f7d8f-9ef1-4caf-bf3c-850472f24513",
    contact: "Tom Angelucci",
    account: "Ivanti",
    action: "reject",
    reason: "Wrong person — no longer works at Ivanti. Now at small company IMI, said they wouldn't be interested."
  },

  // Kim De Anda @ Duolingo - Explicit rejection
  {
    leadId: "49dbd12f-1727-4030-8171-b992044ff9e6",
    contact: "Kim De Anda",
    account: "Duolingo",
    action: "reject",
    reason: "Explicitly said 'I'm not interested.' Clear rejection."
  },

  // Alex Baldocchi @ Driven/ThinkingCapital - No meaningful conversation
  {
    leadId: "e833ef8c-281b-4f5b-85d9-ac3f26f3fe66",
    contact: "Alex Baldocchi",
    account: "Driven",
    action: "reject",
    reason: "No meaningful conversation. Brief non-committal responses. Call ended abruptly without resolution."
  },

  // Melinda Deines @ Shikatani Lacroix Design - Explicit not interested
  {
    leadId: "422efb05-2e5b-47e5-92fc-48788254d8fe",
    contact: "Melinda Deines",
    account: "Shikatani Lacroix Design",
    action: "reject",
    reason: "Explicitly said 'No, that's not something I would be interested in' and confirmed not a priority."
  },

  // Virginia Ashley @ unitedcloud.ca - Rejected AI, asked to be left alone
  {
    leadId: "36175b3b-f196-4f8f-9c71-d377a8f0acd1",
    contact: "Virginia Ashley",
    account: "unitedcloud.ca",
    action: "reject",
    reason: "Rejected AI caller. Said 'leave me alone. Have a great day.' Explicit refusal."
  },

  // Eileen O'Brien @ davidchristensenlaw - Explicit not interested
  {
    leadId: "3ba4ea5f-3ac0-4e84-b21f-d61a094cd616",
    contact: "Eileen O'Brien",
    account: "davidchristensenlaw",
    action: "reject",
    reason: "Explicitly said 'Not at all. Really not on our radar at all.' Law firm — wrong target audience entirely."
  },

  // Eric Klein @ Mammoth - No meaningful conversation, confused about company name
  {
    leadId: "35d0d90c-5b2e-4310-ba17-da60f4dcef4a",
    contact: "Eric Klein",
    account: "mammoth",
    action: "reject",
    reason: "No meaningful conversation. Contact confused about company name. No engagement with pitch."
  },

  // Liam Doyle @ Google - Rejected AI ('What do you want, robot?')
  {
    leadId: "e0267adf-35e6-492b-a3cf-f72bb1a7b34e",
    contact: "Liam Doyle",
    account: "Google",
    action: "reject",
    reason: "Rejected AI caller — asked 'What do you want, robot?' No engagement with pitch."
  },

  // Bruno Evangelista @ Schneider Electric - No meaningful conversation
  {
    leadId: "31f12e69-de69-4da7-8677-359bf4d1bba6",
    contact: "Bruno Evangelista",
    account: "Schneider Electric",
    action: "reject",
    reason: "No meaningful conversation. Asked 'Who is this, sorry?' and call ended without response to pitch."
  },

  // Alon Tirosh @ Sogeti - Rejected AI, asked for email but AI rejection
  {
    leadId: "6ffcb6c9-e936-45a0-859b-c56b3d932616",
    contact: "Alon Tirosh",
    account: "sogeti",
    action: "reject",
    reason: "Rejected AI caller — directly asked 'Are you an AI agent?' Initial request for email, but AI rejection overrides."
  },

  // Jordan Paluch @ Pathstream - No meaningful conversation
  {
    leadId: "139bb7d6-ee17-4ab9-9c81-9b255b4f167c",
    contact: "Jordan Paluch",
    account: "Pathstream",
    action: "reject",
    reason: "No meaningful conversation. Contact asked who/what, agent started pitch but call ended without engagement."
  },

  // Rochelle Paulet @ Quadkor - Rejected AI
  {
    leadId: "7719a609-b4d4-4782-879e-1698eefe941c",
    contact: "Rochelle Paulet",
    account: "quadkor",
    action: "reject",
    reason: "Rejected AI caller — said 'This sounds like an AI call.' No engagement with pitch."
  },

  // Daniel Ashton @ Brainspin - Not interested, asked 'What is this about?' 3x
  {
    leadId: "5a6b3788-1ddf-4bab-b055-e18c93e6e6e8",
    contact: "Daniel Ashton",
    account: "brainspin",
    action: "reject",
    reason: "Not interested. Asked 'What is this about?' three times without engaging. Agent ended call."
  },

  // Bob Consonery @ Fortune Hi-Tech - Wrong number, asked to remove from list
  {
    leadId: "fad16dbd-e180-4996-acb2-2421439e937c",
    contact: "Bob Consonery",
    account: "Fortune Hi-Tech Marketing",
    action: "reject",
    reason: "Wrong number — reached Andrew Emerson at USIC. Asked to remove number from call list."
  },

  // Tiffany Hill @ ecomeng - Explicit rejection
  {
    leadId: "6913ec15-2640-421c-8f01-cabf4e49c58b",
    contact: "Tiffany Hill",
    account: "ecomeng",
    action: "reject",
    reason: "Explicitly said 'No' to conversation. Business model is repeat/architect work — wrong audience."
  },

  // Jim Snyder @ Qualitymatters - No meaningful conversation
  {
    leadId: "8aaa3314-1a2a-4a81-895f-6d229315291c",
    contact: "Jim Snyder",
    account: "qualitymatters",
    action: "reject",
    reason: "No meaningful conversation. Non-English response, only said 'Okay'. No engagement."
  },

  // Jackman Karafa @ alphadigital - Wrong person, no longer works there
  {
    leadId: "19123e85-f073-4ffc-b18b-863b688af4d8",
    contact: "Jackman Karafa",
    account: "alphadigital.com.au",
    action: "reject",
    reason: "Wrong person — no longer works there. Replacement person gave non-committal response."
  },

  // Darwin Datu @ Cloudstaff - Wrong person, reached dental hygienist
  {
    leadId: "2897ca78-855e-4375-9a17-04903d6e5cc1",
    contact: "Darwin Datu",
    account: "cloudstaff",
    action: "reject",
    reason: "Wrong person entirely — reached Shay, a dental hygienist. Never connected with Darwin Datu."
  },

  // Marc Fitten @ Oracle - No meaningful conversation (4 turns)
  {
    leadId: "82e11dff-6235-4e10-8745-4a8c27ca0a43",
    contact: "Marc Fitten",
    account: "Oracle",
    action: "reject",
    reason: "No meaningful conversation. Only 4 turns, contact said 'brake' (likely 'great'). No response to pitch."
  },

  // Martin Pettersson @ Protegrity - Not interested, language barrier
  {
    leadId: "93e949e8-9644-4fb5-910b-420607dd3c38",
    contact: "Martin Pettersson",
    account: "Protegrity",
    action: "reject",
    reason: "Not interested. Severe language/communication barrier. Asked to cut the call. 25 turns but no substantive engagement."
  },

  // Jerry Straub @ Tarbell Management Group - No meaningful conversation (under_review)
  {
    leadId: "abcf1b1a-e3e1-4997-a6bd-ff3d0d232222",
    contact: "Jerry Straub",
    account: "Tarbell Management Group LLC",
    action: "reject",
    reason: "No meaningful conversation. Brief responses, non-English, call ended abruptly. AI Score: 0. No engagement with pitch."
  },

  // Shezmeen Hudani @ Brave - Polite but not interested (under_review)
  {
    leadId: "60bb63f7-3b23-4e4f-a4ad-ee88378cd029",
    contact: "Shezmeen Hudani",
    account: "Brave",
    action: "reject",
    reason: "Not interested — said 'we're doing okay, we have a wholesale team.' Only asked for email 'in case' which is low-intent. AI Score: 0."
  },

  // Mariya R Denkova @ Progress/Ipswitch - Callback requested but for December, currently not interested
  // Already approved but transcript shows low interest
  {
    leadId: "7ce1e098-9562-4ba6-b8cd-4b631be3eb82",
    contact: "Mariya R Denkova",
    account: "Ipswitch IMail Server",
    action: "reject",
    reason: "Said 'not right now' and 'Maybe in December.' Very low current interest. AI score 45, below min_score of 70. Audio issues during call. Not a qualified lead for current pipeline."
  },

  // Jason Iseman @ ChowNow - Never reached target contact, severe audio issues
  {
    leadId: "1ac2753f-83a5-40a2-a690-c2a99af338a6",
    contact: "Jason Iseman",
    account: "chownow",
    action: "reject",
    reason: "Never reached Jason Iseman. Severe connection/audio issues. Person on phone said 'he wasn't here, call back in 45 mins.' No substantive conversation. AI score 51, below min_score."
  },
];

async function executeDecisions() {
  console.log("=== EXECUTING ARGYLE LEAD PIPELINE DECISIONS ===\n");

  const approved = decisions.filter(d => d.action === 'approve');
  const rejected = decisions.filter(d => d.action === 'reject');

  console.log(`APPROVE: ${approved.length} leads`);
  console.log(`REJECT:  ${rejected.length} leads`);
  console.log(`TOTAL:   ${decisions.length} leads\n`);

  // Process APPROVALS — move to 'published' and submit to client
  console.log("--- APPROVING LEADS ---");
  for (const d of approved) {
    console.log(`  Approving: ${d.contact} @ ${d.account}`);
    console.log(`    Reason: ${d.reason}`);

    await db.execute(sql`
      UPDATE leads SET
        qa_status = 'published',
        verification_status = 'verified_approved',
        submitted_to_client = true,
        submitted_at = NOW(),
        approved_at = COALESCE(approved_at, NOW()),
        published_at = COALESCE(published_at, NOW()),
        pm_approved_at = COALESCE(pm_approved_at, NOW()),
        qa_decision = ${`QA Review (manual): APPROVED — ${d.reason}`},
        updated_at = NOW()
      WHERE id = ${d.leadId}
    `);
    console.log(`    => Status set to 'published', submitted_to_client = true\n`);
  }

  // Process REJECTIONS
  console.log("--- REJECTING LEADS ---");
  for (const d of rejected) {
    console.log(`  Rejecting: ${d.contact} @ ${d.account}`);
    console.log(`    Reason: ${d.reason}`);

    await db.execute(sql`
      UPDATE leads SET
        qa_status = 'rejected',
        rejected_reason = ${d.reason},
        rejected_at = NOW(),
        qa_decision = ${`QA Review (manual): REJECTED — ${d.reason}`},
        updated_at = NOW()
      WHERE id = ${d.leadId}
    `);
    console.log(`    => Status set to 'rejected'\n`);
  }

  // Also submit the 8 already-published AppointmentGen leads that were never submitted to client
  console.log("\n--- SUBMITTING ALREADY-PUBLISHED LEADS TO CLIENT ---");
  const publishedNotSubmitted = await db.execute(sql`
    UPDATE leads SET
      submitted_to_client = true,
      submitted_at = NOW(),
      updated_at = NOW()
    WHERE campaign_id = '6d6d125c-53fb-4015-9046-4ed06b13ef4b'
      AND qa_status = 'published'
      AND (submitted_to_client IS NULL OR submitted_to_client = false)
      AND deleted_at IS NULL
    RETURNING id, contact_name, account_name
  `);

  for (const l of publishedNotSubmitted.rows) {
    console.log(`  Submitted to client: ${l.contact_name} @ ${l.account_name} (${l.id})`);
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Approved & published: ${approved.length}`);
  console.log(`Rejected: ${rejected.length}`);
  console.log(`Already-published submitted to client: ${publishedNotSubmitted.rows.length}`);

  await pool.end();
}

executeDecisions().catch((err) => {
  console.error("Error:", err);
  pool.end();
  process.exit(1);
});
