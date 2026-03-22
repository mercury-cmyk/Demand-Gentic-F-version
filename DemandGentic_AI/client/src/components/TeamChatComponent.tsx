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
  reactions?: Record;
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
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState>(new Set());
  const [onlineUsers, setOnlineUsers] = useState>(new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const websocketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef();

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
    return Loading...;
  }

  return (
    
      {/* Sidebar - Channels */}
      
        
          
            Messages
            
              
            
          
          
            
             setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          
        

        
          {channels
            .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(channel => (
               setSelectedChannel(channel)}
                className={`w-full px-4 py-3 text-left border-b border-gray-100 hover:bg-gray-50 transition ${
                  selectedChannel?.id === channel.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                }`}
              >
                
                  
                    
                      # {channel.name}
                    
                    
                      {channel.memberCount} members
                    
                  
                  {channel.unreadCount && channel.unreadCount > 0 && (
                    
                      {channel.unreadCount}
                    
                  )}
                
              
            ))}
        
      

      {/* Main Chat Area */}
      
        {selectedChannel ? (
          <>
            {/* Header */}
            
              
                #{selectedChannel.name}
                {selectedChannel.description}
              
              
                
              
            

            {/* Messages */}
            
              {messages.map(message => (
                
                  
                  
                    
                      {message.sender.name}
                      
                        {format(new Date(message.createdAt), 'p')}
                      
                    
                    {message.content}
                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                      
                        {Object.entries(message.reactions).map(([emoji, users]) => (
                          
                            {emoji}
                            {users.length}
                          
                        ))}
                      
                    )}
                  

                  {/* Message Actions */}
                  
                     {
                        if (websocketRef.current) {
                          websocketRef.current.send(JSON.stringify({
                            type: 'reaction',
                            messageId: message.id,
                            emoji: '👍',
                          }));
                        }
                      }}
                    >
                      
                    
                  
                
              ))}

              {/* Typing Indicator */}
              {typingUsers.size > 0 && (
                
                  
                  
                    {Array.from(typingUsers).join(', ')} is typing
                    
                      
                      
                      
                    
                  
                
              )}

              
            

            {/* Message Input */}
            
              {attachedFiles.length > 0 && (
                
                  {attachedFiles.map((file, idx) => (
                    
                      {file.name}
                       setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="hover:text-red-500"
                      >
                        
                      
                    
                  ))}
                
              )}
              
                 {
                    setMessageInput(e.target.value);
                    handleTyping();
                  }}
                  placeholder="Message #channel..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                   setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    
                  
                  {showEmojiPicker && (
                    
                      {emojis.map(emoji => (
                         {
                            setMessageInput(prev => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="text-xl hover:bg-gray-100 p-2 rounded"
                        >
                          {emoji}
                        
                      ))}
                    
                  )}
                
                
                  
                   setAttachedFiles([..., attachtedFiles, ...Array.from(e.target.files || [])])} />
                
                
                  
                
              
            
          
        ) : (
          
            Select a channel to start chatting
          
        )}
      
    
  );
}