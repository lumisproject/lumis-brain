import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '@/stores/useUserStore';

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useUserStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-muted-foreground font-mono text-sm">Loading session...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
};
