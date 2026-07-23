import React, { useState, useEffect, useRef } from 'react';
import { User, TravelRequest, ChatThread, ChatMessage, ChatThreadType, UserRole } from '../types';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

interface ChatViewProps {
  currentUser: User;
  requests: TravelRequest[];
  onViewRequest: (r: TravelRequest) => void;
}

const generateTempId = (prefix: string) => `${prefix}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

const ChatView: React.FC<ChatViewProps> = ({ currentUser, requests, onViewRequest }) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialLastReadRef = useRef<Record<string, string>>({});
  const lastThreadIdForScrollRef = useRef<string | null>(null);
  
  const activeChannelRef = useRef<any>(null);
  const globalChannelRef = useRef<any>(null);

  // PNC User Search State
  const [profiles, setProfiles] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [modalStep, setModalStep] = useState<1 | 2>(1);

  // New Chat Modal State
  const [chatType, setChatType] = useState<ChatThreadType | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');

  const activeThread = threads.find(t => t.id === activeThreadId);

  // Manage Modal State
  useEffect(() => {
    if (isNewChatModalOpen) {
      setChatType(null);
      setSelectedRequestId('');
      
      if (currentUser.role === UserRole.EMPLOYEE) {
        setModalStep(2);
        setSelectedEmployeeId(currentUser.id);
      } else {
        setModalStep(1);
        setSelectedEmployeeId(null);
        setSearchQuery('');
        const fetchProfiles = async () => {
          const { data } = await supabase.from('profiles').select('*');
          if (data) {
             setProfiles(data.map(d => ({
               id: d.id, name: d.name, email: d.email, role: d.role as UserRole
             })));
          }
        };
        fetchProfiles();
      }
    }
  }, [isNewChatModalOpen, currentUser]);

  // Scroll to bottom of messages only if user is already near the bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    // Check if we just loaded a new thread
    let isFirstLoad = false;
    if (lastThreadIdForScrollRef.current !== activeThreadId && messages.length > 0) {
      lastThreadIdForScrollRef.current = activeThreadId;
      isFirstLoad = true;
    }

    if (isFirstLoad) {
      // Wait a tiny bit for the DOM to render the divider
      setTimeout(() => {
        const divider = document.getElementById('unread-divider');
        if (divider) {
          divider.scrollIntoView({ behavior: 'auto', block: 'center' });
        } else {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
      }, 10);
      return;
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    
    if (isNearBottom || isUploading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isUploading, activeThreadId]);

  // Fetch Threads & Subscribe to Global Changes
  useEffect(() => {
    const fetchThreads = async (silent = false) => {
      if (!silent) setIsLoadingThreads(true);
      try {
        let query = supabase.from('chat_threads').select(`
          id, type, related_request_id, employee_id, title, status, last_read_employee, last_read_pnc, created_at, updated_at,
          profiles!chat_threads_employee_id_fkey (name)
        `).order('updated_at', { ascending: false });

        // Strictly separate conversation visibility based on active role context
        if (currentUser.role === UserRole.EMPLOYEE) {
          query = query.eq('employee_id', currentUser.id);
        } else {
          query = query.neq('employee_id', currentUser.id);
        }

        const { data: threadsData, error: threadsError } = await query;
        if (threadsError) throw threadsError;

        if (threadsData) {
          const parsedThreads: ChatThread[] = threadsData.map((t: any) => ({
            id: t.id,
            type: t.type as ChatThreadType,
            relatedRequestId: t.related_request_id,
            employeeId: t.employee_id,
            employeeName: t.profiles?.name || 'Unknown',
            title: t.title,
            status: t.status || 'active',
            lastReadEmployee: t.last_read_employee,
            lastReadPnc: t.last_read_pnc,
            participantIds: [], 
            messages: [], 
            createdAt: t.created_at,
            updatedAt: t.updated_at
          }));
          setThreads(parsedThreads);
        }
      } catch (error: any) {
        toast.error("Failed to load chats: " + error.message);
      } finally {
        if (!silent) setIsLoadingThreads(false);
      }
    };
    
    fetchThreads();

    // Subscribe to broadcasts to keep the sidebar perfectly synced
    const globalSub = supabase
      .channel('chat_global_changes')
      .on('broadcast', { event: 'update_threads' }, () => {
         fetchThreads(true);
      })
      .subscribe();
      
    globalChannelRef.current = globalSub;

    return () => {
      supabase.removeChannel(globalSub);
      globalChannelRef.current = null;
    };
  }, [currentUser]);

  // Mark Active Thread as Read
  useEffect(() => {
    if (activeThreadId) {
      const thread = threads.find(t => t.id === activeThreadId);
      if (thread) {
        const field = currentUser.role === UserRole.EMPLOYEE ? 'last_read_employee' : 'last_read_pnc';
        const currentLastRead = currentUser.role === UserRole.EMPLOYEE ? thread.lastReadEmployee : thread.lastReadPnc;

        // Store the timestamp from BEFORE they opened it so we can draw the divider
        if (!initialLastReadRef.current[activeThreadId] && currentLastRead) {
          initialLastReadRef.current[activeThreadId] = currentLastRead;
          // Clear it after 5 seconds so new messages don't get caught under it
          setTimeout(() => {
             delete initialLastReadRef.current[activeThreadId!];
          }, 5000);
        } else if (!initialLastReadRef.current[activeThreadId] && !currentLastRead) {
           initialLastReadRef.current[activeThreadId] = new Date(0).toISOString();
           setTimeout(() => {
             delete initialLastReadRef.current[activeThreadId!];
          }, 5000);
        }

        const nowIso = new Date().toISOString();
        supabase.from('chat_threads').update({ [field]: nowIso }).eq('id', activeThreadId).then(() => {
          if (globalChannelRef.current) {
            globalChannelRef.current.send({
              type: 'broadcast',
              event: 'update_threads',
              payload: {}
            });
          }
        });
        
        setThreads(prev => prev.map(t => 
          t.id === activeThreadId 
            ? { ...t, [currentUser.role === UserRole.EMPLOYEE ? 'lastReadEmployee' : 'lastReadPnc']: nowIso }
            : t
        ));
      }
    }
  }, [activeThreadId, messages, currentUser.role]);

  // Fetch Messages for active thread
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('thread_id', activeThreadId)
          .order('timestamp', { ascending: true });

        if (error) throw error;
        if (data) {
          setMessages(data.map(m => ({
            id: m.id,
            senderId: m.sender_id,
            senderName: m.sender_name,
            senderRole: m.sender_role as UserRole,
            text: m.text,
            timestamp: m.timestamp,
            attachmentUrl: m.attachment_url,
            attachmentName: m.attachment_name,
            attachmentType: m.attachment_type
          })));
        }
      } catch (error: any) {
        toast.error("Failed to load messages: " + error.message);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    fetchMessages();

    // Subscribe to new messages via Postgres Changes
    const subscription = supabase
      .channel(`chat_messages_db:${activeThreadId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_messages',
        filter: `thread_id=eq.${activeThreadId}`
      }, (payload) => {
        const newMsg = payload.new;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, {
            id: newMsg.id,
            senderId: newMsg.sender_id,
            senderName: newMsg.sender_name,
            senderRole: newMsg.sender_role as UserRole,
            text: newMsg.text,
            timestamp: newMsg.timestamp,
            attachmentUrl: newMsg.attachment_url,
            attachmentName: newMsg.attachment_name,
            attachmentType: newMsg.attachment_type
          }];
        });
        
        setThreads(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(t => t.id === activeThreadId);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], updatedAt: newMsg.timestamp };
            const t = updated.splice(idx, 1)[0];
            updated.unshift(t);
          }
          return updated;
        });
      })
      .subscribe();
      
    activeChannelRef.current = subscription;

    return () => {
      supabase.removeChannel(subscription);
      activeChannelRef.current = null;
    };
  }, [activeThreadId]);


  const handleStartChat = async () => {
    if (!chatType || !selectedEmployeeId) return;

    let relatedRequestId = null;
    let title = '';

    if (chatType === ChatThreadType.EXISTING_REQUEST) {
      if (!selectedRequestId) return;
      const req = requests.find(r => r.id === selectedRequestId);
      relatedRequestId = selectedRequestId;
      title = `Req: ${req?.submissionId || selectedRequestId}`;
    } else if (chatType === ChatThreadType.FUTURE_REQUEST) {
      const tempId = generateTempId('TEMP-FUT');
      title = `Future Request (${tempId})`;
    } else {
      const tempId = generateTempId('TEMP-OTH');
      title = `General Inquiry (${tempId})`;
    }

    try {
      const { data: threadData, error: threadError } = await supabase
        .from('chat_threads')
        .insert({
          type: chatType,
          related_request_id: relatedRequestId,
          employee_id: selectedEmployeeId,
          title: title,
          status: 'active'
        })
        .select(`
          id, type, related_request_id, employee_id, title, status, created_at, updated_at
        `)
        .single();

      if (threadError) throw threadError;

      const { error: partError } = await supabase
        .from('chat_participants')
        .insert({
          thread_id: threadData.id,
          user_id: currentUser.id
        });

      if (partError) throw partError;

      const newThread: ChatThread = {
        id: threadData.id,
        type: threadData.type as ChatThreadType,
        relatedRequestId: threadData.related_request_id,
        employeeId: threadData.employee_id,
        employeeName: profiles.find(p => p.id === threadData.employee_id)?.name || currentUser.name,
        title: threadData.title,
        status: threadData.status || 'active',
        participantIds: [currentUser.id],
        messages: [],
        createdAt: threadData.created_at,
        updatedAt: threadData.updated_at
      };

      setThreads(prev => [newThread, ...prev]);
      setActiveThreadId(newThread.id);
      setViewMode('active');
      setIsNewChatModalOpen(false);
    } catch (error: any) {
      toast.error("Failed to start chat: " + error.message);
    }
  };

  const handleToggleArchive = async (threadId: string, currentStatus: 'active' | 'archived') => {
    const newStatus = currentStatus === 'active' ? 'archived' : 'active';
    try {
      const { error } = await supabase.from('chat_threads').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', threadId);
      if (error) throw error;
      
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t));
      toast.success(`Chat ${newStatus === 'archived' ? 'archived' : 'unarchived'} successfully`);
      
      if (globalChannelRef.current) {
        globalChannelRef.current.send({
          type: 'broadcast',
          event: 'update_threads',
          payload: {}
        });
      }

      if (newStatus !== viewMode) {
        setActiveThreadId(null);
      }
    } catch (error: any) {
      toast.error(`Failed to ${newStatus === 'active' ? 'unarchive' : 'archive'} chat: ${error.message}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) { 
        toast.error("File size must be less than 5MB");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !activeThreadId || !activeThread) return;
    
    const textToSend = newMessage.trim();
    const fileToUpload = selectedFile;
    
    setNewMessage('');
    setSelectedFile(null);

    let attachmentUrl = null;
    let attachmentName = null;
    let attachmentType = null;

    try {
      if (fileToUpload) {
        setIsUploading(true);
        const fileExt = fileToUpload.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${activeThreadId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, fileToUpload);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath);
          
        attachmentUrl = publicUrl;
        attachmentName = fileToUpload.name;
        attachmentType = fileToUpload.type;
      }

      // Use active persona for sender role
      const roleToSave = currentUser.role;

      const { data: newMsgData, error } = await supabase
        .from('chat_messages')
        .insert({
          thread_id: activeThreadId,
          sender_id: currentUser.id,
          sender_name: currentUser.name,
          sender_role: roleToSave,
          text: textToSend,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
          attachment_type: attachmentType
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }
      
      // Optimistic UI Update so the message appears instantly
      if (newMsgData) {
        setMessages(prev => {
          if (prev.some(m => m.id === newMsgData.id)) return prev;
          return [...prev, {
            id: newMsgData.id,
            senderId: newMsgData.sender_id,
            senderName: newMsgData.sender_name,
            senderRole: newMsgData.sender_role as UserRole,
            text: newMsgData.text,
            timestamp: newMsgData.timestamp,
            attachmentUrl: newMsgData.attachment_url,
            attachmentName: newMsgData.attachment_name,
            attachmentType: newMsgData.attachment_type
          }];
        });
        
        setThreads(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(t => t.id === activeThreadId);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], updatedAt: newMsgData.timestamp };
            const t = updated.splice(idx, 1)[0];
            updated.unshift(t);
          }
          return updated;
        });
        
        if (globalChannelRef.current) {
          globalChannelRef.current.send({
            type: 'broadcast',
            event: 'update_threads',
            payload: {}
          });
        }
      }
      
      await supabase.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', activeThreadId);

    } catch (error: any) {
      toast.error("Failed to send message: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Only show requests for the selected employee in the modal
  const targetEmployeeEmail = profiles.find(p => p.id === selectedEmployeeId)?.email || currentUser.email;
  const filteredRequests = requests.filter(r => r.requesterEmail === targetEmployeeEmail);
  const displayedThreads = threads.filter(t => t.status === viewMode);

  return (
    <div className="h-[calc(100vh-6rem)] animate-in fade-in duration-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-hidden flex transition-all">
      {/* Sidebar - Chat List */}
      <div className={`${activeThreadId ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-slate-800 dark:text-white">Messages</h2>
            <button
              onClick={() => setIsNewChatModalOpen(true)}
              aria-label="Start a new chat"
              className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/30 transition-all active:scale-95"
            >
              <i className="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
          </div>
          
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mb-3">
            <button onClick={() => setViewMode('active')} className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${viewMode === 'active' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'}`}>Active</button>
            <button onClick={() => setViewMode('archived')} className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${viewMode === 'archived' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'}`}>Archived</button>
          </div>

          {currentUser.role !== UserRole.EMPLOYEE && (
            <div className="relative">
              <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-slate-700 dark:text-slate-200"
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoadingThreads ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center opacity-50">
               <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-500 mb-2"></i>
               <p className="text-sm font-bold text-slate-500">Loading chats...</p>
            </div>
          ) : displayedThreads.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 rounded-full flex items-center justify-center text-2xl">
                <i className={viewMode === 'archived' ? "fa-solid fa-box-archive" : "fa-solid fa-comments"}></i>
              </div>
              <div>
                <p className="text-slate-800 dark:text-slate-200 font-bold">No {viewMode} chats</p>
                <p className="text-slate-500 text-sm mt-1">{viewMode === 'archived' ? 'Archived conversations will appear here.' : 'Start a new conversation to get started.'}</p>
              </div>
              {viewMode === 'active' && (
                <button
                  onClick={() => setIsNewChatModalOpen(true)}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-full text-sm font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
                >
                  Start Chat
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {displayedThreads.map(thread => {
                const isMyThread = thread.employeeId === currentUser.id;
                const lr = currentUser.role === UserRole.EMPLOYEE ? thread.lastReadEmployee : thread.lastReadPnc;
                const isUnread = activeThreadId !== thread.id && (!lr || new Date(thread.updatedAt).getTime() > new Date(lr).getTime());
                const displayTitle = isMyThread ? 'PNC Support Team' : (thread.employeeName || thread.title);
                const displayInitials = (isMyThread ? 'PN' : (thread.employeeName ? thread.employeeName.substring(0,2) : 'US')).toUpperCase();
                
                return (
                  <button
                    key={thread.id}
                    onClick={() => setActiveThreadId(thread.id)}
                    className={`w-full text-left p-4 hover:bg-white dark:hover:bg-slate-800 transition-all group relative overflow-hidden ${activeThreadId === thread.id ? 'bg-white dark:bg-slate-800 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex -space-x-3 flex-shrink-0 items-center relative top-0.5">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-2xs font-bold border-2 border-white dark:border-slate-800 z-10 shadow-sm ${isMyThread ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                          {displayInitials}
                        </div>
                        <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-2xs font-bold border-2 border-white dark:border-slate-800 shadow-sm">
                          {isMyThread ? currentUser.name.substring(0,2).toUpperCase() : 'PN'}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className={`text-sm truncate pr-2 ${isUnread ? 'font-black text-slate-900 dark:text-white' : 'font-bold text-slate-700 dark:text-slate-300'}`}>
                            {displayTitle}
                          </p>
                          <div className="flex items-center gap-2">
                            {isUnread && <div className="w-2 h-2 rounded-full bg-rose-500"></div>}
                            <span className={`text-2xs whitespace-nowrap ${isUnread ? 'font-black text-indigo-600 dark:text-indigo-400' : 'font-bold text-slate-400'}`}>
                              {new Date(thread.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        {thread.type === ChatThreadType.EXISTING_REQUEST && thread.relatedRequestId && (
                          <p className="text-2xs font-mono text-slate-400 uppercase tracking-widest mb-1 truncate">
                            ID: {requests.find(r => r.id === thread.relatedRequestId)?.submissionId || requests.find(r => r.id === thread.relatedRequestId)?.id}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-medium">
                          {activeThreadId === thread.id && messages.length > 0 
                            ? `${messages[messages.length - 1].senderName}: ${messages[messages.length - 1].text || (messages[messages.length - 1].attachmentName ? 'Sent an attachment' : '')}`
                            : 'Conversation active'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      {activeThread ? (
        <div className={`${!activeThreadId ? 'hidden' : 'flex'} flex-1 flex-col bg-white dark:bg-slate-900 relative`}>
          {/* Chat Header */}
          <div className="min-h-[4rem] p-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white dark:bg-slate-900 z-10 shadow-sm gap-3 sm:gap-4">
            <div className="flex items-start sm:items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => setActiveThreadId(null)}
                aria-label="Back to chat list"
                className="md:hidden w-8 h-8 flex-shrink-0 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors mt-0.5 sm:mt-0"
              >
                <i className="fa-solid fa-chevron-left" aria-hidden="true"></i>
              </button>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                  <span className="truncate max-w-full">
                    {activeThread.employeeId === currentUser.id ? 'PNC Support Team' : (activeThread.employeeName || activeThread.title)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-2xs uppercase tracking-widest font-black whitespace-nowrap ${activeThread.type === ChatThreadType.EXISTING_REQUEST ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'}`}>
                    {activeThread.type}
                  </span>
                  {activeThread.status === 'archived' && (
                    <span className="px-2 py-0.5 rounded-full text-2xs uppercase tracking-widest font-black bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 whitespace-nowrap">
                      Archived
                    </span>
                  )}
                </h3>
                {activeThread.type === ChatThreadType.EXISTING_REQUEST && activeThread.relatedRequestId ? (
                  <p className="text-xs text-slate-500 font-medium font-mono uppercase tracking-widest mt-1">
                    ID: {requests.find(r => r.id === activeThread.relatedRequestId)?.submissionId || requests.find(r => r.id === activeThread.relatedRequestId)?.id}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 font-medium mt-1 truncate">
                    {activeThread.title}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto pl-11 sm:pl-0">
              {activeThread.status === 'active' && currentUser.role !== UserRole.EMPLOYEE && (
                <button
                  onClick={() => handleToggleArchive(activeThread.id, 'active')}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap flex-1 sm:flex-none"
                >
                  <i className="fa-solid fa-box-archive"></i> Close
                </button>
              )}
              {activeThread.status === 'archived' && (
                <button
                  onClick={() => handleToggleArchive(activeThread.id, 'archived')}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap flex-1 sm:flex-none"
                >
                  <i className="fa-solid fa-box-open"></i> Unarchive
                </button>
              )}
              
              {activeThread.type === ChatThreadType.EXISTING_REQUEST && activeThread.relatedRequestId && (
                <button
                  onClick={() => {
                    const req = requests.find(r => r.id === activeThread.relatedRequestId);
                    if (req) onViewRequest(req);
                  }}
                  className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap flex-1 sm:flex-none"
                >
                  <i className="fa-solid fa-eye"></i> View Request
                </button>
              )}
            </div>
          </div>

          {/* Messages Area - Slack Style */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-slate-900/30 custom-scrollbar">
            {isLoadingMessages ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                 <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-500 mb-2"></i>
                 <p className="text-sm font-bold text-slate-500">Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-50">
                <i className="fa-solid fa-hand-sparkles text-4xl text-indigo-500"></i>
                <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Send a message to start the conversation</p>
              </div>
            ) : (
              <div className="space-y-0.5 pb-4">
                {messages.map((msg, idx) => {
                  // Group logic: same sender and same role
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const isGrouped = prevMsg && 
                    prevMsg.senderId === msg.senderId && 
                    prevMsg.senderRole === msg.senderRole &&
                    (new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime() < 5 * 60 * 1000);

                  const initials = msg.senderName.substring(0, 2).toUpperCase();
                  
                  const lrStr = initialLastReadRef.current[activeThreadId || ''];
                  const lrTime = lrStr ? new Date(lrStr).getTime() : Date.now();
                  const firstUnreadIdx = messages.findIndex(m => new Date(m.timestamp).getTime() > lrTime && m.senderId !== currentUser.id);
                  const showUnreadDivider = idx === firstUnreadIdx;
                  
                  return (
                    <React.Fragment key={msg.id}>
                      {showUnreadDivider && (
                        <div id="unread-divider" className="flex items-center gap-4 my-6 opacity-70">
                          <div className="h-px bg-rose-500 flex-1"></div>
                          <span className="text-2xs font-black uppercase tracking-widest text-rose-500">New Messages</span>
                          <div className="h-px bg-rose-500 flex-1"></div>
                        </div>
                      )}
                      <div className={`flex gap-3 group hover:bg-slate-100/50 dark:hover:bg-slate-800/50 px-2 py-1 -mx-2 rounded-lg transition-colors ${!isGrouped ? 'mt-4' : ''}`}>
                      {/* Avatar */}
                      {!isGrouped ? (
                        <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-xs font-black shadow-sm ${msg.senderRole === UserRole.EMPLOYEE ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                          {initials}
                        </div>
                      ) : (
                        <div className="w-10 flex-shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-2xs font-bold text-slate-400">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}

                      {/* Message Content */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        {!isGrouped && (
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="font-bold text-slate-900 dark:text-white">{msg.senderName}</span>
                            {msg.senderRole !== UserRole.EMPLOYEE && (
                              <span className="px-1.5 py-0.5 rounded text-2xs font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                {msg.senderRole}
                              </span>
                            )}
                            <span className="text-xs font-bold text-slate-400">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}
                        
                        {msg.text && (
                          <p className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        )}
                        
                        {/* Attachment rendering */}
                        {msg.attachmentUrl && (
                          <div className="mt-2 mb-1">
                            {msg.attachmentType?.startsWith('image/') ? (
                              <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="block max-w-sm">
                                <img src={msg.attachmentUrl} alt="attachment" className="max-w-full max-h-64 rounded-lg border border-slate-200 dark:border-slate-700 object-cover cursor-pointer hover:opacity-90 transition-opacity shadow-sm" />
                              </a>
                            ) : (
                              <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-500 transition-colors shadow-sm group/file max-w-sm w-full">
                                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 rounded-lg flex items-center justify-center text-lg">
                                  <i className="fa-solid fa-file-lines"></i>
                                </div>
                                <div className="flex-1 min-w-0 pr-4">
                                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover/file:text-indigo-600 transition-colors">{msg.attachmentName}</p>
                                  <p className="text-2xs text-slate-500 uppercase tracking-widest font-black mt-0.5">Attachment</p>
                                </div>
                                <i className="fa-solid fa-download text-slate-400 group-hover/file:text-indigo-600 transition-colors mr-2"></i>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            {isUploading && (
              <div className="flex gap-3 px-2 py-1 -mx-2 mt-4 items-center opacity-50 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 flex-shrink-0 flex items-center justify-center">
                  <i className="fa-solid fa-spinner fa-spin text-slate-400"></i>
                </div>
                <div className="flex-1">
                  <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
                  <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input or Archived State */}
          {activeThread.status === 'archived' ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 z-10 flex flex-col items-center justify-center gap-2 h-[76px]">
              <p className="text-sm font-black text-slate-500 uppercase tracking-widest"><i className="fa-solid fa-lock mr-2"></i> This conversation is archived</p>
            </div>
          ) : (
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-10">
              {selectedFile && (
                <div className="mb-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-between border border-slate-200 dark:border-slate-700 max-w-sm animate-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded flex items-center justify-center">
                      <i className={`fa-solid ${selectedFile.type.startsWith('image/') ? 'fa-image' : 'fa-file-lines'}`}></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedFile(null)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors ml-2">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="relative flex items-end gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-11 h-11 flex-shrink-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl flex items-center justify-center transition-all active:scale-95"
                >
                  <i className="fa-solid fa-paperclip text-lg"></i>
                </button>

                <div className="flex-1 relative bg-slate-100 dark:bg-slate-800 rounded-xl border border-transparent focus-within:border-indigo-500 focus-within:bg-white dark:focus-within:bg-slate-900 transition-all overflow-hidden shadow-inner">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    placeholder="Message team... (Enter to send, Shift+Enter for new line)"
                    className="w-full bg-transparent border-none px-4 py-3 text-sm focus:ring-0 resize-none outline-none min-h-[44px] max-h-32 custom-scrollbar text-slate-800 dark:text-slate-200"
                    rows={1}
                  />
                </div>
                <button
                  type="submit"
                  disabled={(!newMessage.trim() && !selectedFile) || isUploading}
                  className="w-11 h-11 flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl flex items-center justify-center transition-all shadow-md active:scale-95 disabled:shadow-none disabled:active:scale-100"
                >
                  {isUploading ? (
                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                  ) : (
                    <i className="fa-solid fa-paper-plane text-sm translate-y-[1px] -translate-x-[1px]"></i>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/50 text-center p-8 border-l border-slate-200 dark:border-slate-800">
          <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-500 rounded-full flex items-center justify-center text-4xl mb-6 shadow-inner">
            <i className="fa-regular fa-paper-plane"></i>
          </div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">PNC Support Chat</h2>
          <p className="text-slate-500 max-w-sm">Select a conversation from the list or start a new one to get help with your travel requests.</p>
        </div>
      )}

      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsNewChatModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <header className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-800/30">
              {modalStep === 2 && currentUser.role !== UserRole.EMPLOYEE && (
                <button onClick={() => setModalStep(1)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                  <i className="fa-solid fa-arrow-left"></i>
                </button>
              )}
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex-1">Start New Chat</h3>
              <button onClick={() => setIsNewChatModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-colors">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            
            {modalStep === 1 ? (
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mb-2">Select Employee</p>
                <div className="relative">
                  <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                  <input
                    type="text"
                    placeholder="Search employees by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-200 transition-all shadow-sm"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 pt-2 pr-2">
                  {profiles.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedEmployeeId(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all shadow-sm active:scale-[0.98] ${selectedEmployeeId === p.id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 hover:border-indigo-300 dark:border-slate-800 dark:hover:border-slate-600'}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm ${selectedEmployeeId === p.id ? 'bg-indigo-600' : 'bg-slate-400 dark:bg-slate-600'}`}>
                        {p.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className={`font-bold truncate ${selectedEmployeeId === p.id ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>{p.name}</p>
                        <p className="text-xs text-slate-500 truncate">{p.email}</p>
                      </div>
                      {selectedEmployeeId === p.id && (
                        <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs shadow-md">
                          <i className="fa-solid fa-check"></i>
                        </div>
                      )}
                    </button>
                  ))}
                  {profiles.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                     <div className="text-center py-6 text-slate-500">
                       <i className="fa-solid fa-users-slash text-2xl mb-2 opacity-50"></i>
                       <p className="text-sm font-bold">No employees found</p>
                     </div>
                  )}
                </div>
                <button
                  onClick={() => setModalStep(2)}
                  disabled={!selectedEmployeeId}
                  className="w-full h-12 mt-2 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex justify-center items-center gap-2"
                >
                  Continue <i className="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">What do you need help with?</label>
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={() => setChatType(ChatThreadType.EXISTING_REQUEST)}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left shadow-sm active:scale-[0.98] ${chatType === ChatThreadType.EXISTING_REQUEST ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 hover:border-indigo-300 dark:border-slate-800 dark:hover:border-slate-600'}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${chatType === ChatThreadType.EXISTING_REQUEST ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                        <i className="fa-solid fa-ticket"></i>
                      </div>
                      <div>
                        <p className={`font-bold ${chatType === ChatThreadType.EXISTING_REQUEST ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>Existing Request</p>
                        <p className="text-xs text-slate-500 font-medium">Help with an already submitted request</p>
                      </div>
                    </button>
                    
                    <button 
                      onClick={() => setChatType(ChatThreadType.FUTURE_REQUEST)}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left shadow-sm active:scale-[0.98] ${chatType === ChatThreadType.FUTURE_REQUEST ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 hover:border-indigo-300 dark:border-slate-800 dark:hover:border-slate-600'}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${chatType === ChatThreadType.FUTURE_REQUEST ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                        <i className="fa-solid fa-calendar-plus"></i>
                      </div>
                      <div>
                        <p className={`font-bold ${chatType === ChatThreadType.FUTURE_REQUEST ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>Future Request</p>
                        <p className="text-xs text-slate-500 font-medium">Inquire about an upcoming trip</p>
                      </div>
                    </button>
 
                    <button 
                      onClick={() => setChatType(ChatThreadType.OTHERS)}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left shadow-sm active:scale-[0.98] ${chatType === ChatThreadType.OTHERS ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 hover:border-indigo-300 dark:border-slate-800 dark:hover:border-slate-600'}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${chatType === ChatThreadType.OTHERS ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                        <i className="fa-solid fa-clipboard-question"></i>
                      </div>
                      <div>
                        <p className={`font-bold ${chatType === ChatThreadType.OTHERS ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>Others</p>
                        <p className="text-xs text-slate-500 font-medium">General inquiries and support</p>
                      </div>
                    </button>
                  </div>
                </div>

                {chatType === ChatThreadType.EXISTING_REQUEST && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Select Request</label>
                    <select
                      className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-sm text-slate-800 dark:text-white focus:border-indigo-600 outline-none transition-all shadow-sm"
                      value={selectedRequestId}
                      onChange={(e) => setSelectedRequestId(e.target.value)}
                    >
                      <option value="">-- Choose a request --</option>
                      {filteredRequests.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.submissionId || r.id.substring(0,8)} : {r.from} to {r.to} ({r.pncStatus})
                        </option>
                      ))}
                    </select>
                    {filteredRequests.length === 0 && (
                      <p className="text-xs text-amber-500 font-bold"><i className="fa-solid fa-triangle-exclamation"></i> This user has no existing requests.</p>
                    )}
                  </div>
                )}

                <button
                  onClick={handleStartChat}
                  disabled={!chatType || (chatType === ChatThreadType.EXISTING_REQUEST && !selectedRequestId)}
                  className="w-full h-12 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  Start Conversation
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatView;
