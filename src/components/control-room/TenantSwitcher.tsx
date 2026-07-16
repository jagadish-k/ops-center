/**
 * TenantSwitcher — multi-tenant selector for superadmins.
 *
 * Renders a HeroUI Select of available tenants. Hidden entirely when only a
 * single tenant is available (regular admins). On change it delegates upward so
 * the ActiveOps provider can re-poll under the new isolation boundary.
 */
import { Select, ListBox, Label } from '@heroui/react';
import type { Key } from '@heroui/react';
import type { TenantOption } from '@/lib/mockData';

interface TenantSwitcherProps {
	tenants: TenantOption[];
	activeTenantId: string;
	onTenantChange: (tenantId: string) => void;
}

export function TenantSwitcher({ tenants, activeTenantId, onTenantChange }: TenantSwitcherProps) {
	// Single-tenant admins get no switcher.
	if (tenants.length <= 1) return null;

	const handleChange = (key: Key | Key[] | null): void => {
		if (typeof key === 'string') {
			onTenantChange(key);
		}
	};

	return (
		<div className="w-48">
			<Select
				fullWidth
				value={activeTenantId}
				onChange={handleChange}
				aria-label="Switch tenant">
				<Label className="sr-only">Tenant</Label>
				<Select.Trigger className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5">
					<Select.Value className="font-mono text-xs uppercase tracking-widest text-slate-300" />
					<Select.Indicator />
				</Select.Trigger>
				<Select.Popover>
					<ListBox>
						{tenants.map((tenant) => (
							<ListBox.Item key={tenant.tenantId} id={tenant.tenantId} textValue={tenant.orgName}>
								<span className="font-mono text-xs uppercase tracking-wide text-slate-300">
									{tenant.orgName}
								</span>
								<ListBox.ItemIndicator />
							</ListBox.Item>
						))}
					</ListBox>
				</Select.Popover>
			</Select>
		</div>
	);
}
