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
    <div className={`rounded-lg border ${config.border} ${config.bg} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${config.color}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${config.color}`}>
          {config.label}
        </span>
      </div>
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      {file && (
        <p className="text-xs text-muted-foreground font-mono">{file}</p>
      )}
      <div className="text-xs text-muted-foreground prose prose-xs dark:prose-invert max-w-none">
        <ReactMarkdown>{description}</ReactMarkdown>
      </div>
    </div>
  );
};
