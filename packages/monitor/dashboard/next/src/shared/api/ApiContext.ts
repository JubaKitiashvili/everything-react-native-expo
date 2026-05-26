import { createContext } from 'react';
import type { DashboardApiClient } from './client';

/**
 * Kept in its own file so the provider component + consumer hook can
 * live alongside it without tripping react-refresh's
 * `only-export-components` rule.
 */
export const ApiContext = createContext<DashboardApiClient | null>(null);
