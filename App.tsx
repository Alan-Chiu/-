
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Prize, ScriptItem, ConnectionStatus } from './types';
import { INITIAL_PRIZES, INITIAL_SCRIPTS, SYSTEM_INSTRUCTION } from './constants';
import { createBlob, decode, decodeAudioData } from './services/audioUtils';
import AudioVisualizer from './components/AudioVisualizer';

const App: React.FC = () => {
  const [prizes, setPrizes] = useState<Prize[]>(INITIAL_PRIZES);
  const [scripts, setScripts] = useState<ScriptItem[]>(INITIAL_SCRIPTS);
  const [activeTab, setActiveTab] = useState<'prizes' | 'scripts'>('prizes');
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [transcription, setTranscription] = useState<string>("");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

  // Transcription buffer
  const currentOutputTranscriptionRef = useRef("");

  const stopAudio = useCallback(() => {
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsAiSpeaking(false);
  }, []);

  const toggleConnection = async () => {
    if (status === ConnectionStatus.CONNECTED) {
      if (sessionRef.current) {
        sessionRef.current.close();
      }
      stopAudio();
      setStatus(ConnectionStatus.DISCONNECTED);
      return;
    }

    try {
      setStatus(ConnectionStatus.CONNECTING);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      // Initialize Audio Contexts if not already
      if (!inputAudioContextRef.current) {
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // We'll construct a dynamic system instruction based on the current prizes and scripts
      const dynamicInstruction = `${SYSTEM_INSTRUCTION}
      
當前獎項清單：
${prizes.map(p => `- ${p.name}: ${p.description} (剩餘 ${p.count} 名)`).join('\n')}

預設文稿片段：
${scripts.map(s => `- ${s.title}: ${s.content}`).join('\n')}
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log('Gemini Live session opened');
            setStatus(ConnectionStatus.CONNECTED);
            
            // Start streaming from mic
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (status === ConnectionStatus.CONNECTED || true) { // Using ref/check within promise
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              }
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle transcriptions
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              currentOutputTranscriptionRef.current += text;
              setTranscription(prev => prev + text);
            }

            if (message.serverContent?.turnComplete) {
              currentOutputTranscriptionRef.current = "";
            }

            // Handle Audio output
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              setIsAiSpeaking(true);
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) {
                  setIsAiSpeaking(false);
                }
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              stopAudio();
            }
          },
          onerror: (e) => {
            console.error('Gemini Live error:', e);
            setStatus(ConnectionStatus.ERROR);
          },
          onclose: () => {
            console.log('Gemini Live session closed');
            setStatus(ConnectionStatus.DISCONNECTED);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: dynamicInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          outputAudioTranscription: {}
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err) {
      console.error('Failed to connect:', err);
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const updatePrize = (id: string, updates: Partial<Prize>) => {
    setPrizes(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deletePrize = (id: string) => {
    setPrizes(prev => prev.filter(p => p.id !== id));
  };

  const addPrize = () => {
    const newPrize: Prize = {
      id: Date.now().toString(),
      name: '新獎項',
      count: 1,
      description: '請填寫描述',
      announced: false
    };
    setPrizes(prev => [...prev, newPrize]);
  };

  const updateScript = (id: string, updates: Partial<ScriptItem>) => {
    setScripts(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteScript = (id: string) => {
    setScripts(prev => prev.filter(s => s.id !== id));
  };

  const addScript = () => {
    const newScript: ScriptItem = {
      id: Date.now().toString(),
      title: '新文稿',
      content: '在此輸入內容...'
    };
    setScripts(prev => [...prev, newScript]);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="festive-gradient p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <i className="fas fa-gift absolute top-4 left-10 text-6xl rotate-12"></i>
          <i className="fas fa-music absolute bottom-4 right-10 text-6xl -rotate-12"></i>
          <i className="fas fa-star absolute top-1/2 left-1/4 text-4xl"></i>
        </div>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md border border-white/30">
              <i className="fas fa-microphone-lines text-3xl text-yellow-300"></i>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">尾牙主持神隊友</h1>
              <p className="text-red-100/80 text-sm">Gemini AI 多模態語音主持助手</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleConnection}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all shadow-lg active:scale-95 ${
                status === ConnectionStatus.CONNECTED 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : status === ConnectionStatus.CONNECTING
                ? 'bg-yellow-500 text-white animate-pulse'
                : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              <i className={`fas ${status === ConnectionStatus.CONNECTED ? 'fa-stop-circle' : 'fa-play-circle'}`}></i>
              {status === ConnectionStatus.CONNECTED ? '關閉 AI 助手' : status === ConnectionStatus.CONNECTING ? '連線中...' : '啟動 AI 助手'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: AI Interface */}
        <section className="lg:col-span-1 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-3xl flex flex-col h-full min-h-[400px]">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <i className="fas fa-robot text-blue-400"></i>
              AI 互動面板
            </h2>
            
            <div className="flex-1 flex flex-col gap-4">
              {/* Visualizer and Status */}
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">音頻輸出</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${isAiSpeaking ? 'bg-green-500 animate-ping' : 'bg-slate-600'}`}></div>
                    <span className="text-xs text-slate-400">{isAiSpeaking ? 'AI 正在發言' : '靜止'}</span>
                  </div>
                </div>
                <AudioVisualizer isActive={isAiSpeaking} />
              </div>

              {/* Transcription Area */}
              <div className="flex-1 bg-slate-900/80 p-4 rounded-2xl border border-slate-700 overflow-y-auto max-h-[300px] scrollbar-hide">
                <p className="text-xs font-semibold text-slate-500 mb-2">AI 語音紀錄</p>
                <p className="text-slate-300 leading-relaxed italic">
                  {transcription || "尚未開始連線。開啟 AI 助手後，您可以直接對話，AI 將協助您主持並播報內容。"}
                </p>
              </div>

              <div className="text-center p-4">
                <p className="text-xs text-slate-500">
                  <i className="fas fa-info-circle mr-1"></i>
                  小提醒：AI 已獲取下方的獎項與文稿資訊。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Content Management */}
        <section className="lg:col-span-2 flex flex-col gap-6">
          <div className="glass-panel rounded-3xl overflow-hidden flex flex-col flex-1">
            {/* Tabs */}
            <div className="flex bg-slate-800/50 border-b border-slate-700">
              <button 
                onClick={() => setActiveTab('prizes')}
                className={`flex-1 py-4 px-6 font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'prizes' ? 'text-yellow-400 border-b-2 border-yellow-400 bg-yellow-400/5' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <i className="fas fa-trophy"></i>
                獎項管理
              </button>
              <button 
                onClick={() => setActiveTab('scripts')}
                className={`flex-1 py-4 px-6 font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'scripts' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <i className="fas fa-scroll"></i>
                活動文稿
              </button>
            </div>

            {/* Content Area */}
            <div className="p-6 overflow-y-auto max-h-[600px]">
              {activeTab === 'prizes' ? (
                <div className="flex flex-col gap-4">
                  {prizes.map((prize) => (
                    <div key={prize.id} className="bg-slate-800/40 border border-slate-700 p-4 rounded-2xl group hover:border-yellow-400/50 transition-colors">
                      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                        <div className="flex-1 w-full space-y-2">
                          <input 
                            value={prize.name}
                            onChange={(e) => updatePrize(prize.id, { name: e.target.value })}
                            className="bg-transparent text-lg font-bold w-full focus:outline-none focus:text-yellow-400"
                            placeholder="輸入獎項名稱..."
                          />
                          <input 
                            value={prize.description}
                            onChange={(e) => updatePrize(prize.id, { description: e.target.value })}
                            className="bg-transparent text-sm text-slate-400 w-full focus:outline-none focus:text-slate-200"
                            placeholder="輸入獎項描述..."
                          />
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto justify-between">
                          <div className="flex items-center gap-2 bg-slate-900 rounded-lg px-3 py-1 border border-slate-700">
                            <label className="text-xs text-slate-500 uppercase">數量</label>
                            <input 
                              type="number" 
                              value={prize.count}
                              onChange={(e) => updatePrize(prize.id, { count: parseInt(e.target.value) || 0 })}
                              className="bg-transparent w-12 text-center focus:outline-none"
                            />
                          </div>
                          <button 
                            onClick={() => deletePrize(prize.id)}
                            className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={addPrize}
                    className="border-2 border-dashed border-slate-700 p-4 rounded-2xl text-slate-500 hover:text-yellow-400 hover:border-yellow-400/50 transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-plus-circle"></i>
                    新增獎項
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                   {scripts.map((script) => (
                    <div key={script.id} className="bg-slate-800/40 border border-slate-700 p-4 rounded-2xl group hover:border-blue-400/50 transition-colors">
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <input 
                            value={script.title}
                            onChange={(e) => updateScript(script.title, { title: e.target.value })}
                            className="bg-transparent text-lg font-bold focus:outline-none focus:text-blue-400"
                            placeholder="段落標題..."
                          />
                          <button 
                            onClick={() => deleteScript(script.id)}
                            className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                        <textarea 
                          value={script.content}
                          onChange={(e) => updateScript(script.id, { content: e.target.value })}
                          className="bg-transparent text-slate-300 w-full focus:outline-none border-l-2 border-slate-700 pl-4 py-1 resize-none h-24"
                          placeholder="在此輸入內容..."
                        />
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={addScript}
                    className="border-2 border-dashed border-slate-700 p-4 rounded-2xl text-slate-500 hover:text-blue-400 hover:border-blue-400/50 transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-plus-circle"></i>
                    新增段落
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer / Status Bar */}
      <footer className="glass-panel p-4 flex justify-between items-center text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <i className="fas fa-code-branch"></i>
            v1.0.0
          </span>
          <span className="flex items-center gap-1">
            <i className="fas fa-wifi"></i>
            系統狀態: 
            <span className={status === ConnectionStatus.CONNECTED ? 'text-green-500' : 'text-red-500'}>
              {status}
            </span>
          </span>
        </div>
        <div className="hidden md:block">
          由 Google Gemini 2.5 Pro 提供技術支援
        </div>
      </footer>
    </div>
  );
};

export default App;
