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
    
      
        
        
      

      
        
        
        
      
    
  );
};


export default UnifiedInbox;