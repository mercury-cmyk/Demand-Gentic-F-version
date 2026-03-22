import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { UnifiedContactRecord, UnifiedAccountRecord } from '@shared/unified-records';
import { convertFilterValuesToFilterGroup } from '@shared/filterConfig';
import type { FilterValues } from '@shared/filterConfig';

export type UnifiedContact = UnifiedContactRecord;
export type UnifiedAccount = UnifiedAccountRecord;

export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface PaginatedResponse {
  data: T[];
  pagination: PaginationInfo;
}

export function useUnifiedContacts(filterValues?: FilterValues, page: number = 1, limit: number = 100) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { filterKey, queryString } = useMemo(() => {
    const offset = (page - 1) * limit;
    const params = new URLSearchParams();

    params.append('limit', String(limit));
    params.append('offset', String(offset));

    if (filterValues) {
      const group = convertFilterValuesToFilterGroup(filterValues, 'contacts');
      if (group) {
        const serialized = JSON.stringify(filterValues);
        params.append('filterValues', serialized);
        return {
          filterKey: `${serialized}-${page}-${limit}`,
          queryString: `?${params.toString()}`,
        };
      }
    }

    return {
      filterKey: `all-${page}-${limit}`,
      queryString: `?${params.toString()}`,
    };
  }, [filterValues, page, limit]);

  const { data, ...rest } = useQuery>({
    queryKey: ['/api/contacts-unified', filterKey],
    queryFn: async () => {
      const endpoint = `/api/contacts-unified${queryString}`;
      const res = await apiRequest('GET', endpoint);
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: (newContact: Omit) =>
      apiRequest('POST', '/api/contacts-unified', newContact),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts-unified'] });
      toast({ title: 'Success', description: 'Contact created' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return {
    contacts: data?.data,
    pagination: data?.pagination,
    ...rest,
    createContact: createMutation.mutate
  };
}

export function useUnifiedAccounts(filterValues?: FilterValues, page: number = 1, limit: number = 100) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { filterKey, queryString } = useMemo(() => {
    const offset = (page - 1) * limit;
    const params = new URLSearchParams();

    params.append('limit', String(limit));
    params.append('offset', String(offset));

    if (filterValues) {
      const group = convertFilterValuesToFilterGroup(filterValues, 'accounts');
      if (group) {
        const serialized = JSON.stringify(filterValues);
        params.append('filterValues', serialized);
        return {
          filterKey: `${serialized}-${page}-${limit}`,
          queryString: `?${params.toString()}`,
        };
      }
    }

    return {
      filterKey: `all-${page}-${limit}`,
      queryString: `?${params.toString()}`,
    };
  }, [filterValues, page, limit]);

  const { data, ...rest } = useQuery>({
    queryKey: ['/api/accounts-unified', filterKey],
    queryFn: async () => {
      const endpoint = `/api/accounts-unified${queryString}`;
      const res = await apiRequest('GET', endpoint);
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: (newAccount: Omit) =>
      apiRequest('POST', '/api/accounts-unified', newAccount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts-unified'] });
      toast({ title: 'Success', description: 'Account created' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return {
    accounts: data?.data,
    pagination: data?.pagination,
    ...rest,
    createAccount: createMutation.mutate
  };
}