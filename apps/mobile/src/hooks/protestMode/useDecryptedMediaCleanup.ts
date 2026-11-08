import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sweepDecryptedMedia } from '../../lib/protestMode/readLocalMedia';

/**
 * Deletes the decrypted media *and* the cached reads that name it.
 *
 * The uris live in react-query under the `protest-mode` prefix, so dropping
 * the files alone leaves a cache entry pointing at a path that no longer
 * exists - which is what made a player fail with AVFoundation's -11800 ("no
 * tracks") once another screen had swept, or after a Fast Refresh.
 *
 * Costly on purpose: this also drops `remote-sessions`, so the next read
 * decrypts the session again. There is no alternative - once the files are
 * gone that cache is simply wrong.
 */
export const useDecryptedMediaCleanup = (): (() => void) => {
  const queryClient = useQueryClient();

  return useCallback(() => {
    sweepDecryptedMedia();
    queryClient.removeQueries({ queryKey: ['protest-mode'] });
  }, [queryClient]);
};
