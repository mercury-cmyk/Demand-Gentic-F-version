import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock,
  Filter,
  Forward,
  Inbox,
  Link as LinkIcon,
  MoreHorizontal,
  Reply,
  Search,
  Send,
  Sparkles,
  Star,
  User,
  Smile,
  Meh,
  Frown,
} from "lucide-react";

type Sentiment = "positive" | "neutral" | "negative";

const SENTIMENT_META: Record<
  Sentiment,
  { label: string; icon: React.ComponentType<{ className?: string; size?: number }>; className: string }
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

const STAGGER_CLASSES = [
  "stagger-1",
  "stagger-2",
  "stagger-3",
  "stagger-4",
  "stagger-5",
  "stagger-6",
];

const MOCK_THREADS = [
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

const UnifiedInbox = () => {
  const [selectedId, setSelectedId] = useState(MOCK_THREADS[0]?.id ?? "");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredThreads = useMemo(() => {
    if (!searchTerm) return MOCK_THREADS;
    const query = searchTerm.toLowerCase();
    return MOCK_THREADS.filter((thread) =>
      [thread.sender, thread.subject, thread.snippet, thread.opportunity]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [searchTerm]);

  const selectedThread =
    filteredThreads.find((thread) => thread.id === selectedId) ?? filteredThreads[0] ?? null;
  const resolvedSelectedId = selectedThread?.id;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-10 h-64 w-64 rounded-full bg-cyan-200/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen flex-col lg:flex-row">
        {/* Sidebar - Folders */}
        <div className="w-full border-b border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur lg:w-72 lg:border-b-0 lg:border-r">
          <button className="w-full rounded-2xl bg-gradient-to-r from-cyan-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-105">
            <span className="flex items-center justify-center gap-2">
              <Send size={16} />
              Compose
            </span>
          </button>

          <div className="mt-6 space-y-2">
            <NavItem icon={<Inbox size={18} />} label="Inbox" count={12} active />
            <NavItem icon={<Star size={18} />} label="Starred" />
            <NavItem icon={<Send size={18} />} label="Sent" />
            <NavItem icon={<Archive size={18} />} label="Archived" />
          </div>

          <div className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Smart Views
          </div>
          <div className="mt-3 space-y-2">
            <NavItem icon={<LinkIcon size={18} />} label="Linked Deals" count={5} />
            <NavItem icon={<AlertCircle size={18} />} label="Needs Attention" count={2} />
            <NavItem icon={<User size={18} />} label="High Intent" />
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={16} />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">Mailbox Connected</div>
                <div>zahid.m@pivotal-b2b.com</div>
              </div>
            </div>
          </div>
        </div>

        {/* Thread List */}
        <div className="w-full border-b border-slate-200/70 bg-white lg:w-96 lg:border-b-0 lg:border-r">
          <div className="space-y-4 border-b border-slate-200/60 p-5">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={16} className="text-slate-400" />
              <input
                type="search"
                placeholder="Search conversations..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <button className="rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-slate-600">
                <Filter size={14} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <button className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-cyan-700">
                All
              </button>
              <button className="rounded-full border border-transparent px-3 py-1 text-slate-500 transition hover:border-slate-200 hover:bg-slate-50">
                Unread
              </button>
              <button className="rounded-full border border-transparent px-3 py-1 text-slate-500 transition hover:border-slate-200 hover:bg-slate-50">
                Opportunities
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-210px)] overflow-y-auto">
            {filteredThreads.map((thread, index) => {
              const sentiment = SENTIMENT_META[thread.sentiment];
              const SentimentIcon = sentiment.icon;
              const isSelected = resolvedSelectedId === thread.id;
              return (
                <button
                  key={thread.id}
                  onClick={() => setSelectedId(thread.id)}
                  className={`flex w-full flex-col gap-2 border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50 ${
                    isSelected ? "bg-cyan-50/60 shadow-sm" : ""
                  } animate-fade-in ${STAGGER_CLASSES[index % STAGGER_CLASSES.length]}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-sm font-semibold text-slate-900">{thread.sender}</div>
                    <span className="text-[11px] text-slate-400">{thread.time}</span>
                  </div>
                  <div className="text-sm font-medium text-slate-700">{thread.subject}</div>
                  <div className="text-xs text-slate-500 line-clamp-2">{thread.snippet}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-full border border-cyan-100 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
                      <LinkIcon size={10} />
                      {thread.opportunity}
                    </div>
                    <div className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sentiment.className}`}>
                      <SentimentIcon size={11} />
                      {sentiment.label}
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {thread.stage}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Reading Pane */}
        <div className="flex-1 bg-gradient-to-br from-white via-slate-50 to-cyan-50/40">
          {selectedThread ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur">
                <div className="flex items-center gap-3">
                  <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                    <Reply size={18} />
                  </button>
                  <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                    <Forward size={18} />
                  </button>
                  <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                    <Archive size={18} />
                  </button>
                  <div className="h-5 w-px bg-slate-200" />
                  <button className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                    <LinkIcon size={14} />
                    Link to Opportunity
                  </button>
                </div>
                <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                  <MoreHorizontal size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-10 pt-6">
                <div className="rounded-3xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-cyan-700">
                    <Sparkles size={18} className="animate-pulse-soft" />
                    AI Conversation Summary
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700">
                    Mark is evaluating the pilot scope and comparing vendors. He is positive about the
                    transparency and wants a discovery call this week.
                    <span className="font-semibold text-slate-900"> Action:</span> Share the updated
                    timeline and confirm Wednesday availability.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      Next step: Discovery call
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                      Confidence: 84%
                    </span>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-100 text-lg font-semibold text-cyan-700">
                      {selectedThread.avatar}
                    </div>
                    <div>
                      <div className="text-xl font-semibold text-slate-900">{selectedThread.sender}</div>
                      <div className="text-sm text-slate-500">
                        To: Zahid Mohammadi &lt;zahid.m@pivotal-b2b.com&gt;
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm text-slate-500">
                    <div className="font-semibold text-slate-900">{selectedThread.time}</div>
                    <div>Oct 26, 2023</div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2 py-1 text-cyan-700">
                    Opportunity: {selectedThread.opportunity}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-500">
                    Stage: {selectedThread.stage}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-500">
                    Health: On track
                  </span>
                </div>

                <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="space-y-4 text-sm leading-relaxed text-slate-700">
                    <p>Hi Zahid,</p>
                    <p>
                      Thanks for the proposal. We are reviewing the pilot scope internally and
                      comparing it with another vendor. The transparency in your plan is a strong
                      signal for us.
                    </p>
                    <p>
                      If possible, we would like to schedule a short discovery call this week so we
                      can align on timelines, deliverables, and the success metrics you mentioned.
                    </p>
                    <ul className="list-disc pl-5">
                      <li>Confirm pilot objectives and stakeholders</li>
                      <li>Review data requirements and integration steps</li>
                      <li>Align on launch timing and milestones</li>
                    </ul>
                    <p>
                      Best regards,
                      <br />
                      <strong>Mark Johnson</strong>
                    </p>
                  </div>
                </div>

                <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-4 shadow-md transition focus-within:ring-2 focus-within:ring-cyan-300/50">
                  <textarea
                    placeholder="Quick reply to keep the deal moving..."
                    className="h-24 w-full resize-none border-none text-sm outline-none placeholder:text-slate-400"
                  />
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2 text-slate-400">
                      <button className="rounded-lg p-2 transition hover:bg-slate-50 hover:text-slate-600">
                        <Clock size={16} />
                      </button>
                      <button className="rounded-lg p-2 transition hover:bg-slate-50 hover:text-slate-600">
                        <LinkIcon size={16} />
                      </button>
                    </div>
                    <button className="rounded-full bg-gradient-to-r from-cyan-600 to-emerald-500 px-5 py-2 text-xs font-semibold text-white shadow transition hover:brightness-105">
                      Send Reply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              <div className="text-center">
                <Inbox size={44} className="mx-auto mb-4 opacity-30" />
                <div className="text-sm">Select a conversation to read</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const NavItem = ({
  icon,
  label,
  count,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
}) => (
  <div
    className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
      active
        ? "bg-cyan-50 text-cyan-700 shadow-sm"
        : "text-slate-600 hover:bg-slate-100"
    }`}
  >
    <div className="flex items-center gap-3">
      {icon}
      <span>{label}</span>
    </div>
    {count ? (
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          active ? "bg-cyan-200 text-cyan-800" : "bg-slate-200 text-slate-600"
        }`}
      >
        {count}
      </span>
    ) : null}
  </div>
);

export default UnifiedInbox;
