import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';

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

      // Implement the individual setters
      setUseDefault: (val) => set({ useDefault: val }),
      setProvider: (val) => set({ provider: val }),
      setApiKey: (val) => set({ apiKey: val }),
      setSelectedModel: (val) => set({ selectedModel: val }),
      setJiraProjectKey: (val) => set({ jiraProjectKey: val }),
      setNotionDatabaseId: (val) => set({ notionDatabaseId: val }),

      fetchSettings: async (userId) => {
        if (!userId) return;
        
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching settings:', error);
          return; 
        }

        if (data && data.user_config) {
          const config = data.user_config;
          set({
            useDefault: config.use_default ?? true,
            provider: config.provider ?? 'openai',
            apiKey: config.api_key ? '••••••••••••••••' : '',
            selectedModel: config.model ?? '', 
            jiraProjectKey: data.jira_project_key ?? '',
            notionDatabaseId: data.notion_database_id ?? '',
          });
        } else {
          set({
            useDefault: true,
            provider: 'openai',
            apiKey: '',
            selectedModel: '',
            jiraProjectKey: '',
            notionDatabaseId: '',
          });
        }
      },
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