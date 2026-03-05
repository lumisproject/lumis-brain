import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface SettingsState {
  useDefault: boolean;
  provider: string;
  apiKey: string;
  selectedModel: string;
  jiraProjectKey: string;
  notionDatabaseId: string;
  setSettings: (settings: Partial<SettingsState>) => void;
  updateSetting: (userId: string, key: string, value: any) => Promise<void>;
  fetchSettings: (userId: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  useDefault: true,
  provider: 'openrouter',
  apiKey: '',
  selectedModel: 'stepfun/step-3.5-flash:free',
  jiraProjectKey: '',
  notionDatabaseId: '',

  setSettings: (settings) => set(settings),

  updateSetting: async (userId, key, value) => {
    set({ [key]: value });
    if (!userId) return;

    const current = get();
    const payload = {
      user_id: userId,
      use_default: key === 'useDefault' ? value : current.useDefault,
      provider: key === 'provider' ? value : current.provider,
      api_key: key === 'apiKey' ? value : current.apiKey,
      selected_model: key === 'selectedModel' ? value : current.selectedModel,
      jira_project_key: key === 'jiraProjectKey' ? value : current.jiraProjectKey,
      notion_database_id: key === 'notionDatabaseId' ? value : current.notionDatabaseId,
    };

    const { error } = await supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' });
      
    if (error) {
      console.error('Error saving settings:', error);
    }
  },

  fetchSettings: async (userId) => {
    if (!userId) return;
    
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      set({
        useDefault: data.use_default ?? true,
        provider: data.provider ?? 'openrouter',
        apiKey: data.api_key ?? '',
        selectedModel: data.selected_model ?? 'stepfun/step-3.5-flash:free',
        jiraProjectKey: data.jira_project_key ?? '',
        notionDatabaseId: data.notion_database_id ?? '',
      });
    } else {
      set({
        useDefault: true,
        provider: 'openrouter',
        apiKey: '',
        selectedModel: 'stepfun/step-3.5-flash:free',
        jiraProjectKey: '',
        notionDatabaseId: '',
      });
    }
  },
}));