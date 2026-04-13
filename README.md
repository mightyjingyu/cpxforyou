# CPX Master - Current Logic (Single Source Doc)

이 문서는 현재 코드 기준의 환자 설정/대화 로직을 한 파일로 정리한 문서입니다.

## 1. 핵심 컨셉

- 클라이언트는 대화마다 무거운 환자 설정을 보내지 않습니다.
- 서버가 `sessionId`를 기준으로 환자 설정(`caseSpec`)과 대화 히스토리를 보관합니다.
- 음성 대화는 `STT -> Chat(stream) -> TTS` 파이프라인으로 동작합니다.

## 2. 세션 시작 플로우

1. 홈에서 `/api/case/generate` 호출로 `caseSpec` 생성
2. 클라이언트가 `sessionId(uuid)` 생성
3. `/api/session/register`로 아래를 1회 등록
   - `sessionId`
   - `caseSpec`
   - `difficulty`
4. 성공하면 Zustand `sessionStore.startSession(...)` 후 `/session/[id]` 이동

관련 파일:
- `app/page.tsx`
- `app/api/session/register/route.ts`

## 3. 서버 세션 저장소

`lib/server/chatSessionStore.ts`

- 저장 구조: `Map<string, StoredChatSession>`
- 각 세션 데이터:
  - `caseSpec`
  - `difficulty`
  - `conversationHistory`
  - `updatedAt`
- TTL: 24시간 (`TTL_MS`)
- 대화 턴 저장: `appendChatTurn(sessionId, userText, patientText)`

주의:
- 현재 저장소는 인메모리 Map이므로 서버 재시작 시 유실됩니다.

## 4. 환자 프롬프트 생성 규칙

`lib/ai/patientEngine.ts`의 `buildSystemPrompt(...)`

현재 시그니처:

```ts
buildSystemPrompt(
  mainSymptom: string,
  diagnosis: string,
  difficulty: 'easy' | 'normal' | 'hard',
  unfriendliness: number
)
```

프롬프트 핵심:
- 역할: CPX 표준화 환자
- 최소 뼈대 외 정보는 의학 상식 기반 생성
- 세션 내 일관성 유지
- 난이도/불친절도 반영
- 진단명 선공개 금지, 역질문/조언 금지, 일상어 사용

보조 함수:
- `detectPhysicalExamDeclaration(text)`:
  - "신체진찰", "진찰하겠습니다", "검사하겠습니다" 등 키워드 감지

## 5. 채팅 API

### 5.1 비스트리밍 채팅

`app/api/chat/route.ts`

- 권장 입력: `{ sessionId, message }`
- 호환 입력(레거시): `{ message, caseSpec, conversationHistory, difficulty }`
- 처리:
  1. `sessionId`로 서버 세션 조회
  2. `buildSystemPrompt(...)` 생성
  3. `messages = [system, ...history(-20), user]`
  4. `gpt-4o` 호출
  5. `appendChatTurn(...)`으로 서버 히스토리 반영

난이도별 불친절도 매핑:
- easy: 2
- normal: 5
- hard: 8

### 5.2 스트리밍 채팅

`app/api/chat/stream/route.ts`

- 입력 구조는 비스트리밍과 동일
- `gpt-4o`를 `stream: true`로 호출
- `delta.content`를 텍스트 스트림으로 반환
- 종료 시 누적 응답을 `appendChatTurn(...)`으로 저장

## 6. STT / TTS API

### 6.1 STT

`app/api/stt/route.ts`

- 입력: `multipart/form-data`의 `file`
- 모델: `whisper-1`, `language: ko`
- 너무 짧은 오디오는 거부
- 출력: `{ text }`

### 6.2 TTS

`app/api/tts/route.ts`

- 입력: `{ text }`
- 모델: `tts-1`, voice: `alloy`, mp3 반환
- 최대 입력 길이: 4096자(slice)

## 7. VoiceEngine 동작

`components/session/VoiceEngine.tsx`

상태:
- `idle`, `listening`, `thinking`, `speaking`

동작:
1. 버튼 누르면 녹음 시작(`MediaRecorder`)
2. 클라이언트 VAD 시작 (`startSpeechEndVad`)
3. 아래 중 하나면 녹음 종료 후 처리:
   - 무음 감지
   - 버튼 릴리즈
   - 최대 녹음시간 초과
4. `/api/stt`로 텍스트 변환
5. 로컬 UI 히스토리에 user 메시지 추가
6. `/api/chat/stream`에 `{ sessionId, message }` 전송
7. 스트림 텍스트를 문장 단위로 분할하여 `/api/tts` 병렬 요청
8. 생성된 오디오를 순차 재생
9. 최종 응답을 로컬 UI 히스토리에 patient 메시지로 추가

보조 UX:
- thinking 구간에 짧은 추임새("음...")를 `speechSynthesis`로 재생 후, 실제 TTS 시작 시 cancel

## 8. 문장 분할 / VAD 유틸

- `lib/voice/splitStreamBuffer.ts`
  - 구두점 단위로 스트림 텍스트를 TTS 조각으로 분할
- `lib/voice/vad.ts`
  - 에너지 기반 무음 감지
  - 기본값: `silenceMs=480`, `minSpeechMs=320`, `volumeThreshold=9`

## 9. 클라이언트 상태 저장 (Zustand)

`store/sessionStore.ts`

- 현재 세션 UI 상태:
  - `caseSpec`, `sessionId`, `difficulty`
  - `conversationHistory`
  - 타이머/메모/신체진찰/세션 상태 등
- persist는 `archivedSessions`만 저장

정리:
- 서버 진실 소스(LLM 조립용): `chatSessionStore`
- 클라이언트 진실 소스(UI 표시용): `sessionStore`

## 10. 요청 포맷 빠른 참고

### 세션 등록

```json
{
  "sessionId": "uuid",
  "caseSpec": { "...": "..." },
  "difficulty": "normal"
}
```

### 스트리밍 채팅

```json
{
  "sessionId": "uuid",
  "message": "의사 발화 텍스트"
}
```

### STT

- `multipart/form-data`
- `file=<audio blob>`

### TTS

```json
{
  "text": "환자 응답 문장"
}
```

