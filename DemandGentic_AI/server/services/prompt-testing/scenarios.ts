import { Scenario } from "./types";

export const SCENARIOS: Scenario[] = [
  {
    id: "marketing-cold-call-skeptic",
    name: "Cold Call - Marketing Services (Skeptic)",
    description: "Selling digital marketing services to a heavy equipment distributor who relies on word-of-mouth.",
    prospectPersona: "John, Operations Manager at 'Heavy Duty Pros'. He is 55, pragmatic, busy, and hates 'fluff'. He believes good work speaks for itself and has been burned by SEO agencies before. Direct communicator.",
    objectionSequence: [
      "I'm in the middle of a dispatch, make it quick.",
      "Look, we don't need fancy internet stuff. We've got more work than we can handle just from word of mouth.",
      "I've hired three different agencies in the last five years and they all took my money and did nothing.",
      "How much is this going to cost me?",
      "Send me an email, I've got to go."
    ],
    goal: "Book a 15-minute discovery zoom call."
  },
  {
    id: "real-estate-inbound-lead",
    name: "Inbound Lead Qualification - Residential Real Estate",
    description: "Qualifying a lead who submitted a form on a 'Home Value' calculator.",
    prospectPersona: "Sarah, a potential home seller. She filled out a form to see what her house is worth out of curiosity but isn't sure she wants to sell yet. She is hesitant to commit to a meeting.",
    objectionSequence: [
      "I was just looking at the number, I'm not really looking to sell right now.",
      "We might renovate the kitchen first before we think about moving.",
      "I don't want a realtor coming over and pressuring me.",
      "What's your commission rate?",
      "Can't you just tell me the value over the phone?"
    ],
    goal: "Schedule an on-site valuation appointment."
  },
  {
    id: "saas-customer-support-renewal",
    name: "SaaS Renewal Discussion - At Risk",
    description: "Calling a customer whose usage has dropped 40% prior to renewal.",
    prospectPersona: "Mike, IT Director. His team stopped using the platform because they found it too complex. He is considering cancelling the contract next month.",
    objectionSequence: [
      "Yeah, we're probably not going to renew. The team just doesn't use it.",
      "It's too complicated. Nobody has time to learn it.",
      "We're looking at a cheaper alternative.",
      "I don't have time for a training session right now.",
      "Just send me the cancellation paperwork."
    ],
    goal: "Book a 'Success Review' meeting with a Product Specialist to save the account."
  },
  {
    id: "early-voicemail-detection",
    name: "Early Voicemail Detection (First 3 Seconds)",
    description: "Validate that voicemail cues are detected immediately and the conversational script is aborted.",
    prospectPersona: "Automated voicemail system. No live person is present.",
    objectionSequence: [
      "Hi, you've reached Ann Moore. I'm not available right now, please leave a message after the beep.",
      "At the tone, record your message.",
      "BEEP"
    ],
    goal: "Detect voicemail within 3 seconds and terminate without pitching."
  }
];