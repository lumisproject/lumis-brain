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
import { ArrowLeft, Unplug, Plug } from 'lucide-react';
import { useEffect } from 'react';
import { API_BASE } from '@/lib/supabase';

const SettingsContent = () => {
  const navigate = useNavigate();
  const { user } = useUserStore();
  const { jiraConnected, fetchJiraStatus, disconnectJira } = useProjectStore();
  const {
    useDefault,
    provider,
    apiKey,
    selectedModel,
    setUseDefault,
    setProvider,
    setApiKey,
    setSelectedModel,
  } = useSettingsStore();

  const userId = user?.id || '';

  useEffect(() => {
    if (userId) fetchJiraStatus(userId);
  }, [userId, fetchJiraStatus]);

  const handleJiraConnect = () => {
    window.location.href = `${API_BASE}/auth/jira/connect?state=${userId}`;
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
              <p className="text-xs text-muted-foreground mt-0.5">
                Let Lumis choose the best model for you.
              </p>
            </div>
            <Switch checked={useDefault} onCheckedChange={setUseDefault} />
          </div>

          {!useDefault && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                <Input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Model ID</Label>
                <Input
                  placeholder="stepfun/step-3.5-flash:free"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Jira Integration */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="font-semibold text-lg">Jira Integration</h2>
          <p className="text-sm text-muted-foreground">
            {jiraConnected
              ? 'Your Jira workspace is connected.'
              : 'Connect your Jira workspace to map issues to code.'}
          </p>
          {jiraConnected ? (
            <Button variant="outline" onClick={() => disconnectJira(userId)}>
              <Unplug className="mr-2 h-4 w-4" /> Disconnect
            </Button>
          ) : (
            <Button onClick={handleJiraConnect}>
              <Plug className="mr-2 h-4 w-4" /> Connect Jira
            </Button>
          )}
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
