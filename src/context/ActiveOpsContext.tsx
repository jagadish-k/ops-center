/**
 * Active Operations context — shared live-state surface for the Control Room and
 * Field Client (ADR-0004).
 *
 * Wraps usePollingState and exposes a single source of operational truth to all
 * child components: incidents, staff, dispatches, and connection health. The
 * provider is mounted per-authenticated-surface with the tenant id drawn from
 * the JWT claims.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type {
	IncidentReport,
	WhitelistUser,
	DispatchDirective,
} from '@/types';
import { usePollingState, type PollingState } from '@/hooks/usePollingState';

interface ActiveOpsContextValue extends PollingState {
	activeTenantId: string;
}

const ActiveOpsContext = createContext<ActiveOpsContextValue | undefined>(undefined);

interface ActiveOpsProviderProps {
	/** Tenant isolation boundary from JWT claims. When the JWT is re-minted
	 * (e.g., via switchTenant), this prop changes, triggering a re-poll. */
	tenantId: string;
	children: ReactNode;
}

export function ActiveOpsProvider({
	tenantId,
	children,
}: ActiveOpsProviderProps): ReactNode {
	const polling = usePollingState(tenantId);

	const value: ActiveOpsContextValue = {
		...polling,
		activeTenantId: tenantId,
	};

	return <ActiveOpsContext.Provider value={value}>{children}</ActiveOpsContext.Provider>;
}

/** Access the live operational state. Must be used within an ActiveOpsProvider. */
export function useActiveOps(): ActiveOpsContextValue {
	const context = useContext(ActiveOpsContext);
	if (!context) {
		throw new Error('useActiveOps must be used within an ActiveOpsProvider.');
	}
	return context;
}

// Re-export the value types for downstream convenience.
export type { IncidentReport, WhitelistUser, DispatchDirective };
