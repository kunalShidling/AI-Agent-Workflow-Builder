'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_ORG_MEMBERSHIPS } from '../graphql/queries';
import { useAuthenticationStatus } from '@nhost/nextjs';
import { useRouter } from 'next/navigation';

interface Organization {
  id: string;
  name: string;
  calls_used: number;
  calls_allowed: number;
}

interface OrgContextType {
  organization: Organization | null;
  role: string | null;
  loading: boolean;
  switchOrganization: (orgId: string) => void;
  availableOrgs: any[];
}

const OrgContext = createContext<OrgContextType>({
  organization: null,
  role: null,
  loading: true,
  switchOrganization: () => {},
  availableOrgs: []
});

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthenticationStatus();
  const router = useRouter();

  const { data, loading: isQueryLoading, error } = useQuery(GET_ORG_MEMBERSHIPS, {
    skip: !isAuthenticated,
  });

  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthLoading, isAuthenticated, router]);

  useEffect(() => {
    if (data?.org_members && data.org_members.length > 0 && !activeOrgId) {
      setActiveOrgId(data.org_members[0].org_id);
    }
  }, [data, activeOrgId]);

  const activeMembership = data?.org_members.find((m: any) => m.org_id === activeOrgId) || null;
  const organization = activeMembership?.organization || null;
  const role = activeMembership?.role || null;

  return (
    <OrgContext.Provider value={{
      organization,
      role,
      loading: isAuthLoading || isQueryLoading,
      availableOrgs: data?.org_members || [],
      switchOrganization: setActiveOrgId
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
