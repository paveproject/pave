import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from './storage';
import { ViewType } from '@libs/api-js';

export type ThemeVariant = 'light' | 'dark' | 'system';
export type MapStyleVariant = 'default' | 'satellite';

interface MapState {
  center: [number, number]; // [lng, lat]
  zoom: number;
  selectedMovieId: number | null;
  style: MapStyleVariant;
}

interface UIStore {
  theme: ThemeVariant;
  setTheme: (theme: ThemeVariant) => void;

  watchlist: { view: ViewType };
  setWatchlist: (props: Partial<{ view: ViewType }>) => void;

  myRecos: { view: ViewType };
  setMyRecos: (props: Partial<{ view: ViewType }>) => void;

  playlistView: ViewType;
  setPlaylistView: (view: ViewType) => void;

  feedView: 'community' | 'cast_and_crew';
  setFeedView: (view: 'community' | 'cast_and_crew') => void;

  notificationsView: 'all' | 'unread' | 'archived';
  setNotificationsView: (view: 'all' | 'unread' | 'archived') => void;

  hasOnboarded: boolean;
  setHasOnboarded: (hasOnboarded: boolean) => void;

  // Rate app
  appOpenCount: number;
  incrementAppOpenCount: () => void;
  hasRequestedReview: boolean;
  setHasRequestedReview: (hasRequestedReview: boolean) => void;

  map: MapState;
  setMapCamera: (center: [number, number], zoom: number) => void;
  setSelectedMovieId: (id: number | null) => void;
  setMapStyle: (style: MapStyleVariant) => void;

  // Debug mode - see `settings/index.tsx`'s version-footer triple-tap and
  // `settings/_layout.tsx`'s route guard.
  debug: boolean;
  toggleDebug: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      // Watchlist
      watchlist: {
        view: 'grid',
      },
      setWatchlist: (props) =>
        set((state) => ({
          watchlist: { ...state.watchlist, ...props },
        })),
      // My Recos
      myRecos: {
        view: 'grid',
      },
      setMyRecos: (props) =>
        set((state) => ({
          myRecos: { ...state.myRecos, ...props },
        })),
      // Playlist
      playlistView: 'list',
      setPlaylistView: (view) => set({ playlistView: view }),
      // Feed
      feedView: 'community',
      setFeedView: (view) => set({ feedView: view }),
      // Notifications
      notificationsView: 'all',
      setNotificationsView: (view) => set({ notificationsView: view }),
      // Onboarding
      hasOnboarded: false,
      setHasOnboarded: (hasOnboarded) => set({ hasOnboarded }),

      // Rate app
      appOpenCount: 0,
      incrementAppOpenCount: () => set((state) => ({ appOpenCount: state.appOpenCount + 1 })),
      hasRequestedReview: false,
      setHasRequestedReview: (hasRequestedReview) => set({ hasRequestedReview }),

      // Map
      map: {
        center: [2.5, 48.5],
        zoom: 8,
        selectedMovieId: null,
        style: 'default',
      },
      setMapCamera: (center, zoom) =>
        set((state) => ({
          map: { ...state.map, center, zoom },
        })),
      setSelectedMovieId: (id) =>
        set((state) => ({
          map: { ...state.map, selectedMovieId: id },
        })),
      setMapStyle: (style) =>
        set((state) => ({
          map: { ...state.map, style },
        })),

      // Debug mode
      debug: false,
      toggleDebug: () => set((state) => ({ debug: !state.debug })),
    }),
    {
      name: 'ui-storage',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
