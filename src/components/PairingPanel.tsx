import { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';

type Peer = Awaited<ReturnType<typeof apiClient.peers.list>>[number];

export function PairingPanel() {
  const [machineName, setMachineName] = useState<string>('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [activePin, setActivePin] = useState<{ pin: string; expiresAt: number } | null>(null);
  const [pinNow, setPinNow] = useState<number>(Date.now());
  const [enterPinMode, setEnterPinMode] = useState<boolean>(false);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [enteredLabel, setEnteredLabel] = useState<string>('');
  const [enteredHostAddress, setEnteredHostAddress] = useState<string>('');
  const [enteredError, setEnteredError] = useState<string | null>(null);
  const [statusByPeer, setStatusByPeer] = useState<Record<string, 'online' | 'offline'>>({});

  // Initial load.
  useEffect(() => {
    void apiClient.peers.getMachineName().then(setMachineName);
    void apiClient.peers.list().then(setPeers);
    void apiClient.peers.activePin().then(setActivePin);
  }, []);

  // Subscribe to live peer status (connected / disconnected events from
  // main process transport).
  useEffect(() => {
    return apiClient.peers.onStatus((evt) => {
      setStatusByPeer((s) => ({
        ...s,
        [evt.peerId]: evt.type === 'connected' ? 'online' : 'offline',
      }));
    });
  }, []);

  // PIN countdown — tick once per second while a PIN is active.
  useEffect(() => {
    if (!activePin) return;
    const t = setInterval(() => setPinNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activePin]);

  // Auto-clear expired PIN.
  useEffect(() => {
    if (activePin && pinNow > activePin.expiresAt) setActivePin(null);
  }, [pinNow, activePin]);

  const onGeneratePin = async () => {
    const result = await apiClient.peers.generatePin();
    setActivePin(result);
  };
  const onCancelPin = async () => {
    await apiClient.peers.cancelPin();
    setActivePin(null);
  };
  const onRemovePeer = async (peerId: string) => {
    await apiClient.peers.remove(peerId);
    setPeers(await apiClient.peers.list());
  };
  const onMachineNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setMachineName(v);
    void apiClient.peers.setMachineName(v);
  };
  const onClaimPin = async () => {
    setEnteredError(null);
    const cleanPin = enteredPin.replace(/\D/g, '');
    if (cleanPin.length !== 6) {
      setEnteredError('PIN must be 6 digits');
      return;
    }
    if (!enteredLabel.trim()) {
      setEnteredError('Give the remote machine a label');
      return;
    }
    if (!enteredHostAddress.trim()) {
      setEnteredError('Host address required (e.g. 192.168.1.42:47891 or mac-mini.local:47891)');
      return;
    }
    const result = await apiClient.peers.claimPin({
      pin: cleanPin,
      label: enteredLabel.trim(),
      hostAddress: enteredHostAddress.trim(),
    });
    if (result.ok) {
      setEnterPinMode(false);
      setEnteredPin('');
      setEnteredLabel('');
      setEnteredHostAddress('');
      setPeers(await apiClient.peers.list());
    } else {
      const msgMap: Record<string, string> = {
        'no-host-address': 'Host address missing',
        'no-active-pin': 'No active PIN on the host machine — generate one there first',
        'pin-expired': 'PIN expired',
        'wrong-pin': 'Wrong PIN',
        'too-many-attempts': 'Too many wrong attempts; PIN voided',
        'connection-failed': 'Could not connect to that address',
        'timeout': 'Pairing timed out',
        'closed': 'Connection closed before pairing completed',
        'malformed-reply': 'Got a malformed reply (peer version mismatch?)',
        'pairing-failed': 'Pairing failed',
      };
      setEnteredError(msgMap[result.error] || `Pairing failed: ${result.error}`);
    }
  };

  const secondsLeft = activePin ? Math.max(0, Math.ceil((activePin.expiresAt - pinNow) / 1000)) : 0;
  const pinFmt = activePin ? `${activePin.pin.slice(0, 3)}-${activePin.pin.slice(3)}` : '';
  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SettingRow label="This machine name">
        <input
          type="text"
          value={machineName}
          onChange={onMachineNameChange}
          style={inputStyle}
          placeholder="(hostname)"
        />
      </SettingRow>

      <SettingRow label="Allow remote control">
        {!activePin ? (
          <button onClick={onGeneratePin} style={buttonStyle}>Generate PIN</button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{
              fontSize: 18, fontWeight: 600, letterSpacing: 1,
              color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)',
            }}>{pinFmt}</code>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {mmss} left
            </span>
            <button onClick={onCancelPin} style={{ ...buttonStyle, marginLeft: 'auto' }}>Cancel</button>
          </div>
        )}
      </SettingRow>

      <div>
        <div style={sectionLabel}>Paired machines:</div>
        {peers.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>
            (none yet)
          </div>
        ) : (
          peers.map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', marginBottom: 4,
              border: '0.5px solid var(--color-border-primary)',
              borderRadius: 6,
              background: 'var(--color-bg-secondary)',
            }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{p.label}</span>
              {statusByPeer[p.id] === 'online' ? (
                <span style={{ fontSize: 10, color: 'var(--color-status-connected, #0a0)' }}>
                  ● online
                </span>
              ) : (
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  ● offline
                </span>
              )}
              <button
                onClick={() => onRemovePeer(p.id)}
                style={{ ...buttonStyle, marginLeft: 'auto' }}
              >Remove</button>
            </div>
          ))
        )}
      </div>

      <SettingRow label="Add remote machine">
        {!enterPinMode ? (
          <button onClick={() => setEnterPinMode(true)} style={buttonStyle}>Enter PIN</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            <input
              type="text"
              value={enteredPin}
              onChange={(e) => setEnteredPin(e.target.value)}
              placeholder="6-digit PIN"
              maxLength={7}
              style={inputStyle}
            />
            <input
              type="text"
              value={enteredLabel}
              onChange={(e) => setEnteredLabel(e.target.value)}
              placeholder="Label (e.g. mac-mini)"
              style={inputStyle}
            />
            <input
              type="text"
              value={enteredHostAddress}
              onChange={(e) => setEnteredHostAddress(e.target.value)}
              placeholder="Host address (e.g. mac-mini.local:47891)"
              style={inputStyle}
            />
            {enteredError && (
              <div style={{ fontSize: 11, color: 'var(--color-status-disconnected, #e53)' }}>
                {enteredError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onClaimPin} style={buttonStyle}>Connect</button>
              <button
                onClick={() => { setEnterPinMode(false); setEnteredPin(''); setEnteredLabel(''); setEnteredHostAddress(''); setEnteredError(null); }}
                style={{ ...buttonStyle, background: 'transparent', color: 'var(--color-text-tertiary)' }}
              >Cancel</button>
            </div>
          </div>
        )}
      </SettingRow>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg-input)',
  border: '0.5px solid var(--color-border-primary)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  minWidth: 120,
};

const buttonStyle: React.CSSProperties = {
  background: 'var(--color-bg-secondary)',
  border: '0.5px solid var(--color-border-primary)',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11,
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)', letterSpacing: 0.5,
  marginTop: 8, marginBottom: 4,
};
