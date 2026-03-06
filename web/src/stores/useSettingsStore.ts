import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  useDefault: boolean;
  provider: string;
  apiKey: string;
  selectedModel: string;
  jiraProjectKey: string;
  notionDatabaseId: string;
  setUseDefault: (val: boolean) => void;
  setProvider: (val: string) => void;
  setApiKey: (val: string) => void;
  setSelectedModel: (val: string) => void;
  setJiraProjectKey: (val: string) => void;
  setNotionDatabaseId: (val: string) => void;
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
      partialize: (state) => 
        Object.fromEntries(
          Object.entries(state).filter(([key]) => key !== 'apiKey')
        ) as Partial<SettingsState>,
    }
  )
);