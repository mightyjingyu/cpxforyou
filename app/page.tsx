'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { loginWithGoogle, user, authLoading } = useAuth();

  const handleLoginClick = async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      if (!user) {
        await loginWithGoogle();
      }
      router.push('/archive');
    } catch (e) {
      console.error('Google login failed:', e);
      alert('구글 로그인에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white relative flex flex-col font-sans selection:bg-black selection:text-white">
      {/* Background Grid Pattern - Strong structural black lines but subtle */}
      <div className="absolute inset-0 z-0 pointer-events-none" 
           style={{ 
             backgroundImage: "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)", 
             backgroundSize: "64px 64px" 
           }} 
      />
      
      {/* Soft gradient blobs for the liquid glass effect */}
      <div className="absolute top-10 right-[15%] w-96 h-96 rounded-full bg-neutral-200 blur-[100px] opacity-70 pointer-events-none" />
      <div className="absolute bottom-10 left-[15%] w-96 h-96 rounded-full bg-neutral-300 blur-[100px] opacity-60 pointer-events-none" />

      <div className="relative z-10 flex-1 flex flex-col h-full border-x border-black max-w-6xl mx-auto w-full bg-transparent">
        {/* Header */}
        <header className="px-8 py-5 flex items-center justify-between border-b border-black bg-white/70 backdrop-blur-xl sticky top-0 w-full z-50">
          <span className="text-sm font-bold tracking-tight text-black uppercase">CPX FOR YOU 0</span>
          <span className="text-xs text-black font-medium tracking-wide">의대생 실전 시뮬레이터</span>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 w-full relative">
          
          <div className="glass w-full max-w-lg p-10 rounded-3xl flex flex-col items-center text-center transition-all duration-700 ease-out hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] hover:-translate-y-1 relative z-20 overflow-hidden">
            {/* Subtle inner border for glassmorphism */}
            <div className="absolute inset-0 border border-white/60 rounded-3xl pointer-events-none"></div>

            {/* Title */}
            <div className="mb-12 w-full border-b border-black pb-8 relative z-10">
              <h1 className="text-6xl font-black tracking-tighter text-black mb-4 leading-[0.9] uppercase">
                CPX FOR<br/>YOU 0
              </h1>
              <p className="text-sm font-medium text-black/60 leading-relaxed max-w-[260px] mx-auto tracking-tight">
                AI 환자와 음성으로 진행하는<br />CPX 실기시험 실전 시뮬레이터
              </p>
            </div>

            {/* Buttons */}
            <div className="space-y-3 w-full relative z-10">
              <button
                onClick={handleLoginClick}
                disabled={loading}
                className="relative w-full overflow-hidden rounded-full bg-black text-white py-4 font-semibold text-sm transition-all hover:bg-black/90 active:scale-[0.98] disabled:opacity-70 flex items-center justify-center shadow-lg"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    이동 중...
                  </>
                ) : <span className="relative z-10">{user ? '아카이브 열기' : 'Google 로그인'}</span>}
              </button>
            </div>

            {/* Features */}
            <div className="mt-10 w-full grid grid-cols-3 border border-black rounded-lg overflow-hidden bg-white/40 backdrop-blur-md relative z-10">
              {[
                { title: '12분', desc: '실전 동일 시간' },
                { title: '음성 대화', desc: 'AI 환자 연습' },
                { title: '즉시 채점', desc: '체크리스트 분석' },
              ].map((item, idx) => (
                <div key={item.title} className={`text-center py-3 px-2 transition-colors hover:bg-white/70 ${idx !== 0 ? 'border-l border-black' : ''}`}>
                  <div className="text-xs font-bold text-black mb-0.5 tracking-wider">{item.title}</div>
                  <div className="text-[10px] text-black/60 font-medium leading-tight">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
