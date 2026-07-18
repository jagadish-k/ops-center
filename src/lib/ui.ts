/**
 * Shared UI presentation helpers — tier/severity/status styling + time formatting.
 *
 * Pure functions only; no React. Used by the Control Room and Field surfaces to
 * keep badge/color language consistent across components.
 */
import type {
  InfoTier,
  IncidentSeverity,
  IncidentStatus,
  StaffSpecialty,
} from '@/types';

export interface BadgeStyle {
  /** Tailwind classes for a small badge (bg/text/border). */
  className: string;
  /** Hex color for canvas / inline styling. */
  hex: string;
  label: string;
}

export function tierBadge(tier: InfoTier): BadgeStyle {
  switch (tier) {
    case 1:
      return {
        className: 'border-red-500 bg-red-500/15 text-red-400',
        hex: '#ef4444',
        label: 'T1',
      };
    case 2:
      return {
        className: 'border-red-500/80 bg-red-500/10 text-red-300',
        hex: '#ef4444',
        label: 'T2',
      };
    case 3:
      return {
        className: 'border-amber-500 bg-amber-500/15 text-amber-400',
        hex: '#f59e0b',
        label: 'T3',
      };
    case 4:
      return {
        className: 'border-blue-500/70 bg-blue-500/10 text-blue-300',
        hex: '#3b82f6',
        label: 'T4',
      };
    case 5:
      return {
        className:
          'border-slate-500 bg-slate-500/10 text-slate-600 dark:text-slate-300',
        hex: '#3b82f6',
        label: 'T5',
      };
  }
}

export function severityBadge(severity: IncidentSeverity): BadgeStyle {
  switch (severity) {
    case 'CRITICAL':
      return {
        className: 'border-red-500 bg-red-500/15 text-red-400',
        hex: '#ef4444',
        label: 'CRITICAL',
      };
    case 'HIGH':
      return {
        className: 'border-amber-500 bg-amber-500/15 text-amber-400',
        hex: '#f59e0b',
        label: 'HIGH',
      };
    case 'MEDIUM':
      return {
        className: 'border-yellow-500 bg-yellow-500/15 text-yellow-400',
        hex: '#eab308',
        label: 'MEDIUM',
      };
    case 'LOW':
      return {
        className:
          'border-slate-500 bg-slate-500/10 text-slate-500 dark:text-slate-400',
        hex: '#64748b',
        label: 'LOW',
      };
  }
}

export function statusBadge(status: IncidentStatus): BadgeStyle {
  switch (status) {
    case 'OPEN':
      return {
        className: 'border-red-500/70 bg-red-500/10 text-red-300',
        hex: '#ef4444',
        label: 'OPEN',
      };
    case 'ACKNOWLEDGED':
      return {
        className: 'border-amber-500/70 bg-amber-500/10 text-amber-300',
        hex: '#f59e0b',
        label: 'ACK',
      };
    case 'ON_SCENE':
      return {
        className: 'border-blue-500/70 bg-blue-500/10 text-blue-300',
        hex: '#3b82f6',
        label: 'ON-SCENE',
      };
    case 'RESOLVED':
      return {
        className: 'border-emerald-500/70 bg-emerald-500/10 text-emerald-300',
        hex: '#22c55e',
        label: 'RESOLVED',
      };
  }
}

export function specialtyColor(specialty: StaffSpecialty): string {
  switch (specialty) {
    case 'security':
      return '#3b82f6';
    case 'medical':
      return '#22c55e';
    case 'cleaning':
      return '#eab308';
    case 'supervisor':
      return '#a855f7';
  }
}

/** Relative "time ago" formatter (e.g., "42s", "3m", "1h"). */
export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
