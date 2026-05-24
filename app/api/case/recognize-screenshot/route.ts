import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { CLINICAL_CATEGORIES, CLINICAL_PRESENTATIONS } from '@/lib/ai/personaTemplate';

export const runtime = 'nodejs';

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 없습니다.');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { images } = body; // Array of base64 data URLs or a single image string

    const imageList: string[] = [];
    if (Array.isArray(images)) {
      imageList.push(...images);
    } else if (body.image) {
      imageList.push(body.image);
    }

    if (imageList.length === 0) {
      return NextResponse.json({ error: '이미지 데이터(images)가 누락되었습니다.' }, { status: 400 });
    }

    let client: OpenAI;
    try {
      client = getOpenAIClient();
    } catch {
      return NextResponse.json(
        { error: 'OpenAI API 키가 설정되지 않아 스크린샷 인식을 진행할 수 없습니다.' },
        { status: 503 }
      );
    }

    const contentArray: any[] = [
      {
        type: 'text',
        text: `당신은 의과대학 CPX(임상수행시험) 케이스 설계 조우미입니다.
제공된 이미지들(여러 장의 CPX 상황지침서, 지침카드, 체크리스트, 또는 관련 정보 텍스트 테이블)을 통합 분석하여 환자의 프로필과 병력 정보를 상세하게 추출하여 JSON 형식으로 출력해주세요.

반드시 지켜야 할 규칙:
1. systemCategory는 반드시 다음 중 하나여야 합니다: ${Object.keys(CLINICAL_CATEGORIES).map(k => `"${k}"`).join(', ')}
2. chiefComplaint는 반드시 다음 중 하나여야 합니다: ${CLINICAL_PRESENTATIONS.map(p => `"${p}"`).join(', ')}
3. chiefComplaintCustom은 이미지에서 파악된 주호소 증상 텍스트가 위 chiefComplaint 목록에 부합하지 않거나, 더 상세할 때 입력합니다.
4. patientName이 이미지에 없으면 한국식 이름 하나를 지어내세요 (예: "김철수", "이영희").
5. patientAge가 이미지에 없으면 30~70세 사이의 적절한 나이를 지어내어 숫자로 입력하세요.
6. patientGender는 "남" 또는 "여" 중 하나여야 합니다.
7. chiefComplaintText는 의사(사용자)가 진료실에 들어섰을 때 보게 될 상황지침 한 문장 혹은 짧은 문단입니다. 환자의 나이, 성별, 내원이유를 포함하여 자연스러운 의학 지침서 톤으로 작성하세요 (예: "47세 여자 박임자씨가 소변이 새는 증상으로 내원하였다.").
8. scope는 다음과 같이 고정하세요: { "history": true, "physical": true, "diagnosisPlan": true }
9. historyBlocks는 이미지 속 모든 문진 정보를 각 키에 매핑하세요. 절대 내용을 임의로 생략하거나 요약 및 누락하지 말고, 특히 A(동반 증상) 및 주소(주증상)를 포함하여 이미지의 모든 세부 사항을 정교하게 반영하세요:
   - 주소: 주증상 (Chief Complaint - 환자가 가장 먼저 호소하는 주증상과 그 기간 등)
   - O: 발병 시기 (Onset)
   - L: 부위 및 방사통 (Location)
   - D: 지속 시간 및 빈도 (Duration)
   - Co: 경과 (Course - 악화/완화 경향 등)
   - Ex: 이전 경험 (Experience - 과거 유사한 증상 경험)
   - C: 통증/병변의 특징 및 강도 (Character)
   - A: 동반 증상 (Associated symptom - 결코 누락하지 말고 이미지 속 사소한 동반 증상까지 전부 기재하세요)
   - F: 악화/완화 요인 (Factor)
   - E: 이전 검진/검사 결과 (Exam)
   - 약: 약물력 (Medications)
   - 사: 사회력 (술, 담배, 직업 등)
   - 가: 가족력 (Family history)
   - 외: 외상력 및 수술력 (Trauma/Surgery)
   - 과: 과거 지병 (다른 기왕 질환, 고혈압, 당뇨 등)
   - 여: 여성력 (생리주기, 임산 여부 등 - 여성 환자일 때만 해당)
   - 기타: 기타 보충 사항
10. vitals는 이미지 속 혈압, 맥박, 호흡, 체온 수치를 적으세요.
    - bp: "120/80" 형식의 문자열 (없으면 "120/80" 또는 빈값)
    - hr: 맥박 수치 문자열 (없으면 "80" 또는 빈값)
    - rr: 호흡 수치 문자열 (없으면 "20" 또는 빈값)
    - temp: 체온 수치 문자열 (없으면 "36.5" 또는 빈값)
11. physicalExamFindings: 이미지 속 신체진찰(P/E) 소견을 임의로 분류하지 말고 이미지에 표시된 항목과 줄바꿈 구조 그대로 정교하게 텍스트 블록으로 기재하십시오. (peGeneral, peHEENT 등 여러 필드로 나누어 쓰지 말아야 합니다.)
12. diagnosisRanked: 이미지의 진단을 기반으로 예상 추정 진단 1순위, 2순위, 3순위를 각각 문자열 배열로 적으세요. (예: ["절박성 요실금", "신경성 요실금", "과민성 방광"])
13. managementPlanTests: 필요한 검사/검진 계획을 상세히 적으세요. (예: "1. 요역동학 검사\n2. 골반초음파 및 CT 영상검사\n3. 소변(배양)검사")
14. managementPlanTreatment: 필요한 치료/처방 계획을 상세히 적으세요. (예: "1. 생활 습관 교육\n2. 케겔 운동, 방광 및 배뇨 훈련\n3. 약물 치료")
17. specialQuestion: 환자가 진료 도중 질문하거나 우려하는 특이 사항을 적으세요 (예: "소변 새는게 많이 불편한데 이 증상이 없어질 수 있나요? 그리고 큰 병 아닌지 걱정돼요.").
18. specialOther: 기타 정보나 연출 가이드, 환자 성격 특이사항을 적으세요 (예: "소변이 새는 사실을 많이 부끄러워 함.").

출력은 반드시 마크다운 코드 블록(\`\`\`) 없이, 다른 부연 설명이나 텍스트 없이 유효한 단일 JSON 오브젝트여야 합니다.`
      }
    ];

    for (const img of imageList) {
      contentArray.push({
        type: 'image_url',
        image_url: {
          url: img
        }
      });
    }

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: contentArray
        }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI에서 빈 응답이 돌아왔습니다.');
    }

    const recognizedData = JSON.parse(content);
    return NextResponse.json(recognizedData);
  } catch (error) {
    console.error('Screenshot recognition error:', error);
    const msg = error instanceof Error ? error.message : '스크린샷 처리 도중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
