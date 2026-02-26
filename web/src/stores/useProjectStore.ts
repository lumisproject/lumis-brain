import { create } from 'zustand';
import { supabase, API_BASE } from '@/lib/supabase';

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
  project: Project | null;
  risks: Risk[];
  jiraConnected: boolean;
  ingestionStatus: IngestionStatus | null;
  loading: boolean;
  fetchProject: (userId: string) => Promise<void>;
  fetchJiraStatus: (userId: string) => Promise<void>;
  fetchRisks: (projectId: string) => Promise<void>;
  startIngestion: (userId: string, repoUrl: string) => Promise<string | null>;
  pollIngestionStatus: (projectId: string) => Promise<IngestionStatus | null>;
  disconnectJira: (userId: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  risks: [],
  jiraConnected: false,
  ingestionStatus: null,
  loading: false,

  fetchProject: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    set({ project: data, loading: false });
  },

  fetchJiraStatus: async (userId) => {
    const { data } = await supabase
      .from('jira_tokens')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    set({ jiraConnected: !!data });
  },

  fetchRisks: async (projectId) => {
    try {
      const res = await fetch(`${API_BASE}/api/risks/${projectId}`);
      const data = await res.json();
      const apiRisks = (data?.risks ?? []) as any[];

      const normalizedRisks = apiRisks.map((risk) => {
        const severityRaw = String(risk.severity ?? 'medium').toLowerCase();
        const severity =
          severityRaw === 'high' || severityRaw === 'low' || severityRaw === 'medium'
            ? severityRaw
            : 'medium';

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
    try {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, repo_url: repoUrl }),
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
}));
