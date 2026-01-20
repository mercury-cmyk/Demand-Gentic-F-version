import Telnyx from "telnyx";

const telnyx = new Telnyx(process.env.TELNYX_API_KEY);

async function checkCall() {
  const callControlId = "v3:xmENISgwQaY8PKZxhoh1HScUnBDbpb3WfwP-EAHyiTKdqO1YM79neA";
  
  try {
    const call = await telnyx.calls.retrieve(callControlId);
    console.log("Call status:", JSON.stringify(call, null, 2));
  } catch (e: any) {
    console.log("Error:", e.message);
    
    // List recent calls instead
    console.log("\nChecking recent call events...");
    try {
      const events = await telnyx.callEvents.list({ filter: { call_control_id: callControlId } });
      console.log("Events:", JSON.stringify(events, null, 2));
    } catch (e2: any) {
      console.log("Events error:", e2.message);
    }
  }
}

checkCall().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
