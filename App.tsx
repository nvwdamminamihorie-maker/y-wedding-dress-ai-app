
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { analyzeWeddingDress, chatWithConcierge } from './geminiService';
import { DiagnosisResult, AppState, DiagnosisMode, CollectionItem, ChatMessage } from './types';
import html2canvas from 'html2canvas';

const generateId = () => Math.random().toString(36).substr(2, 9);

const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX = 1000;
      if (width > height) {
        if (width > MAX) { height *= MAX / width; width = MAX; }
      } else {
        if (height > MAX) { width *= MAX / height; height = MAX; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
  });
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    view: 'home',
    image: null,
    partnerImage: null,
    isCoupleMode: false,
    loading: false,
    result: null,
    error: null,
    mode: null,
    catalogItems: [],
    chatHistory: [],
    chatAttachedImage: null,
  });

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const partnerInputRef = useRef<HTMLInputElement>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);
  const chatImageRef = useRef<HTMLInputElement>(null);
  const karteRef = useRef<HTMLDivElement>(null);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null); // New ref for textarea

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [state.chatHistory, chatLoading]);

  // 画面遷移時に必ずトップへ
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.view]);

  const handleCatalogImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !state.mode) return;
    try {
      const newItems: CollectionItem[] = [];
      for (const file of files) {
        const base64 = await new Promise<string>((r) => {
          const reader = new FileReader();
          reader.onload = () => r(reader.result as string);
          reader.readAsDataURL(file);
        });
        const compressed = await compressImage(base64);
        newItems.push({ id: generateId(), title: 'Selection', type: 'Aライン', category: state.mode, imageUrl: compressed, source: 'User' });
      }
      setState(prev => ({ ...prev, catalogItems: [...prev.catalogItems, ...newItems] }));
    } catch (err) {
      setState(prev => ({ ...prev, error: "お写真の準備中にエラーが出てしまいました。" }));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, target: 'user' | 'partner' | 'chat') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await new Promise<string>((r) => {
      const reader = new FileReader();
      reader.onload = () => r(reader.result as string);
      reader.readAsDataURL(file);
    });
    const compressed = await compressImage(base64);
    if (target === 'user') setState(prev => ({ ...prev, image: compressed }));
    else if (target === 'partner') setState(prev => ({ ...prev, partnerImage: compressed }));
    else setState(prev => ({ ...prev, chatAttachedImage: compressed }));
    
    if (e.target) e.target.value = '';
  };

  const adjustTextareaHeight = () => {
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto'; // Reset height to recalculate scrollHeight
      chatTextareaRef.current.style.height = `${chatTextareaRef.current.scrollHeight}px`;
    }
  };

  const handleSendMessage = async () => {
    if ((!chatInput.trim() && !state.chatAttachedImage) || chatLoading) return;
    
    const userMsg: ChatMessage = { role: 'user', text: chatInput, imageUrl: state.chatAttachedImage || undefined };
    setState(prev => ({ ...prev, chatHistory: [...prev.chatHistory, userMsg], chatAttachedImage: null }));
    
    const currentInput = chatInput;
    const currentImage = state.chatAttachedImage;
    setChatInput("");
    setChatLoading(true);
    
    // Reset textarea height after sending
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
    }

    try {
      const reply = await chatWithConcierge(state.chatHistory, currentInput || (currentImage ? "このお写真について教えてください" : ""), currentImage);
      setState(prev => ({ ...prev, chatHistory: [...prev.chatHistory, { role: 'model', text: reply }] }));
    } catch (err) {
      console.error(err);
      let errorText = "すみません、少し接続が不安定なようです。";
      if ((err as any)?.message?.includes('quota')) {
        errorText = "リクエスト上限に達しました。少し時間を置いてから再度お試しください。";
      }
      setState(prev => ({ ...prev, chatHistory: [...prev.chatHistory, { role: 'model', text: errorText }] }));
    } finally {
      setChatLoading(false);
    }
  };

  const handleDiagnosis = async () => {
    if (!state.image || (state.isCoupleMode && !state.partnerImage) || !state.mode) return;
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const result = await analyzeWeddingDress(
        state.image,
        state.mode,
        state.catalogItems.filter(i => i.category === state.mode),
        state.isCoupleMode ? state.partnerImage : null
      );
      setState(prev => ({ ...prev, view: 'result', result, loading: false }));
    } catch (err) {
      console.error(err);
      let errorMsg = "診断中にエラーが発生しました。もう一度お試しください。";
      if ((err as any)?.message?.includes('quota')) {
        errorMsg = "APIの利用制限に達しました。無料枠をご利用の場合は、数分待ってから再度お試しください。";
      }
      setState(prev => ({ ...prev, loading: false, error: errorMsg }));
    }
  };

  const handleDownloadImage = async () => {
    if (!karteRef.current) return;
    
    setState(prev => ({ ...prev, loading: true }));
    try {
      const canvas = await html2canvas(karteRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fffcfc',
        width: karteRef.current.scrollWidth,
        height: karteRef.current.scrollHeight,
        windowWidth: 393, // iPhone 14 width
      });
      
      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `WeddingDressKarte_${new Date().getTime()}.png`;
      link.click();
    } catch (err) {
      console.error('Image generation failed', err);
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const reset = () => setState({
    view: 'home', image: null, partnerImage: null, isCoupleMode: false, result: null, mode: null, catalogItems: [], chatHistory: [], chatAttachedImage: null, loading: false, error: null
  });

  return (
    <div className="min-h-screen bg-[#fffcfc] text-[#5a4a42] font-sans-jp flex flex-col">
      {/* 診断中/処理中オーバーレイ */}
      {state.loading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 backdrop-blur-md animate-fadeIn p-8 text-center">
          <div className="relative w-20 h-20 mb-6">
            <div className="absolute inset-0 border-2 border-[#e8d5d1] rounded-full"></div>
            <div className="absolute inset-0 border-t-2 border-[#e2a8ac] rounded-full animate-spin"></div>
          </div>
          <h3 className="text-xl font-bold mb-2 tracking-widest text-[#5a4a42]">Magic in Progress...</h3>
          <p className="text-xs text-[#8e7f78] leading-relaxed">あなたの美しさと、運命のドレスが響き合う瞬間を見つけています。</p>
        </div>
      )}

      {/* エラー表示 */}
      {state.error && (
        <div className="fixed top-4 left-4 right-4 z-[120] bg-red-50 border border-red-200 p-4 rounded-2xl shadow-lg animate-fadeIn">
          <p className="text-red-600 text-xs font-bold mb-2">Error Occurred</p>
          <p className="text-red-500 text-[11px] leading-relaxed mb-4">{state.error}</p>
          <button onClick={() => setState(s => ({...s, error: null}))} className="bg-red-500 text-white px-4 py-2 rounded-full text-[10px] font-bold">了解しました</button>
        </div>
      )}

      {/* ヘッダー */}
      <header className={`pt-8 pb-4 transition-all duration-500 ${state.view === 'result' ? 'opacity-0 h-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="text-center px-4">
          <p className="font-quicksand text-[8px] tracking-[0.4em] text-[#c9a0a4] uppercase mb-1">New Vintage Wedding - Kobe Boutique</p>
          <h1 className="text-2xl font-bold cursor-pointer" onClick={reset}>
            My <span className="text-[#e2a8ac] font-serif italic">Eternal</span> Dress
          </h1>
          <div className="mt-1 flex items-center justify-center gap-1">
            <span className="text-yellow-400 text-[10px]">★★★★★</span>
            <span className="text-[9px] text-[#8e7f78]">Highly Rated on Google</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col px-4 pb-8 overflow-hidden">
        
        {state.view === 'home' && (
          <div className="flex-1 flex flex-col justify-center gap-4 animate-fadeIn">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold mb-1">Salutations 🕊️</h2>
              <p className="text-[10px] text-[#c9a0a4] mt-1 italic">運命の一着を、AIコンシェルジュと共に。</p>
            </div>
            <div className="grid gap-3">
              <CompactMenuCard 
                icon="🕊️" 
                title="ドレス診断" 
                desc="あなたを最高に輝かせる一着へ" 
                onClick={() => setState(s => ({...s, isCoupleMode: false, view: 'catalog', mode: 'wedding'}))} 
              />
              <CompactMenuCard 
                icon="💍" 
                title="ふたりの絆診断" 
                desc="相性とカラーの調和をチェック" 
                onClick={() => setState(s => ({...s, isCoupleMode: true, view: 'catalog', mode: 'wedding'}))} 
              />
              <CompactMenuCard 
                icon="💬" 
                title="AIコンシェルジュ相談" 
                desc="ドレス選びや準備のお悩みを解消" 
                onClick={() => setState(s => ({...s, view: 'chat_only'}))} 
              />
            </div>
          </div>
        )}

        {state.view === 'catalog' && (
          <div className="flex-1 flex flex-col animate-fadeIn overflow-hidden">
            <div className="shrink-0 flex justify-between items-center mb-4">
              <button onClick={() => setState(s => ({...s, view: 'home'}))} className="text-[#c9a0a4] text-[10px] font-bold tracking-widest uppercase">← Back</button>
              <h2 className="text-sm font-bold">候補のドレスを追加してください</h2>
              <div className="w-10"></div>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3 pb-24">
                <div onClick={() => catalogInputRef.current?.click()} className="aspect-[3/4] border-2 border-dashed border-[#e8d5d1] rounded-2xl flex flex-col items-center justify-center bg-[#fff9f9] transition-all active:scale-95">
                  <span className="text-2xl mb-1">📸</span>
                  <span className="text-[9px] text-[#c9a0a4] font-bold uppercase tracking-widest">Add Image</span>
                </div>
                {state.catalogItems.filter(i => i.category === state.mode).map(item => (
                  <div key={item.id} className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-sm border border-[#f5ecea] animate-fadeIn">
                    <img src={item.imageUrl!} className="w-full h-full object-cover" />
                    <button onClick={() => setState(s => ({...s, catalogItems: s.catalogItems.filter(i => i.id !== item.id)}))} className="absolute top-2 right-2 bg-white/70 text-[10px] w-6 h-6 rounded-full flex items-center justify-center shadow-sm">✕</button>
                  </div>
                ))}
              </div>
            </div>
            <input type="file" multiple hidden ref={catalogInputRef} onChange={handleCatalogImport} />
            {/* データプライバシーに関する注釈 */}
            <div className="text-center text-[9px] text-[#8e7f78] leading-relaxed mt-4 mb-4">
              <p>※画像はサーバーに保存されません。</p>
            </div>
            <div className="fixed bottom-8 left-4 right-4 z-10">
              <button 
                disabled={state.catalogItems.filter(i => i.category === state.mode).length === 0} 
                onClick={() => setState(s => ({...s, view: 'upload'}))} 
                className="w-full py-4 rounded-full bg-[#5a4a42] text-white font-bold text-sm shadow-xl active:scale-95 disabled:bg-gray-200 disabled:shadow-none transition-all"
              >
                次へ進む
              </button>
            </div>
          </div>
        )}

        {state.view === 'upload' && (
          <div className="flex-1 flex flex-col justify-center gap-8 animate-fadeIn text-center">
            <div className="mb-2">
              <h2 className="text-xl font-bold mb-2">{state.isCoupleMode ? 'ふたりの表情を見せてください' : 'あなたの表情を見せてください'}</h2>
              <p className="text-[11px] text-[#8e7f78] px-8 leading-relaxed">お顔がはっきり写っているお写真だと、診断の精度が高まります。</p>
            </div>
            
            <div className="flex flex-col gap-6 items-center">
              <div className="flex gap-4">
                <div className="space-y-2">
                  <p className="text-[8px] font-bold text-[#c9a0a4] tracking-widest uppercase">Bride / User</p>
                  <div onClick={() => fileInputRef.current?.click()} className="w-36 h-48 rounded-3xl border-2 border-dashed border-[#e8d5d1] bg-white flex flex-col items-center justify-center overflow-hidden active:scale-95 transition-all">
                    {state.image ? <img src={state.image} className="w-full h-full object-cover" /> : <><span className="text-2xl mb-1">🕊️</span><span className="text-[9px] font-bold text-[#c9a0a4]">Upload</span></>}
                  </div>
                </div>
                {state.isCoupleMode && (
                  <div className="space-y-2">
                    <p className="text-[8px] font-bold text-[#c9a0a4] tracking-widest uppercase">Partner</p>
                    <div onClick={() => partnerInputRef.current?.click()} className="w-36 h-48 rounded-3xl border-2 border-dashed border-[#e8d5d1] bg-white flex flex-col items-center justify-center overflow-hidden active:scale-95 transition-all">
                      {state.partnerImage ? <img src={state.partnerImage} className="w-full h-full object-cover" /> : <><span className="text-2xl mb-1">🤵</span><span className="text-[9px] font-bold text-[#c9a0a4]">Upload</span></>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <button 
                disabled={!state.image || (state.isCoupleMode && !state.partnerImage)} 
                onClick={handleDiagnosis} 
                className="w-full max-w-xs py-5 rounded-full bg-[#e2a8ac] text-white font-bold text-lg shadow-lg active:scale-95 disabled:bg-gray-200 transition-all"
              >
                診断スタート
              </button>
              <button onClick={() => setState(s => ({...s, view: 'catalog'}))} className="mt-6 text-[#c9a0a4] text-[10px] uppercase font-bold tracking-widest block mx-auto">← Back to Catalog</button>
            </div>
            <input type="file" hidden ref={fileInputRef} onChange={(e) => handleFileChange(e, 'user')} />
            <input type="file" hidden ref={partnerInputRef} onChange={(e) => handleFileChange(e, 'partner')} />
          </div>
        )}

        {state.view === 'result' && state.result && (
          <div className="flex-1 flex flex-col animate-fadeIn overflow-hidden -mx-4">
            <div ref={karteRef} className="flex-1 overflow-y-auto px-4 pb-20 scroll-smooth">
               {/* 診断結果ヘッダー */}
               <div className="pt-8 pb-6 text-center">
                 <h2 className="text-sm font-serif italic text-[#c9a0a4] mb-1">The Royal Karte</h2>
                 <h3 className="text-2xl font-bold mb-4">{state.result.recommendedDress}</h3>
                 <div className="inline-block px-4 py-1 rounded-full border border-[#e2a8ac] text-[#e2a8ac] text-[10px] font-bold uppercase tracking-widest">
                   {state.result.dressLine}
                 </div>
               </div>

               {/* メインイメージ (70%サイズに固定) */}
               <div className="w-[70%] mx-auto rounded-[2rem] overflow-hidden shadow-2xl mb-8 border border-[#f5ecea]">
                  {state.catalogItems.find(i => i.id === state.result?.bestMatchId)?.imageUrl && (
                    <img src={state.catalogItems.find(i => i.id === state.result?.bestMatchId)!.imageUrl!} className="w-full" />
                  )}
               </div>

               {/* 重要注意事項：ドレス持ち込みについて (強調表示) */}
               <div className="bg-[#fff1f1] p-6 rounded-[2rem] border-2 border-[#ffdbdb] shadow-md mb-8 relative overflow-hidden animate-fadeIn">
                  <div className="absolute top-2 right-4 opacity-10 text-4xl">⚠️</div>
                  <h4 className="text-[12px] font-bold text-[#e25c5c] mb-3 flex items-center gap-2">
                    ドレス試着に行く前に確認すべきこと
                  </h4>
                  <div className="space-y-3 text-[11px] leading-relaxed text-[#5a4a42]">
                    <p>
                      式場提携ショップのドレスレンタル費用は非常に高額になるケースが多いです。
                    </p>
                    <p className="bg-white/50 p-3 rounded-xl border border-[#ffdbdb]">
                      <span className="font-bold text-[#e25c5c]">持ち込みを検討する場合：</span><br/>
                      事前に式場へ「持ち込みできるか」および「持ち込み料の金額」を必ず確認してください。契約前に交渉することがスムーズな準備のポイントです。
                    </p>
                  </div>
               </div>

               {/* コンシェルジュからの言葉（選定理由） */}
               <div className="bg-white p-6 rounded-[2rem] border border-[#f5ecea] shadow-sm mb-6">
                 <p className="text-[#5a4a42] text-xs leading-relaxed italic whitespace-pre-wrap">"{state.result.reason}"</p>
               </div>

               {/* 診断プロフィール */}
               <div className="grid grid-cols-2 gap-3 mb-6">
                  <IndividualResultCard title="Bride's Profile" color={state.result.personalColor} face={state.result.faceShape} accent="#e2a8ac" />
                  {state.isCoupleMode && state.result.partnerDiagnosis ? (
                    <IndividualResultCard title="Partner's Profile" color={state.result.partnerDiagnosis.personalColor} face={state.result.partnerDiagnosis.faceShape} accent="#5a4a42" />
                  ) : (
                    <div className="bg-white p-4 rounded-2xl border border-[#f5ecea] flex flex-col justify-center shadow-sm">
                      <span className="text-[8px] text-[#c9a0a4] font-bold uppercase mb-1">Atmosphere</span>
                      <span className="text-[10px] font-bold">{state.result.atmosphereLabel}</span>
                    </div>
                  )}
               </div>

               {/* 顔相に基づく準備アドバイス / 相性診断 */}
               <div className="bg-[#fffaf9] p-6 rounded-[2rem] border border-[#f5ecea] mb-6 relative overflow-hidden shadow-sm">
                  <div className="absolute top-2 right-4 opacity-10 text-4xl">✨</div>
                  <h4 className="text-[10px] font-bold text-[#c9a0a4] uppercase tracking-widest mb-3">Preparation Wisdom</h4>
                  <div className="space-y-4">
                    {state.isCoupleMode && state.result.partnerCompatibility && (
                      <div className="border-b border-[#f5ecea] pb-4 mb-4">
                        <p className="text-[11px] leading-relaxed font-bold mb-1 text-[#e2a8ac]">【おふたりの相性とカラーの調和】</p>
                        <p className="text-[11px] leading-relaxed text-[#5a4a42]">{state.result.partnerCompatibility}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] leading-relaxed font-bold mb-1 text-[#e2a8ac]">【顔相から見る魅力と補完関係】</p>
                      <p className="text-[11px] leading-relaxed text-[#5a4a42] italic">{state.result.faceReading}</p>
                    </div>
                    <div>
                      <p className="text-[11px] leading-relaxed font-bold mb-1 text-[#e2a8ac]">【準備をスムーズに進める考え方と配慮】</p>
                      <p className="text-[11px] leading-relaxed text-[#5a4a42]">{state.result.weddingAdvice}</p>
                    </div>
                  </div>
               </div>

               {/* スタイリング詳細 */}
               <div className="space-y-3 mb-6">
                 <DetailSection icon="💇🏻‍♀️" title="Hairstyle" desc={state.result.stylingDetails.hairstyle} />
                 <DetailSection icon="✨" title="Accessories" desc={state.result.stylingDetails.accessories} />
                 <DetailSection icon="💐" title="Bouquet" desc={state.result.stylingDetails.bouquet} />
               </div>

               {/* コンシェルジュからのパーソナルメッセージ（エール） */}
               {state.result.conciergeMessage && (
                 <div className="bg-[#5a4a42] text-white p-8 rounded-[2rem] mb-10 shadow-xl relative animate-fadeIn">
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#e2a8ac] px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Message from Kobe</div>
                    <p className="text-sm leading-relaxed text-center italic font-serif">
                      {state.result.conciergeMessage}
                    </p>
                 </div>
               )}

               {/* チャットボタンへの導線 */}
               <div className="text-center pb-8">
                 <button onClick={() => setState(s => ({...s, view: 'chat_only'}))} className="text-[#c9a0a4] text-[11px] font-bold uppercase tracking-[0.2em] underline underline-offset-8">
                   AIコンシェルジュに相談する 💬
                 </button>
               </div>
            </div>

            {/* ボトムナビゲーション */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/60 backdrop-blur-md border-t border-[#f5ecea] flex gap-3">
               <button onClick={reset} className="flex-1 py-4 rounded-full bg-white border border-[#5a4a42] text-[#5a4a42] text-xs font-bold uppercase tracking-widest shadow-sm active:scale-95">Restart</button>
               <button onClick={handleDownloadImage} className="flex-1 py-4 rounded-full bg-[#5a4a42] text-white text-xs font-bold uppercase tracking-widest shadow-lg active:scale-95 uppercase">Download</button>
            </div>
          </div>
        )}

        {state.view === 'chat_only' && (
          <div className="fixed inset-0 z-[110] flex flex-col bg-white animate-fadeIn">
            <header className="shrink-0 p-6 flex justify-between items-center border-b border-[#f5ecea]">
              <div>
                <h3 className="text-lg font-bold">New Vintage Wedding Kobe</h3>
                <p className="text-[10px] text-[#c9a0a4] font-bold uppercase tracking-widest">AIコンシェルジュ ★★★★★</p>
              </div>
              <button onClick={() => setState(s => ({...s, view: state.result ? 'result' : 'home'}))} className="w-8 h-8 rounded-full bg-[#f5ecea] flex items-center justify-center">✕</button>
            </header>
            
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#fffcfc]">
              {state.chatHistory.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                  <span className="text-4xl mb-4">🕊️</span>
                  <p className="text-xs italic leading-relaxed px-12">いらっしゃいませ。神戸で評判のドレスショップへようこそ。準備の進め方や、お持ち込み、お相手への配慮など何でもお尋ねください。</p>
                </div>
              )}
              {state.chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-[13px] leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-[#e2a8ac] text-white rounded-tr-none' : 'bg-white border border-[#f5ecea] text-[#5a4a42] rounded-tl-none'}`}>
                    {msg.imageUrl && <img src={msg.imageUrl} className="w-full rounded-lg mb-2 max-h-48 object-cover" />}
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start"><div className="bg-white border border-[#f5ecea] p-3 rounded-2xl flex gap-1"><div className="w-1 h-1 bg-[#e2a8ac] rounded-full animate-bounce"></div><div className="w-1 h-1 bg-[#e2a8ac] rounded-full animate-bounce delay-100"></div><div className="w-1 h-1 bg-[#e2a8ac] rounded-full animate-bounce delay-200"></div></div></div>
              )}
            </div>

            <div className="shrink-0 p-4 border-t border-[#f5ecea] bg-white">
              {state.chatAttachedImage && (
                <div className="relative inline-block mb-3 animate-fadeIn">
                  <img src={state.chatAttachedImage} className="w-16 h-16 rounded-xl object-cover border-2 border-[#e2a8ac]" />
                  <button onClick={() => setState(s => ({...s, chatAttachedImage: null}))} className="absolute -top-2 -right-2 bg-black/60 text-white text-[10px] w-5 h-5 rounded-full">✕</button>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => chatImageRef.current?.click()} className="w-12 h-12 rounded-full bg-[#fffaf9] border border-[#f5ecea] flex items-center justify-center text-xl">📸</button>
                <textarea 
                  ref={chatTextareaRef}
                  value={chatInput} 
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    adjustTextareaHeight();
                  }}
                  rows={1}
                  placeholder="気になることをお尋ねください" 
                  className="flex-none w-[calc(70.4%-78.85px)] bg-[#fffaf9] border border-[#f5ecea] rounded-2xl px-5 py-3 text-base focus:outline-none focus:border-[#e2a8ac] resize-none overflow-hidden"
                />
                <button onClick={handleSendMessage} disabled={chatLoading} className="w-12 h-12 rounded-full bg-[#5a4a42] text-white flex items-center justify-center shadow-md active:scale-95">🕊️</button>
              </div>
              {/* データプライバシーに関する注釈 (チャット用) */}
              <div className="text-center text-[9px] text-[#8e7f78] leading-relaxed mt-3">
                <p>※ご入力内容はサーバーに保存されません。</p>
              </div>
              <input type="file" hidden ref={chatImageRef} onChange={(e) => handleFileChange(e, 'chat')} />
            </div>
          </div>
        )}

      </main>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.35s ease-out forwards; }
        ::-webkit-scrollbar { display: none; }
        @media print { .fixed, header, footer { display: none !important; } .overflow-hidden { overflow: visible !important; } }
      `}</style>
    </div>
  );
};

const CompactMenuCard = ({ icon, title, desc, onClick }: any) => (
  <button onClick={onClick} className="bg-white p-5 rounded-[1.8rem] border border-[#f5ecea] flex items-center gap-4 text-left active:scale-[0.98] transition-all shadow-sm">
    <div className="w-12 h-12 rounded-2xl bg-[#fff9f9] flex items-center justify-center text-2xl shrink-0">{icon}</div>
    <div>
      <h3 className="text-[15px] font-bold mb-0.5">{title}</h3>
      <p className="text-[10px] text-[#8e7f78]">{desc}</p>
    </div>
  </button>
);

const IndividualResultCard = ({ title, color, face, accent }: any) => (
  <div className="bg-white p-4 rounded-2xl border border-[#f5ecea] shadow-sm">
    <span className="text-[8px] font-bold uppercase tracking-tighter block mb-2" style={{color: accent}}>{title}</span>
    <div className="space-y-1.5">
       <div className="flex items-center justify-between gap-1 border-b border-[#f5ecea] pb-1">
          <span className="text-[7px] text-[#c9a0a4] font-bold">Color</span>
          <span className="text-[10px] font-bold">{color}</span>
       </div>
       <div className="flex items-center justify-between gap-1">
          <span className="text-[7px] text-[#c9a0a4] font-bold">Face</span>
          <span className="text-[10px] font-bold">{face}</span>
       </div>
    </div>
  </div>
);

const DetailSection = ({ icon, title, desc }: any) => (
  <div className="bg-white p-4 rounded-2xl border border-[#f5ecea] flex gap-4 shadow-sm">
    <div className="w-10 h-10 rounded-xl bg-[#fffcfc] border border-[#f5ecea] flex items-center justify-center text-lg shrink-0">{icon}</div>
    <div>
      <h4 className="text-[9px] font-bold text-[#c9a0a4] uppercase tracking-widest mb-1">{title}</h4>
      <p className="text-[11px] leading-relaxed text-[#5a4a42]">{desc}</p>
    </div>
  </div>
);

export default App;
