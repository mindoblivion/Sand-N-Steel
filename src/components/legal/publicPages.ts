/**
 * publicPages.ts — the public routes, stated in ONE place.
 *
 * The game has no router: `src/App.tsx` is one screen-switching component and
 * `src/main.tsx` decides what to mount from the address.  These two pages are
 * different in kind from every other screen — they must work **without a session**
 * and in a **production build**, because the deletion page's URL is what a store
 * listing points at:
 *
 *   • `/delete-account` — the deletion-request page Google Play asks of every app
 *     that creates accounts;
 *   • `/privacy` — the privacy policy;
 *   • `/terms` — the terms of service.
 *
 * This module holds only the ROUTE TABLE (no React, no components), so `main.tsx`
 * can name the routes without pulling either page into the game's own chunk: the
 * pages themselves are `LegalPages.tsx`, dynamically imported from `main.tsx`.
 */

/** The public pages, by their route. */
export type PublicPageId = 'delete-account' | 'privacy' | 'terms';

export const PUBLIC_PAGE_PATHS: Readonly<Record<PublicPageId, string>> = {
  'delete-account': '/delete-account',
  privacy: '/privacy',
  terms: '/terms',
};

/**
 * Which public page a pathname asks for, or `null` when the address belongs to the
 * game.  A trailing slash is the same address (`/privacy/`); anything else is not.
 */
export function resolvePublicPage(pathname: string): PublicPageId | null {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  for (const id of Object.keys(PUBLIC_PAGE_PATHS) as PublicPageId[]) {
    if (PUBLIC_PAGE_PATHS[id] === normalized) return id;
  }
  return null;
}
