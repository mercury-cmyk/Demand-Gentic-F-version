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

import { MOCK_THREADS, SENTIMENT_META, Sentiment } from "@/data/inbox";
import NavItem from "./NavItem";
import Sidebar from "./Sidebar";
import ThreadList from "./ThreadList";
import ReadingPane from "./ReadingPane";

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
        <Sidebar />
        <ThreadList
          threads={filteredThreads}
          selectedThreadId={resolvedSelectedId}
          onThreadSelect={setSelectedId}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
        />
        <ReadingPane thread={selectedThread} />
      </div>
    </div>
  );
};


export default UnifiedInbox;
