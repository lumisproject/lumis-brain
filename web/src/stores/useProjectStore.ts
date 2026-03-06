import { create } from 'zustand';
import { supabase, API_BASE } from '@/lib/supabase';
import { useSettingsStore } from './useSettingsStore';

interface Risk {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file?: string;
}

interface Project {
  id: string;
  repo_url: string;
  repo_name?: string;
  last_commit?: string;
  status?: string;
  user_id: string;
}

interface IngestionStatus {
  status: string;
  step?: string;
  logs: string[];
  error?: string;
}

interface ProjectState {
  projects: Project[];
  project: Project | null;
  risks: Risk[];
  jiraConnected: boolean;
  notionConnected: boolean;
  ingestionStatus: IngestionStatus | null;
  loading: boolean;
  fetchProjects: (userId: string) => Promise<void>;
  selectProject: (projectId: string) => void;
  fetchJiraStatus: (userId: string) => Promise<void>;
  fetchNotionStatus: (userId: string) => Promise<void>;
  fetchRisks: (projectId: string) => Promise<void>;
  startIngestion: (userId: string, repoUrl: string) => Promise<string | null>;
  pollIngestionStatus: (projectId: string) => Promise<IngestionStatus | null>;
  disconnectJira: (userId: string) => Promise<void>;
  disconnectNotion: (userId: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  project: null,
  risks: [],
  jiraConnected: false,
  notionConnected: false,
  ingestionStatus: null,
  loading: false,

  fetchProjects: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    const projects = (data ?? []) as Project[];
    const current = get().project;
    const active = current && projects.some((p) => p.id === current.id)
      ? current
      : projects[0] ?? null;
    set({ projects, project: active, loading: false });
  },

  selectProject: (projectId) => {
    const { projects } = get();
    const next = projects.find((p) => p.id === projectId) ?? null;
    set({ project: next, risks: [] });
  },

  fetchJiraStatus: async (userId) => {
    const { data } = await supabase
      .from('jira_tokens')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    set({ jiraConnected: !!data });
  },

  // --- NEW NOTION LOGIC ---
  fetchNotionStatus: async (userId) => {
    const { data } = await supabase
      .from('notion_tokens')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    set({ notionConnected: !!data });
  },

  fetchRisks: async (projectId) => {
    try {
      const res = await fetch(`${API_BASE}/api/get_risks/${projectId}`);
      const data = await res.json();
      const apiRisks = (data?.risks ?? []) as any[];

      const normalizedRisks = apiRisks.map((risk) => {
        const severityRaw = String(risk.severity ?? 'medium').toLowerCase();
        
        // Add the 'as "high" | "medium" | "low"' assertion here:
        const severity = (
          severityRaw === 'high' || severityRaw === 'low' || severityRaw === 'medium' 
            ? severityRaw 
            : 'medium'
        ) as 'high' | 'medium' | 'low';

        return {
          id: risk.id ?? `${risk.project_id ?? 'project'}-${risk.risk_type ?? 'risk'}`,
          severity,
          title: risk.title ?? risk.risk_type ?? 'Risk',
          description: risk.description ?? '',
          file: risk.file ?? risk.file_path ?? undefined,
        };
      });

      set({ risks: normalizedRisks });
    } catch {
      set({ risks: [] });
    }
  },

  startIngestion: async (userId, repoUrl) => {
    // Add logic to get config settings
    const settings = useSettingsStore.getState();
    const userConfig = settings.useDefault
        ? { user_id: userId }
        : {
            provider: settings.provider,
            api_key: settings.apiKey,
            model: settings.selectedModel,
            user_id: userId,
          };

    try {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Append user_config to the POST body
        body: JSON.stringify({ user_id: userId, repo_url: repoUrl, user_config: userConfig }),
      });
      const data = await res.json();
      return data.project_id || null;
    } catch {
      return null;
    }
  },

  pollIngestionStatus: async (projectId) => {
    try {
      const res = await fetch(`${API_BASE}/api/ingest/status/${projectId}`);
      const data = await res.json();
      set({ ingestionStatus: data });
      return data;
    } catch {
      return null;
    }
  },

  disconnectJira: async (userId) => {
    try {
      await fetch(`${API_BASE}/api/jira/disconnect/${userId}`, { method: 'DELETE' });
      set({ jiraConnected: false });
    } catch { /* ignore */ }
  },

  // --- NEW NOTION LOGIC ---
  disconnectNotion: async (userId) => {
    try {
      await fetch(`${API_BASE}/api/notion/disconnect/${userId}`, { method: 'DELETE' });
      set({ notionConnected: false });
    } catch { /* ignore */ }
  },
}));