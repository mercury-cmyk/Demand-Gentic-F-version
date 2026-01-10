import React from "react";
import { Filter, Link as LinkIcon, Search } from "lucide-react";
import { SENTIMENT_META } from "@/data/inbox";

const STAGGER_CLASSES = [
  "stagger-1",
  "stagger-2",
  "stagger-3",
  "stagger-4",
  "stagger-5",
  "stagger-6",
];

export const ThreadList = ({
  threads,
  onThreadSelect,
  selectedThreadId,
  searchTerm,
  onSearchTermChange,
}) => (
  <div className="w-full border-b border-slate-200/70 bg-white lg:w-96 lg:border-b-0 lg:border-r">
    <div className="space-y-4 border-b border-slate-200/60 p-5">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <Search size={16} className="text-slate-400" />
        <input
          type="search"
          placeholder="Search conversations..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
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
      {threads.map((thread, index) => {
        const sentiment = SENTIMENT_META[thread.sentiment];
        const SentimentIcon = sentiment.icon;
        const isSelected = selectedThreadId === thread.id;
        return (
          <button
            key={thread.id}
            onClick={() => onThreadSelect(thread.id)}
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
);

export default ThreadList;
