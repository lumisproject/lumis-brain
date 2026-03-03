import { useNavigate } from 'react-router-dom';
import { AuthGuard } from '@/components/AuthGuard';
import { useUserStore } from '@/stores/useUserStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Unplug, Plug, Loader2, BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/supabase';

const SettingsContent = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const { 
    jiraConnected, fetchJiraStatus, disconnectJira, 
    notionConnected, fetchNotionStatus, disconnectNotion, // <-- NEW
    project: currentProject 
  } = useProjectStore();
  
  // Local state for fetching Jira projects & Notion databases
  const [availableJiraProjects, setAvailableJiraProjects] = useState<{key: string, name: string}[]>([]);
  const [loadingJiraProjects, setLoadingJiraProjects] = useState(false);
  
  const [availableNotionDatabases, setAvailableNotionDatabases] = useState<{id: string, name: string}[]>([]); // <-- NEW
  const [loadingNotionDatabases, setLoadingNotionDatabases] = useState(false); // <-- NEW

  const {
    useDefault,
    provider,
    apiKey,
    selectedModel,
    jiraProjectKey,
    notionDatabaseId, // <-- NEW
    setUseDefault,
    setProvider,
    setApiKey,
    setSelectedModel,
    setJiraProjectKey,
    setNotionDatabaseId // <-- NEW
  } = useSettingsStore();

  const userId = user?.id || '';

  // Fetch connection statuses on load
  useEffect(() => {
    if (userId) {
      fetchJiraStatus(userId);
      fetchNotionStatus(userId);
    }
  }, [userId, fetchJiraStatus, fetchNotionStatus]);

  // Fetch available Jira projects
  useEffect(() => {
    const fetchJiraProjects = async () => {
      if (jiraConnected && userId) {
        setLoadingJiraProjects(true);
        try {
          const res = await fetch(`${API_BASE}/api/jira/projects/${userId}`);
          if (res.ok) setAvailableJiraProjects(await res.json());
        } catch (error) { console.error("Failed to fetch Jira projects:", error); } 
        finally { setLoadingJiraProjects(false); }
      }
    };
    fetchJiraProjects();
  }, [jiraConnected, userId]);

  // Fetch available Notion Databases
  useEffect(() => {
    const fetchNotionDatabases = async () => {
      if (notionConnected && userId) {
        setLoadingNotionDatabases(true);
        try {
          const res = await fetch(`${API_BASE}/api/notion/databases/${userId}`);
          if (res.ok) setAvailableNotionDatabases(await res.json());
        } catch (error) { console.error("Failed to fetch Notion databases:", error); } 
        finally { setLoadingNotionDatabases(false); }
      }
    };
    fetchNotionDatabases();
  }, [notionConnected, userId]);

  const handleJiraConnect = () => window.location.href = `${API_BASE}/auth/jira/connect?state=${userId}`;
  const handleNotionConnect = () => window.location.href = `${API_BASE}/auth/notion/connect?state=${userId}`; // <-- NEW

  const handleJiraProjectSelect = async (key: string) => {
    setJiraProjectKey(key);
    if (currentProject?.id) {
      try {
        await fetch(`${API_BASE}/api/projects/${currentProject.id}/jira-mapping`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jira_project_id: key })
        });
      } catch (error) { console.error("Failed to save Jira mapping", error); }
    }
  };

  const handleNotionDatabaseSelect = async (id: string) => {
    setNotionDatabaseId(id);
    if (currentProject?.id) {
      try {
        await fetch(`${API_BASE}/api/projects/${currentProject.id}/notion-mapping`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notion_database_id: id })
        });
      } catch (error) { console.error("Failed to save Notion mapping", error); }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl py-12 space-y-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        {/* LLM Config */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h2 className="font-semibold text-lg">LLM Configuration</h2>

          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Use System Default</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Let Lumis choose the best model for you.</p>
            </div>
            <Switch checked={useDefault} onCheckedChange={setUseDefault} />
          </div>

          {!useDefault && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <Input type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Model ID</Label>
                <Input placeholder="stepfun/step-3.5-flash:free" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Integrations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Jira Integration */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">Jira <Plug className="h-4 w-4 text-blue-500" /></h2>
            <p className="text-sm text-muted-foreground">
              {jiraConnected ? 'Workspace connected.' : 'Map issues to code.'}
            </p>
            
            {jiraConnected ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Target Project</Label>
                  <Select value={jiraProjectKey} onValueChange={handleJiraProjectSelect} disabled={loadingJiraProjects}>
                    <SelectTrigger>
                      {loadingJiraProjects ? <Loader2 className="w-4 h-4 animate-spin" /> : <SelectValue placeholder="Select a Jira Project" />}
                    </SelectTrigger>
                    <SelectContent>
                      {availableJiraProjects.map((p) => (
                        <SelectItem key={p.key} value={p.key}>{p.name} ({p.key})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!currentProject?.id && <p className="text-xs text-yellow-500 mt-1">Open a project first to save mapping.</p>}
                </div>
                <Button variant="outline" className="w-full" onClick={() => disconnectJira(userId)}>
                  <Unplug className="mr-2 h-4 w-4" /> Disconnect
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={handleJiraConnect}>Connect Jira</Button>
            )}
          </div>

          {/* Notion Integration (NEW) */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">Notion <BookOpen className="h-4 w-4 text-black dark:text-white" /></h2>
            <p className="text-sm text-muted-foreground">
              {notionConnected ? 'Workspace connected.' : 'Sync tasks with databases.'}
            </p>
            
            {notionConnected ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Target Database</Label>
                  <Select value={notionDatabaseId} onValueChange={handleNotionDatabaseSelect} disabled={loadingNotionDatabases}>
                    <SelectTrigger>
                      {loadingNotionDatabases ? <Loader2 className="w-4 h-4 animate-spin" /> : <SelectValue placeholder="Select a Database" />}
                    </SelectTrigger>
                    <SelectContent>
                      {availableNotionDatabases.map((db) => (
                        <SelectItem key={db.id} value={db.id}>{db.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!currentProject?.id && <p className="text-xs text-yellow-500 mt-1">Open a project first to save mapping.</p>}
                </div>
                <Button variant="outline" className="w-full" onClick={() => disconnectNotion(userId)}>
                  <Unplug className="mr-2 h-4 w-4" /> Disconnect
                </Button>
              </div>
            ) : (
              <Button className="w-full bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200" onClick={handleNotionConnect}>
                Connect Notion
              </Button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

const SettingsPage = () => (
  <AuthGuard>
    <SettingsContent />
  </AuthGuard>
);

export default SettingsPage;