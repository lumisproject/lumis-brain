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
      <div className="flex w-full justify-start px-6 py-4 animate-in fade-in slide-in-from-left-4">
        <div className="flex max-w-3xl items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 shadow-sm">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Lumis Intelligence</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground font-mono backdrop-blur-sm">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
              </div>
              <span className="opacity-70">{thinkingText}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full px-6 py-5 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
      <div
        className={`flex max-w-[85%] sm:max-w-3xl items-start gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'
          }`}
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-md transition-transform hover:scale-105 ${isUser
            ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border border-primary/20'
            : 'bg-card text-primary border border-border/50'
            }`}
        >
          {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
        </div>
        <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
          <div className="px-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              {isUser ? 'You' : 'Lumis Assistant'}
            </span>
          </div>
          <div
            className={`min-w-0 rounded-2xl border px-5 py-4 text-[14px] leading-relaxed relative overflow-hidden transition-all ${isUser
              ? 'bg-primary text-primary-foreground border-primary/20 shadow-lg shadow-primary/10'
              : 'bg-card text-card-foreground border-border/60 shadow-xl shadow-black/5'
              }`}
          >
            {isUser && (
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
            )}
            <div className="relative z-10 space-y-3 prose-strong:font-bold prose-code:text-primary-foreground">
              <ReactMarkdown
                components={{
                  p({ children }) {
                    return <p className="whitespace-pre-wrap">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="list-disc pl-5 space-y-2">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="list-decimal pl-5 space-y-2">{children}</ol>;
                  },
                  li({ children }) {
                    return <li className="whitespace-pre-wrap">{children}</li>;
                  },
                  strong({ children }) {
                    return <strong className="font-bold text-foreground dark:text-white uppercase tracking-tight">{children}</strong>;
                  },
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeStr = String(children).replace(/\n$/, '');
                    if (match) {
                      return (
                        <div className="group relative my-4 overflow-hidden rounded-xl border border-border/70 bg-terminal shadow-2xl">
                          <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                            <span>{match[1]}</span>
                          </div>
                          <CopyButton code={codeStr} />
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{
                              margin: 0,
                              padding: '1.25rem',
                              borderRadius: 0,
                              fontSize: '0.85rem',
                              background: 'transparent',
                              lineHeight: '1.6',
                            }}
                          >
                            {codeStr}
                          </SyntaxHighlighter>
                        </div>
                      );
                    }
                    return (
                      <code
                        className={`rounded-md px-1 py-0.5 text-[0.85rem] font-semibold font-mono ${isUser
                            ? 'text-white border-b border-white/30'
                            : 'text-primary border-b border-primary/20 bg-primary/5'
                          }`}
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
    </div>
  );
};
