import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/stores/useProjectStore';

const Syncing = () => {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');
  const { pollIngestionStatus, ingestionStatus } = useProjectStore();
  const navigate = useNavigate();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [localLogs, setLocalLogs] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!projectId) {
      navigate('/dashboard');
      return;
    }

    intervalRef.current = setInterval(async () => {
      const data = await pollIngestionStatus(projectId);
      if (data) {
        setLocalLogs(data.logs || []);
        if (data.status === 'completed' || data.logs?.some((l: string) => l.includes('DONE'))) {
          clearInterval(intervalRef.current);
          setTimeout(() => navigate('/dashboard'), 800);
        }
      }
    }, 1200);

    return () => clearInterval(intervalRef.current);
  }, [projectId, navigate, pollIngestionStatus]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localLogs]);

  const colorize = (line: string) => {
    if (line.includes('ERROR') || line.includes('❌')) return 'text-destructive';
    if (line.includes('SUCCESS') || line.includes('✅') || line.includes('DONE')) return 'text-terminal-fg';
    if (line.includes('WARNING') || line.includes('⚠️')) return 'text-risk-medium';
    if (line.includes('🤔')) return 'text-primary';
    return 'text-foreground/70';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl">
        <div className="terminal-window">
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-destructive/60" />
              <span className="h-3 w-3 rounded-full bg-risk-medium/60" />
              <span className="h-3 w-3 rounded-full bg-terminal-fg/60" />
            </div>
            <span className="ml-2 text-xs text-muted-foreground">lumis — ingestion</span>
          </div>

          {/* Terminal body */}
          <div className="h-[500px] overflow-y-auto p-4 bg-terminal">
            <div className="mb-2 text-muted-foreground text-xs">
              $ lumis ingest --project {projectId}
            </div>
            {localLogs.map((line, i) => (
              <div key={i} className={`terminal-line ${colorize(line)}`}>
                {line}
              </div>
            ))}
            {ingestionStatus?.status !== 'completed' && (
              <div className="terminal-line flex items-center gap-1">
                <span className="animate-blink text-terminal-cursor">▊</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {ingestionStatus?.status === 'completed' && (
          <p className="mt-4 text-center text-sm text-terminal-fg font-mono animate-fade-in-up">
            ✅ Ingestion complete. Redirecting to dashboard...
          </p>
        )}
      </div>
    </div>
  );
};

export default Syncing;
