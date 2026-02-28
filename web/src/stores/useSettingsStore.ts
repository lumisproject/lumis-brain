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
      provider: 'openrouter',
      apiKey: '',
      selectedModel: 'stepfun/step-3.5-flash:free',
      jiraProjectKey: '', // <-- Initial state
      notionDatabaseId: '', // <-- Initial state for Notion Database ID

      setUseDefault: (val) => set({ useDefault: val }),
      setProvider: (val) => set({ provider: val }),
      setApiKey: (val) => set({ apiKey: val }),
      setSelectedModel: (val) => set({ selectedModel: val }),
      setJiraProjectKey: (val) => set({ jiraProjectKey: val }), // <-- Action
      setNotionDatabaseId: (val) => set({ notionDatabaseId: val }), // <-- Action for Notion Database ID
    }),
    { name: 'lumis-settings' }
  )
);
