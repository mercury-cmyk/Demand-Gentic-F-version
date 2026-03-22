import { useState, useCallback, useRef, useEffect } from 'react';

// ==================== MESSAGING HOOKS ====================

export function useChannels(teamId: string) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiCall(`/api/team-messaging/channels/${teamId}`);
      setChannels(res.channels || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const createChannel = useCallback(
    async (name: string, description?: string, channelType = 'general') => {
      try {
        const res = await apiCall('/api/team-messaging/channels', {
          method: 'POST',
          body: JSON.stringify({ teamId, name, description, channelType }),
        });
        setChannels(prev => [...prev, res.channel]);
        return res.channel;
      } catch (err) {
        setError((err as Error).message);
        throw err;
      }
    },
    [teamId],
  );

  const updateChannel = useCallback(async (channelId: string, updates: any) => {
    try {
      const res = await apiCall(`/api/team-messaging/channels/${channelId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      setChannels(prev =>
        prev.map(c => (c.id === channelId ? res.channel : c)),
      );
      return res.channel;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  return { channels, loading, error, createChannel, updateChannel, refetch: fetch };
}

export function useMessages(channelId: string) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(
    async (limit = 50, offset = 0) => {
      try {
        setLoading(true);
        const res = await apiCall(
          `/api/team-messaging/messages/${channelId}?limit=${limit}&offset=${offset}`,
        );
        setMessages(res.messages || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [channelId],
  );

  useEffect(() => {
    if (channelId) fetch();
  }, [channelId, fetch]);

  const sendMessage = useCallback(
    async (content: string, attachmentIds: string[] = []) => {
      try {
        const res = await apiCall('/api/team-messaging/messages', {
          method: 'POST',
          body: JSON.stringify({ channelId, content, attachmentIds }),
        });
        setMessages(prev => [...prev, res.message]);
        return res.message;
      } catch (err) {
        setError((err as Error).message);
        throw err;
      }
    },
    [channelId],
  );

  const editMessage = useCallback(async (messageId: string, content: string) => {
    try {
      const res = await apiCall(`/api/team-messaging/messages/${messageId}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? res.message : m)),
      );
      return res.message;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      await apiCall(`/api/team-messaging/messages/${messageId}`, {
        method: 'DELETE',
      });
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  const markAsRead = useCallback(async (messageId: string) => {
    try {
      await apiCall(`/api/team-messaging/messages/${messageId}/read`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Failed to mark message as read:', err);
    }
  }, []);

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      const res = await apiCall(`/api/team-messaging/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? res.message : m)),
      );
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    editMessage,
    deleteMessage,
    markAsRead,
    addReaction,
    refetch: fetch,
  };
}

export function useChannelMembers(channelId: string) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiCall(`/api/team-messaging/channels/${channelId}/details`);
      setMembers(res.members || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (channelId) fetch();
  }, [channelId, fetch]);

  const addMember = useCallback(
    async (userId: string) => {
      try {
        const res = await apiCall(
          `/api/team-messaging/channels/${channelId}/members`,
          {
            method: 'POST',
            body: JSON.stringify({ userId }),
          },
        );
        setMembers(prev => [...prev, res.member]);
        return res.member;
      } catch (err) {
        setError((err as Error).message);
        throw err;
      }
    },
    [channelId],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      try {
        await apiCall(
          `/api/team-messaging/channels/${channelId}/members/${userId}`,
          { method: 'DELETE' },
        );
        setMembers(prev => prev.filter(m => m.userId !== userId));
      } catch (err) {
        setError((err as Error).message);
        throw err;
      }
    },
    [channelId],
  );

  return { members, loading, error, addMember, removeMember, refetch: fetch };
}

export function useMessageSearch(teamId: string) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = useCallback(
    async (query: string, type = 'all') => {
      if (!query.trim()) {
        setResults(null);
        return;
      }

      try {
        setLoading(true);
        const res = await apiCall(
          `/api/team-messaging/search?q=${encodeURIComponent(query)}&teamId=${teamId}&type=${type}`,
        );
        setResults(res);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [teamId],
  );

  return { results, loading, error, search };
}

// ==================== CALLS HOOKS ====================

export function useCalls(teamId: string) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(
    async (limit = 50, offset = 0, userId?: string, status?: string) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
        });
        if (userId) params.append('userId', userId);
        if (status) params.append('status', status);

        const res = await apiCall(
          `/api/team-calls/calls/history/${teamId}?${params.toString()}`,
        );
        setCalls(res.calls || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [teamId],
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const initiateCall = useCallback(
    async (recipientIds: string[], callType = 'voice', channelId?: string) => {
      try {
        const res = await apiCall('/api/team-calls/calls/initiate', {
          method: 'POST',
          body: JSON.stringify({ teamId, recipientIds, callType, channelId }),
        });
        return res.call;
      } catch (err) {
        setError((err as Error).message);
        throw err;
      }
    },
    [teamId],
  );

  return { calls, loading, error, initiateCall, fetchHistory };
}

export function useCallParticipant(callId: string) {
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCall = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiCall(`/api/team-calls/calls/${callId}`);
      setCall(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [callId]);

  useEffect(() => {
    if (callId) fetchCall();
  }, [callId, fetchCall]);

  const acceptCall = useCallback(async () => {
    try {
      const res = await apiCall(`/api/team-calls/calls/${callId}/accept`, {
        method: 'POST',
      });
      setCall(prev => prev ? { ...prev, status: 'active' } : null);
      return res;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, [callId]);

  const declineCall = useCallback(async () => {
    try {
      await apiCall(`/api/team-calls/calls/${callId}/decline`, {
        method: 'POST',
      });
      setCall(null);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, [callId]);

  const endCall = useCallback(async () => {
    try {
      await apiCall(`/api/team-calls/calls/${callId}/end`, {
        method: 'POST',
      });
      setCall(null);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, [callId]);

  return { call, loading, error, acceptCall, declineCall, endCall, refetch: fetchCall };
}

export function useCallRecording(callId: string) {
  const [recording, setRecording] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRecording = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiCall(`/api/team-calls/calls/${callId}/recording`);
      setRecording(res.recording);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [callId]);

  const saveRecording = useCallback(
    async (recordingUrl: string, duration: number, fileSize: number) => {
      try {
        const res = await apiCall(`/api/team-calls/calls/${callId}/recording`, {
          method: 'POST',
          body: JSON.stringify({
            recordingUrl,
            recordingDuration: duration,
            fileSize,
          }),
        });
        setRecording(res.recording);
        return res.recording;
      } catch (err) {
        setError((err as Error).message);
        throw err;
      }
    },
    [callId],
  );

  return { recording, loading, error, saveRecording, refetch: fetchRecording };
}

export function useCallTranscript(callId: string) {
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTranscript = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiCall(`/api/team-calls/calls/${callId}/transcript`);
      setTranscript(res.transcript);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [callId]);

  const saveTranscript = useCallback(
    async (transcriptText: string, summary?: string, keyPoints?: string[], sentiment?: string) => {
      try {
        const res = await apiCall(`/api/team-calls/calls/${callId}/transcript`, {
          method: 'POST',
          body: JSON.stringify({
            transcriptText,
            summary,
            keyPoints,
            sentiment,
          }),
        });
        setTranscript(res.transcript);
        return res.transcript;
      } catch (err) {
        setError((err as Error).message);
        throw err;
      }
    },
    [callId],
  );

  return { transcript, loading, error, saveTranscript, refetch: fetchTranscript };
}

export function useCallStats(teamId: string) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(
    async (days = 30) => {
      try {
        setLoading(true);
        const res = await apiCall(`/api/team-calls/calls/stats/${teamId}?days=${days}`);
        setStats(res);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [teamId],
  );

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { stats, loading, error, refetch: fetch };
}

// ==================== UTILITY ====================

function apiCall(
  path: string,
  options: RequestInit = {},
): Promise {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    ...options.headers,
  };

  return fetch(path, { ...options, headers }).then(async res => {
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || 'API error');
    }
    return res.json();
  });
}