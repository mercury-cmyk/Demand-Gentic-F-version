'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Send, Search, Plus, MoreVertical, Pin, Smile, Paperclip, X } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  description?: string;
  channelType: string;
  unreadCount?: number;
  memberCount?: number;
}

interface Message {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  attachmentIds?: string[];
  createdAt: string;
  editedAt?: string;
  reactions?: Record<string, string[]>;
  sender: {
    id: string;
    name: string;
    avatar?: string;
  };
  readCount?: number;
  isPinned?: boolean;
}

interface ChatUser {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'away' | 'offline';
}

export function TeamChatComponent({ teamId }: { teamId: string }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const websocketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Load channels on mount
  useEffect(() => {
    const loadChannels = async () => {
      try {
        const res = await fetch(`/api/team-messaging/channels/${teamId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const data = await res.json();
        setChannels(data.channels || []);
        if (data.channels?.length > 0) {
          setSelectedChannel(data.channels[0]);
        }
      } catch (err) {
        console.error('Failed to load channels:', err);
      } finally {
        setLoading(false);
      }
    };
    loadChannels();
  }, [teamId]);

  // Load messages for selected channel
  useEffect(() => {
    if (!selectedChannel) return;

    const loadMessages = async () => {
      try {
        const res = await fetch(
          `/api/team-messaging/messages/${selectedChannel.id}?limit=50`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          },
        );
        const data = await res.json();
        setMessages(data.messages || []);
        setOnlineUsers(new Set());
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    };

    loadMessages();
  }, [selectedChannel?.id]);

  // Connect to WebSocket
  useEffect(() => {
    if (!selectedChannel) return;

    const userId = localStorage.getItem('userId');
    if (!userId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/chat/${selectedChannel.id}/${userId}`,
    );

    ws.onopen = () => {
      console.log(`Connected to chat: ${selectedChannel.id}`);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'new_message':
          setMessages(prev => [...prev, {
            id: data.messageId,
            channelId: selectedChannel.id,
            senderId: data.senderId,
            content: data.content,
            createdAt: data.timestamp,
            sender: { id: data.senderId, name: 'User', avatar: undefined },
          }]);
          scrollToBottom();
          break;

        case 'online_users':
          setOnlineUsers(new Set(data.users));
          break;

        case 'user_joined':
          setOnlineUsers(prev => new Set([...prev, data.userId]));
          break;

        case 'user_left':
          setOnlineUsers(prev => {
            const updated = new Set(prev);
            updated.delete(data.userId);
            return updated;
          });
          break;

        case 'user_typing':
          setTypingUsers(new Set(data.typingUsers || []));
          break;

        case 'message_reaction':
          setMessages(prev =>
            prev.map(msg => {
              if (msg.id === data.messageId) {
                const reactions = msg.reactions || {};
                if (!reactions[data.emoji]) {
                  reactions[data.emoji] = [];
                }
                if (!reactions[data.emoji].includes(data.userId)) {
                  reactions[data.emoji].push(data.userId);
                }
                return { ...msg, reactions };
              }
              return msg;
            }),
          );
          break;
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    websocketRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [selectedChannel?.id]);

  // Handle typing
  const handleTyping = useCallback(() => {
    if (!websocketRef.current) return;

    websocketRef.current.send(JSON.stringify({ type: 'typing_start' }));
    setIsTyping(true);

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      websocketRef.current?.send(JSON.stringify({ type: 'typing_stop' }));
      setIsTyping(false);
    }, 2000);
  }, []);

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChannel || !websocketRef.current) return;

    const messageId = `msg_${Date.now()}`;

    // Optimistic update
    const newMessage: Message = {
      id: messageId,
      channelId: selectedChannel.id,
      senderId: localStorage.getItem('userId') || '',
      content: messageInput,
      createdAt: new Date().toISOString(),
      sender: { id: '', name: 'You' },
    };
    setMessages(prev => [...prev, newMessage]);

    // Send via API
    try {
      const res = await fetch('/api/team-messaging/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          channelId: selectedChannel.id,
          content: messageInput,
          attachmentIds: attachedFiles.map(f => f.name),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update with server ID
        setMessages(prev =>
          prev.map(m => (m.id === messageId ? data.message : m)),
        );
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }

    // Send via WebSocket for real-time update
    websocketRef.current.send(JSON.stringify({
      type: 'message',
      content: messageInput,
      messageId,
    }));

    setMessageInput('');
    setAttachedFiles([]);
    setIsTyping(false);
    scrollToBottom();
  };

  // Create new channel
  const handleCreateChannel = async () => {
    const name = prompt('Enter channel name:');
    if (!name) return;

    try {
      const res = await fetch('/api/team-messaging/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ teamId, name, channelType: 'general' }),
      });

      if (res.ok) {
        const data = await res.json();
        setChannels(prev => [...prev, data.channel]);
      }
    } catch (err) {
      console.error('Failed to create channel:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉'];

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - Channels */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Messages</h2>
            <button
              onClick={handleCreateChannel}
              className="p-2 hover:bg-gray-100 rounded-lg"
              title="New channel"
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {channels
            .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(channel => (
              <button
                key={channel.id}
                onClick={() => setSelectedChannel(channel)}
                className={`w-full px-4 py-3 text-left border-b border-gray-100 hover:bg-gray-50 transition ${
                  selectedChannel?.id === channel.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      # {channel.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {channel.memberCount} members
                    </div>
                  </div>
                  {channel.unreadCount && channel.unreadCount > 0 && (
                    <span className="ml-2 px-2 py-1 bg-red-500 text-white text-xs rounded-full">
                      {channel.unreadCount}
                    </span>
                  )}
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedChannel ? (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">#{selectedChannel.name}</h1>
                <p className="text-sm text-gray-500">{selectedChannel.description}</p>
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-lg">
                <MoreVertical size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.map(message => (
                <div key={message.id} className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold">{message.sender.name}</span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(message.createdAt), 'p')}
                      </span>
                    </div>
                    <p className="text-gray-900 break-words">{message.content}</p>
                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {Object.entries(message.reactions).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full flex items-center gap-1"
                          >
                            <span>{emoji}</span>
                            <span className="text-gray-600">{users.length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Message Actions */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      className="p-1 hover:bg-gray-100 rounded"
                      onClick={() => {
                        if (websocketRef.current) {
                          websocketRef.current.send(JSON.stringify({
                            type: 'reaction',
                            messageId: message.id,
                            emoji: '👍',
                          }));
                        }
                      }}
                    >
                      <Smile size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Typing Indicator */}
              {typingUsers.size > 0 && (
                <div className="flex gap-3 text-sm text-gray-500">
                  <div className="w-10 h-10 rounded-full bg-gray-300 flex-shrink-0" />
                  <div className="flex items-center gap-1">
                    <span>{Array.from(typingUsers).join(', ')} is typing</span>
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-white border-t border-gray-200 px-6 py-4">
              {attachedFiles.length > 0 && (
                <div className="mb-3 flex gap-2 flex-wrap">
                  {attachedFiles.map((file, idx) => (
                    <div key={idx} className="px-3 py-1 bg-gray-100 rounded-full text-sm flex items-center gap-2">
                      <span>{file.name}</span>
                      <button
                        onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="hover:text-red-500"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleSendMessage} className="flex gap-3">
                <input
                  type="text"
                  value={messageInput}
                  onChange={e => {
                    setMessageInput(e.target.value);
                    handleTyping();
                  }}
                  placeholder="Message #channel..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <Smile size={20} />
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute bottom-12 right-0 bg-white border border-gray-300 rounded-lg p-2 grid grid-cols-4 gap-2 shadow-lg">
                      {emojis.map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setMessageInput(prev => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="text-xl hover:bg-gray-100 p-2 rounded"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <label className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
                  <Paperclip size={20} />
                  <input type="file" hidden onChange={e => setAttachedFiles([..., attachtedFiles, ...Array.from(e.target.files || [])])} />
                </label>
                <button
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a channel to start chatting
          </div>
        )}
      </div>
    </div>
  );
}
