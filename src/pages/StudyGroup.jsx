import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { generateSummary, generateFlashcards, generateQuiz, chatWithTutor } from '../services/openai';
import { extractTextFromFile } from '../services/fileParser';


const StudyGroup = () => {
  const [selectedAnswers, setSelectedAnswers] = useState({});

  const { groupId } = useParams();
  const navigate = useNavigate();
  const { userData } = useAuth();
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [aiContent, setAiContent] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [sessions, setSessions] = useState([]);
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [sessionLoading, setSessionLoading] = useState(false);
  // const [liveSession, setLiveSession] = useState(null);
  // const [showVideoModal, setShowVideoModal] = useState(false);
  // const [liveToken, setLiveToken] = useState(null);
  const liveTimeoutRef = useRef(null);
  const [tutorMessages, setTutorMessages] = useState([]);
  const [tutorInput, setTutorInput] = useState('');
  const [tutorLoading, setTutorLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cleanupMessages;
    let cleanupSessions;

    if (userData) {
      fetchGroup();
      fetchFiles();
      cleanupMessages = subscribeMessages();
      cleanupSessions = subscribeSessions();
    }

    return () => {
      if (cleanupMessages) cleanupMessages();
      if (cleanupSessions) cleanupSessions();
      if (liveTimeoutRef.current) {
        clearTimeout(liveTimeoutRef.current);
        liveTimeoutRef.current = null;
      }
    };
  }, [groupId, userData]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchGroup = async () => {
    try {
      const { data: groupData, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (error || !groupData) {
        navigate('/dashboard');
        return;
      }

      // Check if user is a member
      const { data: membership, error: membershipError } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId)
        .eq('user_id', userData.id)
        .maybeSingle();

      // Allow teachers to access their own groups
      const isGroupCreator = groupData.created_by === userData.id;
      
      if (membershipError && !isGroupCreator) {
        console.error('Membership check error:', membershipError);
        navigate('/dashboard');
        return;
      }
      
      if (!membership && !isGroupCreator) {
        navigate('/dashboard');
        return;
      }

      // Count members
      const { data: members, error: membersError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

      if (membersError) {
        console.error('Error loading member count:', membersError);
      }

      setGroup({
        ...groupData,
        membersCount: members ? members.length : 0,
      });
    } catch (error) {
      console.error('Error fetching group:', error);
      navigate('/dashboard');
    }
  };

  const handleOptionClick = (qIndex, optionIndex) => {
  setSelectedAnswers(prev => ({
    ...prev,
    [qIndex]: optionIndex
  }));
};


  const subscribeMessages = () => {
    const loadInitial = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data);
      }
    };

    loadInitial();

    const channel = supabase
      .channel(`messages:group:${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          setMessages((prev) => {
             // Avoid duplicates if we already added it manually
             if (prev.some(msg => msg.id === payload.new.id)) return prev;
             return [...prev, payload.new];
          });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to messages channel');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Error subscribing to messages channel');
        } else if (status === 'TIMED_OUT') {
          console.error('Subscription to messages timed out');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Database error fetching files:', error);
        return;
      }

      const mapped = await Promise.all(
        (data || []).map(async (file) => {
          try {
            const { data: publicUrlData } = supabase.storage
              .from('group-files')
              .getPublicUrl(file.path);
 
            let url = publicUrlData?.publicUrl || '';
 
            // Always try to create a signed URL to ensure access regardless of bucket policy
            try {
              const { data: signedData } = await supabase.storage
                .from('group-files')
                .createSignedUrl(file.path, 3600);
              url = signedData?.signedUrl || url;
            } catch (signedErr) {
              console.error('Signed URL generation failed for:', file.name, signedErr);
            }
 
            return {
              id: file.id,
              name: file.name,
              url,
              path: file.path,
              uploadedBy: file.uploaded_by,
              uploadedByName: file.uploaded_by_name,
              uploadedAt: file.created_at,
            };
          } catch (urlError) {
            console.error('Error getting URL for file:', file.name, urlError);
            return {
              id: file.id,
              name: file.name,
              url: '',
              path: file.path,
              uploadedBy: file.uploaded_by,
              uploadedByName: file.uploaded_by_name,
              uploadedAt: file.created_at,
            };
          }
        }),
      );

      setFiles(mapped);
    } catch (error) {
      console.error('Error fetching files:', error);
      // Show user-friendly error message
      alert('Failed to load files: ' + (error.message || 'Unknown error'));
    }
  };

  const subscribeSessions = () => {
    const loadInitial = async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('group_id', groupId)
        .order('start_time', { ascending: true });

      if (!error && data) {
        setSessions(data);
      }
    };

    loadInitial();

    const channel = supabase
      .channel(`sessions:group:${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sessions', filter: `group_id=eq.${groupId}` },
        (payload) => {
          setSessions((prev) => {
            if (prev.some(session => session.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    if (messageSending) return;

    try {
      setMessageSending(true);
      const { data, error } = await supabase.from('messages').insert({
        group_id: groupId,
        user_id: userData.id,
        user_name: userData.name,
        text: newMessage,
      }).select().single();

      if (error) throw error;
      
      // Optimistically update state
      if (data) {
        setMessages(prev => {
          // Check if message already exists to avoid duplicates
          if (prev.some(msg => msg.id === data.id)) return prev;
          return [...prev, data];
        });
      }
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setMessageSending(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Get current user directly from Supabase for better reliability
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('User not logged in:', userError?.message || 'No user found');
      return;
    }

    setUploading(true);
    try {
      const path = `${groupId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('group-files')
        .upload(path, file);
 
      if (uploadError) throw uploadError;
 
      const { error: dbError } = await supabase.from('files').insert({
        group_id: groupId,
        name: file.name,
        path,
        uploaded_by: user.id,
        uploaded_by_name: user.user_metadata?.name || user.email || 'Unknown User',
      });
 
      if (dbError) throw dbError;
 
      await fetchFiles();
    } catch (error) {
      console.error('Error uploading file:', error);
      // Show user-friendly error message
      alert('Failed to upload file: ' + (error.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

const deleteFile = async (file) => {
  const isTeacherLocal = group?.created_by === userData?.id;
  if (!userData || (userData.id !== file.uploadedBy && !isTeacherLocal)) {
    alert('Only the teacher or uploader can delete this file.');
    return;
  }

  const confirmDelete = window.confirm(`Delete file "${file.name}"? This action cannot be undone.`);
  if (!confirmDelete) return;

  try {
    const filePath = file.path || file.path?.toString();
    if (!filePath) {
      throw new Error('File path unavailable. Cannot delete file from storage.');
    }

    const { data, error: storageError } = await supabase.storage.from('group-files').remove([filePath]);
    if (storageError) throw storageError;

    const { error } = await supabase.from('files').delete().eq('id', file.id);
    if (error) throw error;

    setFiles((prev) => prev.filter((f) => f.id !== file.id));
  } catch (err) {
    console.error('DELETE FAILED:', err);
    alert(err.message || 'Delete failed');
  }
};



  // Removed unused file-selection helpers to reduce bundle size and complexity.

  const handleAISummary = async () => {
    if (!aiContent.trim()) {
      alert('Please select a file first or enter content');
      return;
    }

    setAiLoading(true);
    setAiResult(null);
    try {
      const usedFileName = selectedFile?.name || null;
      const summary = await generateSummary(aiContent);
      setAiResult({ type: 'summary', content: summary, fileName: usedFileName });
    } catch (error) {
      alert('Error generating summary: ' + error.message);
    } finally {
      setAiLoading(false);
    }
  };

 

  const fetchFileContent = async (file) => {
    if (!file || !file.url) {
      alert('No file URL available');
      return;
    }

    try {
      setAiLoading(true);
      const res = await fetch(file.url);
      if (!res.ok) throw new Error('Failed to fetch file content');

      const blob = await res.blob();
      const text = await extractTextFromFile(blob);

      if (text && text.length > 0) {
        setAiContent(text.slice(0, 200000));
        setSelectedFile({ name: file.name, url: file.url, source: 'uploaded' });
      } else {
        const fallback = await res.text();
        if (fallback && fallback.length > 0) {
          setAiContent(fallback.slice(0, 200000));
          setSelectedFile({ name: file.name, url: file.url, source: 'uploaded' });
        } else alert('Could not extract text from this file. Try a text version.');
      }
    } catch (err) {
      console.error('fetchFileContent error', err);
      alert('Failed to load file content: ' + (err.message || 'Unknown'));
    } finally {
      setAiLoading(false);
    }
  };

  // Jitsi helpers
  const getRoomName = (session) => {
    return `study-group-${groupId}-${session?.id || Date.now()}`;
  };

  const getJitsiPublicUrl = (session) => {
    return `https://meet.jit.si/${encodeURIComponent(getRoomName(session))}`;
  };


  const handleAIFlashcards = async () => {
    if (!aiContent.trim()) {
      alert('Please select a file first or enter content');
      return;
    }

    setAiLoading(true);
    setAiResult(null);
    try {
      const usedFileName = selectedFile?.name || null;
      const flashcards = await generateFlashcards(aiContent);
      setAiResult({ type: 'flashcards', content: flashcards, fileName: usedFileName });
    } catch (error) {
      alert('Error generating flashcards: ' + error.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIQuiz = async () => {
    if (!aiContent.trim()) {
      alert('Please select a file first or enter content');
      return;
    }

    setAiLoading(true);
    setAiResult(null);
    try {
      const usedFileName = selectedFile?.name || null;
      const quiz = await generateQuiz(aiContent);
      setAiResult({ type: 'quiz', content: quiz, fileName: usedFileName });
    } catch (error) {
      alert('Error generating quiz: ' + error.message);
    } finally {
      setAiLoading(false);
    }
  };

  const createSession = async (e) => {
    e.preventDefault();
    setSessionError('');

    // Require title, description, and start time/date
    if (!sessionTitle.trim()) {
      setSessionError('Please provide a session title.');
      return;
    }

    if (!sessionDescription.trim()) {
      setSessionError('Please provide a session description.');
      return;
    }

    if (!sessionStartTime) {
      setSessionError('Please provide a start date and time.');
      return;
    }

    // Validate start time format and ensure it's in the future
    const start = new Date(sessionStartTime);
    if (Number.isNaN(start.getTime())) {
      setSessionError('Invalid start time format.');
      return;
    }
    const now = new Date();
    if (start.getTime() <= now.getTime()) {
      setSessionError('Start time must be in the future. Please choose a future date/time.');
      return;
    }
    setSessionLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setSessionError('You must be logged in to create a session.');
        setSessionLoading(false);
        return;
      }
      const { data, error } = await supabase.from('sessions').insert({
        group_id: groupId,
        title: sessionTitle,
        description: sessionDescription,
        start_time: sessionStartTime ? new Date(sessionStartTime).toISOString() : null,
        created_by: user.id,
        created_by_name: user.user_metadata?.name || user.email || 'Unknown User',
      }).select().single();

      if (error) throw error;
      
      // Optimistically update state
      if (data) {
        setSessions(prev => {
          if (prev.some(session => session.id === data.id)) return prev;
          return [...prev, data];
        });
      }
      setSessionTitle('');
      setSessionDescription('');
      setSessionStartTime('');
      setSessionLoading(false);
    } catch (error) {
      console.error('Error creating session:', error);
      setSessionError('Failed to create session. Please try again.');
      setSessionLoading(false);
    }
  };

  const deleteLiveMeeting = async (session) => {
  // Only the creator can delete the session
  if (!userData || userData.id !== session.created_by) {
    alert('Only the teacher who created this session can delete it.');
    return;
  }

  const confirmDelete = window.confirm(
    `Delete session "${session.title}"? This action cannot be undone.`
  );

  if (!confirmDelete) return;

  try {
    // Delete the session
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', session.id);

    if (error) throw error;

    // Update UI (remove deleted session from state)
    setSessions(prev =>
      prev.filter(s => s.id !== session.id)
    );

  } catch (err) {
    console.error('Error deleting session:', err);
    setSessionError(err.message || 'Failed to delete session');
  }
};


  const sendTutorMessage = async (e) => {
    e.preventDefault();
    if (tutorLoading) return;
    if (!tutorInput.trim()) return;

    const newUserMessage = { role: 'user', content: tutorInput };
    setTutorMessages((prev) => [...prev, newUserMessage]);
    setTutorInput('');
    setTutorLoading(true);

    try {
      const aiMessage = await chatWithTutor([
        ...tutorMessages,
        newUserMessage,
        {
          role: 'user',
          content: `Group: ${group.name}\nTeacher: ${group.created_by_name}\n\nUse the shared notes and questions to help with studying.`,
        },
      ]);
      setTutorMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error in tutor chat:', error);
      alert(error.message || 'Failed to get a response from the AI tutor.');
    } finally {
      setTutorLoading(false);
    }
  };

  if (!group) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isTeacher = group.created_by === userData?.id;

  return (
    <div className="bg-slate-950 text-slate-50">
      <div className="border-b border-slate-800/80 px-4 sm:px-8 py-4 flex items-center justify-between gap-3 bg-slate-950/80">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-xs sm:text-sm px-3 py-1.5 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800 transition"
          >
            ← Back to dashboard
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
              {group.name}
            </h1>
            <p className="text-xs text-slate-400">
              Teacher: {group.created_by_name} • {group.membersCount || 0} members
            </p>
          </div>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-200">
          Role: <span className="font-semibold capitalize">{isTeacher ? 'Teacher' : 'Student'}</span>
        </span>
      </div>

      <div className="px-4 sm:px-8 pb-6 pt-5 space-y-5">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
          <h2 className="text-sm font-semibold mb-1">Group overview</h2>
          <p className="text-xs text-slate-400">
            {group.description || 'No description yet. Use the chat and sessions to plan what you will study together.'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-full border transition ${
              activeTab === 'chat'
                ? 'bg-sky-500 text-white border-sky-400 shadow-sm'
                : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-full border transition ${
              activeTab === 'files'
                ? 'bg-sky-500 text-white border-sky-400 shadow-sm'
                : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
          >
            Files
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-full border transition ${
              activeTab === 'ai'
                ? 'bg-sky-500 text-white border-sky-400 shadow-sm'
                : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
          >
            AI Tools
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-full border transition ${
              activeTab === 'sessions'
                ? 'bg-sky-500 text-white border-sky-400 shadow-sm'
                : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
          >
            Sessions & Live
          </button>
          <button
            onClick={() => setActiveTab('tutor')}
            className={`px-3 py-1.5 text-xs sm:text-sm rounded-full border transition ${
              activeTab === 'tutor'
                ? 'bg-sky-500 text-white border-sky-400 shadow-sm'
                : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
          >
            AI Tutor Chat
          </button>
        </div>

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="bg-white rounded-lg shadow-md h-[600px] flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.user_id === userData?.id ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      msg.user_id === userData?.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    <p className="font-semibold text-sm mb-1 opacity-75">{msg.user_name}</p>
                    <p className='font-bold'>{msg.text}</p>
                    {msg.created_at && (
                      <p className="text-xs mt-1 opacity-75">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={sendMessage} className="border-t p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 text-black px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={messageSending}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Files Tab */}
        {activeTab === 'files' && (
          <div className="bg-white text-black rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Uploaded Files</h3>
              {isTeacher ? <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".pdf,.txt,.doc,.docx"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload File'}
                </button>
              </div> : <h2 className="text-gray-700">Only teachers can upload files</h2>}
            </div>
            <div className="space-y-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <span className="text-gray-700">{file.name}</span>
                  <div className='flex gap-10'>
                    <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Download
                  </a>
                  <div
                  className="cursor-pointer hover:scale-110 transition"
                  onClick={() => deleteFile(file)}
                  >❌</div>
                  </div> 
                </div>
              ))}
              {files.length === 0 && (
                <p className="text-gray-500 text-center py-8">No files uploaded yet</p>
              )}
            </div>
          </div>
        )}

        {/* AI Tools Tab */}
        {activeTab === 'ai' && (
          <div className="bg-white text-black rounded-lg shadow-md p-6">
            <h3 className="text-xl font-semibold mb-4">AI Study Tools</h3>
            
            {/* File Selection */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <select
                    value={''}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      if (!Number.isNaN(idx) && files[idx]) fetchFileContent(files[idx]);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                  >
                    <option value="">Load from uploaded files...</option>
                    {files.map((file, index) => (
                      <option key={index} value={index}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between mb-3 text-sm">
                  <div className="text-gray-700">
                    Selected file: <span className="font-medium">{selectedFile.name}</span>
                    <span className="ml-2 text-xs text-gray-500">({selectedFile.source})</span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setAiContent('');
                      // reset select input by forcing re-render value handled via empty string
                    }}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}

              <textarea
                value={aiContent}
                onChange={(e) => {
                  setAiContent(e.target.value);
                  setSelectedFile(null);
                }}
                placeholder="Enter content directly here or load from a file..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg h-32"
                rows="5"
              />
            </div>

            {/* AI Action Buttons */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={handleAISummary}
                disabled={aiLoading}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
              >
                Generate Summary
              </button>
              <button
                onClick={handleAIFlashcards}
                disabled={aiLoading}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                Generate Flashcards
              </button>
              <button
                onClick={handleAIQuiz}
                disabled={aiLoading}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition disabled:opacity-50"
              >
                Generate Quiz
              </button>
            </div>
            {aiLoading && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <p className="mt-4 text-gray-600">Generating AI content...</p>
              </div>
            )}

            {aiResult && !aiLoading && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold mb-3">
                  {aiResult.type === 'summary' && 'Summary'}
                  {aiResult.type === 'flashcards' && 'Flashcards'}
                  {aiResult.type === 'quiz' && 'Quiz'}
                </h4>
                {aiResult.fileName && (
                  <p className="text-xs text-gray-500 mb-2">From file: <span className="font-medium">{aiResult.fileName}</span></p>
                )}
                
                {aiResult.type === 'summary' && (
                  <div className="whitespace-pre-wrap text-gray-700">
                    {aiResult.content}
                  </div>
                )}

                {aiResult.type === 'flashcards' && (
                  <div className="space-y-4">
                    {Array.isArray(aiResult.content) ? (
                      aiResult.content.map((card, index) => (
                        <div key={index} className="border rounded-lg p-4 bg-white">
                          <p className="font-semibold mb-2">Q: {card.question}</p>
                          <p className="text-gray-600">A: {card.answer}</p>
                        </div>
                      ))
                    ) : (
                      <pre className="whitespace-pre-wrap">{JSON.stringify(aiResult.content, null, 2)}</pre>
                    )}
                  </div>
                )}

                {aiResult?.type === 'quiz' && (
  <div className="space-y-6">
    {aiResult.content.map((q, qIndex) => (
      <div
        key={qIndex}
        className="p-4 border rounded-lg bg-white"
      >
        {/* Question */}
        <p className="font-semibold mb-3">
          {qIndex + 1}. {q.question}
        </p>

        {/* Options */}
        <div className="space-y-2">
          {q.options.map((option, oIndex) => {
            const selected = selectedAnswers[qIndex];
            const isCorrect = oIndex === q.correctAnswer;
            const isSelected = selected === oIndex;

            let bg = 'bg-gray-100 hover:bg-gray-200';

            if (selected !== undefined) {
              if (isCorrect) bg = 'bg-green-200';
              else if (isSelected) bg = 'bg-red-200';
            }

            return (
              <button
                key={oIndex}
                onClick={() => handleOptionClick(qIndex, oIndex)}
                disabled={selected !== undefined}
                className={`w-full text-left p-2 rounded transition ${bg}`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </div>
)}

              </div>
            )}
          </div>
        )}

        {/* Sessions & Live Tab */}
        {activeTab === 'sessions' && (
          <div className="bg-white rounded-lg shadow-md p-6 text-black">
            <div className="flex flex-col lg:flex-row gap-8">
              {isTeacher && (
                <div className="lg:w-1/3 border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
                  <h3 className="text-lg font-semibold mb-4">Create Study Session</h3>
                  {sessionError && (
                    <p className="mb-2 text-sm text-red-600">{sessionError}</p>
                  )}
                  <form onSubmit={createSession} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Session Title
                      </label>
                      <input
                        type="text"
                        value={sessionTitle}
                        onChange={(e) => setSessionTitle(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. Algebra Revision"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <textarea
                        value={sessionDescription}
                        onChange={(e) => setSessionDescription(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="What will you cover in this session?"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Time
                      </label>
                      <input
                        type="datetime-local"
                        value={sessionStartTime}
                        onChange={(e) => setSessionStartTime(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sessionLoading}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {sessionLoading ? 'Scheduling...' : 'Schedule Session'}
                    </button>
                  </form>
                </div>
              )}

              <div className={isTeacher ? 'lg:w-2/3' : 'w-full'}>
                <h3 className="text-lg font-semibold mb-4">Upcoming Sessions</h3>
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-gray-50"
                    >
                      <div>
                        <h4 className="font-semibold text-gray-800">{session.title}</h4>
                        {session.description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {session.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          Starts:{' '}
                          {session.start_time
                            ? new Date(session.start_time).toLocaleString()
                            : 'Not set'}
                        </p>
                        <p className="text-xs text-gray-500">
                          Host: {session.created_by_name}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => window.open(getJitsiPublicUrl(session), '_blank')}
                          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition"
                        >
                          Join Live Meeting
                        </button>
                        
                        {isTeacher && (
                          <>
                            <button
                              onClick={() => deleteLiveMeeting(session)}
                              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
                            >
                              Delete Meeting
                            </button>
                          </>
                        )}
                        <button
                          onClick={async () => {
                            const url = getJitsiPublicUrl(session);
                            try {
                              await navigator.clipboard.writeText(url);
                              alert('Meeting link copied to clipboard');
                            } catch (err) {
                              // fallback
                              prompt('Copy this meeting link:', url);
                            }
                          }}
                          className="bg-gray-200 text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-300 transition text-sm"
                        >
                          Copy link
                        </button>
                      </div>
                    </div>
                  ))}

                  {sessions.length === 0 && (
                    <p className="text-gray-500 text-center py-8">
                      No sessions scheduled yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Tutor Chat Tab */}
        {activeTab === 'tutor' && (
          <div className="bg-white rounded-lg shadow-md p-6 flex flex-col h-[600px] text-black">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold">AI Tutor</h3>
                <p className="text-sm text-gray-500">
                  Ask questions about your topics, homework, or exam prep.
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Available for teachers & students
              </span>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg p-4 bg-gray-50 space-y-3 mb-4">
              {tutorMessages.length === 0 && (
                <p className="text-gray-500 text-sm">
                  Start the conversation by asking something! Your AI tutor is here to help you study and understand your material better.
                </p>
              )}

              {tutorMessages.map((msg, index) => (
                <div
                  key={`${msg.role}-${index}`}
                  className={`flex ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-xl px-3 py-2 rounded-2xl text-sm shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-white text-gray-800 rounded-bl-none'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}

            {tutorLoading && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                <span>AI tutor is thinking...</span>
              </div>
            )}
            </div>

            <form onSubmit={sendTutorMessage} className="mt-auto">
              <div className="flex gap-2">
                <textarea
                  value={tutorInput}
                  onChange={(e) => setTutorInput(e.target.value)}
                  rows={2}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ask a question or request a study explanation..."
                />
                <button
                  type="submit"
                  disabled={tutorLoading}
                  className="self-end bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {tutorLoading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudyGroup;
