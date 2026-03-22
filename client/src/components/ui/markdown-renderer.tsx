import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none break-words', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const isCodeBlock = !inline && match;
            const codeString = String(children).replace(/\n$/, '');

            if (isCodeBlock) {
              return (
                <div className="relative group rounded-lg overflow-hidden bg-zinc-950 dark:bg-zinc-950 border border-zinc-800 my-4">
                  <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-b border-zinc-800 flex-row">
                    <span className="text-xs font-mono text-zinc-400">{match[1]}</span>
                    <CopyButton text={codeString} />
                  </div>
                  <div className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-zinc-50">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </div>
                </div>
              );
            }

            return (
              <code
                className="bg-muted px-1.5 py-0.5 rounded-md font-mono text-[13px] text-foreground"
                {...props}
              >
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="leading-relaxed mb-3 last:mb-0">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-4 space-y-1 my-3">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-4 space-y-1 my-3">{children}</ol>;
          },
          li({ children }) {
            return <li className="pl-1">{children}</li>;
          },
          a({ children, href }) {
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline underline-offset-4 pointer-events-auto">
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4 rounded-lg border border-border/50">
                <table className="w-full text-sm text-left">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-muted/50 text-xs uppercase">{children}</thead>;
          },
          tr({ children }) {
            return <tr className="border-b border-border/50 last:border-0">{children}</tr>;
          },
          th({ children }) {
            return <th className="px-4 py-3 font-semibold text-foreground/80">{children}</th>;
          },
          td({ children }) {
            return <td className="px-4 py-3">{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded-md"
      onClick={copy}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}