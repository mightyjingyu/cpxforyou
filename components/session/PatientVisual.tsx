'use client';

import { CaseSpec } from '@/types';

interface Props {
  caseSpec: CaseSpec;
  voiceState: 'idle' | 'listening' | 'thinking' | 'speaking';
}

const PATIENT_AVATARS: Record<string, string> = {
  '남': '👨‍🦳',
  '여': '👩',
};

export default function PatientVisual({ caseSpec, voiceState }: Props) {
  const avatar = PATIENT_AVATARS[caseSpec.patient.gender] || '🧑';

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      {/* 환자 아바타 */}
      <div className="relative">
        <div
          className={`w-40 h-40 rounded-full flex items-center justify-center text-7xl transition-all duration-500 border relative overflow-hidden backdrop-blur-xl ${
            voiceState === 'speaking'
              ? 'bg-white/90 border-black shadow-[0_20px_50px_rgba(0,0,0,0.15)] scale-105'
              : 'bg-white/40 border-black/30 shadow-sm'
          }`}
        >
          {avatar}
          <div className="absolute inset-0 border border-white/60 pointer-events-none rounded-full" />
        </div>

        {/* 음성 상태 링 */}
        {voiceState === 'speaking' && (
          <div className="absolute inset-0 rounded-full border border-black animate-ping opacity-30" />
        )}
        {voiceState === 'listening' && (
          <div className="absolute inset-0 rounded-full border border-black animate-pulse opacity-20" />
        )}
      </div>

      {/* 환자 이름 */}
      <div className="text-center">
        <p className="text-xl font-black text-black tracking-tight mb-1">
          {caseSpec.patient.name}
        </p>
        <p className="text-sm font-bold text-black/50 tracking-widest uppercase">
          {caseSpec.patient.age}세 / {caseSpec.patient.gender}
        </p>
      </div>

      {/* 음성 상태 시각화 */}
      <div className="h-10 flex items-center justify-center">
        {voiceState === 'speaking' && (
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="wave-bar w-1.5 h-8 bg-black rounded-full"
                style={{ animationDelay: `${(i - 1) * 0.1}s` }}
              />
            ))}
          </div>
        )}
        {voiceState === 'thinking' && (
          <div className="flex items-center gap-2">
            <div className="dot-1 w-2.5 h-2.5 bg-black/60 rounded-full" />
            <div className="dot-2 w-2.5 h-2.5 bg-black/60 rounded-full" />
            <div className="dot-3 w-2.5 h-2.5 bg-black/60 rounded-full" />
          </div>
        )}
        {voiceState === 'listening' && (
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="wave-bar w-1.5 h-8 bg-black/20 rounded-full"
                style={{ animationDelay: `${(i - 1) * 0.1}s` }}
              />
            ))}
          </div>
        )}
        {voiceState === 'idle' && (
          <div className="text-xs font-bold text-black/30 tracking-widest uppercase">대기 중</div>
        )}
      </div>

      {/* 상태 텍스트 */}
      <div className="text-xs font-bold text-black/50 uppercase tracking-widest leading-relaxed">
        {voiceState === 'listening' && '듣는 중...'}
        {voiceState === 'thinking' && '환자가 생각 중...'}
        {voiceState === 'speaking' && '환자가 말하는 중'}
        {voiceState === 'idle' && '마이크를 켜서 진료를 시작하세요'}
      </div>
    </div>
  );
}
