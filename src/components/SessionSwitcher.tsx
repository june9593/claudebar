import { useChatStore } from '../stores/chatStore';

export function SessionSwitcher() {
  const sessions = useChatStore((s) => s.sessions);
  const agents = useChatStore((s) => s.agents);
  const currentSession = useChatStore((s) => s.currentSession);
  const switchSession = useChatStore((s) => s.switchSession);
  const createSession = useChatStore((s) => s.createSession);
  const setView = useChatStore((s) => s.setView);

  const handleSelect = (session: typeof sessions[0]) => {
    switchSession(session);
    setView('chat');
  };

  const handleCreate = async (agentId: string) => {
    await createSession(agentId);
    setView('chat');
  };

  return (
    <div
      className="absolute inset-0 z-10 overflow-y-auto"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      <div className="p-3 space-y-1">
        <p
          className="text-xs font-medium px-2 py-1"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          会话列表
        </p>

        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => handleSelect(session)}
            className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
            style={{
              backgroundColor:
                currentSession?.id === session.id
                  ? 'var(--color-surface-active)'
                  : 'transparent',
              color: 'var(--color-text-primary)',
            }}
            onMouseEnter={(e) => {
              if (currentSession?.id !== session.id)
                e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
            }}
            onMouseLeave={(e) => {
              if (currentSession?.id !== session.id)
                e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>🦞</span>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{session.agent}</p>
              <p
                className="truncate text-xs"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {session.model} · {session.channel}
              </p>
            </div>
          </button>
        ))}

        <div
          className="border-t my-2"
          style={{ borderColor: 'var(--color-border-secondary)' }}
        />

        <p
          className="text-xs font-medium px-2 py-1"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          新建会话
        </p>

        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => handleCreate(agent.id)}
            className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
            style={{ color: 'var(--color-text-primary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span>＋</span>
            <span>{agent.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
