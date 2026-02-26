import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Bot, User } from 'lucide-react';
import { useState } from 'react';

interface ChatMessageProps {
  role: 'user' | 'lumis';
  content: string;
  isThinking?: boolean;
  thinkingText?: string;
}

const CopyButton = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 rounded-md bg-secondary p-1.5 text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

export const ChatMessage = ({ role, content, isThinking, thinkingText }: ChatMessageProps) => {
  const isUser = role === 'user';

  if (isThinking) {
    return (
      <div className="flex w-full justify-start px-4 py-3">
        <div className="flex max-w-3xl items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground font-mono shadow-sm">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
            </div>
            <span>{thinkingText}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full px-4 py-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex max-w-3xl items-start gap-3 ${
          isUser ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
          }`}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
        <div
          className={`min-w-0 rounded-2xl border px-3 py-2 text-sm leading-relaxed shadow-sm ${
            isUser
              ? 'bg-primary text-primary-foreground border-primary/40'
              : 'bg-card text-card-foreground border-border/60'
          }`}
        >
          <div className="space-y-2">
            <ReactMarkdown
              components={{
              p({ children }) {
                return <p className="whitespace-pre-wrap">{children}</p>;
              },
              ul({ children }) {
                return <ul className="list-disc pl-5 space-y-1">{children}</ul>;
              },
              ol({ children }) {
                return <ol className="list-decimal pl-5 space-y-1">{children}</ol>;
              },
              li({ children }) {
                return <li className="whitespace-pre-wrap">{children}</li>;
              },
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const codeStr = String(children).replace(/\n$/, '');
                if (match) {
                  return (
                    <div className="relative my-3 overflow-hidden rounded-xl border border-border/70 bg-background/90">
                      <div className="flex items-center justify-between border-b border-border/70 bg-muted px-4 py-1.5 text-[0.7rem] font-mono uppercase tracking-wide text-muted-foreground">
                        <span>{match[1]}</span>
                      </div>
                      <CopyButton code={codeStr} />
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: 0,
                          fontSize: '0.8rem',
                          background: 'hsl(220 20% 8%)',
                        }}
                      >
                        {codeStr}
                      </SyntaxHighlighter>
                    </div>
                  );
                }
                return (
                  <code
                    className="rounded bg-muted px-1.5 py-0.5 text-[0.75rem] font-mono"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
            }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
};
