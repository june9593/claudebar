import { ApprovalCard } from './ApprovalCard';
import type { ApprovalRequest, ApprovalDecision } from './ApprovalCard';

interface ApprovalsViewProps {
  pendingApprovals: ApprovalRequest[];
  resolvedApprovals: ApprovalRequest[];
  resolveApproval: (id: string, decision: ApprovalDecision) => void;
}

export function ApprovalsView({ pendingApprovals, resolvedApprovals, resolveApproval }: ApprovalsViewProps) {
  const hasPending = pendingApprovals.length > 0;
  const hasResolved = resolvedApprovals.length > 0;
  const isEmpty = !hasPending && !hasResolved;

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-chat)',
    }}>
      <div style={{ padding: '12px 14px 8px', flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
        }}>
          Approvals
        </span>
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '0 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        {isEmpty ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-tertiary)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
          }}>
            No approvals
          </div>
        ) : (
          <>
            {/* Pending approvals */}
            {hasPending && (
              <>
                <SectionLabel text={`Pending (${pendingApprovals.length})`} />
                {pendingApprovals.map(a => (
                  <ApprovalCard key={a.id} approval={a} onResolve={resolveApproval} />
                ))}
              </>
            )}

            {/* Resolved / expired approvals */}
            {hasResolved && (
              <>
                <SectionLabel text="History" />
                {resolvedApprovals.map(a => (
                  <ResolvedCard key={a.id} approval={a} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <span style={{
      fontSize: '11px',
      fontWeight: 600,
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-text-tertiary)',
      textTransform: 'uppercase',
      letterSpacing: '0.3px',
      padding: '8px 4px 2px',
    }}>
      {text}
    </span>
  );
}

function ResolvedCard({ approval }: { approval: ApprovalRequest }) {
  const extended = approval as ApprovalRequest & { resolvedDecision?: string };
  const isExpired = Date.now() >= approval.expiresAtMs && !extended.resolvedDecision;
  const decision = extended.resolvedDecision;

  return (
    <div style={{
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border-secondary)',
      borderRadius: '8px',
      padding: '10px 12px',
      opacity: 0.6,
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {approval.request.command}
        </span>
        <span style={{
          fontSize: '10px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          padding: '2px 6px',
          borderRadius: '4px',
          marginLeft: '8px',
          background: isExpired ? 'var(--color-bg-tertiary)' : decision === 'deny' ? 'var(--color-status-disconnected)' : 'var(--color-status-connected)',
          color: isExpired ? 'var(--color-text-tertiary)' : 'var(--color-bubble-user-text)',
        }}>
          {isExpired ? 'expired' : decision || 'resolved'}
        </span>
      </div>
      {approval.request.agentId && (
        <span style={{
          fontSize: '11px',
          fontFamily: 'var(--font-sans)',
          color: 'var(--color-text-tertiary)',
        }}>
          Agent: {approval.request.agentId}
        </span>
      )}
    </div>
  );
}
