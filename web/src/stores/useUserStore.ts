import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { useChatStore } from '@/stores/useChatStore';
import { useSettingsStore } from '@/stores/useSettingsStore'; // Import settings store

interface UserState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
  clearError: () => void;
  clearUser: () => void; // Added missing property
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      return false;
    }
    set({ user: data.user, session: data.session, loading: false });

    try {
      useChatStore.getState().clearMessages();
    } catch {
      // ignore
    }

    return true;
  },

  signUp: async (email, password) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      return false;
    }
    set({ user: data.user, session: data.session, loading: false });

    try {
      useChatStore.getState().clearMessages();
    } catch {
      // ignore
    }

    return true;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    
    // Clear current store state
    get().clearUser(); 
    
    // Clear other store states to prevent account bleeding
    try {
      useChatStore.getState().clearMessages();
      // Safely clear settings store persistence
      if (useSettingsStore.persist) {
        useSettingsStore.persist.clearStorage();
      }
    } catch (e) {
      console.error("Error clearing stores during sign out:", e);
    }
    
    // NOTE: Navigation should happen in the component calling signOut, 
    // or via window.location.href for a hard reset
    window.location.href = '/login'; 
  },

  checkSession: async () => {
    set({ loading: true });
    const { data: { session } } = await supabase.auth.getSession();
    set({ user: session?.user ?? null, session, loading: false });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, session });
    });
  },

  clearError: () => set({ error: null }),

  // Implementation of clearUser
  clearUser: () => set({ user: null, session: null, error: null }),
}));