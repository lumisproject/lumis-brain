import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/stores/useProjectStore';
import { useUserStore } from '@/stores/useUserStore';
import { useChatStore } from '@/stores/useChatStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Github, Plus, Check, RefreshCw } from 'lucide-react';
import { API_BASE } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export const ProjectSwitcher = () => {
  const { projects, project, selectProject, startIngestion, fetchProjects } = useProjectStore();
  const { user } = useUserStore();
  const clearMessages = useChatStore((s) => s.clearMessages);
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const userId = user?.id as string | undefined;

  const handleSelectProject = (projectId: string) => {
    if (projectId === project?.id) return;
    selectProject(projectId);
    clearMessages();
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const ownerId = userId ?? projects[0]?.user_id;
    if (!repoUrl || !ownerId) return;
    setAdding(true);
    const projectId = await startIngestion(ownerId, repoUrl);
    setAdding(false);
    setAddOpen(false);
    setRepoUrl('');
    if (projectId) navigate(`/syncing?project_id=${projectId}`);
  };

  const handleDeleteProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !userId) return;

    // Update this to prioritize repo_name just like the UI does
    const expectedSlug = project.repo_name || project.repo_url
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\/$/, '');

    if (deleteConfirm !== expectedSlug) return;

    setDeleting(true);
    try {
      await fetch(`${API_BASE}/api/projects/${userId}/${project.id}`, {
        method: 'DELETE',
      });

      // Refresh projects and clear chat context
      await fetchProjects(userId);
      clearMessages();

      setDeleteOpen(false);
      setDeleteConfirm('');
    } finally {
      setDeleting(false);
    }
  };

  const displayName = (p: { repo_name?: string; repo_url: string }) =>
    p.repo_name || p.repo_url.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');

  if (projects.length === 0) return null;

  const currentSlug = project ? displayName(project) : '';

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 min-w-[180px] justify-between gap-2 border-border/60 bg-muted/30 px-3 font-medium hover:bg-muted/50"
        >
          <div className="flex items-center gap-2 truncate">
            <Github className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm">
              {project ? displayName(project) : 'Select project'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Your projects
        </DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => handleSelectProject(p.id)}
            className="flex items-center gap-2"
          >
            {project?.id === p.id ? (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <span className="h-4 w-4 shrink-0" />
            )}
            <span className={cn("truncate", project?.id === p.id && "font-semibold")}>
              {displayName(p)}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => setAddOpen(true)}
          className="text-primary focus:text-primary"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add new project
        </DropdownMenuItem>
        {project && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              Delete current project
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add new project</DialogTitle>
          <DialogDescription>
            Paste a GitHub repository URL to ingest a new codebase.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleAddProject} className="flex flex-col gap-4">
          <Input
            placeholder="https://github.com/user/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
          <Button type="submit" disabled={adding || !repoUrl}>
            {adding ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Ingest repository
          </Button>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog
      open={deleteOpen}
      onOpenChange={(open) => {
        setDeleteOpen(open);
        if (!open) {
          setDeleteConfirm('');
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            To confirm, type {" "}
            <span className="font-mono">{currentSlug || "this project"}</span>{" "},
            all associated data will be permanently deleted.{" "}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleDeleteProject} className="flex flex-col gap-4">
          <Input
            placeholder="owner/repo"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
          />
          <Button
            type="submit"
            variant="destructive"
            disabled={
              deleting ||
              !project ||
              !userId ||
              deleteConfirm !== currentSlug
            }
          >
            {deleting && (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            )}
            Permanently delete project
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </>
  );
};
