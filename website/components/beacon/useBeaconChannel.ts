'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { BeaconMessage, beaconChannelTopic } from '../../lib/beacon';

interface PresenceMeta {
  role: 'host' | 'presenter' | 'participant';
  participant_id?: string;
}

// Broadcast messages are never persisted/replayed to late joiners — every
// page using this hook must hydrate its initial state from a direct data
// read and treat onMessage purely as "here's what just changed."
export function useBeaconChannel(eventId: string | null, meta: PresenceMeta, onMessage: (msg: BeaconMessage) => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [connectedCount, setConnectedCount] = useState(0);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!eventId) return;
    const presenceKey = meta.participant_id || crypto.randomUUID();
    const channel = supabase.channel(beaconChannelTopic(eventId), {
      config: { presence: { key: presenceKey } },
    });

    channel.on('broadcast', { event: 'beacon' }, (msg) => {
      onMessageRef.current(msg.payload as BeaconMessage);
    });

    channel.on('presence', { event: 'sync' }, () => {
      setConnectedCount(Object.keys(channel.presenceState()).length);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ role: meta.role });
      }
    });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, meta.participant_id]);

  const send = useCallback(async (message: BeaconMessage) => {
    const channel = channelRef.current;
    if (!channel) return;
    await channel.send({ type: 'broadcast', event: 'beacon', payload: message });
  }, []);

  return { send, connectedCount };
}
