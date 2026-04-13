'use client';

import { Vitals } from '@/types';

interface Props {
  patientName: string;
  age: number;
  gender: string;
  vitals: Vitals;
}

export default function InstructionPanel({ patientName, age, gender, vitals }: Props) {
  return (
    <div className="bg-transparent px-8 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-8 max-w-7xl mx-auto w-full">
        {/* 환자 정보 */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] font-black text-black/50 tracking-widest uppercase shrink-0 border border-black/20 rounded-full px-2 py-0.5">Patient</span>
          <span className="text-sm font-black text-black tracking-tight truncate">
            {patientName} <span className="text-black/40 font-bold tracking-widest uppercase ml-1">({age}세/{gender})</span>
          </span>
        </div>

        <div className="hidden sm:block w-px h-4 bg-black/20" />

        {/* 활력징후 */}
        <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
          <span className="text-[10px] font-black text-black/50 tracking-widest uppercase border border-black/20 rounded-full px-2 py-0.5">Vitals</span>
          <span className="text-xs font-bold font-mono text-black">
            BP <strong className="text-black text-sm ml-1">{vitals.bp}</strong>
          </span>
          <span className="text-xs font-bold font-mono text-black">
            HR <strong className="text-black text-sm ml-1">{vitals.hr}</strong>
          </span>
          <span className="text-xs font-bold font-mono text-black">
            RR <strong className="text-black text-sm ml-1">{vitals.rr}</strong>
          </span>
          <span className="text-xs font-bold font-mono text-black">
            T <strong className="text-black text-sm ml-1">{vitals.temp}°C</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
