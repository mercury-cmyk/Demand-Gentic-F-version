import { Smile, Meh, Frown } from "lucide-react";
import React from "react";

export type Sentiment = "positive" | "neutral" | "negative";

export const SENTIMENT_META: Record; className: string }
> = {
  positive: {
    label: "Positive",
    icon: Smile,
    className: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  neutral: {
    label: "Neutral",
    icon: Meh,
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
  negative: {
    label: "Needs Care",
    icon: Frown,
    className: "bg-amber-50 text-amber-700 border-amber-100",
  },
};

export const MOCK_THREADS = [
  {
    id: "1",
    sender: "Mark Johnson",
    subject: "Proposal request - Energy ChangeMakers",
    snippet:
      "Thanks Zahid, we are reviewing the scope and want to align on next steps for the pilot.",
    time: "10:24 AM",
    unread: true,
    opportunity: "Energy ChangeMakers Pilot",
    sentiment: "positive" as Sentiment,
    avatar: "MJ",
    stage: "Discovery",
  },
  {
    id: "2",
    sender: "Sarah Chen",
    subject: "Technical specs for Q3 rollout",
    snippet:
      "Attached the updated integration notes and testing checklist for the API rollout.",
    time: "Yesterday",
    unread: false,
    opportunity: "Global Tech Solutions",
    sentiment: "neutral" as Sentiment,
    avatar: "SC",
    stage: "Evaluation",
  },
  {
    id: "3",
    sender: "Robert Fox",
    subject: "Contract signature pending",
    snippet:
      "Legal is reviewing the last clause. They want confirmation on the renewal term.",
    time: "Oct 24",
    unread: false,
    opportunity: "Fox Industries Expansion",
    sentiment: "negative" as Sentiment,
    avatar: "RF",
    stage: "Negotiation",
  },
];