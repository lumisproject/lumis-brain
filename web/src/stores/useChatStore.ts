import { create } from 'zustand';
import { API_BASE } from '@/lib/supabase';
import { useSettingsStore } from './useSettingsStore';

interface ChatMessage {
  role: 'user' | 'lumis';
  content: string;
  isThinking?: boolean;
  thinkingText?: string;
}

interface ChatState {
  messages: ChatMessage[];
  chatMode: 'single-turn' | 'multi-turn';
  reasoningEnabled: boolean;
  sending: boolean;
  setChatMode: (mode: 'single-turn' | 'multi-turn') => void;
  setReasoningEnabled: (enabled: boolean) => void;
  sendMessage: (query: string, projectId: string, userId: string) => Promise<void>;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  chatMode: 'single-turn',
  reasoningEnabled: false,
  sending: false,

  setChatMode: (mode) => set({ chatMode: mode }),
  setReasoningEnabled: (enabled) => set({ reasoningEnabled: enabled }),

  sendMessage: async (query, projectId, userId) => {
    const { chatMode, reasoningEnabled } = get();
    const settings = useSettingsStore.getState();

    const userMessage: ChatMessage = { role: 'user', content: query };
    const thinkingMessage: ChatMessage = {
      role: 'lumis',
      content: '',
      isThinking: true,
      thinkingText: 'Analyzing your codebase...',
    };

    set((s) => ({
      messages: [...s.messages, userMessage, thinkingMessage],
      sending: true,
    }));

    try {
      const userConfig = settings.useDefault
        ? { user_id: userId }
        : {
            provider: settings.provider,
            api_key: settings.apiKey,
            model: settings.selectedModel,
            user_id: userId,
            reasoning_enabled: reasoningEnabled,
            mode: chatMode,
            projectId: projectId,
          };

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          query,
          mode: chatMode,
          reasoning: reasoningEnabled,
          user_config: userConfig,
        }),
      });

      const data = await res.json();
      set((s) => ({
        messages: s.messages.map((m) =>
          m.isThinking
            ? { role: 'lumis' as const, content: data.response || 'No response received.' }
            : m
        ),
        sending: false,
      }));
    } catch {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.isThinking
            ? { role: 'lumis' as const, content: 'Failed to get a response. Check your connection.' }
            : m
        ),
        sending: false,
      }));
    }
  },

  clearMessages: () => set({ messages: [] }),
}));
