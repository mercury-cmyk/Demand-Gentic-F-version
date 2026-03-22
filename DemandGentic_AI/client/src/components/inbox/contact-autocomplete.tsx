import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContactSuggestion {
  id: number;
  name: string;
  email: string;
  company?: string;
}

interface ContactAutocompleteProps {
  value: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function ContactAutocomplete({ value, onChange, placeholder = "Add recipients...", className }: ContactAutocompleteProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef>();

  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(inputValue.trim());
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [inputValue]);

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["/api/inbox/contacts/autocomplete", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length  ({
        id: c.id,
        name: c.fullName || c.name || c.email,
        email: c.email,
        company: c.jobTitle || c.company || '',
      }));
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const filteredSuggestions = (suggestions ?? []).filter(
    (s) => !value.includes(s.email)
  );

  const addEmail = useCallback((email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputValue("");
    setIsOpen(false);
    setHighlightIndex(0);
  }, [value, onChange]);

  const removeEmail = useCallback((email: string) => {
    onChange(value.filter((e) => e !== email));
  }, [value, onChange]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      e.preventDefault();
      if (isOpen && filteredSuggestions.length > 0 && highlightIndex  0) {
      removeEmail(value[value.length - 1]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (filteredSuggestions.length > 0 && debouncedQuery.length >= 2) {
      setIsOpen(true);
      setHighlightIndex(0);
    } else {
      setIsOpen(false);
    }
  }, [filteredSuggestions.length, debouncedQuery]);

  return (
    
       inputRef.current?.focus()}
      >
        {value.map((email) => (
          
            {email}
             { e.stopPropagation(); removeEmail(email); }}
              className="ml-0.5 hover:bg-muted rounded-sm"
              aria-label={`Remove ${email}`}
            >
              
            
          
        ))}
         setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (filteredSuggestions.length > 0) setIsOpen(true); }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] border-0 shadow-none focus-visible:ring-0 h-7 px-1 text-sm"
        />
        {isLoading && }
      

      {isOpen && filteredSuggestions.length > 0 && (
        
          {filteredSuggestions.map((s, i) => (
             setHighlightIndex(i)}
              onClick={() => addEmail(s.email)}
            >
              {s.name}
              
                {s.email}{s.company ? ` · ${s.company}` : ""}
              
            
          ))}
        
      )}
    
  );
}