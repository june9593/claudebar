import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';

interface Props { source: string; }

export function Markdown({ source }: Props) {
  const theme = useSettingsStore((s) => (s as unknown as { resolvedTheme?: 'light' | 'dark' }).resolvedTheme);
  const isDark = theme === 'dark';

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...rest }) {
          // react-markdown v10 dropped the `inline` prop. Distinguish fenced
          // blocks from inline code by the className: fenced blocks emit
          // `<code class="language-x">` (or, if no language hint, the parent
          // <pre> still wraps; we detect the multi-line case by looking for
          // newlines in the code text).
          const codeText = String(children ?? '').replace(/\n$/, '');
          const match = /language-(\w+)/.exec(className ?? '');
          const isFencedWithLang = !!match;
          const isFencedNoLang = !match && codeText.includes('\n');

          if (isFencedWithLang) {
            return <CodeBlock language={match[1]} code={codeText} isDark={isDark} />;
          }
          if (isFencedNoLang) {
            return (
              <pre style={{ margin: '8px 0', borderRadius: 6, overflow: 'auto' }}>
                <code
                  className={className}
                  style={{
                    display: 'block',
                    background: 'var(--color-bg-tertiary)',
                    padding: '10px 12px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    lineHeight: 1.5,
                    borderRadius: 6,
                  }}
                  {...rest}
                >
                  {children}
                </code>
              </pre>
            );
          }
          // Inline code
          return (
            <code
              className={className}
              style={{
                background: 'var(--color-bg-input)',
                padding: '1px 5px', borderRadius: 4,
                fontFamily: 'var(--font-mono)', fontSize: '0.9em',
              }}
              {...rest}
            >
              {children}
            </code>
          );
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {source}
    </ReactMarkdown>
  );
}

function CodeBlock({ language, code, isDark }: { language: string; code: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div style={{ position: 'relative', margin: '8px 0' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--color-bg-tertiary)',
        padding: '4px 8px',
        borderTopLeftRadius: 6, borderTopRightRadius: 6,
        fontSize: 11, color: 'var(--color-text-tertiary)',
        borderBottom: '0.5px solid var(--color-border-primary)',
      }}>
        <span>{language}</span>
        <button
          onClick={onCopy}
          aria-label="Copy code"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={isDark ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          borderTopLeftRadius: 0, borderTopRightRadius: 0,
          borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
          fontSize: 12,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
