import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Send, 
  ChevronLeft, 
  ChevronRight, 
  MessageSquare, 
  RefreshCw, 
  ArrowRight,
  Stethoscope,
  Info,
  CheckCircle2,
  AlertCircle,
  Upload,
  Camera,
  Type as TypeIcon,
  X,
  FileUp,
  Image as ImageIcon,
  History,
  Trash2,
  Clock
} from 'lucide-react';
import Markdown from 'react-markdown';
import { analyzeDischargeNote, createChatSession } from './services/gemini';
import { DischargeAnalysis, Message, ExplanationSlide, HistoryItem } from './types';
import { cn } from './lib/utils';
import { Part } from '@google/genai';

type InputMethod = 'text' | 'file' | 'camera';

export default function App() {
  const [inputMethod, setInputMethod] = useState<InputMethod>('text');
  const [inputNote, setInputNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ file: File, preview: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<DischargeAnalysis | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [chatSession, setChatSession] = useState<any>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [email, setEmail] = useState('');
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [showReportPrompt, setShowReportPrompt] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [demographics, setDemographics] = useState({ age: '', gender: '', location: '' });
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistory(data);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  const saveToHistory = async (originalInput: string, analysis: DischargeAnalysis) => {
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_input: originalInput,
          analysis_json: JSON.stringify(analysis)
        })
      });
      fetchHistory();
    } catch (error) {
      console.error("Failed to save to history:", error);
    }
  };

  const deleteHistoryItem = async (id: number) => {
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      fetchHistory();
    } catch (error) {
      console.error("Failed to delete history item:", error);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    const parsedAnalysis = JSON.parse(item.analysis_json);
    setAnalysis(parsedAnalysis);
    const session = createChatSession(parsedAnalysis, item.original_input);
    setChatSession(session);
    setCurrentSlide(0);
    setChatMessages([]);
    setShowHistory(false);
    setReportSent(false);
    setShowReportPrompt(false);
  };

  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !analysis) return;
    setIsSendingReport(true);
    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, analysis })
      });
      if (res.ok) {
        setReportSent(true);
      }
    } catch (error) {
      console.error("Failed to send report:", error);
    } finally {
      setIsSendingReport(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedFile({ file, preview: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      
      // Convert to file
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], "captured-note.jpg", { type: "image/jpeg" });
          setSelectedFile({ file, preview: dataUrl });
          stopCamera();
        });
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      let input: string | Part[];
      let originalText = "";
      
      if (inputMethod === 'text') {
        if (!inputNote.trim()) return;
        input = inputNote;
        originalText = inputNote;
      } else {
        if (!selectedFile) return;
        const base64 = await fileToBase64(selectedFile.file);
        input = [{
          inlineData: {
            data: base64,
            mimeType: selectedFile.file.type
          }
        }];
        originalText = `Multimodal input (${selectedFile.file.name})`;
      }

      const result = await analyzeDischargeNote(
        input, 
        isPremium, 
        isPremium ? { ...demographics, latLng: userLocation || undefined } : undefined
      );
      setAnalysis(result);
      const session = createChatSession(result, originalText);
      setChatSession(session);
      setCurrentSlide(0);
      setChatMessages([]);
      
      // Save to backend history
      saveToHistory(originalText, result);
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("Failed to analyze the note. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpgrade = () => {
    // Simulate payment
    setIsPremium(true);
    setShowUpgradeModal(false);
    
    // Get location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => console.error("Error getting location:", error)
      );
    }
  };

  const syncToCalendar = (reminder: { title: string; date: string; description: string }) => {
    // In a real app, this would use Google Calendar API
    // For now, we generate a .ics file or a Google Calendar link
    const startTime = new Date().toISOString().replace(/-|:|\.\d+/g, '');
    const endTime = new Date(Date.now() + 3600000).toISOString().replace(/-|:|\.\d+/g, '');
    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(reminder.title)}&dates=${startTime}/${endTime}&details=${encodeURIComponent(reminder.description)}&sf=true&output=xml`;
    window.open(url, '_blank');
  };

  const handleSendMessage = async () => {
    if (!userQuery.trim() || !chatSession || isChatting) return;
    
    const newMessage: Message = { role: 'user', text: userQuery };
    setChatMessages(prev => [...prev, newMessage]);
    setUserQuery('');
    setIsChatting(true);

    try {
      const response = await chatSession.sendMessage({ message: userQuery });
      const modelMessage: Message = { role: 'model', text: response.text || "I'm sorry, I couldn't process that." };
      setChatMessages(prev => [...prev, modelMessage]);
    } catch (error) {
      console.error("Chat failed:", error);
      setChatMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsChatting(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const reset = () => {
    setAnalysis(null);
    setInputNote('');
    setSelectedFile(null);
    setChatMessages([]);
    setChatSession(null);
    stopCamera();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8">
      {/* Header */}
      <header className="w-full max-w-4xl mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
            <Stethoscope className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">DocDecode</h1>
        </div>
        <div className="flex items-center gap-4">
          {!isPremium && (
            <button 
              onClick={() => setShowUpgradeModal(true)}
              className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-orange-100 hover:scale-105 transition-all flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              Go Premium
            </button>
          )}
          {isPremium && (
            <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
              Premium
            </div>
          )}
          <button 
            onClick={() => setShowHistory(true)}
            className="text-sm font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
          >
            <History className="w-4 h-4" />
            History
          </button>
          {analysis && (
            <button 
              onClick={reset}
              className="text-sm font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              New Note
            </button>
          )}
        </div>
      </header>

      <main className="w-full max-w-4xl flex-1 flex flex-col gap-8">
        {!analysis ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 md:p-8"
          >
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-2">How would you like to provide your medical document?</h2>
              <p className="text-slate-500 text-sm">Upload discharge notes, X-rays, or lab charts to get a simple explanation.</p>
            </div>

            {/* Input Method Tabs */}
            {isPremium && (
              <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100">
                <div className="col-span-full mb-2">
                  <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Demographic Context (Premium)
                  </h3>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Age</label>
                  <input 
                    type="number" 
                    value={demographics.age}
                    onChange={(e) => setDemographics({...demographics, age: e.target.value})}
                    placeholder="e.g. 45"
                    className="w-full px-3 py-2 bg-white border border-indigo-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Gender</label>
                  <select 
                    value={demographics.gender}
                    onChange={(e) => setDemographics({...demographics, gender: e.target.value})}
                    className="w-full px-3 py-2 bg-white border border-indigo-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Location</label>
                  <input 
                    type="text" 
                    value={demographics.location}
                    onChange={(e) => setDemographics({...demographics, location: e.target.value})}
                    placeholder="e.g. New York, NY"
                    className="w-full px-3 py-2 bg-white border border-indigo-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            <div className="flex p-1 bg-slate-100 rounded-2xl mb-8">
              {[
                { id: 'text', icon: TypeIcon, label: 'Text' },
                { id: 'file', icon: FileUp, label: 'File' },
                { id: 'camera', icon: Camera, label: 'Camera' }
              ].map((method) => (
                <button
                  key={method.id}
                  onClick={() => {
                    setInputMethod(method.id as InputMethod);
                    if (method.id !== 'camera') stopCamera();
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all",
                    inputMethod === method.id 
                      ? "bg-white text-indigo-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <method.icon className="w-4 h-4" />
                  {method.label}
                </button>
              ))}
            </div>
            
            <div className="min-h-[300px] flex flex-col">
              {inputMethod === 'text' && (
                <textarea
                  value={inputNote}
                  onChange={(e) => setInputNote(e.target.value)}
                  placeholder="Paste your discharge note here..."
                  className="w-full h-64 p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none font-sans text-slate-700"
                />
              )}

              {inputMethod === 'file' && (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex-1 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 cursor-pointer transition-all",
                    selectedFile ? "border-indigo-200 bg-indigo-50/30" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                  )}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    accept="image/*,application/pdf"
                  />
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-4">
                      {selectedFile.file.type.startsWith('image/') ? (
                        <img src={selectedFile.preview} alt="Preview" className="w-32 h-32 object-cover rounded-xl shadow-md" />
                      ) : (
                        <div className="w-32 h-32 bg-white rounded-xl shadow-md flex items-center justify-center">
                          <FileText className="w-12 h-12 text-indigo-600" />
                        </div>
                      )}
                      <div className="text-center">
                        <p className="font-semibold text-slate-900">{selectedFile.file.name}</p>
                        <p className="text-xs text-slate-500">{(selectedFile.file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                        className="text-xs text-red-500 font-bold uppercase tracking-wider hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="bg-indigo-100 p-4 rounded-2xl mb-4">
                        <Upload className="w-8 h-8 text-indigo-600" />
                      </div>
                      <p className="font-bold text-slate-900">Click to upload</p>
                      <p className="text-sm text-slate-500 mt-1">PDF, X-ray, or Chart (JPG, PNG)</p>
                    </>
                  )}
                </div>
              )}

              {inputMethod === 'camera' && (
                <div className="flex-1 bg-black rounded-3xl overflow-hidden relative min-h-[400px]">
                  {!isCameraActive && !selectedFile && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-8 text-center">
                      <Camera className="w-12 h-12 mb-4 opacity-50" />
                      <p className="font-semibold mb-4">Take a photo of your discharge papers, X-ray, or chart</p>
                      <button 
                        onClick={startCamera}
                        className="bg-indigo-600 px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
                      >
                        Start Camera
                      </button>
                    </div>
                  )}
                  
                  {isCameraActive && (
                    <>
                      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4">
                        <button 
                          onClick={capturePhoto}
                          className="w-16 h-16 bg-white rounded-full border-4 border-slate-300 flex items-center justify-center shadow-xl active:scale-95 transition-all"
                        >
                          <div className="w-12 h-12 bg-indigo-600 rounded-full" />
                        </button>
                        <button 
                          onClick={stopCamera}
                          className="absolute right-8 bottom-4 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-all"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      </div>
                    </>
                  )}

                  {selectedFile && inputMethod === 'camera' && (
                    <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-8">
                      <img src={selectedFile.preview} alt="Captured" className="max-h-[80%] rounded-2xl shadow-2xl" />
                      <div className="mt-6 flex gap-4">
                        <button 
                          onClick={() => { setSelectedFile(null); startCamera(); }}
                          className="px-6 py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all"
                        >
                          Retake
                        </button>
                        <button 
                          onClick={() => setInputMethod('camera')}
                          className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
                        >
                          Looks Good
                        </button>
                      </div>
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}
            </div>
            
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || (inputMethod === 'text' ? !inputNote.trim() : !selectedFile)}
                className={cn(
                  "px-8 py-4 rounded-2xl font-semibold flex items-center gap-2 transition-all shadow-lg",
                  isAnalyzing || (inputMethod === 'text' ? !inputNote.trim() : !selectedFile)
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                    : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200"
                )}
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    Decode Note
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1">
            {/* Slides Section */}
            <div className="lg:col-span-3 flex flex-col gap-6">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden"
              >
                {/* Slide Header */}
                <div className="bg-slate-50 border-bottom border-slate-200 p-4 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Topic {currentSlide + 1} of {analysis.slides.length}
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
                      disabled={currentSlide === 0}
                      className="p-2 rounded-full hover:bg-white disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setCurrentSlide(prev => Math.min(analysis.slides.length - 1, prev + 1))}
                      disabled={currentSlide === analysis.slides.length - 1}
                      className="p-2 rounded-full hover:bg-white disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Slide Content */}
                <div className="p-8 flex-1 overflow-y-auto">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentSlide}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="h-full flex flex-col"
                    >
                      <h3 className="text-3xl font-serif font-bold text-slate-900 mb-6">
                        {analysis.slides[currentSlide].topic}
                      </h3>
                      
                      <div className="markdown-body flex-1">
                        <Markdown>{analysis.slides[currentSlide].content}</Markdown>
                      </div>

                      <div className="mt-8 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-3">
                        <Info className="w-5 h-5 text-indigo-600 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-1">The Bottom Line</p>
                          <p className="text-indigo-900 font-medium">{analysis.slides[currentSlide].laymanSummary}</p>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Progress Bar */}
                <div className="h-1.5 bg-slate-100 w-full">
                  <motion.div 
                    className="h-full bg-indigo-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${((currentSlide + 1) / analysis.slides.length) * 100}%` }}
                  />
                </div>
              </motion.div>

              {/* Overall Summary Card */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6"
              >
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h4 className="font-bold text-emerald-900 uppercase tracking-wider text-xs">Overall Summary</h4>
                </div>
                <p className="text-emerald-900 leading-relaxed font-medium">
                  {analysis.overallSummary}
                </p>
              </motion.div>

              {/* Premium Insights */}
              {isPremium && (
                <>
                  {analysis.demographicInsights && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-indigo-600 text-white rounded-3xl p-6 shadow-xl shadow-indigo-100"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <History className="w-5 h-5" />
                        <h4 className="font-bold uppercase tracking-wider text-xs">Demographic Insights</h4>
                      </div>
                      <p className="leading-relaxed text-indigo-50">
                        {analysis.demographicInsights}
                      </p>
                    </motion.div>
                  )}

                  {analysis.reminders && analysis.reminders.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white border border-slate-200 rounded-3xl p-6"
                    >
                      <div className="flex items-center gap-2 mb-4">
                        <Clock className="w-5 h-5 text-indigo-600" />
                        <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs">Upcoming Reminders</h4>
                      </div>
                      <div className="space-y-3">
                        {analysis.reminders.map((rem, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{rem.title}</p>
                              <p className="text-xs text-slate-500">{rem.date}</p>
                            </div>
                            <button 
                              onClick={() => syncToCalendar(rem)}
                              className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all"
                            >
                              Sync to Calendar
                            </button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {analysis.nearbyFollowUp && analysis.nearbyFollowUp.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white border border-slate-200 rounded-3xl p-6"
                    >
                      <div className="flex items-center gap-2 mb-4">
                        <Stethoscope className="w-5 h-5 text-indigo-600" />
                        <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs">Nearby Follow-up Places</h4>
                      </div>
                      <div className="space-y-3">
                        {analysis.nearbyFollowUp.map((place, i) => (
                          <a 
                            key={i} 
                            href={place.uri} 
                            target="_blank" 
                            rel="noreferrer"
                            className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-300 transition-all group"
                          >
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{place.name}</p>
                              <p className="text-xs text-slate-500">{place.address}</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-all" />
                          </a>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {/* Finish Session / Report Prompt */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6"
              >
                {!showReportPrompt ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900">Finished with your session?</h4>
                      <p className="text-sm text-slate-500">Get a comprehensive report sent to your email for later reference.</p>
                    </div>
                    <button 
                      onClick={() => setShowReportPrompt(true)}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                    >
                      Finish & Get Report
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900">Comprehensive Report</h4>
                      <button 
                        onClick={() => setShowReportPrompt(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    {reportSent ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3"
                      >
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        <div>
                          <p className="font-bold text-emerald-900">Report Sent!</p>
                          <p className="text-sm text-emerald-700">A copy has been sent to <strong>{email}</strong>.</p>
                        </div>
                      </motion.div>
                    ) : (
                      <form onSubmit={handleSendReport} className="flex gap-2">
                        <input 
                          type="email" 
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Enter your email address"
                          className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                        <button 
                          type="submit"
                          disabled={isSendingReport}
                          className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
                        >
                          {isSendingReport ? "Sending..." : "Send Report"}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </motion.div>
            </div>

            {/* Chat Section */}
            <div className="lg:col-span-2 flex flex-col h-[600px] lg:h-auto">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-900">Follow-up Questions</h3>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6">
                      <div className="bg-indigo-100 p-3 rounded-2xl mb-4">
                        <Info className="w-6 h-6 text-indigo-600" />
                      </div>
                      <p className="text-slate-500 text-sm">
                        Ask anything about your document. For example: "What does this value mean?" or "Are there any abnormalities in the X-ray?"
                      </p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "max-w-[85%] p-3 rounded-2xl text-sm",
                        msg.role === 'user' 
                          ? "bg-indigo-600 text-white ml-auto rounded-tr-none" 
                          : "bg-white border border-slate-200 text-slate-700 mr-auto rounded-tl-none shadow-sm"
                      )}
                    >
                      <Markdown>{msg.text}</Markdown>
                    </div>
                  ))}
                  {isChatting && (
                    <div className="bg-white border border-slate-200 text-slate-700 mr-auto rounded-2xl rounded-tl-none p-3 shadow-sm">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 bg-white border-t border-slate-100">
                  <div className="relative">
                    <input
                      type="text"
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask a question..."
                      className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!userQuery.trim() || isChatting}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl disabled:opacity-30 transition-all"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 flex items-center gap-2 px-2">
                <AlertCircle className="w-4 h-4 text-slate-400" />
                <p className="text-[10px] text-slate-400 leading-tight">
                  DocDecode provides AI-generated summaries for informational purposes only. Always consult your doctor for medical advice.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* History Sidebar/Modal */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-xl font-bold text-slate-900">Your History</h2>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                    <Clock className="w-12 h-12 mb-4 opacity-20" />
                    <p>No history yet. Analyze a note to see it here.</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div 
                      key={item.id}
                      className="group bg-slate-50 border border-slate-200 rounded-2xl p-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer relative"
                      onClick={() => loadFromHistory(item)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {new Date(item.timestamp).toLocaleDateString()} at {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id); }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 line-clamp-2 mb-1">
                        {item.original_input}
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-1">
                        {JSON.parse(item.analysis_json).overallSummary}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Upgrade Modal */}
      <AnimatePresence>
        {showUpgradeModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUpgradeModal(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-[40px] shadow-2xl z-[70] overflow-hidden"
            >
              <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-12 text-white text-center relative">
                <div className="absolute top-6 right-6">
                  <button onClick={() => setShowUpgradeModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="bg-white/20 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
                  <Stethoscope className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-4xl font-serif font-bold mb-4 italic">DocDecode Premium</h2>
                <p className="text-indigo-100 text-lg">Unlock deeper insights and personalized care.</p>
              </div>
              
              <div className="p-10 space-y-8">
                <div className="space-y-4">
                  {[
                    { icon: History, title: "Demographic Analysis", desc: "Comparative insights based on your age and location." },
                    { icon: Clock, title: "Calendar Sync", desc: "Automatically sync follow-ups and medication reminders." },
                    { icon: Stethoscope, title: "Nearby Care Finder", desc: "Find the best specialists and clinics near you." }
                  ].map((feature, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="bg-indigo-50 p-3 rounded-2xl h-fit">
                        <feature.icon className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{feature.title}</h4>
                        <p className="text-sm text-slate-500">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <button 
                    onClick={handleUpgrade}
                    className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:scale-[1.02] transition-all"
                  >
                    Upgrade Now — $9.99/mo
                  </button>
                  <p className="text-center text-[10px] text-slate-400 mt-4 uppercase tracking-widest font-bold">
                    Cancel anytime • Secure payment
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="w-full max-w-4xl mt-12 pb-8 text-center border-t border-slate-200 pt-8">
        <p className="text-slate-400 text-sm">
          &copy; {new Date().getFullYear()} DocDecode. Empowering patients with clarity.
        </p>
      </footer>
    </div>
  );
}
