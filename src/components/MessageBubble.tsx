import type { Message } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-3`}
    >
      <div
        className="max-w-[85%] px-3 py-2 message-content"
        style={{
          backgroundColor: isUser
            ? 'var(--color-surface-user-bubble)'
            : 'var(--color-surface-assistant-bubble)',
          color: isUser
            ? 'var(--color-text-on-user-bubble)'
            : 'var(--color-text-on-assistant-bubble)',
          borderRadius: isUser
            ? 'var(--radius-bubble) var(--radius-bubble) 4px var(--radius-bubble)'
            : 'var(--radius-bubble) var(--radius-bubble) var(--radius-bubble) 4px',
          fontSize: '13px',
          lineHeight: '1.5',
          wordBreak: 'break-word',
        }}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');

                  if (match) {
                    return (
                      <div className="relative group my-2">
                        <div
                          className="flex items-center justify-between px-3 py-1 text-xs rounded-t-md"
                          style={{
                            backgroundColor: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          <span>{match[1]}</span>
                          <button
                            onClick={() => handleCopyCode(codeString)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded text-xs"
                            style={{ color: 'var(--color-text-link)' }}
                          >
                            Copy
                          </button>
                        </div>
                        <pre
                          className="overflow-x-auto p-3 rounded-b-md"
                          style={{
                            backgroundColor: 'var(--color-surface-code-block)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            lineHeight: '1.5',
                          }}
                        >
                          <code>{codeString}</code>
                        </pre>
                      </div>
                    );
                  }

                  return (
                    <code
                      className="px-1 py-0.5 rounded text-xs"
                      style={{
                        backgroundColor: 'var(--color-surface-code-block)',
                        color: 'var(--color-text-code)',
                        fontFamily: 'var(--font-mono)',
                      }}
                      {...props}
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
                      rel="noopener noreferrer"
                      style={{ color: 'var(--color-text-link)' }}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
