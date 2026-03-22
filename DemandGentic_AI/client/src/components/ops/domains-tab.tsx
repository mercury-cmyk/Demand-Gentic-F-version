import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Copy,
  Plus,
  Globe,
  Shield,
  Trash2,
  MoreVertical,
  RefreshCw,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { apiJsonRequest } from '@/lib/queryClient';

interface DomainMapping {
  id: string;
  domain: string;
  cloudRunService: string;
  environment: 'dev' | 'staging' | 'prod';
  httpStatus: number;
  sslStatus: 'ACTIVE' | 'PENDING' | 'EXPIRED';
  sslExpiry: Date;
  dnsStatus: 'PROPAGATED' | 'PENDING';
  createdAt: Date;
  lastChecked: Date;
}

type DomainEnvironment = DomainMapping['environment'];

export default function DomainsTab() {
  const [domains, setDomains] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDNSDialog, setShowDNSDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [newDomain, setNewDomain] = useState({
    domain: '',
    cloudRunService: '',
    environment: 'prod',
  });

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      const mockDomains: DomainMapping[] = [
        {
          id: '1',
          domain: 'demandgentic.com',
          cloudRunService: 'demandgentic-api',
          environment: 'prod',
          httpStatus: 200,
          sslStatus: 'ACTIVE',
          sslExpiry: new Date('2026-03-15'),
          dnsStatus: 'PROPAGATED',
          createdAt: new Date('2025-01-01'),
          lastChecked: new Date(),
        },
        {
          id: '2',
          domain: 'api.demandgentic.com',
          cloudRunService: 'demandgentic-api',
          environment: 'prod',
          httpStatus: 200,
          sslStatus: 'ACTIVE',
          sslExpiry: new Date('2026-03-15'),
          dnsStatus: 'PROPAGATED',
          createdAt: new Date('2025-01-05'),
          lastChecked: new Date(),
        },
        {
          id: '3',
          domain: 'api-staging.demandgentic.com',
          cloudRunService: 'demandgentic-api-staging',
          environment: 'staging',
          httpStatus: 200,
          sslStatus: 'ACTIVE',
          sslExpiry: new Date('2026-02-20'),
          dnsStatus: 'PROPAGATED',
          createdAt: new Date('2025-01-15'),
          lastChecked: new Date(),
        },
        {
          id: '4',
          domain: 'api-dev.demandgentic.com',
          cloudRunService: 'demandgentic-api-dev',
          environment: 'dev',
          httpStatus: 200,
          sslStatus: 'ACTIVE',
          sslExpiry: new Date('2026-04-01'),
          dnsStatus: 'PROPAGATED',
          createdAt: new Date('2025-01-20'),
          lastChecked: new Date(),
        },
      ];

      setDomains(mockDomains);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch domains:', error);
      setIsLoading(false);
    }
  };

  const handleAddDomain = async () => {
    if (!newDomain.domain || !newDomain.cloudRunService) {
      return;
    }

    try {
      await apiJsonRequest>('POST', '/api/ops/domains', newDomain);
      setSelectedDomain({
        id: Math.random().toString(),
        ...newDomain,
        httpStatus: 0,
        sslStatus: 'PENDING',
        sslExpiry: new Date(),
        dnsStatus: 'PENDING',
        createdAt: new Date(),
        lastChecked: new Date(),
      });
      setShowDNSDialog(true);
      setNewDomain({ domain: '', cloudRunService: '', environment: 'prod' });
    } catch (error) {
      console.error('Failed to add domain:', error);
    }
  };

  const handleDeleteDomain = async () => {
    if (!selectedDomain) return;

    try {
      await apiJsonRequest>('DELETE', `/api/ops/domains/${selectedDomain.domain}`);
      await fetchDomains();
      setShowDeleteDialog(false);
      setSelectedDomain(null);
    } catch (error) {
      console.error('Failed to delete domain:', error);
    }
  };

  const handleRenewSSL = async (domain: DomainMapping) => {
    try {
      await apiJsonRequest>('POST', `/api/ops/domains/${domain.domain}/ssl/renew`, {});
      await fetchDomains();
    } catch (error) {
      console.error('Failed to renew SSL:', error);
    }
  };

  const getSSLColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-500/20 text-green-400';
      case 'PENDING':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'EXPIRED':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getDNSRecords = (domain: string, service: string) => {
    return [
      {
        name: domain,
        type: 'CNAME',
        value: `${service}.run.app`,
        instruction: `Add CNAME record pointing to ${service}.run.app`,
      },
      {
        name: `_acme-challenge.${domain}`,
        type: 'TXT',
        value: 'v=acme-validation-token',
        instruction: 'SSL certificate validation record',
      },
    ];
  };

  return (
    
      {/* Add Domain Dialog */}
      
        
          
            
              
                
                  Add New Domain
                  
                    Map a custom domain to your Cloud Run service
                  
                
                
              
            
          
        
        
          
            Add New Domain
            Map a custom domain to your Cloud Run service
          
          
            
              Domain Name
               setNewDomain({ ...newDomain, domain: e.target.value })}
                className="mt-1 bg-slate-700 border-slate-600"
              />
            
            
              Cloud Run Service
               setNewDomain({ ...newDomain, cloudRunService: e.target.value })}
                className="mt-1 bg-slate-700 border-slate-600"
              />
            
            
              Environment
              
                setNewDomain({ ...newDomain, environment: val as DomainEnvironment })
              }>
                
                  
                
                
                  Development
                  Staging
                  Production
                
              
            
            
              Add Domain
            
          
        
      

      {/* DNS Records Dialog */}
      
        
          
            DNS Records to Add
            
              Add these DNS records at your domain registrar to activate {selectedDomain?.domain}
            
          
          
            {selectedDomain &&
              getDNSRecords(selectedDomain.domain, selectedDomain.cloudRunService).map(
                (record, idx) => (
                  
                    
                      
                        
                          
                            Type
                            
                              {record.type}
                            
                          
                          
                            Name
                            {record.name}
                          
                        
                        
                          Value
                          
                            
                              {record.value}
                            
                             navigator.clipboard.writeText(record.value)}
                            >
                              
                            
                          
                        
                        {record.instruction}
                      
                    
                  
                )
              )}
          
        
      

      {/* Domain Mappings Table */}
      
        
          Domain Mappings
          All custom domains and their mappings
        
        
          {isLoading ? (
            Loading domains...
          ) : domains.length === 0 ? (
            No domains found
          ) : (
            
              
                
                  
                    Domain
                    Service
                    SSL
                    DNS
                    HTTP Status
                    Actions
                  
                
                
                  {domains.map((domain) => (
                    
                      
                        
                        {domain.domain}
                      
                      {domain.cloudRunService}
                      
                        
                          {domain.sslStatus}
                        
                      
                      
                        
                          {domain.dnsStatus}
                        
                      
                      
                        {domain.httpStatus}
                      
                      
                        
                          
                            
                              
                            
                          
                          
                             {
                                setSelectedDomain(domain);
                                setShowDNSDialog(true);
                              }}
                              className="text-slate-200 cursor-pointer hover:bg-slate-700"
                            >
                              
                              View DNS Records
                            
                             handleRenewSSL(domain)}
                              className="text-slate-200 cursor-pointer hover:bg-slate-700"
                            >
                              
                              Renew SSL
                            
                             {
                                setSelectedDomain(domain);
                                setShowDeleteDialog(true);
                              }}
                              className="text-red-400 cursor-pointer hover:bg-red-500/20"
                            >
                              
                              Remove
                            
                          
                        
                      
                    
                  ))}
                
              
            
          )}
        
      

      {/* Delete Confirmation */}
      
        
          Remove Domain
          
            Are you sure you want to remove {selectedDomain?.domain}?
            This will stop routing traffic to {selectedDomain?.cloudRunService}.
          
          
            
              Cancel
            
            
              Remove
            
          
        
      
    
  );
}