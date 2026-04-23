import React, { useState, useEffect, useRef, useCallback } from 'react';
import LobsterPet from './LobsterPet';
import './pet.css';

type PetState = 'idle' | 'hover' | 'active' | 'notification' | 'disconnected';
type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

const PetApp: React.FC = () => {
  const [petState, setPetState] = useState<PetState>('idle');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const activeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0 });

  // Listen for ws:status from main process
  useEffect(() => {
    const cleanup = window.electronAPI.ws.onStatus((status) => {
      if (status.connected) {
        setConnectionStatus('connected');
        // Clear disconnected state when reconnected
        setPetState((prev) => (prev === 'disconnected' ? 'idle' : prev));
      } else if (status.error) {
        setConnectionStatus('disconnected');
        setPetState('disconnected');
      } else {
        setConnectionStatus('connecting');
      }
    });
    return cleanup;
  }, []);

  // Listen for approval events → notification state
  useEffect(() => {
    const cleanup = window.electronAPI.ws.onApproval(() => {
      setPetState('notification');
    });
    return cleanup;
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (petState === 'notification' || petState === 'disconnected') return;
    setPetState('hover');
  }, [petState]);

  const handleMouseLeave = useCallback(() => {
    if (petState === 'notification' || petState === 'disconnected') return;
    setPetState('idle');
  }, [petState]);

  const handleClick = useCallback(() => {
    if (isDraggingRef.current) return;

    // Clear notification on click
    if (petState === 'notification') {
      setPetState('idle');
    } else {
      setPetState('active');
      if (activeTimeoutRef.current) clearTimeout(activeTimeoutRef.current);
      activeTimeoutRef.current = setTimeout(() => setPetState('idle'), 400);
    }

    window.electronAPI.pet.onClick();
  }, [petState]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    window.electronAPI.pet.onRightClick();
  }, []);

  // Drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDraggingRef.current = false;
    dragStartRef.current = { mouseX: e.screenX, mouseY: e.screenY };

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.screenX - dragStartRef.current.mouseX;
      const dy = ev.screenY - dragStartRef.current.mouseY;
      if (!isDraggingRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        isDraggingRef.current = true;
      }
      if (isDraggingRef.current) {
        window.electronAPI.pet.onDrag(ev.screenX, ev.screenY);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (isDraggingRef.current) {
        window.electronAPI.pet.onDragEnd();
      }
      // Reset drag flag after a tick so click handler can check it
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 0);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const statusDotClass = connectionStatus === 'disconnected' ? 'error'
    : connectionStatus === 'connecting' ? 'connecting'
    : '';

  return (
    <div
      className={`pet-container state-${petState}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
    >
      <div className="lobster-svg">
        <LobsterPet />
      </div>
      <div className="pet-shadow" />
      <div className={`status-dot ${statusDotClass}`} />
    </div>
  );
};

export default PetApp;
