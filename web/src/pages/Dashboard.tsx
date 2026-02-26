import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthGuard } from '@/components/AuthGuard';
import { useUserStore } from '@/stores/useUserStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useChatStore } from '@/stores/useChatStore';
import { ChatMessage } from '@/components/ChatMessage';
import { RiskCard } from '@/components/RiskCard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  Sparkles,
  Send,
  GitBranch,
  Webhook,
  ShieldAlert,
  Settings,
  Copy,
  Check,
  LogOut,
  RefreshCw,
  Github,
} from 'lucide-react';

const NGROK_PLACEHOLDER = 'https://unsparing-kaley-unmodest.ngrok-free.dev';

const OnboardingCard = ({ userId }: { userId: string }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const { startIngestion } = useProjectStore();
  const navigate = useNavigate();

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl) return;
    setLoading(true);
    const projectId = await startIngestion(userId, repoUrl);
    if (projectId) {
      navigate(`/syncing?project_id=${projectId}`);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Github className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Connect Your Repository</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Paste a GitHub repository URL to start ingesting your codebase.
          </p>
        </div>
        <form onSubmit={handleIngest} className="flex gap-2">
          <Input
            placeholder="https://github.com/user/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !repoUrl}>
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              'Ingest'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

const DashboardContent = () => {
  const { user, signOut } = useUserStore();
  const { project, risks, fetchProject, fetchRisks, startIngestion, loading } = useProjectStore();
  const {
    messages,
    chatMode,
    reasoningEnabled,
    sending,
    setChatMode,
    setReasoningEnabled,
    sendMessage,
  } = useChatStore();
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const userId = user?.id || '';

  useEffect(() => {
    if (userId) {
      fetchProject(userId);
    }
  }, [userId, fetchProject]);

  useEffect(() => {
    if (project?.id) {
      fetchRisks(project.id);
    }
  }, [project?.id, fetchRisks]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !project?.id || sending) return;
    sendMessage(input.trim(), project.id, userId);
    setInput('');
  };

  const handleResync = async () => {
    if (!project?.repo_url) return;
    const pid = await startIngestion(userId, project.repo_url);
    if (pid) navigate(`/syncing?project_id=${pid}`);
  };

  const webhookUrl = project
    ? `https://${NGROK_PLACEHOLDER}/api/webhook/${userId}/${project.id}`
    : '';

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-muted-foreground font-mono text-sm">Loading workspace...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return <OnboardingCard userId={userId} />;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Lumis</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main area */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left sidebar */}
        <ResizablePanel defaultSize={28} minSize={20} maxSize={40}>
          <div className="flex h-full flex-col overflow-y-auto border-r border-border">
            {/* Repo info */}
            <div className="border-b border-border p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" />
                Active Repository
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">{project.repo_name || project.repo_url}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  <span className={`h-2 w-2 rounded-full ${project.last_commit ? 'bg-terminal-fg' : 'bg-risk-medium'}`} />
                  <span className="font-mono text-muted-foreground">
                    {project.last_commit ? project.last_commit.slice(0, 7) : 'pending'}
                  </span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleResync}>
                <RefreshCw className="mr-1.5 h-3 w-3" /> Force Re-sync
              </Button>
            </div>

            {/* Webhook */}
            <div className="border-b border-border p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Webhook className="h-3.5 w-3.5" />
                Webhook URL
              </div>
              <div className="flex gap-1">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="text-xs font-mono h-8"
                />
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copyWebhook}>
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>

            {/* Risk Monitor */}
            <div className="flex-1 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" />
                Risk Monitor
              </div>
              {risks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No risks detected yet.</p>
              ) : (
                <div className="space-y-2">
                  {risks.map((risk) => (
                    <RiskCard
                      key={risk.id}
                      severity={risk.severity}
                      title={risk.title}
                      description={risk.description}
                      file={risk.file}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center chat */}
        <ResizablePanel defaultSize={72} minSize={50}>
          <div className="flex h-full flex-col">
            {/* Chat header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Mode</Label>
                  <div className="flex rounded-md border border-border text-xs">
                    <button
                      onClick={() => setChatMode('single-turn')}
                      className={`px-2.5 py-1 rounded-l-md transition-colors ${
                        chatMode === 'single-turn'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Single
                    </button>
                    <button
                      onClick={() => setChatMode('multi-turn')}
                      className={`px-2.5 py-1 rounded-r-md transition-colors ${
                        chatMode === 'multi-turn'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Multi
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Reasoning</Label>
                  <Switch
                    checked={reasoningEnabled}
                    onCheckedChange={setReasoningEnabled}
                    className="scale-75"
                  />
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 animate-float">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold">Ask Lumis anything</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Query your codebase in natural language. Lumis has full context.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <ChatMessage key={i} {...msg} />
                  ))}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border p-4">
              <form onSubmit={handleSend} className="flex gap-2">
                <Input
                  placeholder="Ask about your codebase..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={sending}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={sending || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

const Dashboard = () => (
  <AuthGuard>
    <DashboardContent />
  </AuthGuard>
);

export default Dashboard;
