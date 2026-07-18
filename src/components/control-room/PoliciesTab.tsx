/**
 * PoliciesTab — Rego policy authoring surface (M10, superadmin-only).
 *
 * Layer 1: list + edit DB-stored policies + run policy tests via OPA.
 *
 * Layout:
 *   Left panel: policy list (cards). Click to load into editor.
 *   Right panel: CodeMirror editor + test runner.
 *
 * Test runner: paste input JSON, click Run, see decision + elapsed time.
 * Uses /api/admin/policies/test which spawns `opa eval` server-side.
 *
 * Requires the `tenant:manage` permission (superadmin only).
 *
 * NOT in v1:
 *   - Per-tenant overrides (Layer 2)
 *   - Rebuild-and-deploy from UI (deploy-time concern)
 *   - Live WASM bundle refresh (requires function restart)
 */
import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { Button, Spinner, Drawer, Input, Label, TextArea } from '@heroui/react';
import {
	adminListPolicies,
	adminCreatePolicy,
	adminUpdatePolicy,
	adminDeletePolicy,
	adminTestPolicy,
	type AdminPolicy,
	type PolicyTestResult,
	ApiError,
} from '@/services/api';
import { useOptimisticList } from '@/hooks/useOptimisticList';
import { regoLanguage } from '@/lib/rego-language';
import { CardGridSkeleton } from '@/components/shared/Skeletons';

const SAMPLE_POLICY = `package stadium.custom

import rego.v1

default allow := false

allow if {
    input.subject.global_role == "superadmin"
}

allow if {
    input.action == "incident:read"
}
`;

const SAMPLE_INPUT = JSON.stringify(
	{
		action: 'incident:read',
		subject: { global_role: 'member', roles: ['staff'], user_id: 'u1', tenant_id: 't1' },
		resource: null,
	},
	null,
	2,
);

export function PoliciesTab() {
	const [createOpen, setCreateOpen] = useState(false);
	const [selected, setSelected] = useState<AdminPolicy | null>(null);

	const { items: policies, loading, error, reload, mutate } = useOptimisticList<AdminPolicy[]>({
		loader: adminListPolicies,
		initial: null,
	});

	return (
		<div className="flex h-full flex-col gap-3 p-4">
			<header className="flex items-center gap-3">
				<h2 className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">Policies</h2>
				<span className="font-mono text-[10px] uppercase tracking-widest text-slate-900 dark:text-slate-500 dark:text-slate-500">
					{policies?.length ?? 0} polic{policies?.length === 1 ? 'y' : 'ies'}
				</span>
				<div className="ml-auto">
					<Button size="sm" variant="secondary" onPress={() => setCreateOpen(true)} className="neu-raised-sm neu-hover neu-active">+ New Policy</Button>
				</div>
			</header>

			{error && (
				<div className="rounded border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-300">
					{error}
					<Button size="sm" variant="ghost" onPress={() => void reload()} className="ml-3 neu-raised-sm neu-hover neu-active">Retry</Button>
				</div>
			)}

			<div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_2fr]">
				{/* Left: policy list */}
				<aside className="overflow-auto rounded border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/40">
					{loading && policies === null ? (
						<div className="p-3"><CardGridSkeleton cards={3} /></div>
					) : (
						<ul className="divide-y divide-slate-800">
							{policies?.map((p) => (
								<li
									key={p.name}
									className={`cursor-pointer p-3 hover:bg-slate-200 dark:bg-slate-800/30 ${selected?.name === p.name ? 'bg-slate-200 dark:bg-slate-800/40' : ''}`}
									onClick={() => setSelected(p)}
								>
									<div className="flex items-center gap-2">
										<span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{p.name}</span>
										{p.isSystem && (
											<span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
												system
											</span>
										)}
										{!p.enabled && (
											<span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-300">
												disabled
											</span>
										)}
									</div>
									<p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-400">{p.description}</p>
								</li>
							))}
						</ul>
					)}
				</aside>

				{/* Right: editor + tester */}
				<main className="flex min-h-0 flex-col gap-3">
					{selected ? (
						<PolicyEditor key={selected.name} policy={selected} mutate={mutate} />
					) : (
						<div className="flex h-full items-center justify-center rounded border border-slate-300 bg-white text-xs text-slate-900 dark:text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-500">
							Select a policy to edit, or create a new one.
						</div>
					)}
				</main>
			</div>

			<CreatePolicyDrawer
				isOpen={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreated={async (newPolicy) => {
					await mutate(async () => {}, (draft) => { draft.push(newPolicy); });
					setCreateOpen(false);
					setSelected(newPolicy);
				}}
			/>
		</div>
	);
}

