import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface SettingsState {
  useDefault: boolean;
  provider: string;
  apiKey: string;
  selectedModel: string;
  jiraProjectKey: string;
  notionDatabaseId: string;
  setSettings: (settings: Partial<Omit<SettingsState, 'setSettings' | 'updateSetting' | 'fetchSettings'>>) => void;
  // ISSUE 2 FIX: Strongly typed key and corresponding value
  updateSetting: <K extends keyof Omit<SettingsState, 'setSettings' | 'updateSetting' | 'fetchSettings'>>(
    userId: string, 
    key: K, 
    value: SettingsState[K]
  ) => Promise<void>;
  fetchSettings: (userId: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      useDefault: true,
      
      provider: '',
      apiKey: '',
      selectedModel: '', 
      jiraProjectKey: '',
      notionDatabaseId: '',
      
      setUseDefault: (val) => set({ useDefault: val }),
      setProvider: (val) => set({ provider: val }),
      setApiKey: (val) => set({ apiKey: val }),
      setSelectedModel: (val) => set({ selectedModel: val }),
      setJiraProjectKey: (val) => set({ jiraProjectKey: val }),
      setNotionDatabaseId: (val) => set({ notionDatabaseId: val }),
    }),
    {
      name: 'lumis-settings',
    }
  )
);
