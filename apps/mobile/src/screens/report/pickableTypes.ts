import { getLocales } from 'expo-localization';
import { reportTypesFor } from '@libs/constants';

/**
 * Read once: the device region doesn't meaningfully change inside a session,
 * and both sheet steps have to filter against the same list. Country-restricted
 * types stay out when the OS won't give a region.
 */
export const pickableTypes = reportTypesFor(getLocales()[0]?.regionCode ?? undefined);
