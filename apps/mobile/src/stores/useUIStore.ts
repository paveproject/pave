import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from './storage';
import { ViewType } from '@libs/api-js';

interface MapState {
  center: [number, number]; // [lng, lat]
  zoom: number;
  selectedMovieId: number | null;
}

interface UIStore {
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
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
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
      },
      setMapCamera: (center, zoom) =>
        set((state) => ({
          map: { ...state.map, center, zoom },
        })),
      setSelectedMovieId: (id) =>
        set((state) => ({
          map: { ...state.map, selectedMovieId: id },
        })),
    }),
    {
      name: 'ui-storage',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
