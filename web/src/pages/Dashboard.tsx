import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthGuard } from '@/components/AuthGuard';
import { useUserStore } from '@/stores/useUserStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useChatStore } from '@/stores/useChatStore';
import { ChatMessage } from '@/components/ChatMessage';
import { RiskCard } from '@/components/RiskCard';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
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
  ExternalLink,
} from 'lucide-react';

const NGROK_PLACEHOLDER = 'unsparing-kaley-unmodest.ngrok-free.dev';

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
  const { project, risks, fetchProjects, fetchRisks, startIngestion, loading } = useProjectStore();
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
      fetchProjects(userId);
    }
  }, [userId, fetchProjects]);

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
    <div className="flex h-screen flex-col bg-background bg-mesh grain">
      {/* Top bar */}
      <header className="flex h-14 items-center justify-between border-b border-border/60 bg-background/95 Backdrop-blur-md px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/20">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight">Lumis</span>
            <span className="text-[10px] text-muted-foreground font-medium -mt-1 uppercase tracking-widest">Platform</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ProjectSwitcher />
          <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 px-3 py-1 mr-2">
            <div className="h-1.5 w-1.5 rounded-full bg-terminal-fg animate-pulse" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Engine Active</span>
          </div>
          <ThemeToggle />
          <div className="h-4 w-[1px] bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-muted/60" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-destructive/10 hover:text-destructive group" onClick={signOut}>
            <LogOut className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </header>

      {/* Main area */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left sidebar */}
        <ResizablePanel defaultSize={28} minSize={20} maxSize={40}>
          <div className="flex h-full flex-col overflow-y-auto border-r border-border">
            {/* Repo info */}
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                <GitBranch className="h-3 w-3" />
                Active Source
              </div>
              <div className="group relative rounded-xl border border-border/50 bg-secondary/10 p-5 transition-all hover:border-primary/40 hover:bg-secondary/20 shadow-sm overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={project.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-background border border-border shadow-sm text-muted-foreground hover:text-primary hover:border-primary/50 transition-all hover:scale-110 active:scale-95"
                    title="Open Repository"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>

                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                        <Github className="h-4 w-4 text-primary" />
                      </div>
                      <p className="font-bold text-sm text-foreground tracking-tight truncate" title={project.repo_name || project.repo_url}>
                        {project.repo_name || project.repo_url.replace('https://github.com/', '')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 pl-1">
                      <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 border border-border/50 transition-colors group-hover:bg-muted/60 max-w-full overflow-hidden">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${project.last_commit ? 'bg-terminal-fg shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-risk-medium animate-pulse'}`} />
                        <span className="font-mono text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider truncate">
                          Commit: {project.last_commit ? project.last_commit.slice(0, 7) : 'synchronizing...'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 opacity-60 group-hover:opacity-100 transition-all">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md"
                      onClick={handleResync}
                    >
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Sync Base
                    </Button>
                    <span className="text-[9px] font-medium text-muted-foreground/30 uppercase tracking-tighter">
                      Git Integration
                    </span>
                  </div>
                </div>

                {/* Decorative background element */}
                <div className="absolute -bottom-4 -right-4 h-16 w-16 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
              </div>
            </div>

            {/* Webhook */}
            <div className="border-b border-border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                  <Webhook className="h-3.5 w-3.5" />
                  Integration
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full relative overflow-hidden group hover:border-primary/50 transition-all"
                onClick={copyWebhook}
              >
                <div className="flex items-center gap-2">
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-terminal-fg" />
                      <span className="text-terminal-fg font-medium">Copied to Clipboard</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Webhook URL</span>
                    </>
                  )}
                </div>
                {copied && (
                  <div className="absolute inset-0 bg-terminal-fg/10 animate-pulse-slow" />
                )}
              </Button>
              <p className="text-[10px] text-muted-foreground/60 leading-tight">
                Use this endpoint for GitHub Webhook events (push, pull_request) to sync changes automatically.
              </p>
            </div>

            {/* Risk Monitor */}
            <div className="flex-1 p-5 space-y-4 bg-muted/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                  <ShieldAlert className="h-3 w-3" />
                  Security Guard
                </div>
                {risks.length > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-risk-high/10 px-2 py-0.5 text-[10px] font-bold text-risk-high animate-pulse">
                    {risks.length} Issues
                  </span>
                )}
              </div>
              {risks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 opacity-50">
                  <div className="h-10 w-10 rounded-full border border-dashed border-border flex items-center justify-center">
                    <Check className="h-5 w-5" />
                  </div>
                  <p className="text-[10px] font-medium uppercase tracking-wider">System Secure</p>
                </div>
              ) : (
                <div className="space-y-3 pb-6">
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
            <div className="flex items-center justify-between border-b border-border/50 bg-background/50 backdrop-blur-sm px-6 py-3">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Memory</span>
                  <div className="flex p-0.5 rounded-lg bg-muted/50 border border-border">
                    <button
                      onClick={() => setChatMode('single-turn')}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${chatMode === 'single-turn'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      OFF
                    </button>
                    <button
                      onClick={() => setChatMode('multi-turn')}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${chatMode === 'multi-turn'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      ON
                    </button>
                  </div>
                </div>
                <div className="h-4 w-[1px] bg-border" />
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Reasoning</span>
                  <Switch
                    checked={reasoningEnabled}
                    onCheckedChange={setReasoningEnabled}
                    className="scale-90 data-[state=checked]:bg-primary"
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
            <div className="p-6 bg-gradient-to-t from-background via-background to-transparent sticky bottom-0">
              <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-end gap-3 rounded-2xl border border-border/60 bg-card p-2 shadow-2xl shadow-black/20 focus-within:border-primary/50 transition-all">
                <div className="flex-1 px-3 py-1">
                  <textarea
                    placeholder="Ask Lumis about the codebase architecture or specific logic..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                    disabled={sending}
                    className="w-full bg-transparent text-sm resize-none focus:outline-none min-h-[44px] max-h-[200px] py-2"
                  />
                </div>
                <Button
                  type="submit"
                  size="icon"
                  disabled={sending || !input.trim()}
                  className="h-10 w-10 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20"
                >
                  {sending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
              <p className="mt-3 text-center text-[10px] text-muted-foreground/50 font-medium uppercase tracking-[0.2em]">
                Lumis v1.0 • Generative Engine Powered
              </p>
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