// ─── Policy editor + test runner ─────────────────────────────────────────────

interface MutateFn {
	(serverOp: () => Promise<unknown>, optimisticUpdate: (draft: AdminPolicy[]) => void): Promise<boolean>;
}

function PolicyEditor({ policy, mutate }: { policy: AdminPolicy; mutate: MutateFn }) {
	const [source, setSource] = useState(policy.source);
	const [savedSource, setSavedSource] = useState(policy.source);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	const [testInput, setTestInput] = useState(SAMPLE_INPUT);
	const [testResult, setTestResult] = useState<PolicyTestResult | null>(null);
	const [testing, setTesting] = useState(false);

	const dirty = source !== savedSource;

	const save = async () => {
		setSaving(true);
		setSaveError(null);
		const ok = await mutate(
			() => adminUpdatePolicy(policy.name, { source }),
			(draft) => {
				const t = draft.find((p) => p.name === policy.name);
				if (t) t.source = source;
			},
		);
		if (ok) {
			setSavedSource(source);
		} else {
			setSaveError('Save failed — rolled back.');
		}
		setSaving(false);
	};

	const runTest = async () => {
		setTesting(true);
		setTestResult(null);
		try {
			const parsed = JSON.parse(testInput);
			// Use the unsaved source if dirty (test against current editor state).
			const result = await adminTestPolicy(source, parsed);
			setTestResult(result);
		} catch (err) {
			setTestResult({
				ok: false,
				error: err instanceof SyntaxError
					? `Invalid JSON input: ${err.message}`
					: err instanceof ApiError ? err.message : 'Test failed',
				elapsedMs: 0,
			});
		} finally {
			setTesting(false);
		}
	};

	const remove = async () => {
		if (!confirm(`Delete policy "${policy.name}"? This cannot be undone.`)) return;
		await mutate(
			() => adminDeletePolicy(policy.name),
			(draft) => {
				const idx = draft.findIndex((p) => p.name === policy.name);
				if (idx >= 0) draft.splice(idx, 1);
			},
		);
	};

	const readOnly = policy.isSystem;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<header className="flex items-center gap-3">
				<h3 className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{policy.name}</h3>
				{readOnly && (
					<span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-300">
						read-only
					</span>
				)}
				<span className="ml-auto font-mono text-[10px] text-slate-900 dark:text-slate-500 dark:text-slate-500">
					{source.length} chars
					{dirty && <span className="ml-2 text-amber-600 dark:text-amber-400">● unsaved</span>}
				</span>
				{!readOnly && (
			<Button
					size="sm"
					variant="primary"
					onPress={save}
					isDisabled={saving || !dirty}
					className="neu-raised-sm neu-hover neu-active"
				>
					{saving ? <Spinner size="sm" /> : 'Save'}
				</Button>
			)}
			{!readOnly && (
				<Button size="sm" variant="ghost" className="text-red-600 neu-raised-sm neu-hover neu-active dark:text-red-400" onPress={remove}>
					Delete
				</Button>
			)}
		</header>

			<p className="text-xs text-slate-600 dark:text-slate-400">{policy.description}</p>

			<div className="min-h-[300px] flex-1 overflow-hidden rounded border border-slate-300 dark:border-slate-800">
				<CodeMirror
					value={source}
					height="100%"
					theme={oneDark}
					extensions={[regoLanguage, EditorView.lineWrapping]}
					onChange={(val) => setSource(val)}
					readOnly={readOnly}
					basicSetup={{ lineNumbers: true, highlightActiveLine: !readOnly, foldGutter: true }}
				/>
			</div>

			{saveError && (
				<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
					{saveError}
				</div>
			)}

			{/* Test runner */}
			<details className="rounded border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/40" open>
			<summary className="cursor-pointer p-3 font-mono text-[10px] uppercase tracking-widest text-slate-700 dark:text-slate-300">
				Test runner (opa eval)
			</summary>
				<div className="flex flex-col gap-2 border-t border-slate-300 dark:border-slate-800 p-3">
					<Label className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500">
						Input JSON
					</Label>
					<TextArea
						aria-label="Policy test input JSON"
						className="h-32 w-full neu-pressed font-mono text-xs"
						value={testInput}
						onChange={(e) => setTestInput(e.target.value)}
						spellCheck={false}
					/>
					<div className="flex items-center gap-2">
						<Button size="sm" variant="secondary" onPress={runTest} isDisabled={testing} className="neu-raised-sm neu-hover neu-active">
							{testing ? <Spinner size="sm" /> : 'Run test'}
						</Button>
						<span className="font-mono text-[10px] text-slate-900 dark:text-slate-500 dark:text-slate-500">
							Evaluates <code>data.stadium.authz.allow</code> with the input above
						</span>
					</div>

					{testResult && (
						<div
							className={`rounded border p-3 text-xs ${
								!testResult.ok
									? 'border-red-500/40 bg-red-950/30 text-red-300'
									: testResult.allowed
										? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
										: 'border-amber-500/40 bg-amber-950/30 text-amber-300'
							}`}
						>
							{!testResult.ok ? (
								<div>
									<strong>Error:</strong> {testResult.error}
								</div>
							) : (
								<div>
									<strong>Decision: {testResult.allowed ? 'ALLOW' : 'DENY'}</strong>
									<span className="ml-3 text-slate-600 dark:text-slate-400">({testResult.elapsedMs}ms)</span>
								</div>
							)}
						</div>
					)}
				</div>
			</details>
		</div>
	);
}

