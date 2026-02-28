import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Sparkles } from 'lucide-react';

export const Navbar = ({ showAuth = true }: { showAuth?: boolean }) => {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border/50 glass-panel">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg tracking-tight">Lumis.</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {showAuth && (
            <>
              <Link
                to="/login"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
