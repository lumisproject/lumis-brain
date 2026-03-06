import { useNavigate } from 'react-router-dom';
import { supabase, API_BASE } from '@/lib/supabase';
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
import { ArrowLeft, Plug, Loader2, BookOpen, Save, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const SettingsContent = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useUserStore();
  const { 
    jiraConnected, fetchJiraStatus, disconnectJira, 
    notionConnected, fetchNotionStatus, disconnectNotion,
    project: currentProject 
  } = useProjectStore();
  
  const [availableJiraProjects, setAvailableJiraProjects] = useState<{key: string, name: string}[]>([]);
  const [loadingJiraProjects, setLoadingJiraProjects] = useState(false);
  const [availableNotionDatabases, setAvailableNotionDatabases] = useState<{id: string, name: string}[]>([]);
  const [loadingNotionDatabases, setLoadingNotionDatabases] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingConfig, setIsFetchingConfig] = useState(true);

  const {
    useDefault,
    provider,
    apiKey,
    selectedModel,
    jiraProjectKey,
    notionDatabaseId,
    setUseDefault,
    setProvider,
    setApiKey,
    setSelectedModel,
    setJiraProjectKey,
    setNotionDatabaseId
  } = useSettingsStore();

  const userId = user?.id || '';

  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localModel, setLocalModel] = useState(selectedModel);

  // Sync local state if store updates elsewhere
  useEffect(() => setLocalApiKey(apiKey), [apiKey]);
  useEffect(() => setLocalModel(selectedModel), [selectedModel]);

  const handleApiKeyBlur = () => {
    if (localApiKey !== apiKey) setApiKey(localApiKey);
  };

  const handleModelBlur = () => {
    if (localModel !== selectedModel) setSelectedModel(localModel);
  };

  // --- NEW FIX: FETCH SAVED CONFIG ON LOAD ---
  useEffect(() => {
    const fetchUserConfig = async () => {
      if (!userId) return;
      setIsFetchingConfig(true);
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('user_config')
          .eq('user_id', userId)
          .maybeSingle();

        if (data && data.user_config) {
          const config = data.user_config;
          // Apply saved settings
          setUseDefault(config.use_default !== false); // Default to true if missing
          if (config.provider) setProvider(config.provider);
          if (config.model) {
            setSelectedModel(config.model);
            setLocalModel(config.model);
          }
          if (config.api_key) {
            // Never put the encrypted string in the UI, just show the mask
            setApiKey("••••••••••••••••");
            setLocalApiKey("••••••••••••••••");
          }
        } else {
          // If no config exists in the database for this user, force default mode
          setUseDefault(true);
        }
      } catch (err) {
        console.error("Failed to load user config:", err);
      } finally {
        setIsFetchingConfig(false);
      }
    };
    fetchUserConfig();
  }, [userId, setUseDefault, setProvider, setSelectedModel, setApiKey]);

  useEffect(() => {
    if (userId) {
      fetchJiraStatus(userId);
      fetchNotionStatus(userId);
    }
  }, [userId, fetchJiraStatus, fetchNotionStatus]);

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

  const handleSaveConfig = async () => {
    if (!userId) return;

    // --- NEW VALIDATION: Prevent saving empty inputs ---
    if (!useDefault) {
      if (!localApiKey?.trim() || !localModel?.trim()) {
        toast({
          title: "Missing Information",
          description: "Please provide both an API Key and a Model ID, or switch to 'System Default'.",
          variant: "destructive"
        });
        return; // Stop the function here so it doesn't save
      }
    }

    setIsSaving(true);
    try {
      // 1. GET THE TOKEN DIRECTLY FROM SUPABASE
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error("No active authentication session found. Please log in again.");
      }

      // 2. Prepare Payload
      const payload = {
        provider,
        apiKey: localApiKey, 
        selectedModel: localModel,
        useDefault,
      };

      // 3. Make the Request
      const res = await fetch(`${API_BASE}/api/settings/${userId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast({ 
          title: "Settings Saved", 
          description: "Your configuration has been encrypted and stored." 
        });
      } else {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to save");
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Could not save settings.", 
        variant: "destructive" 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleJiraConnect = () => window.location.href = `${API_BASE}/auth/jira/connect?state=${userId}`;
  const handleNotionConnect = () => window.location.href = `${API_BASE}/auth/notion/connect?state=${userId}`;

  const handleJiraProjectSelect = async (key: string) => {
    setJiraProjectKey(key);
    if (currentProject?.id) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        await fetch(`${API_BASE}/api/projects/${currentProject.id}/jira-mapping`, {
          method: 'POST', 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}` 
          },
          body: JSON.stringify({ jira_project_id: key })
        });
      } catch (error) { 
        console.error("Failed to save Jira mapping", error); 
      }
    }
    };

  const handleNotionDatabaseSelect = async (id: string) => {
    setNotionDatabaseId(id);
    if (currentProject?.id) {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        await fetch(`${API_BASE}/api/projects/${currentProject.id}/notion-mapping`, {
          method: 'POST', 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}` // Inject token
          },
          body: JSON.stringify({ notion_project_id: id })
        });
      } catch (error) { 
        console.error("Failed to save Notion mapping", error); 
      }
    }
    };

  if (isFetchingConfig) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl py-12 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          
          <Button onClick={handleSaveConfig} disabled={isSaving} className="gap-2 shadow-sm">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save LLM Settings
          </Button>
        </div>

        {/* LLM Config */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <h2 className="font-semibold text-lg">Lumis Intelligence</h2>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
            <div>
              <Label className="font-medium">Use System Default</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Use the Lumis optimized environment (recommended).</p>
            </div>
            <Switch checked={useDefault} onCheckedChange={setUseDefault} />
          </div>

          {!useDefault && (
            <div className="grid gap-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <Input 
                  type="password" 
                  placeholder={apiKey ? "••••••••••••••••" : "Paste your API key here"} 
                  value={localApiKey} 
                  onChange={(e) => setLocalApiKey(e.target.value)} 
                  onBlur={handleApiKeyBlur} 
                />
              </div>

              <div className="space-y-2">
                <Label>Model ID</Label>
                <Input 
                  placeholder="e.g. gpt-4o or claude-3-5-sonnet-latest" 
                  value={localModel} 
                  onChange={(e) => setLocalModel(e.target.value)} 
                  onBlur={handleModelBlur} 
                />
              </div>
            </div>
          )}
        </div>

        {/* Integrations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Jira */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
            <h2 className="font-semibold text-lg flex items-center gap-2">Jira <Plug className="h-4 w-4 text-blue-500" /></h2>
            <p className="text-sm text-muted-foreground">
              {jiraConnected ? 'Connected to Atlassian.' : 'Sync your tickets with AI.'}
            </p>
            
            {jiraConnected ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">Active Project</Label>
                  <Select value={jiraProjectKey} onValueChange={handleJiraProjectSelect} disabled={loadingJiraProjects || !currentProject}>
                    <SelectTrigger>
                      {loadingJiraProjects ? <Loader2 className="w-4 h-4 animate-spin" /> : <SelectValue placeholder={currentProject ? "Select Project" : "Open a project first"} />}
                    </SelectTrigger>
                    <SelectContent>
                      {availableJiraProjects.map((p) => (
                        <SelectItem key={p.key} value={p.key}>{p.name} ({p.key})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="secondary" size="sm" className="w-full text-xs" onClick={() => disconnectJira(userId)}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={handleJiraConnect}>Connect Jira</Button>
            )}
          </div>

          {/* Notion */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
            <h2 className="font-semibold text-lg flex items-center gap-2">Notion <BookOpen className="h-4 w-4" /></h2>
            <p className="text-sm text-muted-foreground">
              {notionConnected ? 'Connected to Notion.' : 'Automate your Notion docs.'}
            </p>
            
            {notionConnected ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">Active Database</Label>
                  <Select value={notionDatabaseId} onValueChange={handleNotionDatabaseSelect} disabled={loadingNotionDatabases || !currentProject}>
                    <SelectTrigger>
                      {loadingNotionDatabases ? <Loader2 className="w-4 h-4 animate-spin" /> : <SelectValue placeholder={currentProject ? "Select Database" : "Open a project first"} />}
                    </SelectTrigger>
                    <SelectContent>
                      {availableNotionDatabases.map((db) => (
                        <SelectItem key={db.id} value={db.id}>{db.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="secondary" size="sm" className="w-full text-xs" onClick={() => disconnectNotion(userId)}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={handleNotionConnect}>Connect Notion</Button>
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