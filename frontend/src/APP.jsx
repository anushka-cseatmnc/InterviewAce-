import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Mic, MicOff, Upload, Clock, Code, MessageSquare, Users, Volume2, Lightbulb, Send, CheckCircle, RotateCcw, Zap } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

const App = () => {
  const [stage, setStage] = useState('upload');
  const [company, setCompany] = useState('');
  const [language, setLanguage] = useState('');
  const [sessionId] = useState(() => Date.now().toString());
  
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentRound, setCurrentRound] = useState('dsa');
  const [roundProgress, setRoundProgress] = useState('0/2');
  const [difficulty, setDifficulty] = useState('medium');
  const [interviewerName, setInterviewerName] = useState('');
  const [interviewerGender, setInterviewerGender] = useState('male');
  const [timeLeft, setTimeLeft] = useState(90 * 60);
  const [isActive, setIsActive] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [code, setCode] = useState('// Write your solution here\n\n');
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [editorLoaded, setEditorLoaded] = useState(false);
  
  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceMode, setVoiceMode] = useState(null);
  
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);
  const utteranceRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsActive(false);
            handleEndInterview();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isActive, timeLeft]);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.maxAlternatives = 1;

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += text + ' ';
          } else {
            interimTranscript += text;
          }
        }

        setTranscript(prev => {
          if (finalTranscript) {
            return prev + finalTranscript;
          }
          return prev + interimTranscript;
        });
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          if (isListening) {
            setTimeout(() => {
              try { recognitionRef.current?.start(); } catch (e) {}
            }, 500);
          }
        } else if (event.error === 'aborted') {
          console.log('Recognition aborted, will restart if needed');
        }
      };

      recognitionRef.current.onend = () => {
        if (isListening) {
          try { recognitionRef.current?.start(); } catch (e) {}
        }
      };
    }

    return () => {
      try { recognitionRef.current?.stop(); } catch (e) {}
    };
  }, [isListening]);

  const startListening = (mode) => {
    if (!recognitionRef.current) {
      alert('Speech recognition not supported in your browser. Please use Chrome or Edge.');
      return;
    }
    
    setVoiceMode(mode);
    setIsListening(true);
    setTranscript('');
    
    try {
      recognitionRef.current.start();
      const text = mode === 'clarify' 
        ? "I'm listening for your question." 
        : "I'm listening. Take your time explaining your approach.";
      speakText(text);
    } catch (e) {
      console.log('Recognition already started:', e);
    }
  };

  const stopListening = () => {
    setIsListening(false);
    
    try { recognitionRef.current?.stop(); } catch (e) {}
    
    const finalTranscript = transcript.trim();
    if (finalTranscript) {
      if (voiceMode === 'clarify') {
        askClarification(finalTranscript);
      } else {
        submitAnswer(finalTranscript, 'voice');
      }
    }
    
    setTranscript('');
    setVoiceMode(null);
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const cleanText = text
        .replace(/\*\*/g, '')
        .replace(/\n/g, ' ')
        .replace(/```[\s\S]*?```/g, '[code block]')
        .replace(/#{1,6}\s/g, '')
        .replace(/•/g, '')
        .substring(0, 500);
      
      utteranceRef.current = new SpeechSynthesisUtterance(cleanText);
      utteranceRef.current.rate = 0.95;
      utteranceRef.current.pitch = 1.0;
      utteranceRef.current.volume = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => {
        if (interviewerGender === 'female') {
          return v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Victoria');
        } else {
          return v.name.includes('Male') || v.name.includes('David') || v.name.includes('Daniel');
        }
      }) || voices.find(v => v.lang.includes('en'));
      
      if (preferred) utteranceRef.current.voice = preferred;
      
      window.speechSynthesis.speak(utteranceRef.current);
    }
  };

  const addMessage = (sender, text) => {
    setMessages(prev => [...prev, { sender, text, timestamp: Date.now() }]);
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('resume', file);

      const res = await fetch(`${API_URL}/resume-parser`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      addMessage('system', `✅ Resume analyzed!\n\nSkills detected: ${data.skills.join(', ')}`);
      setStage('company');
    } catch (error) {
      addMessage('system', '✅ Resume uploaded. Proceeding to company selection.');
      setStage('company');
    } finally {
      setLoading(false);
    }
  };

  const startInterview = async () => {
    if (!company) {
      alert('Please select a company');
      return;
    }
    if (!language) {
      alert('Please select a programming language');
      return;
    }

    setStage('interview');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/interview-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', company, sessionId, language })
      });

      const data = await res.json();
      
      setCurrentQuestion(data.question);
      setCurrentRound(data.currentRound);
      setRoundProgress(data.roundProgress);
      setDifficulty(data.difficulty);
      setInterviewerName(data.interviewerName);
      setInterviewerGender(data.interviewerGender || 'male');
      setIsActive(true);
      
      addMessage('ai', data.welcomeMessage);
      
      setTimeout(() => {
        addMessage('ai', `${data.question}\n\nFeel free to ask clarifying questions before you start coding!`);
        speakText(`Let's begin. ${data.question.substring(0, 200)}`);
      }, 2000);
      
    } catch (error) {
      console.error('Start error:', error);
      addMessage('ai', 'Welcome! Let\'s start with your first coding problem.');
      setIsActive(true);
    } finally {
      setLoading(false);
    }
  };

  const askClarification = async (question) => {
    const q = question || textInput;
    if (!q.trim()) return;
    
    addMessage('user', `❓ ${q}`);
    setLoading(true);
    setTextInput('');

    try {
      const res = await fetch(`${API_URL}/interview-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clarify',
          sessionId,
          answer: q,
          currentQuestion
        })
      });

      const data = await res.json();
      addMessage('ai', data.response);
      speakText(data.response);
    } catch (error) {
      addMessage('ai', 'Good question. Let me clarify that for you...');
    } finally {
      setLoading(false);
    }
  };

  const requestHint = async () => {
    addMessage('user', '💡 I could use a hint here.');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/interview-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hint',
          sessionId,
          currentQuestion
        })
      });

      const data = await res.json();
      addMessage('ai', `💡 **Hint #${data.hintLevel}:**\n\n${data.response}`);
      speakText(data.response);
    } catch (error) {
      addMessage('ai', 'Let me give you a hint to help you progress...');
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async (answer, type = 'voice') => {
    if (!answer.trim()) return;
    
    addMessage('user', answer);
    setLoading(true);
    setTextInput('');

    try {
      const res = await fetch(`${API_URL}/interview-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'answer',
          sessionId,
          answer,
          type,
          interviewType: currentRound,
          currentQuestion,
          language
        })
      });

      const data = await res.json();
      addMessage('ai', data.response);
      speakText(data.response);

      if (data.nextQuestion) {
        setCurrentQuestion(data.nextQuestion);
        setCurrentRound(data.currentRound);
        setRoundProgress(data.roundProgress);
        setDifficulty(data.difficulty);
        
        setTimeout(() => {
          const prefix = data.shouldTransition 
            ? `\n\n**🎯 Round Transition: ${data.currentRound.toUpperCase()}**\n\n` 
            : '\n\n**Next Question:**\n\n';
          addMessage('ai', prefix + data.nextQuestion);
          speakText(data.nextQuestion.substring(0, 200));
        }, 1500);
      }
    } catch (error) {
      addMessage('ai', 'Thank you. Let me follow up on that...');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async () => {
    if (!code.trim() || code === '// Write your solution here\n\n') {
      alert('Please write some code first!');
      return;
    }
    
    addMessage('user', `📝 Submitted ${language} code`);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/interview-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'answer',
          sessionId,
          answer: code,
          type: 'code',
          interviewType: currentRound,
          currentQuestion,
          language
        })
      });

      const data = await res.json();
      
      if (data.executionResults) {
        addMessage('system', `**Execution:** ${data.executionResults.status}\n\n${data.executionResults.output || 'No output'}`);
      }
      
      addMessage('ai', data.response);
      speakText(data.response);

      if (data.nextQuestion) {
        setCurrentQuestion(data.nextQuestion);
        setCurrentRound(data.currentRound);
        setRoundProgress(data.roundProgress);
        setCode('// Write your solution here\n\n');
        
        setTimeout(() => {
          addMessage('ai', data.nextQuestion);
          speakText(data.nextQuestion.substring(0, 200));
        }, 1500);
      }
    } catch (error) {
      addMessage('ai', 'Let me review your code and ask some follow-up questions...');
    } finally {
      setLoading(false);
    }
  };

  const handleEndInterview = async () => {
    setIsActive(false);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/interview-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', sessionId })
      });

      const data = await res.json();
      setStage('feedback');
      addMessage('system', `**Interview Complete**\n\n${data.feedback}`);
      speakText('Interview complete. Great work today!');
    } catch (error) {
      setStage('feedback');
      addMessage('system', 'Interview complete. Great work today!');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getRoundColor = () => {
    if (currentRound === 'dsa') return '#3b82f6';
    if (currentRound === 'theoretical') return '#8b5cf6';
    return '#ec4899';
  };

  const getRoundIcon = () => {
    if (currentRound === 'dsa') return <Code size={18} />;
    if (currentRound === 'theoretical') return <MessageSquare size={18} />;
    return <Users size={18} />;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#f1f5f9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(20px)', padding: '14px 24px', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px' }}>IA</div>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#e2e8f0' }}>InterviewAce</h1>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>AI Mock Interviewer v3.0</p>
            </div>
          </div>
          
          {isActive && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(59, 130, 246, 0.1)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                {getRoundIcon()}
                <span style={{ fontSize: '12px', fontWeight: '600', color: getRoundColor(), textTransform: 'uppercase' }}>{currentRound}</span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{roundProgress}</span>
              </div>
              
              {interviewerName && (
                <div style={{ fontSize: '12px', color: '#94a3b8', background: 'rgba(30, 41, 59, 0.5)', padding: '6px 12px', borderRadius: '8px' }}>
                  👤 <span style={{ color: '#3b82f6', fontWeight: '600' }}>{interviewerName}</span>
                </div>
              )}
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: timeLeft < 300 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.1)', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${timeLeft < 300 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.25)'}` }}>
                <Clock size={16} color={timeLeft < 300 ? '#ef4444' : '#3b82f6'} />
                <span style={{ fontSize: '14px', fontWeight: '700', color: timeLeft < 300 ? '#ef4444' : '#3b82f6' }}>{formatTime(timeLeft)}</span>
              </div>
              
              <button onClick={handleEndInterview} style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>
                End Interview
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px' }}>
        {/* UPLOAD STAGE */}
        {stage === 'upload' && (
          <div style={{ textAlign: 'center', maxWidth: '600px', margin: '80px auto' }}>
            <div style={{ width: '70px', height: '70px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 12px 32px rgba(59, 130, 246, 0.4)' }}>
              <Upload size={36} color="white" />
            </div>
            <h2 style={{ fontSize: '32px', marginBottom: '12px', fontWeight: '700', color: '#e2e8f0' }}>Upload Your Resume</h2>
            <p style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '32px' }}>We'll analyze your skills to customize the interview</p>
            
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', padding: '14px 32px', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', boxShadow: '0 6px 20px rgba(59, 130, 246, 0.5)' }}>
              <Upload size={18} />
              Choose Resume (PDF/DOCX/TXT)
              <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleResumeUpload} style={{ display: 'none' }} />
            </label>
            
            {loading && (
              <div style={{ marginTop: '24px', color: '#3b82f6', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div style={{ width: '16px', height: '16px', border: '3px solid rgba(59, 130, 246, 0.3)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                Analyzing resume...
              </div>
            )}
          </div>
        )}

        {/* COMPANY & LANGUAGE SELECTION */}
        {stage === 'company' && (
          <div style={{ textAlign: 'center', maxWidth: '900px', margin: '60px auto' }}>
            <h2 style={{ fontSize: '32px', marginBottom: '8px', fontWeight: '700', color: '#e2e8f0' }}>Select Target Company</h2>
            <p style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '40px' }}>Each company has unique interview patterns and difficulty levels</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '50px' }}>
              {[
                { name: 'Google', icon: '🔍', color: '#4285F4', desc: 'Algorithm-focused interviews' },
                { name: 'Amazon', icon: '📦', color: '#FF9900', desc: 'Leadership principles focus' },
                { name: 'Meta', icon: '👥', color: '#0668E1', desc: 'System design heavy' },
                { name: 'Apple', icon: '🍎', color: '#A2AAAD', desc: 'Product-oriented approach' }
              ].map(comp => (
                <button
                  key={comp.name}
                  onClick={() => setCompany(comp.name)}
                  style={{
                    background: company === comp.name ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(30, 41, 59, 0.7)',
                    border: company === comp.name ? '2px solid #3b82f6' : '2px solid rgba(59, 130, 246, 0.2)',
                    padding: '24px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    transform: company === comp.name ? 'scale(1.05)' : 'scale(1)'
                  }}
                >
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>{comp.icon}</div>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: 'white', marginBottom: '4px' }}>{comp.name}</div>
                  <div style={{ fontSize: '12px', color: company === comp.name ? '#cbd5e1' : '#64748b' }}>{comp.desc}</div>
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ fontSize: '24px', marginBottom: '16px', fontWeight: '700', color: '#e2e8f0' }}>Choose Programming Language</h3>
              <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '20px' }}>Select the language you'll code in during the interview</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', maxWidth: '700px', margin: '0 auto' }}>
                {[
                  { name: 'JavaScript', icon: '🟨', value: 'javascript' },
                  { name: 'Python', icon: '🐍', value: 'python' },
                  { name: 'Java', icon: '☕', value: 'java' },
                  { name: 'C++', icon: '⚡', value: 'cpp' }
                ].map(lang => (
                  <button
                    key={lang.value}
                    onClick={() => setLanguage(lang.value)}
                    style={{
                      background: language === lang.value ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(30, 41, 59, 0.7)',
                      border: language === lang.value ? '2px solid #10b981' : '2px solid rgba(59, 130, 246, 0.2)',
                      padding: '16px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      transform: language === lang.value ? 'scale(1.05)' : 'scale(1)'
                    }}
                  >
                    <div style={{ fontSize: '28px', marginBottom: '6px' }}>{lang.icon}</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: language === lang.value ? 'white' : '#cbd5e1' }}>{lang.name}</div>
                  </button>
                ))}
              </div>
            </div>
            
            <button
              onClick={startInterview}
              disabled={!company || !language || loading}
              style={{
                background: (company && language) ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(59, 130, 246, 0.2)',
                color: (company && language) ? 'white' : '#64748b',
                border: 'none',
                padding: '16px 48px',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: (company && language) ? 'pointer' : 'not-allowed',
                boxShadow: (company && language) ? '0 8px 24px rgba(59, 130, 246, 0.5)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                opacity: (company && language) ? 1 : 0.5
              }}
            >
              {loading ? (
                <>
                  <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255, 255, 255, 0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Preparing Interview...
                </>
              ) : (
                <>
                  <Zap size={20} />
                  Start Interview
                </>
              )}
            </button>
          </div>
        )}

        {/* INTERVIEW STAGE */}
        {stage === 'interview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '20px', height: 'calc(100vh - 160px)' }}>
            {/* Left: Editor/Voice */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Current Question */}
              {currentQuestion && (
                <div style={{ background: 'rgba(30, 41, 59, 0.8)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(59, 130, 246, 0.2)', maxHeight: '40%', overflowY: 'auto' }}>
                  <div style={{ padding: '4px 10px', background: getRoundColor() + '25', border: `1.5px solid ${getRoundColor()}50`, borderRadius: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: getRoundColor(), display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                    {getRoundIcon()}
                    {currentRound} • Question {roundProgress}
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
                    {currentQuestion.replace(/\*\*/g, '')}
                  </div>
                  
                  {/* Quick Actions */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                    <button onClick={() => speakText(currentQuestion)} title="Read question aloud" style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.35)', color: '#3b82f6', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Volume2 size={16} />
                      Read Aloud
                    </button>
                    
                    <button onClick={() => startListening('clarify')} disabled={isListening} style={{ background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.35)', color: '#8b5cf6', padding: '8px 14px', borderRadius: '8px', cursor: isListening ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', opacity: isListening ? 0.5 : 1 }}>
                      <Mic size={16} />
                      Ask Question
                    </button>
                    
                    <button onClick={requestHint} disabled={loading} style={{ background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.35)', color: '#eab308', padding: '8px 14px', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', opacity: loading ? 0.5 : 1 }}>
                      <Lightbulb size={16} />
                      Get Hint
                    </button>
                  </div>
                </div>
              )}

              {/* Editor or Voice Interface */}
              {currentRound === 'dsa' ? (
                <div style={{ flex: 1, background: 'rgba(30, 41, 59, 0.8)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <div style={{ background: 'rgba(15, 23, 42, 0.9)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <span style={{ fontWeight: '600', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <Code size={16} />
                      Code Editor - {language.toUpperCase()}
                    </span>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {editorLoaded ? '✅ Ready' : '⏳ Loading...'}
                    </div>
                  </div>
                  
                  <div style={{ flex: 1, minHeight: '400px' }}>
                    <Editor
                      height="100%"
                      language={language === 'cpp' ? 'cpp' : language}
                      theme="vs-dark"
                      value={code}
                      onChange={(val) => setCode(val || '')}
                      onMount={() => setEditorLoaded(true)}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2,
                        wordWrap: 'on',
                        quickSuggestions: true,
                        suggestOnTriggerCharacters: true
                      }}
                    />
                  </div>
                  
                  <div style={{ padding: '12px', background: 'rgba(15, 23, 42, 0.9)', borderTop: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', gap: '10px' }}>
                    <button onClick={submitCode} disabled={loading || !editorLoaded} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '600', cursor: (loading || !editorLoaded) ? 'not-allowed' : 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, opacity: (loading || !editorLoaded) ? 0.5 : 1 }}>
                      <CheckCircle size={16} />
                      {loading ? 'Submitting...' : 'Submit & Run Code'}
                    </button>
                    <button onClick={() => setCode('// Write your solution here\n\n')} style={{ background: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8', border: '1px solid rgba(100, 116, 139, 0.35)', padding: '10px 18px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RotateCcw size={16} />
                      Reset
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, background: 'rgba(30, 41, 59, 0.8)', borderRadius: '12px', padding: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '24px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <h3 style={{ fontSize: '22px', fontWeight: '700', color: '#e2e8f0', textAlign: 'center', marginBottom: '8px' }}>
                    {currentRound === 'theoretical' ? '🎯 Technical Discussion' : '💬 Behavioral Round'}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', marginBottom: '16px', maxWidth: '500px' }}>
                    {isListening 
                      ? '🎙️ I\'m listening... Click the microphone again when you\'re done speaking' 
                      : 'Click the microphone to speak your answer naturally. I\'ll listen to everything you say.'}
                  </p>
                  
                  <button
                    onClick={() => isListening ? stopListening() : startListening('answer')}
                    style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '50%',
                      background: isListening ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isListening ? '0 12px 40px rgba(239, 68, 68, 0.6)' : '0 12px 40px rgba(16, 185, 129, 0.6)',
                      transition: 'all 0.3s',
                      animation: isListening ? 'pulse 2s infinite' : 'none'
                    }}
                  >
                    {isListening ? <MicOff size={48} /> : <Mic size={48} />}
                  </button>
                  
                  {transcript && (
                    <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '20px', borderRadius: '12px', maxWidth: '90%', border: '1px solid rgba(59, 130, 246, 0.3)', animation: 'slideIn 0.4s ease-out', maxHeight: '150px', overflowY: 'auto' }}>
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.7', color: '#e2e8f0' }}>{transcript}</p>
                    </div>
                  )}
                  
                  {/* Text Input Alternative */}
                  <div style={{ width: '100%', maxWidth: '550px', marginTop: '20px' }}>
                    <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', textAlign: 'center' }}>Or type your response:</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="text"
                        placeholder="Type your answer here..."
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && textInput.trim() && submitAnswer(textInput, 'voice')}
                        style={{ flex: 1, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(59, 130, 246, 0.35)', color: '#e2e8f0', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                      />
                      <button
                        onClick={() => submitAnswer(textInput, 'voice')}
                        disabled={!textInput.trim() || loading}
                        style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: (textInput.trim() && !loading) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '600', opacity: (textInput.trim() && !loading) ? 1 : 0.4 }}
                      >
                        <Send size={18} />
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Chat */}
            <div style={{ background: 'rgba(30, 41, 59, 0.8)', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.9)', padding: '14px 18px', fontWeight: '600', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', fontSize: '14px' }}>
                <MessageSquare size={18} />
                Interview Chat
                {isListening && (
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', animation: 'pulse 2s infinite' }}>
                    <div style={{ width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%' }} />
                    Listening
                  </span>
                )}
              </div>
              
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {messages.map((msg, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start', animation: 'slideIn 0.3s ease-out' }}>
                    <div style={{
                      maxWidth: '85%',
                      background: msg.sender === 'ai' ? 'rgba(59, 130, 246, 0.15)' : msg.sender === 'user' ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(139, 92, 246, 0.15)',
                      color: msg.sender === 'system' ? '#a78bfa' : 'white',
                      padding: '12px 16px',
                      borderRadius: msg.sender === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      fontSize: '13px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      border: msg.sender === 'ai' ? '1px solid rgba(59, 130, 246, 0.25)' : msg.sender === 'system' ? '1px solid rgba(139, 92, 246, 0.25)' : 'none',
                      boxShadow: msg.sender === 'user' ? '0 4px 12px rgba(59, 130, 246, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.1)'
                    }}>
                      {msg.sender === 'ai' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '11px', color: '#60a5fa', fontWeight: '600' }}>
                          <div style={{ width: '20px', height: '20px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>AI</div>
                          {interviewerName || 'Interviewer'}
                        </div>
                      )}
                      {msg.text}
                    </div>
                  </div>
                ))}
                
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '12px 16px', borderRadius: '14px 14px 14px 4px', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '6px', height: '6px', background: '#3b82f6', borderRadius: '50%', animation: 'bounce 1.4s infinite' }} />
                      <div style={{ width: '6px', height: '6px', background: '#3b82f6', borderRadius: '50%', animation: 'bounce 1.4s infinite 0.2s' }} />
                      <div style={{ width: '6px', height: '6px', background: '#3b82f6', borderRadius: '50%', animation: 'bounce 1.4s infinite 0.4s' }} />
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>Thinking...</span>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>
              
              {/* Quick Chat Input */}
              <div style={{ padding: '12px', background: 'rgba(15, 23, 42, 0.9)', borderTop: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Type a message or question..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && textInput.trim() && askClarification()}
                    style={{ flex: 1, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(59, 130, 246, 0.35)', color: '#e2e8f0', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                  />
                  <button
                    onClick={askClarification}
                    disabled={!textInput.trim() || loading}
                    style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.35)', padding: '10px 16px', borderRadius: '8px', cursor: (textInput.trim() && !loading) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', opacity: (textInput.trim() && !loading) ? 1 : 0.4 }}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FEEDBACK STAGE */}
        {stage === 'feedback' && (
          <div style={{ maxWidth: '900px', margin: '60px auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <div style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 12px 32px rgba(16, 185, 129, 0.5)', animation: 'scaleIn 0.5s ease-out' }}>
                <CheckCircle size={40} color="white" />
              </div>
              <h2 style={{ fontSize: '36px', marginBottom: '12px', fontWeight: '700', background: 'linear-gradient(135deg, #10b981, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Interview Complete!</h2>
              <p style={{ fontSize: '15px', color: '#94a3b8' }}>Here's your comprehensive performance feedback</p>
            </div>
            
            <div style={{ background: 'rgba(30, 41, 59, 0.8)', borderRadius: '14px', padding: '36px', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '32px' }}>
              {messages.filter(m => m.sender === 'system').slice(-1).map((msg, idx) => (
                <div key={idx} style={{ whiteSpace: 'pre-wrap', lineHeight: '1.9', fontSize: '14px', color: '#cbd5e1' }}>
                  {msg.text}
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.location.reload()}
                style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', border: 'none', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 6px 20px rgba(59, 130, 246, 0.5)', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <RotateCcw size={18} />
                Start New Interview
              </button>
              <button
                onClick={() => window.print()}
                style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.35)', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                📄 Download Feedback
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Global Styles */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-8px); }
        }
        
        @keyframes pulse {
          0%, 100% { box-shadow: 0 12px 40px rgba(239, 68, 68, 0.5); }
          50% { box-shadow: 0 16px 48px rgba(239, 68, 68, 0.8); }
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        @keyframes scaleIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        
        button:not(:disabled):hover {
          transform: translateY(-2px);
          transition: all 0.2s ease;
        }
        
        button:not(:disabled):active {
          transform: translateY(0);
        }
        
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        ::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.6);
          border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: rgba(59, 130, 246, 0.6);
          border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.8);
        }
        
        input:focus, select:focus, textarea:focus {
          outline: 2px solid rgba(59, 130, 246, 0.5);
          outline-offset: 2px;
        }
        
        @media print {
          button { display: none !important; }
          nav { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default App;