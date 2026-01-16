
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Prize, ScriptItem, ConnectionStatus } from './types';
import { INITIAL_PRIZES, INITIAL_SCRIPTS, SYSTEM_INSTRUCTION } from './constants';
import { createBlob, decode, decodeAudioData } from './services/audioUtils';
import AudioVisualizer from './components/AudioVisualizer';

const App: React.FC = () => {
  // 從 localStorage 讀取初始化資料
  const getInitialPrizes = () => {
    const saved = localStorage.getItem('mc_buddy_prizes');
    return saved ? JSON.parse(saved) : INITIAL_PRIZES;
  };

  const getInitialScripts = () => {
    const saved = localStorage.getItem('mc_buddy_scripts');
    return saved ? JSON.parse(saved) : INITIAL_SCRIPTS;
  };

  const [prizes, setPrizes] = useState<Prize[]>(getInitialPrizes);
  const [scripts, setScripts] = useState<ScriptItem[]>(getInitialScripts);
  const [activeTab, setActiveTab] = useState<'prizes' | 'scripts'>('prizes');
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [transcription, setTranscription] = useState<string>("");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [showSaveMsg, setShowSaveMsg] = useState(false);

  // 持久化儲存
  useEffect(() => {
    localStorage.setItem('mc_buddy_prizes', JSON.stringify(prizes));
    localStorage.setItem('mc_buddy_scripts', JSON.stringify(scripts));
    setShowSaveMsg(true);
    const timer = setTimeout(() => setShowSaveMsg(false), 2000);
    return () => clearTimeout(timer);
  }, [prizes, scripts]);

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

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
      
      if (!inputAudioContextRef.current) {
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const dynamicInstruction = `${SYSTEM_INSTRUCTION}
      
當前獎項清單 (由 INA 觸發)：
${prizes.map(p => `- ${p.name}: ${p.description} (名額: ${p.count})`).join('\n')}

預設文稿範本 (由 INA 觸發)：
${scripts.map(s => `- ${s.title}: ${s.content}`).join('\n')}
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              setTranscription(prev => prev + message.serverContent.outputTranscription.text);
            }
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
                if (sourcesRef.current.size === 0) setIsAiSpeaking(false);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }
          },
          onerror: (e) => setStatus(ConnectionStatus.ERROR),
          onclose: () => setStatus(ConnectionStatus.DISCONNECTED)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: dynamicInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } // 更改為男性聲音 Puck
          },
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const resetToDefault = () => {
    if (confirm('確定要重設所有內容嗎？這將覆蓋您目前的修改。')) {
      setPrizes(INITIAL_PRIZES);
      setScripts(INITIAL_SCRIPTS);
    }
  };

  // 管理函數... (與之前相同但保持一致性)
  const updatePrize = (id: string, updates: Partial<Prize>) => setPrizes(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  const deletePrize = (id: string) => setPrizes(prev => prev.filter(p => p.id !== id));
  const addPrize = () => setPrizes(prev => [...prev, { id: Date.now().toString(), name: '新獎項', count: 1, description: '內容描述...', announced: false }]);
  const updateScript = (id: string, updates: Partial<ScriptItem>) => setScripts(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  const deleteScript = (id: string) => setScripts(prev => prev.filter(s => s.id !== id));
  const addScript = () => setScripts(prev => [...prev, { id: Date.now().toString(), title: '新文稿範本', content: '在此輸入播報內容...' }]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="festive-gradient p-6 shadow-xl relative overflow-hidden">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md border border-white/30">
              <i className="fas fa-microphone-lines text-3xl text-yellow-300"></i>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">尾牙主持神隊友</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-yellow-400 text-red-900 text-[10px] font-black px-2 py-0.5 rounded-full">指令關鍵字: INA</span>
                <span className="bg-blue-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">VOICE: 男性 (PUCK)</span>
              </div>
            </div>
          </div>
          <button 
            onClick={toggleConnection}
            className={`px-6 py-3 rounded-full font-bold transition-all shadow-lg active:scale-95 ${
              status === ConnectionStatus.CONNECTED ? 'bg-red-500 text-white' : 'bg-green-500 text-white animate-pulse'
            }`}
          >
            {status === ConnectionStatus.CONNECTED ? '關閉 AI 助手' : '啟動 AI 助手'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-3xl flex flex-col h-full min-h-[400px]">
            <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-robot text-blue-400"></i>
                AI 互動
              </div>
              {showSaveMsg && <span className="text-[10px] text-green-400 animate-fade-in">已自動儲存內容</span>}
            </h2>
            <div className="flex-1 flex flex-col gap-4">
              <div className="bg-yellow-400/10 border border-yellow-400/30 p-4 rounded-2xl text-xs">
                <p className="font-bold text-yellow-400 mb-1">男性語音指令範例：</p>
                <p className="text-slate-400">「INA，請幫我播報頭獎內容」</p>
                <p className="text-slate-400">「INA，朗讀開場白範本」</p>
              </div>
              <AudioVisualizer isActive={isAiSpeaking} />
              <div className="flex-1 bg-slate-900/80 p-4 rounded-2xl border border-slate-700 overflow-y-auto max-h-[250px] text-sm text-slate-300 italic whitespace-pre-wrap">
                {transcription || "等待指令中..."}
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-2 flex flex-col gap-6">
          <div className="glass-panel rounded-3xl overflow-hidden flex flex-col flex-1">
            <div className="flex bg-slate-800/50 border-b border-slate-700 justify-between items-center">
              <div className="flex flex-1">
                <button onClick={() => setActiveTab('prizes')} className={`flex-1 py-4 font-bold ${activeTab === 'prizes' ? 'text-yellow-400 border-b-2 border-yellow-400 bg-yellow-400/5' : 'text-slate-400'}`}>獎項管理</button>
                <button onClick={() => setActiveTab('scripts')} className={`flex-1 py-4 font-bold ${activeTab === 'scripts' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-slate-400'}`}>主持文稿</button>
              </div>
              <button onClick={resetToDefault} className="px-4 text-xs text-slate-500 hover:text-red-400 flex items-center gap-1"><i className="fas fa-undo"></i>重設</button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[500px]">
              {activeTab === 'prizes' ? (
                <div className="flex flex-col gap-4">
                  {prizes.map((p) => (
                    <div key={p.id} className="bg-slate-800/40 border border-slate-700 p-4 rounded-2xl">
                      <div className="flex flex-col md:flex-row gap-3">
                        <div className="flex-1 space-y-2">
                          <input value={p.name} onChange={(e) => updatePrize(p.id, { name: e.target.value })} className="bg-transparent text-lg font-bold w-full text-yellow-400 focus:outline-none" />
                          <input value={p.description} onChange={(e) => updatePrize(p.id, { description: e.target.value })} className="bg-transparent text-sm text-slate-400 w-full focus:outline-none" />
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="number" value={p.count} onChange={(e) => updatePrize(p.id, { count: parseInt(e.target.value) || 0 })} className="bg-slate-900 w-12 text-center rounded border border-slate-700 py-1" />
                          <button onClick={() => deletePrize(p.id)} className="text-slate-500 hover:text-red-400 px-2"><i className="fas fa-trash"></i></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={addPrize} className="border-2 border-dashed border-slate-700 p-4 rounded-2xl text-slate-500 hover:text-yellow-400">+ 新增獎項</button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {scripts.map((s) => (
                    <div key={s.id} className="bg-slate-800/40 border border-slate-700 p-4 rounded-2xl">
                      <div className="flex justify-between items-center mb-2">
                        <input value={s.title} onChange={(e) => updateScript(s.id, { title: e.target.value })} className="bg-transparent text-lg font-bold text-blue-400 focus:outline-none" />
                        <button onClick={() => deleteScript(s.id)} className="text-slate-500 hover:text-red-400"><i className="fas fa-trash"></i></button>
                      </div>
                      <textarea value={s.content} onChange={(e) => updateScript(s.id, { content: e.target.value })} className="bg-slate-900/50 text-slate-300 w-full p-3 rounded-lg border border-slate-700 focus:outline-none h-32 resize-none" />
                    </div>
                  ))}
                  <button onClick={addScript} className="border-2 border-dashed border-slate-700 p-4 rounded-2xl text-slate-500 hover:text-blue-400">+ 新增範本</button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
