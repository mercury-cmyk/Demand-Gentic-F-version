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
  
    
      
        
         onSearchTermChange(event.target.value)}
        />
        
          
        
      

      
        
          All
        
        
          Unread
        
        
          Opportunities
        
      
    

    
      {threads.map((thread, index) => {
        const sentiment = SENTIMENT_META[thread.sentiment];
        const SentimentIcon = sentiment.icon;
        const isSelected = selectedThreadId === thread.id;
        return (
           onThreadSelect(thread.id)}
            className={`flex w-full flex-col gap-2 border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50 ${
              isSelected ? "bg-cyan-50/60 shadow-sm" : ""
            } animate-fade-in ${STAGGER_CLASSES[index % STAGGER_CLASSES.length]}`}
          >
            
              {thread.sender}
              {thread.time}
            
            {thread.subject}
            {thread.snippet}
            
              
                
                {thread.opportunity}
              
              
                
                {sentiment.label}
              
              
                {thread.stage}
              
            
          
        );
      })}
    
  
);

export default ThreadList;