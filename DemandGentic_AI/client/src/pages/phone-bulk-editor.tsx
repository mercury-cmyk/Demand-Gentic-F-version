import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, Edit, CheckSquare, Square, Phone, Building2, Users, AlertCircle, Filter, ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface PhoneRecord {
  id: string;
  type: 'contact' | 'account';
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  tel: string | null;
  company: string;
  accountId: string;
  title?: string;
  department?: string;
  city?: string;
  state?: string;
  country?: string;
  seniorityLevel?: string;
  jobFunction?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  revenue?: string;
  hqCity?: string;
  hqState?: string;
  hqCountry?: string;
  hqAddress?: string;
}

export default function PhoneBulkEditor() {
  const { toast } = useToast();
  const [searchType, setSearchType] = useState('both');
  const [phonePattern, setPhonePattern] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedIds, setSelectedIds] = useState>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [findValue, setFindValue] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [previewUpdates, setPreviewUpdates] = useState>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedList, setSelectedList] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState('');
  
  // Fetch lists for filtering
  const { data: lists = [] } = useQuery({
    queryKey: ['/api/segments'],
  });
  
  // Fetch filter options
  const { data: filterOptions } = useQuery({
    queryKey: ['/api/filter-options'],
  });

  const handleSearch = async () => {
    if (!phonePattern.trim()) {
      toast({
        title: "Search pattern required",
        description: "Please enter a phone pattern to search for",
        variant: "destructive"
      });
      return;
    }

    setIsSearching(true);
    try {
      // Build separate filters for contacts and accounts
      const contactConditions: any[] = [];
      const accountConditions: any[] = [];
      
      // Location filters
      if (selectedCountry) {
        if (searchType !== 'accounts') {
          contactConditions.push({
            field: 'contact.country',
            operator: 'equals',
            value: selectedCountry
          });
        }
        if (searchType !== 'contacts') {
          accountConditions.push({
            field: 'account.hqCountry',
            operator: 'equals',
            value: selectedCountry
          });
        }
      }
      
      if (selectedState) {
        if (searchType !== 'accounts') {
          contactConditions.push({
            field: 'contact.state',
            operator: 'equals',
            value: selectedState
          });
        }
        if (searchType !== 'contacts') {
          accountConditions.push({
            field: 'account.hqState',
            operator: 'equals',
            value: selectedState
          });
        }
      }
      
      if (selectedCity) {
        if (searchType !== 'accounts') {
          contactConditions.push({
            field: 'contact.city',
            operator: 'equals',
            value: selectedCity
          });
        }
        if (searchType !== 'contacts') {
          accountConditions.push({
            field: 'account.hqCity',
            operator: 'equals',
            value: selectedCity
          });
        }
      }
      
      // Department (contacts only)
      if (selectedDepartment && searchType !== 'accounts') {
        contactConditions.push({
          field: 'contact.department',
          operator: 'equals',
          value: selectedDepartment
        });
      }
      
      // Industry (accounts only)
      if (selectedIndustry && searchType !== 'contacts') {
        accountConditions.push({
          field: 'account.industry',
          operator: 'equals',
          value: selectedIndustry
        });
      }

      const response = await apiRequest({
        method: 'POST',
        url: '/api/phone-bulk/search',
        data: {
          searchType,
          phonePattern: phonePattern.trim(),
          contactFilters: contactConditions.length > 0 ? contactConditions : null,
          accountFilters: accountConditions.length > 0 ? accountConditions : null,
          listId: selectedList || null
        }
      });

      setSearchResults(response.results || []);
      setSelectedIds(new Set());
      
      toast({
        title: "Search complete",
        description: `Found ${response.total} record(s) matching "${phonePattern}"`,
      });
    } catch (error: any) {
      toast({
        title: "Search failed",
        description: error.message || "Failed to search phone numbers",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === searchResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(searchResults.map(r => r.id)));
    }
  };

  const generatePreview = () => {
    if (!findValue.trim()) {
      toast({
        title: "Find value required",
        description: "Please enter a value to find",
        variant: "destructive"
      });
      return;
    }

    if (selectedIds.size === 0) {
      toast({
        title: "No records selected",
        description: "Please select at least one record to update",
        variant: "destructive"
      });
      return;
    }

    const selectedRecords = searchResults.filter(r => selectedIds.has(r.id));
    const preview: Array = [];

    for (const record of selectedRecords) {
      const updates: any = {};
      
      if (record.type === 'contact') {
        // Check each phone field - use replaceAll for simple string replacement (handles special chars like +, (, ), etc.)
        if (record.phone && record.phone.includes(findValue)) {
          updates.phone = record.phone.replaceAll(findValue, replaceValue);
        }
        if (record.mobile && record.mobile.includes(findValue)) {
          updates.mobile = record.mobile.replaceAll(findValue, replaceValue);
        }
        if (record.tel && record.tel.includes(findValue)) {
          updates.tel = record.tel.replaceAll(findValue, replaceValue);
        }
      } else if (record.type === 'account') {
        if (record.phone && record.phone.includes(findValue)) {
          updates.phone = record.phone.replaceAll(findValue, replaceValue);
        }
      }

      if (Object.keys(updates).length > 0) {
        preview.push({ record, updates });
      }
    }

    if (preview.length === 0) {
      toast({
        title: "No matches found",
        description: `None of the selected records contain "${findValue}"`,
        variant: "destructive"
      });
      return;
    }

    setPreviewUpdates(preview);
    setShowUpdateDialog(true);
  };

  const applyUpdates = async () => {
    setIsUpdating(true);
    try {
      const updates = previewUpdates.map(({ record, updates }) => ({
        id: record.id,
        type: record.type,
        fieldUpdates: updates
      }));

      const response = await apiRequest({
        method: 'POST',
        url: '/api/phone-bulk/update',
        data: { updates }
      });

      toast({
        title: "Update successful",
        description: `Updated ${response.totalUpdated} record(s): ${response.contactsUpdated} contacts, ${response.accountsUpdated} accounts`,
      });

      setShowUpdateDialog(false);
      setPreviewUpdates([]);
      setSelectedIds(new Set());
      
      // Re-run search to show updated data
      if (phonePattern) {
        handleSearch();
      }
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update phone numbers",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const allSelected = searchResults.length > 0 && selectedIds.size === searchResults.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size 
      
        
          Phone Bulk Editor
          
            Search and mass-update phone numbers across contacts and accounts
          
        
      

      {/* Search Section */}
      
        
          
            
            Search Phone Numbers
          
          
            Find contacts and accounts by phone pattern (e.g., "440", "+44", "1908")
          
        
        
          
            
              Search In
               setSearchType(v)}>
                
                  
                
                
                  Both Contacts & Accounts
                  Contacts Only
                  Accounts Only
                
              
            
            
              Phone Pattern
              
                 setPhonePattern(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                
                  {isSearching ? "Searching..." : "Search"}
                
              
            
          
          
          {/* Advanced Filters */}
          
            
              
                
                  
                  Advanced Filters
                
                
              
            
            
              
              
                {/* List/Segment Filter */}
                
                  List / Segment
                  
                    
                      
                    
                    
                      All lists
                      {lists.map((list: any) => (
                        
                          {list.name}
                        
                      ))}
                    
                  
                
                
                {/* Country Filter */}
                
                  Country
                  
                    
                      
                    
                    
                      All countries
                      {filterOptions?.countries?.map((country: string) => (
                        
                          {country}
                        
                      ))}
                    
                  
                
                
                {/* State Filter */}
                
                  State / Region
                  
                    
                      
                    
                    
                      All states
                      {filterOptions?.states?.map((state: string) => (
                        
                          {state}
                        
                      ))}
                    
                  
                
                
                {/* City Filter */}
                
                  City
                  
                    
                      
                    
                    
                      All cities
                      {filterOptions?.cities?.map((city: string) => (
                        
                          {city}
                        
                      ))}
                    
                  
                
                
                {/* Department Filter (Contacts Only) */}
                {searchType !== 'accounts' && (
                  
                    Department
                    
                      
                        
                      
                      
                        All departments
                        {filterOptions?.departments?.map((dept: string) => (
                          
                            {dept}
                          
                        ))}
                      
                    
                  
                )}
                
                {/* Industry Filter (Accounts Only) */}
                {searchType !== 'contacts' && (
                  
                    Industry
                    
                      
                        
                      
                      
                        All industries
                        {filterOptions?.industries?.map((industry: string) => (
                          
                            {industry}
                          
                        ))}
                      
                    
                  
                )}
              
              
              {/* Clear Filters Button */}
               {
                  setSelectedList('');
                  setSelectedCountry('');
                  setSelectedState('');
                  setSelectedCity('');
                  setSelectedDepartment('');
                  setSelectedIndustry('');
                }}
                data-testid="button-clear-filters"
              >
                Clear All Filters
              
            
          
        
      

      {/* Results Section */}
      {searchResults.length > 0 && (
        <>
          {/* Bulk Update Controls */}
          
            
              
                
                Bulk Update
              
              
                Find and replace phone patterns in selected records
              
            
            
              
                
                
                  Selected {selectedIds.size} of {searchResults.length} record(s)
                
              
              
                
                  Find
                   setFindValue(e.target.value)}
                  />
                
                
                  Replace With
                   setReplaceValue(e.target.value)}
                  />
                
                
                  Action
                  
                    Preview Updates
                  
                
              
            
          

          {/* Results Table */}
          
            
              
                
                  
                  Search Results ({searchResults.length})
                
                
                  {allSelected ? (
                    <>
                      
                      Deselect All
                    
                  ) : (
                    <>
                      
                      Select All
                    
                  )}
                
              
            
            
              
                
                  
                    
                      
                        
                          
                        
                        Type
                        Name
                        Company
                        Phone
                        Mobile
                        Tel
                        Email
                        Title
                        City
                        State
                        Country
                      
                    
                    
                      {searchResults.map((record) => (
                        
                          
                             toggleSelection(record.id)}
                              data-testid={`checkbox-select-${record.id}`}
                            />
                          
                          
                            
                              {record.type === 'contact' ? (
                                
                              ) : (
                                
                              )}
                              {record.type}
                            
                          
                          {record.name}
                          {record.company}
                          {record.phone || '-'}
                          {record.mobile || '-'}
                          {record.tel || '-'}
                          {record.email || '-'}
                          {record.title || '-'}
                          {record.city || record.hqCity || '-'}
                          {record.state || record.hqState || '-'}
                          {record.country || record.hqCountry || '-'}
                        
                      ))}
                    
                  
                
              
            
          
        
      )}

      {/* No Results Message */}
      {searchResults.length === 0 && phonePattern && !isSearching && (
        
          
            
            No Results Found
            
              No records found matching "{phonePattern}". Try a different search pattern.
            
          
        
      )}

      {/* Update Preview Dialog */}
      
        
          
            Preview Bulk Update
            
              Review the changes before applying. {previewUpdates.length} record(s) will be updated.
            
          
          
          
            {previewUpdates.map(({ record, updates }, index) => (
              
                
                  
                    
                      {record.type}
                    
                    {record.name}
                    ({record.company})
                  
                
                
                
                  {Object.entries(updates).map(([field, newValue]) => {
                    const oldValue = record[field as keyof PhoneRecord];
                    return (
                      
                        {field}:
                        {oldValue}
                        →
                        {newValue as string}
                      
                    );
                  })}
                
              
            ))}
          

          
             setShowUpdateDialog(false)}
              disabled={isUpdating}
              data-testid="button-cancel-update"
            >
              Cancel
            
            
              {isUpdating ? "Applying..." : `Apply Updates (${previewUpdates.length})`}
            
          
        
      
    
  );
}