import { reserveRecoveryDekGeneration } from '@libs/api-js';
import { useMutation } from '@tanstack/react-query';
import { toApiCallError } from '../apiError';

/** A compare-and-swap guard around minting a new recovery DEK (see
 * `handlers::reserve_recovery_dek_generation`'s own doc comment) - no
 * cache write of its own, there's no query this ever needs to patch.
 * Throws (via `toApiCallError`, check with `isConflictError`) on a lost
 * race (409) rather than returning a union, matching this codebase's
 * existing `isNotFoundError`/`isForbiddenError` convention. */
export const useReserveRecoveryDekGenerationMutation = () =>
  useMutation({
    mutationFn: async (body: { expectedGeneration: number }) => {
      const { data, error, response } = await reserveRecoveryDekGeneration({ body });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
