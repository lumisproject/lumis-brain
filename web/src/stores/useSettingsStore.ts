import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  useDefault: boolean;
  provider: string;
  apiKey: string;
  selectedModel: string;
  setUseDefault: (val: boolean) => void;
  setProvider: (val: string) => void;
  setApiKey: (val: string) => void;
  setSelectedModel: (val: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      useDefault: true,
      provider: 'openrouter',
      apiKey: '',
      selectedModel: 'stepfun/step-3.5-flash:free',
      setUseDefault: (val) => set({ useDefault: val }),
      setProvider: (val) => set({ provider: val }),
      setApiKey: (val) => set({ apiKey: val }),
      setSelectedModel: (val) => set({ selectedModel: val }),
    }),
    { name: 'lumis-settings' }
  )
);
