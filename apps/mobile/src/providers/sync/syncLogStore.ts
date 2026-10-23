import { create } from 'zustand';
import type { SyncTaskStatus } from './types';

export interface SyncLogEntry {
  id: string;
  taskId: string;
  status: SyncTaskStatus;
  timestamp: number;
  message?: string;
}

/** Capped so a long-running app session doesn't grow this forever. */
const MAX_LOG_ENTRIES = 200;

interface SyncLogStore {
  entries: SyncLogEntry[];
  append: (entry: Omit<SyncLogEntry, 'id' | 'timestamp'>) => void;
}

/**
 * Append-only history of every status change any sync task reported
 * (not just its current state, which `syncRegistryStore` already has) -
 * backs the debug sync screen's log view. No persistence: debug-only,
 * doesn't need to survive a restart.
 */
export const useSyncLogStore = create<SyncLogStore>()((set) => ({
  entries: [],
  append: (entry) =>
    set((state) => ({
      entries: [
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: Date.now(),
        },
        ...state.entries,
      ].slice(0, MAX_LOG_ENTRIES),
    })),
}));