// ─── Create Policy drawer ────────────────────────────────────────────────────

function CreatePolicyDrawer({
	isOpen,
	onClose,
	onCreated,
}: {
	isOpen: boolean;
	onClose: () => void;
	onCreated: (policy: AdminPolicy) => void | Promise<void>;
}) {
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [source, setSource] = useState(SAMPLE_POLICY);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const submit = async () => {
		setSubmitting(true);
		setSubmitError(null);
		try {
			await adminCreatePolicy({ name, description, source });
			const preview: AdminPolicy = {
				name,
				description,
				source,
				enabled: true,
				updatedAt: new Date().toISOString(),
				updatedBy: null,
				isSystem: false,
			};
			setName('');
			setDescription('');
			setSource(SAMPLE_POLICY);
			await onCreated(preview);
		} catch (err) {
			setSubmitError(err instanceof ApiError ? err.message : 'Failed to create policy');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Drawer isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
			<div className="flex h-full flex-col gap-4 p-6">
				<h3 className="font-mono text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">New Policy</h3>

				<div>
					<Label htmlFor="policy-name" className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">
						Name (use slashes for namespacing)
					</Label>
					<Input
						id="policy-name"
						placeholder="stadium/custom"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="neu-pressed"
					/>
				</div>

				<div>
					<Label htmlFor="policy-desc" className="font-mono text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-400">Description</Label>
					<Input
						id="policy-desc"
						placeholder="Custom audit policy"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						className="neu-pressed"
					/>
				</div>

				<div className="min-h-0 flex-1 overflow-hidden rounded border border-slate-300 dark:border-slate-800">
					<CodeMirror
						value={source}
						theme={oneDark}
						extensions={[regoLanguage, EditorView.lineWrapping]}
						onChange={(val) => setSource(val)}
						height="300px"
					/>
				</div>

				{submitError && (
					<div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-xs text-red-300">
						{submitError}
					</div>
				)}

			<div className="flex justify-end gap-2">
				<Button size="sm" variant="ghost" onPress={onClose} isDisabled={submitting} className="neu-raised-sm neu-hover neu-active">Cancel</Button>
				<Button size="sm" variant="primary" onPress={submit} isDisabled={submitting || !name || !description} className="neu-raised-sm neu-hover neu-active">
					{submitting ? <Spinner size="sm" /> : 'Create'}
				</Button>
			</div>
			</div>
		</Drawer>
	);
}
