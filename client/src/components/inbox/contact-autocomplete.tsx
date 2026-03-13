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
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(inputValue.trim());
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [inputValue]);

  const { data: suggestions, isLoading } = useQuery<ContactSuggestion[]>({
    queryKey: ["/api/inbox/contacts/autocomplete", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const res = await apiRequest("GET", `/api/inbox/contacts/autocomplete?q=${encodeURIComponent(debouncedQuery)}`);
      const data = await res.json();
      const contacts = data.contacts ?? data ?? [];
      return contacts.map((c: any) => ({
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
      if (isOpen && filteredSuggestions.length > 0 && highlightIndex < filteredSuggestions.length) {
        addEmail(filteredSuggestions[highlightIndex].email);
      } else if (inputValue.trim()) {
        addEmail(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
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
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className="flex flex-wrap items-center gap-1 min-h-[36px] rounded-md border bg-background px-2 py-1 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((email) => (
          <Badge key={email} variant="secondary" className="text-xs h-6 gap-1 pl-2 pr-1">
            {email}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeEmail(email); }}
              className="ml-0.5 hover:bg-muted rounded-sm"
              aria-label={`Remove ${email}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (filteredSuggestions.length > 0) setIsOpen(true); }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] border-0 shadow-none focus-visible:ring-0 h-7 px-1 text-sm"
        />
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mr-1" />}
      </div>

      {isOpen && filteredSuggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {filteredSuggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={cn(
                "flex flex-col w-full px-3 py-2 text-left text-sm hover:bg-muted/70 transition-colors",
                i === highlightIndex && "bg-muted/70"
              )}
              onMouseEnter={() => setHighlightIndex(i)}
              onClick={() => addEmail(s.email)}
            >
              <span className="font-medium truncate">{s.name}</span>
              <span className="text-xs text-muted-foreground truncate">
                {s.email}{s.company ? ` · ${s.company}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
