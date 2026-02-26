import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';

const JiraCallback = () => {
  const [searchParams] = useSearchParams();
  const message = searchParams.get('message') || '';
  const navigate = useNavigate();
  const isSuccess = message.toLowerCase().includes('success') || !message.toLowerCase().includes('error');

  useEffect(() => {
    const timer = setTimeout(() => navigate('/dashboard'), 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4 animate-fade-in-up">
        {isSuccess ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-terminal-fg" />
        ) : (
          <XCircle className="mx-auto h-12 w-12 text-destructive" />
        )}
        <h2 className="text-xl font-semibold">{message || 'Processing...'}</h2>
        <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
      </div>
    </div>
  );
};

export default JiraCallback;
