'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useSessionStore } from '@/store/sessionStore';
import { CLINICAL_CATEGORIES, CLINICAL_PRESENTATIONS } from '@/lib/ai/personaTemplate';
import { HISTORY_BLOCK_SEMANTICS, HISTORY_KEYS } from '@/lib/ai/historyBlockSemantics';
import type { CaseSpec, Difficulty, Friendliness, TimerMode } from '@/types';
import type { DirectCaseFormPayload, DirectCaseScope } from '@/types/directCase';
import type { PastExam } from '@/types/pastExam';
import { useAuth } from '@/components/auth/AuthProvider';
import { listPastExamsFromFirestore, savePastExam, deletePastExam } from '@/lib/firebase/pastExams';

function PastExamsContent() {
  const router = useRouter();
  const { user, authLoading } = useAuth();
  const { startSession, bookmarkedPastExamIds, togglePastExamBookmark } = useSessionStore();

  const [exams, setExams] = useState<PastExam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  // Filter States
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [presentationFilter, setPresentationFilter] = useState<string>('ALL');
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  // Selected Exam for Practice Setup
  const [selectedExam, setSelectedExam] = useState<PastExam | null>(null);

  // Practice Configs
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [friendliness, setFriendliness] = useState<Friendliness>('normal');
  const [timerMode, setTimerMode] = useState<TimerMode>('countdown');
  const [interactionMode, setInteractionMode] = useState<'voice' | 'text'>('voice');

  // Register Modal / Screen State
  const [registerOpen, setRegisterOpen] = useState(false);
  const [viewingExam, setViewingExam] = useState<PastExam | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form States for OCR Correct & Register
  const [title, setTitle] = useState('');
  const [systemCategory, setSystemCategory] = useState(Object.keys(CLINICAL_CATEGORIES)[0] || '');
  const [chiefComplaint, setChiefComplaint] = useState(CLINICAL_PRESENTATIONS[0] || '');
  const [chiefComplaintCustom, setChiefComplaintCustom] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('30');
  const [patientGender, setPatientGender] = useState<'남' | '여'>('남');
  const [chiefComplaintText, setChiefComplaintText] = useState('');
  const [historyBlocks, setHistoryBlocks] = useState<Record<string, string>>({});
  const [vitals, setVitals] = useState({ bp: '', hr: '', rr: '', temp: '' });
  const [physicalExtra, setPhysicalExtra] = useState('');
  const [dx1, setDx1] = useState('');
  const [dx2, setDx2] = useState('');
  const [dx3, setDx3] = useState('');
  const [specialQuestion, setSpecialQuestion] = useState('');
  const [specialOther, setSpecialOther] = useState('');
  const [peHEENT, setPeHEENT] = useState('');
  const [peAbdomen, setPeAbdomen] = useState('');
  const [peExtremity, setPeExtremity] = useState('');
  const [peGeneral, setPeGeneral] = useState('');
  const [managementPlanTests, setManagementPlanTests] = useState('');
  const [managementPlanTreatment, setManagementPlanTreatment] = useState('');
  const [patientEducation, setPatientEducation] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Fetch all exams on load
  const loadExams = useCallback(async () => {
    setLoadingExams(true);
    try {
      const res = await fetch('/api/past-exams');
      if (!res.ok) throw new Error('기본 기출을 불러오지 못했습니다.');
      const preMade: PastExam[] = await res.json();

      let userExams: PastExam[] = [];
      try {
        userExams = await listPastExamsFromFirestore();
      } catch (fsErr) {
        console.error('Failed to load past exams directly from Firestore:', fsErr);
      }

      const mergedMap = new Map<string, PastExam>();
      for (const exam of preMade) {
        mergedMap.set(exam.id, exam);
      }
      for (const exam of userExams) {
        mergedMap.set(exam.id, {
          ...exam,
          isPreMade: false,
        });
      }
      const result = Array.from(mergedMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      setExams(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingExams(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/');
      return;
    }
    void loadExams();
  }, [authLoading, user, router, loadExams]);

  // Handle Category -> presentation cascade
  const presentationOptions = useMemo(() => {
    if (categoryFilter === 'ALL') {
      return ['ALL', ...CLINICAL_PRESENTATIONS];
    }
    return ['ALL', ...(CLINICAL_CATEGORIES[categoryFilter] || [])];
  }, [categoryFilter]);

  // Adjust presentation selection if it goes out of current category list
  useEffect(() => {
    if (!presentationOptions.includes(presentationFilter)) {
      setPresentationFilter('ALL');
    }
  }, [presentationOptions, presentationFilter]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (registerOpen || viewingExam !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [registerOpen, viewingExam]);


  // Filtered lists
  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      // Category Filter
      if (categoryFilter !== 'ALL' && exam.systemCategory !== categoryFilter) {
        return false;
      }
      // Clinical Presentation Filter
      if (presentationFilter !== 'ALL' && exam.chiefComplaint !== presentationFilter) {
        return false;
      }
      // Bookmark Filter
      if (showBookmarksOnly) {
        const isBookmarked = (bookmarkedPastExamIds ?? []).includes(exam.id);
        if (!isBookmarked) return false;
      }
      return true;
    });
  }, [exams, categoryFilter, presentationFilter, showBookmarksOnly, bookmarkedPastExamIds]);

  // File Upload -> OCR Vision
  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setOcrLoading(true);
    try {
      const base64Images: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const base64Image = await base64Promise;
        base64Images.push(base64Image);
      }

      const res = await fetch('/api/case/recognize-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: base64Images }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '스크린샷 분석에 실패했습니다.');
      }

      const data = await res.json();
      
      // Auto fill form states
      setTitle(data.title || `${data.patientName || '환자'} 기출 증례`);
      setSystemCategory(data.systemCategory || Object.keys(CLINICAL_CATEGORIES)[0] || '');
      setChiefComplaint(data.chiefComplaint || CLINICAL_PRESENTATIONS[0] || '');
      setChiefComplaintCustom(data.chiefComplaintCustom || '');
      setPatientName(data.patientName || '김환자');
      setPatientAge(String(data.patientAge ?? '30'));
      setPatientGender(data.patientGender === '여' ? '여' : '남');
      setChiefComplaintText(data.chiefComplaintText || '');
      setHistoryBlocks(data.historyBlocks || {});
      setVitals(data.vitals || { bp: '', hr: '', rr: '', temp: '' });
      setPhysicalExtra(data.physicalExamFindings || (Array.isArray(data.physicalExtraLines) ? data.physicalExtraLines.join('\n') : ''));
      
      // Structured PE
      setPeGeneral('');
      setPeHEENT('');
      setPeAbdomen('');
      setPeExtremity('');
      
      // Management & education plans
      setManagementPlanTests(data.managementPlanTests || '');
      setManagementPlanTreatment(data.managementPlanTreatment || '');
      setPatientEducation('');

      if (Array.isArray(data.diagnosisRanked)) {
        setDx1(data.diagnosisRanked[0] || '');
        setDx2(data.diagnosisRanked[1] || '');
        setDx3(data.diagnosisRanked[2] || '');
      } else {
        setDx1('');
        setDx2('');
        setDx3('');
      }
      setSpecialQuestion(data.specialQuestion || '');
      setSpecialOther(data.specialOther || '');

    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : '이미지 처리 중 오류가 발생했습니다.');
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  };

  const handleRegisterExam = async () => {
    if (!title.trim()) {
      alert('기출 증례 제목을 입력해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const ccResolved = chiefComplaintCustom.trim() || chiefComplaint;
      const ageNum = Math.max(1, Math.min(120, parseInt(patientAge, 10) || 30));

      const scope: DirectCaseScope = {
        history: true,
        physical: true,
        diagnosisPlan: !!(dx1.trim() && dx2.trim() && dx3.trim()),
      };

      const payload: DirectCaseFormPayload = {
        systemCategory,
        chiefComplaint: ccResolved,
        patientName: patientName.trim() || '환자',
        patientAge: ageNum,
        patientGender,
        chiefComplaintText: chiefComplaintText.trim() || ccResolved,
        scope,
        historyBlocks,
        difficulty: 'normal',
        specialQuestion: specialQuestion.trim() || undefined,
        specialOther: specialOther.trim() || undefined,
      };

      if (vitals.bp || vitals.hr || vitals.rr || vitals.temp) {
        payload.vitals = {
          bp: vitals.bp.trim(),
          hr: vitals.hr.trim(),
          rr: vitals.rr.trim(),
          temp: vitals.temp.trim(),
        };
      }

      if (physicalExtra.trim()) {
        payload.physicalExtraLines = physicalExtra
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      if (scope.diagnosisPlan) {
        payload.diagnosisRanked = [dx1.trim(), dx2.trim(), dx3.trim()];
      }

      // Complete Case Spec using standard builder endpoint
      const compRes = await fetch('/api/case/direct-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!compRes.ok) {
        const err = await compRes.json().catch(() => ({}));
        throw new Error(err.error || '케이스 내용 생성 중 오류가 발생했습니다.');
      }

      const compData = await compRes.json();
      const caseSpec: CaseSpec = compData.caseSpec;

      const isEditing = !!viewingExam && !viewingExam.isPreMade;
      const targetId = isEditing ? viewingExam.id : crypto.randomUUID();

      // Create new/updated PastExam entry
      const examData: PastExam = {
        id: targetId,
        title: title.trim(),
        systemCategory,
        chiefComplaint: ccResolved,
        caseSpec,
        updatedAt: Date.now(),
        formPayload: payload,
        authorId: user?.uid,
        isPreMade: false,
      };

      // Save to global Firestore collection
      await savePastExam(examData);
      alert(isEditing ? '성공적으로 수정되었습니다!' : '성공적으로 기출 문제 은행에 등록되었습니다!');
      
      // Reset form and close modal
      setRegisterOpen(false);
      setViewingExam(null);
      // Reload list
      await loadExams();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '기출 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const loadExamIntoForm = useCallback((exam: PastExam) => {
    setViewingExam(exam);
    setRegisterOpen(false); // Close registration view just in case

    setTitle(exam.title || '');
    setSystemCategory(exam.systemCategory || Object.keys(CLINICAL_CATEGORIES)[0] || '');
    setChiefComplaint(exam.chiefComplaint || CLINICAL_PRESENTATIONS[0] || '');
    setChiefComplaintCustom('');

    const payload = exam.formPayload;
    if (payload) {
      setPatientName(payload.patientName || '');
      setPatientAge(String(payload.patientAge ?? ''));
      setPatientGender(payload.patientGender || '남');
      setChiefComplaintText(payload.chiefComplaintText || '');
      setHistoryBlocks(payload.historyBlocks || {});
      setVitals({
        bp: payload.vitals?.bp || '',
        hr: payload.vitals?.hr ? String(payload.vitals.hr) : '',
        rr: payload.vitals?.rr ? String(payload.vitals.rr) : '',
        temp: payload.vitals?.temp ? String(payload.vitals.temp) : '',
      });
      
      let combinedPE = '';
      if (payload.peGeneral?.trim()) combinedPE += `[General] ${payload.peGeneral.trim()}\n`;
      if (payload.peHEENT?.trim()) combinedPE += `[HEENT] ${payload.peHEENT.trim()}\n`;
      if (payload.peAbdomen?.trim()) combinedPE += `[Abdomen] ${payload.peAbdomen.trim()}\n`;
      if (payload.peExtremity?.trim()) combinedPE += `[Extremity] ${payload.peExtremity.trim()}\n`;
      if (payload.physicalExtraLines?.length) {
        combinedPE += payload.physicalExtraLines.join('\n');
      }
      setPhysicalExtra(combinedPE.trim());
      setPeGeneral('');
      setPeHEENT('');
      setPeAbdomen('');
      setPeExtremity('');
      setManagementPlanTests(payload.managementPlanTests || '');
      setManagementPlanTreatment(payload.managementPlanTreatment || '');
      setPatientEducation('');

      if (Array.isArray(payload.diagnosisRanked)) {
        setDx1(payload.diagnosisRanked[0] || '');
        setDx2(payload.diagnosisRanked[1] || '');
        setDx3(payload.diagnosisRanked[2] || '');
      } else {
        setDx1('');
        setDx2('');
        setDx3('');
      }
      setSpecialQuestion(payload.specialQuestion || '');
      setSpecialOther(payload.specialOther || '');
    } else {
      // Build form states from caseSpec
      const spec = exam.caseSpec;
      setPatientName(spec.patient?.name || '');
      setPatientAge(String(spec.patient?.age || ''));
      setPatientGender(spec.patient?.gender === '여' ? '여' : '남');
      setChiefComplaintText(spec.chief_complaint_display || spec.opening_line || '');

      // Reconstruct historyBlocks
      const blocks: Record<string, string> = {};
      if (spec.chief_complaint_display || spec.opening_line) {
        blocks['주소'] = spec.chief_complaint_display || spec.opening_line || '';
      }
      if (spec.symptom_details) {
        if (spec.symptom_details.onset) blocks['O'] = spec.symptom_details.onset;
        if (spec.symptom_details.location) blocks['L'] = spec.symptom_details.location;
        if (spec.symptom_details.duration) blocks['D'] = spec.symptom_details.duration;
        if (spec.symptom_details.progression) blocks['Co'] = spec.symptom_details.progression;
        if (spec.symptom_details.character) blocks['C'] = spec.symptom_details.character;
        if (spec.symptom_details.associated) blocks['A'] = spec.symptom_details.associated;
        
        const agg = spec.symptom_details.aggravating;
        const rel = spec.symptom_details.relieving;
        if (agg || rel) {
          blocks['F'] = `악화: ${agg || '없음'}, 완화: ${rel || '없음'}`;
        }
      }
      if (spec.history) {
        if (spec.history.medications) blocks['약'] = spec.history.medications;
        if (spec.history.family) blocks['가'] = spec.history.family;
        if (spec.history.past_medical) blocks['과'] = spec.history.past_medical;
        
        const smoking = spec.history.social?.smoking;
        const alcohol = spec.history.social?.alcohol;
        const occupation = spec.history.social?.occupation || spec.patient?.occupation;
        if (smoking || alcohol || occupation) {
          blocks['사'] = `직업: ${occupation || '무직'}, 술: ${alcohol || '안 함'}, 담배: ${smoking || '안 함'}`;
        }
      }
      setHistoryBlocks(blocks);

      // Vitals
      setVitals({
        bp: spec.vitals?.bp || '',
        hr: spec.vitals?.hr ? String(spec.vitals.hr) : '',
        rr: spec.vitals?.rr ? String(spec.vitals.rr) : '',
        temp: spec.vitals?.temp ? String(spec.vitals.temp) : '',
      });

      setPhysicalExtra(spec.physical_exam_findings || '');
      setPeGeneral('');
      setPeHEENT('');
      setPeAbdomen('');
      setPeExtremity('');

      if (spec.answer_key?.diagnosis_ranked) {
        setDx1(spec.answer_key.diagnosis_ranked[0] || '');
        setDx2(spec.answer_key.diagnosis_ranked[1] || '');
        setDx3(spec.answer_key.diagnosis_ranked[2] || '');
      } else {
        setDx1(spec.true_diagnosis || '');
        setDx2(spec.differentials?.[0] || '');
        setDx3(spec.differentials?.[1] || '');
      }

      setManagementPlanTests(spec.answer_key?.management_plan?.tests || '');
      setManagementPlanTreatment(spec.answer_key?.management_plan?.treatment || '');
      setPatientEducation('');

      setSpecialQuestion(spec.patient_concern || '');
      setSpecialOther(spec.personality || '');
    }
  }, []);

  const handleDeleteExam = async () => {
    if (!viewingExam) return;
    if (viewingExam.isPreMade) {
      alert('기본 탑재 기출은 삭제할 수 없습니다.');
      return;
    }
    if (!confirm('정말로 이 기출을 삭제하시겠습니까?')) {
      return;
    }
    
    setSubmitting(true);
    try {
      await deletePastExam(viewingExam.id);
      alert('성공적으로 삭제되었습니다.');
      setViewingExam(null);
      setRegisterOpen(false);
      await loadExams();
    } catch (e) {
      console.error(e);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartExam = async (exam: PastExam) => {
    setSubmitting(true);
    try {
      const caseSpec = exam.caseSpec;
      const sessionId = uuidv4();

      const reg = await fetch('/api/session/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          caseSpec,
          difficulty,
          friendliness,
        }),
      });

      if (!reg.ok) {
        const err = await reg.json().catch(() => ({}));
        throw new Error(err.error || '세션 등록 실패');
      }

      startSession(caseSpec, sessionId, difficulty, timerMode, true, exam.title);
      router.push(interactionMode === 'voice' ? `/session/${sessionId}` : `/session-message/${sessionId}`);
    } catch (e) {
      console.error(e);
      alert('시험 시작 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartRandomExam = async () => {
    if (filteredExams.length === 0) {
      alert('조건에 맞는 기출 증례가 없습니다.');
      return;
    }
    const randomPicked = filteredExams[Math.floor(Math.random() * filteredExams.length)];
    await handleStartExam(randomPicked);
  };

  const isReadOnly = !!viewingExam && !!viewingExam.isPreMade;

  if (!authLoading && !user) return null;

  return (
    <main className="min-h-screen bg-white relative flex flex-col font-sans selection:bg-black selection:text-white">
      {/* Background Grid */}
      <div className="fixed inset-0 z-0 pointer-events-none"
           style={{
             backgroundImage: "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
             backgroundSize: "64px 64px"
           }}
      />
      <div className="fixed top-10 right-[15%] w-96 h-96 rounded-full bg-neutral-200 blur-[100px] opacity-70 pointer-events-none z-0" />
      <div className="fixed bottom-10 left-[15%] w-96 h-96 rounded-full bg-neutral-300 blur-[100px] opacity-60 pointer-events-none z-0" />

      <div className="relative z-10 flex-1 flex flex-col h-full border-x border-black max-w-6xl mx-auto w-full bg-transparent">
        
        {/* Header */}
        <header className="border-b border-black bg-white/70 backdrop-blur-xl px-8 py-5 sticky top-0 z-50">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/practice')} className="text-sm font-bold uppercase tracking-wider text-black/60 hover:text-black transition-colors flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Practice
            </button>
            <h1 className="text-sm font-black tracking-widest uppercase">Past Exam Mode</h1>
            <button
              onClick={() => {
                setRegisterOpen(true);
                setViewingExam(null);
                // Clear any previous form state
                setTitle('');
                setPatientName('');
                setPatientAge('30');
                setPatientGender('남');
                setChiefComplaintText('');
                setHistoryBlocks({});
                setVitals({ bp: '', hr: '', rr: '', temp: '' });
                setPhysicalExtra('');
                setDx1('');
                setDx2('');
                setDx3('');
                setSpecialQuestion('');
                setSpecialOther('');
                setPeGeneral('');
                setPeHEENT('');
                setPeAbdomen('');
                setPeExtremity('');
                setManagementPlanTests('');
                setManagementPlanTreatment('');
                setPatientEducation('');
              }}
              className="px-5 py-2.5 rounded-full border border-black bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-black/90"
            >
              새 기출 등록 (스크린샷)
            </button>
          </div>
        </header>

        {/* Register Screen (Image upload and form correction) */}
        {(registerOpen || viewingExam !== null) && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setRegisterOpen(false);
                setViewingExam(null);
              }
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <div className="bg-white border border-black rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-black flex items-center justify-between bg-white sticky top-0 z-10">
                <h2 className="text-lg font-black uppercase tracking-tight">
                  {isReadOnly ? '기출 증례 상세 보기 (수정 불가)' : viewingExam ? '기출 증례 수정 및 삭제' : '새 기출 증례 등록'}
                </h2>
                <button
                  onClick={() => {
                    setRegisterOpen(false);
                    setViewingExam(null);
                  }}
                  className="text-xs font-bold border border-black px-3 py-1.5 rounded-full hover:bg-black/5"
                >
                  닫기
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid md:grid-cols-3 gap-6">
                  {/* File upload block */}
                  {!isReadOnly && (
                    <div className="md:col-span-1 border border-black border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-center bg-white/50 min-h-[220px]">
                      <span className="text-3xl mb-4">📸</span>
                      <p className="text-xs font-bold text-black uppercase tracking-wider mb-2">기출 스크린샷 업로드 (여러 장 가능)</p>
                      <p className="text-[10px] text-black/50 mb-4 max-w-[180px] leading-relaxed">
                        상황지침서, 병력/진찰 테이블 등 증례 정보가 담긴 모든 캡처 이미지들을 함께 선택해 업로드하세요.
                      </p>
                      <label className="cursor-pointer px-4 py-2 rounded-full border border-black bg-white text-xs font-bold hover:bg-neutral-50 active:scale-[0.98] transition-all">
                        파일 선택 (복수 가능)
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => void handleScreenshotUpload(e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}

                  {/* Loader */}
                  {ocrLoading && (
                    <div className="md:col-span-2 border border-black rounded-3xl p-12 flex flex-col items-center justify-center bg-white/60 backdrop-blur-md">
                      <div className="w-10 h-10 border-4 border-black/20 border-t-white rounded-full animate-spin mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest text-black">스크린샷 데이터 인식 중...</p>
                      <p className="text-[10px] text-black/50 mt-1">상황 지침, 병력, 신체진찰 기록을 정교하게 추출하고 있습니다.</p>
                    </div>
                  )}

                  {/* Form editing block */}
                  {!ocrLoading && (
                    <div className={`${isReadOnly ? 'md:col-span-3' : 'md:col-span-2'} space-y-6`}>
                      {/* 1. 기출 증례 정보 */}
                      <section className="space-y-4 rounded-2xl border border-black p-4 bg-white/50">
                        <h3 className="text-xs font-black uppercase tracking-widest">기출 증례 정보</h3>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-black/50 block">증례 제목</label>
                          <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="기출 증례를 구분할 제목"
                            readOnly={isReadOnly}
                            className={`w-full rounded-xl border border-black px-3 py-2 text-sm outline-none ${
                              isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                            }`}
                          />
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-black/50 block">계통 분류</label>
                            <select
                              value={systemCategory}
                              onChange={(e) => setSystemCategory(e.target.value)}
                              disabled={isReadOnly}
                              className={`mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm bg-white ${
                                isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-800 opacity-80' : ''
                              }`}
                            >
                              {Object.keys(CLINICAL_CATEGORIES).map((k) => (
                                <option key={k} value={k}>{k}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-black/50 block">주호소 분류 (C.C.)</label>
                            <select
                              value={chiefComplaint}
                              onChange={(e) => setChiefComplaint(e.target.value)}
                              disabled={isReadOnly}
                              className={`mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm bg-white ${
                                isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-800 opacity-80' : ''
                              }`}
                            >
                              {CLINICAL_PRESENTATIONS.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            {!isReadOnly && (
                              <input
                                value={chiefComplaintCustom}
                                onChange={(e) => setChiefComplaintCustom(e.target.value)}
                                placeholder="분류에 없는 C.C. 직접 입력"
                                className="mt-2 w-full rounded-xl border border-black/40 px-3 py-2 text-sm"
                              />
                            )}
                          </div>
                        </div>
                      </section>

                      {/* 2. 환자 기본 사항 & 상황 지침 */}
                      <section className="space-y-4 rounded-2xl border border-black p-4 bg-white/50">
                        <h3 className="text-xs font-black uppercase tracking-widest">환자 기본 사항 & 상황 지침</h3>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <input
                            value={patientName}
                            onChange={(e) => setPatientName(e.target.value)}
                            placeholder="환자 이름"
                            readOnly={isReadOnly}
                            className={`rounded-xl border border-black px-3 py-2 text-sm ${
                              isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                            }`}
                          />
                          <input
                            value={patientAge}
                            onChange={(e) => setPatientAge(e.target.value)}
                            placeholder="나이"
                            readOnly={isReadOnly}
                            className={`rounded-xl border border-black px-3 py-2 text-sm ${
                              isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                            }`}
                          />
                          <div className="flex gap-4 items-center px-2">
                            <label className={`flex items-center gap-2 text-sm ${isReadOnly ? 'opacity-80' : ''}`}>
                              <input
                                type="radio"
                                checked={patientGender === '남'}
                                onChange={() => setPatientGender('남')}
                                disabled={isReadOnly}
                              />
                              남
                            </label>
                            <label className={`flex items-center gap-2 text-sm ${isReadOnly ? 'opacity-80' : ''}`}>
                              <input
                                type="radio"
                                checked={patientGender === '여'}
                                onChange={() => setPatientGender('여')}
                                disabled={isReadOnly}
                              />
                              여
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-black/50 block">학생 제공 주호소 상황지침</label>
                          <textarea
                            value={chiefComplaintText}
                            onChange={(e) => setChiefComplaintText(e.target.value)}
                            rows={2}
                            placeholder="의사가 시작 화면에서 읽게 될 정보"
                            readOnly={isReadOnly}
                            className={`mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none resize-y ${
                              isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                            }`}
                          />
                        </div>
                      </section>

                      {/* 3. 예상 감별 진단 & 진료 계획 (Answer Key) */}
                      <section className="space-y-4 rounded-2xl border border-black p-4 bg-white/50">
                        <h3 className="text-xs font-black uppercase tracking-widest">예상 감별 진단 & 진료 계획 (Answer Key)</h3>
                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] font-bold text-black/50 block">예상 감별 진단 1~3순위</label>
                            <div className="grid gap-2 mt-1">
                              <input
                                value={dx1}
                                onChange={(e) => setDx1(e.target.value)}
                                placeholder="1순위 (주진단)"
                                readOnly={isReadOnly}
                                className={`rounded-xl border border-black px-3 py-2 text-sm outline-none ${
                                  isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                                }`}
                              />
                              <input
                                value={dx2}
                                onChange={(e) => setDx2(e.target.value)}
                                placeholder="2순위"
                                readOnly={isReadOnly}
                                className={`rounded-xl border border-black px-3 py-2 text-sm outline-none ${
                                  isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                                }`}
                              />
                              <input
                                value={dx3}
                                onChange={(e) => setDx3(e.target.value)}
                                placeholder="3순위"
                                readOnly={isReadOnly}
                                className={`rounded-xl border border-black px-3 py-2 text-sm outline-none ${
                                  isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                                }`}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-black/50 block">필요한 검사 계획 3가지</label>
                            <textarea
                              value={managementPlanTests}
                              onChange={(e) => setManagementPlanTests(e.target.value)}
                              rows={2}
                              placeholder="예: 1. 요역동학 검사\n2. 골반초음파 및 CT 영상검사\n3. 소변(배양)검사"
                              readOnly={isReadOnly}
                              className={`mt-1 w-full rounded-xl border border-black/30 px-3 py-2 text-sm outline-none resize-y ${
                                isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                              }`}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-black/50 block">필요한 치료 계획 3가지</label>
                            <textarea
                              value={managementPlanTreatment}
                              onChange={(e) => setManagementPlanTreatment(e.target.value)}
                              rows={2}
                              placeholder="예: 1. 생활 습관 교육\n2. 케겔 운동, 방광 및 배뇨 훈련\n3. 약물 치료"
                              readOnly={isReadOnly}
                              className={`mt-1 w-full rounded-xl border border-black/30 px-3 py-2 text-sm outline-none resize-y ${
                                isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                              }`}
                            />
                          </div>
                        </div>
                      </section>

                      {/* 4. 병력 사항 (OLD COEX 등) */}
                      <section className="space-y-4 rounded-2xl border border-black p-4 bg-white/50">
                        <h3 className="text-xs font-black uppercase tracking-widest">병력 사항 (OLD COEX 등)</h3>
                        <div className="grid gap-3">
                          {HISTORY_KEYS.map((key) => {
                            const sem = HISTORY_BLOCK_SEMANTICS[key];
                            return (
                              <div key={key}>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[10px] font-bold text-black/50">[{key}]</span>
                                  <span className="text-[9px] text-black/40">{sem.ko} ({sem.en})</span>
                                </div>
                                <textarea
                                  value={historyBlocks[key] ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setHistoryBlocks((prev) => ({ ...prev, [key]: val }));
                                  }}
                                  rows={2}
                                  readOnly={isReadOnly}
                                  className={`mt-1 w-full rounded-xl border border-black/30 px-3 py-2 text-sm outline-none resize-y ${
                                    isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                                  }`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      {/* 5. 신체 진찰 & 활력 징후 */}
                      <section className="space-y-4 rounded-2xl border border-black p-4 bg-white/50">
                        <h3 className="text-xs font-black uppercase tracking-widest">신체 진찰 & 활력 징후</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            ['bp', '혈압(BP)'],
                            ['hr', '맥박(HR)'],
                            ['rr', '호흡(RR)'],
                            ['temp', '체온(BT)'],
                          ].map(([k, label]) => (
                            <div key={k}>
                              <label className="text-[10px] text-black/50 block">{label}</label>
                              <input
                                value={vitals[k as keyof typeof vitals] ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setVitals((v) => ({ ...v, [k]: val }));
                                }}
                                readOnly={isReadOnly}
                                className={`mt-1 w-full rounded-xl border border-black px-2 py-1.5 text-sm ${
                                  isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                                }`}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="grid gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-black/50 block">신체 진찰 소견 (P/E)</label>
                            <textarea
                              value={physicalExtra}
                              onChange={(e) => setPhysicalExtra(e.target.value)}
                              rows={4}
                              placeholder="예: [General] V/S : stable&#10;[HEENT] 눈(-), 구강(-)&#10;[Abdomen] Suprapubic Td/rTd(-/-)"
                              readOnly={isReadOnly}
                              className={`w-full rounded-xl border border-black px-3 py-2 text-sm resize-y outline-none ${
                                isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                              }`}
                            />
                          </div>
                        </div>
                      </section>

                      {/* 6. 특이사항 & 가이드 */}
                      <section className="space-y-4 rounded-2xl border border-black p-4 bg-white/50">
                        <h3 className="text-xs font-black uppercase tracking-widest">특이사항 & 가이드</h3>
                        <div>
                          <label className="text-[10px] font-bold text-black/50 block">주요 환자 우려/질문 사항</label>
                          <input
                            value={specialQuestion}
                            onChange={(e) => setSpecialQuestion(e.target.value)}
                            placeholder="주요 환자 우려/질문 사항"
                            readOnly={isReadOnly}
                            className={`w-full mt-1 rounded-xl border border-black px-3 py-2 text-sm outline-none ${
                              isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-black/50 block">기타 특이 설정 사항</label>
                          <textarea
                            value={specialOther}
                            onChange={(e) => setSpecialOther(e.target.value)}
                            rows={2}
                            placeholder="기타 특이 설정 사항"
                            readOnly={isReadOnly}
                            className={`w-full mt-1 rounded-xl border border-black px-3 py-2 text-sm resize-y outline-none ${
                              isReadOnly ? 'bg-neutral-50 border-neutral-200 text-neutral-850' : ''
                            }`}
                          />
                        </div>
                      </section>

                      {isReadOnly ? (
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setViewingExam(null);
                            }}
                            className="flex-1 py-4 rounded-2xl border border-black bg-white text-black text-sm font-bold hover:bg-neutral-50 transition-all active:scale-[0.98]"
                          >
                            닫기
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setViewingExam(null);
                              const configSection = document.getElementById('practice-config-section');
                              if (configSection) {
                                configSection.scrollIntoView({ behavior: 'smooth' });
                              }
                            }}
                            className="flex-1 py-4 rounded-2xl bg-black text-white text-sm font-bold hover:bg-black/90 transition-all active:scale-[0.98]"
                          >
                            연습 설정으로 이동
                          </button>
                        </div>
                      ) : viewingExam ? (
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setViewingExam(null);
                              setRegisterOpen(false);
                            }}
                            className="px-6 py-4 rounded-2xl border border-black bg-white text-black text-sm font-bold hover:bg-neutral-50 transition-all active:scale-[0.98]"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void handleDeleteExam()}
                            className="px-6 py-4 rounded-2xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-all active:scale-[0.98] disabled:opacity-50"
                          >
                            삭제
                          </button>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void handleRegisterExam()}
                            className="flex-1 py-4 rounded-2xl bg-black text-white text-sm font-bold hover:bg-black/90 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {submitting ? (
                              <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                수정 내용 저장 중...
                              </>
                            ) : '수정 내용 저장'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setRegisterOpen(false);
                            }}
                            className="px-6 py-4 rounded-2xl border border-black bg-white text-black text-sm font-bold hover:bg-neutral-50 transition-all active:scale-[0.98]"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void handleRegisterExam()}
                            className="flex-1 py-4 rounded-2xl bg-black text-white text-sm font-bold hover:bg-black/90 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {submitting ? (
                              <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                AI 기출 케이스 완성 및 등록 중...
                              </>
                            ) : '기출 문제 은행에 기출 등록'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Question Bank Dashboard */}
        <div className="flex-1 p-6 w-full max-w-5xl mx-auto grid grid-cols-12 gap-6 mt-6">
          
          {/* Left Filter Column */}
          <aside className="col-span-12 md:col-span-4 lg:col-span-3 space-y-6">
            <div className="glass rounded-3xl border border-black p-5 relative overflow-hidden">
              <div className="absolute inset-0 border border-white/60 rounded-3xl pointer-events-none" />
              
              <div className="relative z-10 space-y-5">
                <h3 className="text-xs font-black text-black uppercase tracking-widest">필터 설정</h3>

                {/* Favorite toggle */}
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={showBookmarksOnly}
                    onChange={(e) => setShowBookmarksOnly(e.target.checked)}
                    className="rounded border-black"
                  />
                  <span className="text-xs font-bold text-black/80">★ 즐겨찾기 기출만 보기</span>
                </label>

                {/* Category selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-black/50 uppercase tracking-wider block">계통별 분류</label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full rounded-2xl border border-black px-3 py-2 text-sm bg-white/50 outline-none"
                  >
                    <option value="ALL">전체 보기</option>
                    {Object.keys(CLINICAL_CATEGORIES).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Clinical presentation selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-black/50 uppercase tracking-wider block">임상별 분류 (C.C.)</label>
                  <select
                    value={presentationFilter}
                    onChange={(e) => setPresentationFilter(e.target.value)}
                    className="w-full rounded-2xl border border-black px-3 py-2 text-sm bg-white/50 outline-none"
                  >
                    <option value="ALL">전체 보기</option>
                    {presentationOptions.filter(o => o !== 'ALL').map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Quick Random Practice */}
            <div className="glass rounded-3xl border border-black p-5 relative overflow-hidden bg-black/5">
              <div className="absolute inset-0 border border-white/60 rounded-3xl pointer-events-none" />
              <div className="relative z-10 space-y-4">
                <h3 className="text-xs font-black text-black uppercase tracking-widest">필터 내 랜덤 연습</h3>
                <p className="text-[10px] text-black/60 leading-relaxed">
                  현재 지정한 필터 범위 내에서 무작위 기출 케이스로 즉시 시험을 시작합니다.
                </p>
                <div className="text-[10px] font-bold text-black border border-black/10 rounded-xl px-3 py-2 bg-white/40">
                  선택 범위: {categoryFilter === 'ALL' ? '모든 계통' : categoryFilter} · {presentationFilter === 'ALL' ? '모든 주호소' : presentationFilter}
                  <br />
                  매칭 개수: {filteredExams.length}개
                </div>
                <button
                  onClick={() => {
                    if (filteredExams.length === 0) {
                      alert('매칭되는 기출 증례가 없습니다.');
                      return;
                    }
                    // Select first matching one as a preview, or launch directly
                    const randomPicked = filteredExams[Math.floor(Math.random() * filteredExams.length)];
                    setSelectedExam(randomPicked);
                    // Scroll down to configuration if mobile
                  }}
                  className="w-full py-2.5 rounded-full bg-black text-white text-xs font-bold hover:bg-black/90 transition-all active:scale-[0.98]"
                >
                  랜덤 기출 선택하기
                </button>
              </div>
            </div>
          </aside>

          {/* Main Question List Column */}
          <main className="col-span-12 md:col-span-8 lg:col-span-9 space-y-6">
            
            {/* List Header */}
            <div className="flex items-center justify-between border-b border-black/10 pb-3">
              <h3 className="text-xs font-black text-black uppercase tracking-widest">등록된 기출 증례 ({filteredExams.length}개)</h3>
              {loadingExams && <span className="text-xs text-black/50">불러오는 중...</span>}
            </div>

            {/* Past Exam Cards List */}
            {filteredExams.length === 0 && !loadingExams ? (
              <div className="text-center py-20 border border-black/10 rounded-3xl bg-white/40 backdrop-blur-sm">
                <p className="text-sm font-semibold text-black/50">조건에 맞는 기출 증례가 존재하지 않습니다.</p>
                <p className="text-xs text-black/45 mt-1">상단에서 필터 조건을 바꾸거나 새로운 기출을 등록해 보세요.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto pr-1">
                {filteredExams.map((exam) => {
                  const isBookmarked = (bookmarkedPastExamIds ?? []).includes(exam.id);
                  const isSelected = selectedExam?.id === exam.id;
                  return (
                    <div
                      key={exam.id}
                      onClick={() => {
                        setSelectedExam(exam);
                        loadExamIntoForm(exam);
                      }}
                      className={`group relative border rounded-3xl overflow-hidden cursor-pointer transition-all duration-300 p-5 flex flex-col justify-between bg-white/40 backdrop-blur-md hover:bg-white/80 hover:-translate-y-1 hover:shadow-lg
                        ${isSelected ? 'border-black ring-2 ring-black/5 bg-black/[0.02]' : 'border-black/20'}
                      `}
                    >
                      <div className="absolute inset-0 border border-white/60 pointer-events-none rounded-3xl" />
                      
                      <div className="relative z-10 flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <span className="text-[10px] font-bold text-black border border-black rounded-full px-2 py-0.5 bg-white/50">
                              {exam.systemCategory}
                            </span>
                            <span className="text-[10px] font-semibold text-black/50">
                              {exam.chiefComplaint}
                            </span>
                            {exam.isPreMade && (
                              <span className="text-[9px] font-extrabold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1">
                                기본 탑재
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-black tracking-tight line-clamp-1">{exam.title}</h4>
                          <p className="text-xs font-semibold text-black/60 mt-1 line-clamp-2 leading-relaxed">
                            {exam.caseSpec.patient.name} ({exam.caseSpec.patient.age}세/{exam.caseSpec.patient.gender}) · {exam.caseSpec.true_diagnosis}
                          </p>
                        </div>

                        {/* Favorite button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void togglePastExamBookmark(exam.id);
                          }}
                          className={`text-lg p-1.5 rounded-full hover:bg-black/5 active:scale-95 transition-all
                            ${isBookmarked ? 'text-amber-500' : 'text-neutral-300 hover:text-neutral-400'}
                          `}
                        >
                          ★
                        </button>
                      </div>

                      <div className="relative z-10 flex items-center justify-between border-t border-black/5 mt-4 pt-3 text-[10px] text-black/40">
                        <span>수정일: {new Date(exam.updatedAt).toLocaleDateString()}</span>
                        <span className="font-bold text-black/60 group-hover:text-black">연습 설정하기 →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Launch Configuration Area */}
            {selectedExam && (
              <section id="practice-config-section" className="glass rounded-3xl border border-black p-6 space-y-6 relative overflow-hidden bg-black/[0.01]">
                <div className="absolute inset-0 border border-white/60 rounded-3xl pointer-events-none" />
                
                <div className="relative z-10 flex items-start justify-between border-b border-black/10 pb-3">
                  <div>
                    <h3 className="text-xs font-black text-black uppercase tracking-widest">연습 세션 설정</h3>
                    <p className="text-sm font-black text-black mt-1">
                      선택된 기출: <span className="underline">{selectedExam.title}</span>
                    </p>
                    <p className="text-[10px] text-black/50 mt-0.5">
                      환자 정보: {selectedExam.caseSpec.patient.name} ({selectedExam.caseSpec.patient.age}세/{selectedExam.caseSpec.patient.gender}) · {selectedExam.caseSpec.patient.occupation}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowPreview((prev) => !prev)}
                      className="text-[10px] font-bold text-black border border-black rounded-full px-3 py-1 bg-white hover:bg-neutral-50"
                    >
                      {showPreview ? '기출 세부 내용 닫기' : '기출 세부 내용 보기'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedExam(null);
                        setShowPreview(false);
                      }}
                      className="text-[10px] font-bold text-black/50 hover:text-black border border-black/20 rounded-full px-2.5 py-1"
                    >
                      선택 취소
                    </button>
                  </div>
                </div>

                {/* Read-Only Details Panel */}
                {showPreview && (
                  <div className="border border-black/25 rounded-2xl p-4 bg-white/70 space-y-4 max-h-[40vh] overflow-y-auto relative z-10 text-xs text-black/85 leading-relaxed">
                    <div className="border-b border-black/10 pb-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-black/50">기본 정보</p>
                      <p className="font-bold">분류: {selectedExam.systemCategory} · {selectedExam.chiefComplaint}</p>
                      <p>상황지침: {selectedExam.caseSpec.chief_complaint_display || selectedExam.caseSpec.opening_line}</p>
                    </div>

                    <div className="border-b border-black/10 pb-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-black/50">환자 인적사항 & 활력 징후</p>
                      <p>이름: {selectedExam.caseSpec.patient.name} ({selectedExam.caseSpec.patient.age}세 / {selectedExam.caseSpec.patient.gender}) · 직업: {selectedExam.caseSpec.patient.occupation}</p>
                      <p>Vitals: 혈압 {selectedExam.caseSpec.vitals.bp} mmHg · 맥박 {selectedExam.caseSpec.vitals.hr}회/분 · 호흡 {selectedExam.caseSpec.vitals.rr}회/분 · 체온 {selectedExam.caseSpec.vitals.temp}℃</p>
                    </div>

                    <div className="border-b border-black/10 pb-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-black/50">병력 사항 (OLD COEX 등)</p>
                      <div className="grid grid-cols-2 gap-2 mt-1 font-medium text-[11px]">
                        <p><strong>[O] 발병시기:</strong> {selectedExam.caseSpec.symptom_details.onset}</p>
                        <p><strong>[L] 위치:</strong> {selectedExam.caseSpec.symptom_details.location || '-'}</p>
                        <p><strong>[D] 지속/빈도:</strong> {selectedExam.caseSpec.symptom_details.duration}</p>
                        <p><strong>[Co] 경과:</strong> {selectedExam.caseSpec.symptom_details.progression || '-'}</p>
                        <p><strong>[C] 특징:</strong> {selectedExam.caseSpec.symptom_details.character}</p>
                        <p><strong>[A] 동반증상:</strong> {selectedExam.caseSpec.symptom_details.associated}</p>
                        <p><strong>[F] 악화/완화:</strong> 악화({selectedExam.caseSpec.symptom_details.aggravating}) / 완화({selectedExam.caseSpec.symptom_details.relieving})</p>
                        <p><strong>[Ex] 유사경험:</strong> {selectedExam.caseSpec.history.hpi ? 'HPI 참고' : '-'}</p>
                        <p><strong>[약] 약물력:</strong> {selectedExam.caseSpec.history.medications}</p>
                        <p><strong>[사] 사회력:</strong> 술({selectedExam.caseSpec.history.social.alcohol}) · 담배({selectedExam.caseSpec.history.social.smoking})</p>
                        <p><strong>[가] 가족력:</strong> {selectedExam.caseSpec.history.family}</p>
                        <p><strong>[과] 과거력:</strong> {selectedExam.caseSpec.history.past_medical}</p>
                      </div>
                    </div>

                    <div className="border-b border-black/10 pb-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-black/50">신체 진찰 소견 (P/E)</p>
                      <p className="whitespace-pre-wrap">{selectedExam.caseSpec.physical_exam_findings}</p>
                    </div>

                    <div className="border-b border-black/10 pb-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-black/50">감별 진단 순위</p>
                      <ol className="list-decimal list-inside font-bold">
                        {selectedExam.caseSpec.answer_key.diagnosis_ranked.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ol>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-black/50">치료 및 교육 계획 (Answer Key)</p>
                      <p><strong>검사 계획:</strong> {selectedExam.caseSpec.answer_key.management_plan.tests}</p>
                      <p><strong>치료 계획:</strong> {selectedExam.caseSpec.answer_key.management_plan.treatment}</p>
                      <p><strong>환자 교육:</strong> {selectedExam.caseSpec.answer_key.patient_education}</p>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-6 relative z-10">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-black uppercase tracking-widest mb-2 block">난이도 설정</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'easy' as const, label: '쉬움' },
                          { value: 'normal' as const, label: '보통' },
                          { value: 'hard' as const, label: '어려움' },
                        ].map((d) => (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => setDifficulty(d.value)}
                            className={`rounded-2xl py-2.5 text-xs font-bold border transition-all ${
                              difficulty === d.value
                                ? 'bg-black text-white border-black shadow-md'
                                : 'bg-white/50 text-black/70 border-black/20 hover:border-black/50'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-black uppercase tracking-widest mb-2 block">환자 태도 설정</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'cooperative' as const, label: '협조적' },
                          { value: 'normal' as const, label: '보통' },
                          { value: 'uncooperative' as const, label: '비협조적' },
                        ].map((f) => (
                          <button
                            key={f.value}
                            type="button"
                            onClick={() => setFriendliness(f.value)}
                            className={`rounded-2xl py-2.5 text-xs font-bold border transition-all ${
                              friendliness === f.value
                                ? 'bg-black text-white border-black shadow-md'
                                : 'bg-white/50 text-black/70 border-black/20 hover:border-black/50'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-black uppercase tracking-widest mb-2 block">진행 방식</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setInteractionMode('voice')}
                          className={`text-left rounded-2xl border p-3 transition-all ${
                            interactionMode === 'voice'
                              ? 'border-black bg-black text-white shadow-md'
                              : 'border-black/20 bg-white/50 hover:border-black/40'
                          }`}
                        >
                          <p className="text-xs font-black mb-0.5">음성 세션</p>
                          <p className={`text-[10px] font-medium leading-relaxed ${interactionMode === 'voice' ? 'text-white/80' : 'text-black/50'}`}>
                            마이크로 환자와 음성 대화
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setInteractionMode('text')}
                          className={`text-left rounded-2xl border p-3 transition-all ${
                            interactionMode === 'text'
                              ? 'border-black bg-black text-white shadow-md'
                              : 'border-black/20 bg-white/50 hover:border-black/40'
                          }`}
                        >
                          <p className="text-xs font-black mb-0.5">메시지 세션</p>
                          <p className={`text-[10px] font-medium leading-relaxed ${interactionMode === 'text' ? 'text-white/80' : 'text-black/50'}`}>
                            키보드 텍스트 채팅 대화
                          </p>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-black uppercase tracking-widest mb-2 block">타이머 방식</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setTimerMode('countdown')}
                          className={`text-left rounded-2xl border p-3 transition-all ${
                            timerMode === 'countdown'
                              ? 'border-black bg-black text-white shadow-md'
                              : 'border-black/20 bg-white/50 hover:border-black/40'
                          }`}
                        >
                          <p className="text-xs font-black mb-0.5">카운트다운</p>
                          <p className={`text-[10px] font-medium ${timerMode === 'countdown' ? 'text-white/80' : 'text-black/50'}`}>
                            12분 역타이머
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTimerMode('countup')}
                          className={`text-left rounded-2xl border p-3 transition-all ${
                            timerMode === 'countup'
                              ? 'border-black bg-black text-white shadow-md'
                              : 'border-black/20 bg-white/50 hover:border-black/40'
                          }`}
                        >
                          <p className="text-xs font-black mb-0.5">카운트업</p>
                          <p className={`text-[10px] font-medium ${timerMode === 'countup' ? 'text-white/80' : 'text-black/50'}`}>
                            무제한 누적타이머
                          </p>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 relative z-10">
                  <button
                    onClick={() => void handleStartExam(selectedExam)}
                    disabled={submitting}
                    className="w-full py-4.5 bg-black text-white rounded-2xl text-xs font-bold uppercase tracking-wider hover:bg-black/90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                  >
                    {submitting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        시험 세션 생성 중...
                      </>
                    ) : '이 기출 조건으로 연습 시작'}
                  </button>
                </div>
              </section>
            )}

            {/* Quick Random launch triggers */}
            {!selectedExam && filteredExams.length > 0 && (
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => void handleStartRandomExam()}
                  className="px-6 py-3 rounded-full bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 active:scale-[0.97] transition-all flex items-center gap-2"
                >
                  🎲 현재 필터 조건 기출 중 하나 무작위 시작
                </button>
              </div>
            )}

          </main>
        </div>
      </div>
    </main>
  );
}

export default function PastExamsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white flex items-center justify-center font-sans">
          <p className="text-sm text-black/60">로딩 중…</p>
        </main>
      }
    >
      <PastExamsContent />
    </Suspense>
  );
}
