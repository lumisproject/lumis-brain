import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { useChatStore } from '@/stores/useChatStore';
import { useSettingsStore } from '@/stores/useSettingsStore'; // Add this import

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

    // Fetch user specific settings
    if (data.user) {
      await useSettingsStore.getState().fetchSettings(data.user.id);
    }

    try { useChatStore.getState().clearMessages(); } catch {}
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

    // Fetch user specific settings
    if (data.user) {
      await useSettingsStore.getState().fetchSettings(data.user.id);
    }

    try { useChatStore.getState().clearMessages(); } catch {}
    return true;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });

    // Clear settings back to default on sign out
    useSettingsStore.getState().setSettings({
      useDefault: true,
      provider: 'openrouter',
      apiKey: '',
      selectedModel: 'stepfun/step-3.5-flash:free',
      jiraProjectKey: '',
      notionDatabaseId: '',
    });

    try { useChatStore.getState().clearMessages(); } catch {}
  },

  checkSession: async () => {
    set({ loading: true });
    const { data: { session } } = await supabase.auth.getSession();
    set({ user: session?.user ?? null, session, loading: false });

    if (session?.user) {
      await useSettingsStore.getState().fetchSettings(session.user.id);
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, session });
      if (session?.user) {
        useSettingsStore.getState().fetchSettings(session.user.id);
      }
    });
  },

  clearError: () => set({ error: null }),
}));