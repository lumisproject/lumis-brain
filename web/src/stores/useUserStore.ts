import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { useChatStore } from '@/stores/useChatStore';

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
}

export const useUserStore = create<UserState>((set) => ({
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

    // Reset chat when a user logs in (new or returning)
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

    // New accounts should always start with an empty chat
    try {
      useChatStore.getState().clearMessages();
    } catch {
      // ignore
    }

    return true;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });

    // Clear chat history when logging out so the next user doesn't see it
    try {
      useChatStore.getState().clearMessages();
    } catch {
      // ignore
    }
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
}));
