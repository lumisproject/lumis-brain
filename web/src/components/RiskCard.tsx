import ReactMarkdown from 'react-markdown';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';

interface RiskCardProps {
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file?: string;
}

const severityConfig = {
  high: { icon: ShieldAlert, color: 'text-risk-high', bg: 'bg-risk-high/10', border: 'border-risk-high/30', label: 'High' },
  medium: { icon: AlertTriangle, color: 'text-risk-medium', bg: 'bg-risk-medium/10', border: 'border-risk-medium/30', label: 'Medium' },
  low: { icon: ShieldCheck, color: 'text-risk-low', bg: 'bg-risk-low/10', border: 'border-risk-low/30', label: 'Low' },
};

export const RiskCard = ({ severity, title, description, file }: RiskCardProps) => {
  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <div className={`group relative overflow-hidden rounded-xl border ${config.border} bg-card/50 p-4 transition-all hover:bg-card hover:shadow-lg hover:shadow-black/20 animate-fade-in-up`}>
      {/* Background glow */}
      <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full ${config.bg} blur-2xl transition-opacity group-hover:opacity-100 opacity-50`} />

      <div className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-md ${config.bg} border ${config.border}`}>
              <Icon className={`h-3.5 w-3.5 ${config.color}`} />
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${config.color}`}>
              {config.label} Priority
            </span>
          </div>
          {file && (
            <div className="flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground border border-border/50">
              {file.split('/').pop()}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <h4 className="text-sm font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
            {title}
          </h4>
          {file && (
            <p className="text-[10px] text-muted-foreground/70 font-mono truncate" title={file}>
              {file}
            </p>
          )}
        </div>

        <div className="relative">
          <div className="text-xs leading-relaxed text-muted-foreground prose prose-xs dark:prose-invert max-w-none line-clamp-3 group-hover:line-clamp-none transition-all duration-300">
            <ReactMarkdown>{description}</ReactMarkdown>
          </div>
          <div className="absolute bottom-0 left-0 h-4 w-full bg-gradient-to-t from-card/50 to-transparent group-hover:opacity-0 transition-opacity" />
        </div>
      </div>

      {/* Side indicator */}
      <div className={`absolute left-0 top-0 h-full w-1 ${config.color.replace('text-', 'bg-')} opacity-40`} />
    </div>
  );
};
