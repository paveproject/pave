import { claimSeq, recordAudioChunk } from './protestSessions';
import { PROTEST_AUDIO_CHUNK_TABLE, PROTEST_SESSION_TABLE } from './schema';
import type { ProtestSession } from './models/ProtestSession';

interface FakeRow {
  id: string;
  [key: string]: unknown;
}

/**
 * A database with the one property these tests are about: `write()` runs its
 * blocks one at a time.
 *
 * Not the LokiJS adapter, which would need a dependency the app doesn't
 * otherwise have, and not the SQLite one, which needs the native module. What
 * matters is WatermelonDB's writer-queue contract, and reproducing that is
 * enough to catch the mistake these tests exist for: reading a counter
 * *outside* the write that bumps it.
 *
 * Built inside the factory because `jest.mock` is hoisted above every
 * declaration in this file - the state is handed back out through the mocked
 * module instead.
 */
jest.mock('./database', () => {
  const rows = new Map<string, FakeRow[]>();
  let created = 0;

  let tail: Promise<unknown> = Promise.resolve();
  const write = <T>(block: () => T | Promise<T>): Promise<T> => {
    const next = tail.then(block);
    tail = next.catch(() => undefined);
    return next;
  };

  const withUpdate = (row: FakeRow): FakeRow => {
    row.update = async (apply: (target: FakeRow) => void) => apply(row);
    return row;
  };

  return {
    __rows: rows,
    __reset: () => {
      rows.clear();
      created = 0;
    },
    __withUpdate: withUpdate,
    database: {
      write,
      get: (table: string) => ({
        find: async (id: string) => {
          const row = (rows.get(table) ?? []).find((entry) => entry.id === id);
          if (!row) throw new Error(`no ${table} row ${id}`);
          return row;
        },
        create: async (build: (row: FakeRow) => void) => {
          const row = withUpdate({ id: `row-${(created += 1)}` });
          build(row);
          rows.set(table, [...(rows.get(table) ?? []), row]);
          return row;
        },
      }),
    },
  };
});

jest.mock('../../providers/sync/offlineExecutor/protestExecutor', () => {
  const enqueued: Record<string, unknown>[] = [];
  return {
    __enqueued: enqueued,
    protestExecutor: {
      waitForInit: async () => undefined,
      peekOutbox: async () => [],
      createOfflineTransaction: (options: { metadata: Record<string, unknown> }) => {
        enqueued.push(options.metadata);
        return { mutate: (fn: () => void) => fn(), commit: async () => undefined };
      },
    },
    protestMutationMarkers: { insert: () => undefined },
  };
});

jest.mock('../protestMode/crypto', () => ({
  sealMetadata: () => 'sealed-metadata',
  mintSessionKey: () => new Uint8Array(32),
  sealSessionKey: async () => 'sealed-key',
  resealSessionKeys: async () => ({}),
}));
jest.mock('../protestMode/keyStore', () => ({
  getProtestSessionKey: async () => new Uint8Array(32),
  setProtestSessionKey: async () => undefined,
}));
jest.mock('../protestMode/protestAudio', () => ({ sweepOrphanedChunks: async () => undefined }));
// `virtual`: the workspace alias isn't on jest's resolver path, and these
// tests never reach the network anyway.
jest.mock(
  '@libs/api-js',
  () => ({ listSessions: async () => ({}), endSession: async () => ({}) }),
  { virtual: true },
);
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${Math.random().toString(36).slice(2)}`,
}));
jest.mock('../../providers/sync/syncLogStore', () => ({
  useSyncLogStore: { getState: () => ({ append: () => undefined }) },
}));
jest.mock('../../logger', () => ({
  logger: { debug: () => undefined, error: () => undefined, warn: () => undefined },
}));

const db = jest.requireMock('./database') as {
  __rows: Map<string, FakeRow[]>;
  __reset: () => void;
  __withUpdate: (row: FakeRow) => FakeRow;
};
const executor = jest.requireMock('../../providers/sync/offlineExecutor/protestExecutor') as {
  __enqueued: Record<string, unknown>[];
};

const seedSession = (nextSeq = 0) => {
  const session = db.__withUpdate({
    id: 'session-1',
    nextSeq,
    sealedKey: 'sealed-key',
    startedAt: new Date(0),
    endedAt: null,
  });
  db.__rows.set(PROTEST_SESSION_TABLE, [session]);
  return session as unknown as ProtestSession;
};

const chunkRows = () => db.__rows.get(PROTEST_AUDIO_CHUNK_TABLE) ?? [];

beforeEach(() => {
  db.__reset();
  executor.__enqueued.length = 0;
});

describe('claimSeq', () => {
  it('never hands the same number to two concurrent claims', async () => {
    // The bug this replaces: `seq` was read outside the write that bumped it,
    // so an audio rotation firing during a position flush got the number the
    // flush was already using. `(session, seq)` is unique server-side and the
    // 409 is permanent, so the loser was dropped for good.
    const session = seedSession();

    const claims = await Promise.all(Array.from({ length: 16 }, () => claimSeq(session)));

    expect(new Set(claims).size).toBe(16);
    expect([...claims].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('continues from where the row left off', async () => {
    const session = seedSession(7);

    expect(await claimSeq(session)).toBe(7);
    expect(await claimSeq(session)).toBe(8);
  });
});

describe('recordAudioChunk', () => {
  const chunk = {
    userId: 'user-1',
    sessionId: 'session-1',
    ciphertextUri: 'file:///sealed-1.bin',
    startedAt: new Date(1_700_000_000_000),
    durationMs: 60_000,
  };

  it('persists the blob id it enqueues', async () => {
    // The two have to agree, because a replay reads the row rather than the
    // outbox: a fresh id at the same `seq` would collide with the attempt that
    // may already have landed, and that 409 is permanent.
    seedSession();

    await recordAudioChunk(chunk);

    const [row] = chunkRows();
    expect(executor.__enqueued).toHaveLength(1);
    expect(row.blobId).toBe(executor.__enqueued[0].blobId);
    expect(row.seq).toBe(executor.__enqueued[0].seq);
    expect(executor.__enqueued[0].chunkId).toBe(row.id);
  });

  it('writes the chunk unsynced, pointing at the sealed file', async () => {
    seedSession();

    await recordAudioChunk(chunk);

    const [row] = chunkRows();
    expect(row.uri).toBe(chunk.ciphertextUri);
    expect(row.durationMs).toBe(60_000);
    // Never on enqueue: the difference between "the evidence is safe" and
    // "the evidence looked safe".
    expect(row.synced).toBe(false);
  });

  it('gives two chunks of one session distinct sequence numbers', async () => {
    seedSession();

    await Promise.all([recordAudioChunk(chunk), recordAudioChunk(chunk)]);

    expect(new Set(chunkRows().map((row) => row.seq)).size).toBe(2);
  });
});
