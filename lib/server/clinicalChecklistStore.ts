import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { ChecklistCategory } from '@/types';

const WORKBOOK_PATH = path.join(process.cwd(), '임상별_체크리스트_최종.xlsx');

const PRESENTATION_SHEET_HINTS: Record<string, string[]> = {
  '복통': ['급성복통'],
  '소화불량': ['소화불량-만성복통'],
  '토혈': ['토혈'],
  '혈변': ['혈변'],
  '구토': ['구토'],
  '배변이상(변비/설사)': ['배변 이상(변비)', '배변 이상(설사)'],
  '황달': ['황달'],
  '가슴 통증': ['가슴통증'],
  '실신': ['실신'],
  '두근거림': ['두근거림'],
  '고혈압': ['고혈압'],
  '이상 지질혈증': ['이상지질혈증'],
  '기침': ['기침'],
  '콧물/코막힘': ['콧물-코막힘'],
  '객혈': ['객혈'],
  '호흡곤란': ['호흡곤란'],
  '소변량 변화(다뇨증/핍뇨)': ['소변량 변화(다뇨증)', '소변량 변화(핍뇨)'],
  '붉은색 소변': ['붉은색 소변'],
  '배뇨 이상': ['배뇨 이상-소변찔끔증'],
  '발열': ['발열'],
  '쉽게 멍이 듦': ['쉽게 멍이 듦'],
  '피로': ['피로'],
  '체중 감소': ['체중 감소'],
  '체중 증가/비만': ['체중 증가-비만'],
  '관절 통증/부기': ['관절 통증-부기'],
  '목통증/허리통증': ['목통증', '허리 통증'],
  '피부 발진': ['피부 발진'],
  '기분 변화': ['기분변화'],
  '불안': ['불안'],
  '수면장애': ['수면장애'],
  '기억력 저하': ['기억력 저하'],
  '어지럼': ['어지럼'],
  '두통': ['두통'],
  '경련': ['경련'],
  '근력/감각 이상': ['근력-감각 이상'],
  '의식장애': ['의식장애'],
  '떨림/운동이상': ['떨림-운동 이상'],
  '유방통/유방덩이(멍울)': ['유방통-유방덩이(멍울)'],
  '질 분비물/질 출혈': ['질 분비물', '질출혈'],
  '월경이상/월경통': ['월경 이상', '월경통'],
  '산전 진찰': ['산전 진찰'],
  '성장/발달 지연': ['성장-발달 지연'],
  '예방접종': ['예방접종'],
  '음주/금연 상담': ['음주 상담', '금연 상담'],
  '물질오남용': ['물질 오남용'],
  '나쁜 소식 전하기': ['나쁜 소식 전하기'],
  '가정 폭력/성폭력': ['가정 폭력', '성 폭력'],
  '자살': ['자살'],
};

let cachedWorkbook: XLSX.WorkBook | null = null;

function getWorkbook(): XLSX.WorkBook | null {
  if (cachedWorkbook) return cachedWorkbook;
  if (!fs.existsSync(WORKBOOK_PATH)) return null;
  try {
    const fileBuffer = fs.readFileSync(WORKBOOK_PATH);
    cachedWorkbook = XLSX.read(fileBuffer, { type: 'buffer' });
    return cachedWorkbook;
  } catch (error) {
    console.error('Failed to load clinical checklist workbook:', error);
    return null;
  }
}

function cleanCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseChecklistFromSheet(workbook: XLSX.WorkBook, sheetName: string): ChecklistCategory[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: '',
  });

  const byCategory = new Map<string, string[]>();
  let currentCategory = '';
  for (const row of rows) {
    const possibleNumber = row[1];
    if (typeof possibleNumber !== 'number') continue;

    const categoryCell = cleanCell(row[0]);
    const itemCell = cleanCell(row[2]);
    if (!itemCell) continue;

    if (categoryCell) currentCategory = categoryCell;
    if (!currentCategory) currentCategory = '기타';

    if (!byCategory.has(currentCategory)) byCategory.set(currentCategory, []);
    byCategory.get(currentCategory)!.push(itemCell);
  }

  return Array.from(byCategory.entries()).map(([category, items]) => ({
    category,
    items,
  }));
}

function resolveSheetNamesForPresentation(
  workbook: XLSX.WorkBook,
  clinicalPresentation: string
): string[] {
  const hints = PRESENTATION_SHEET_HINTS[clinicalPresentation];
  if (!hints || hints.length === 0) return [];

  const sheetNames = workbook.SheetNames;
  return hints
    .map((hint) => sheetNames.find((sheet) => sheet.includes(hint)))
    .filter((sheet): sheet is string => Boolean(sheet));
}

export function getChecklistByClinicalPresentation(
  clinicalPresentation: string,
  checklistVariant?: string
): ChecklistCategory[] | null {
  const workbook = getWorkbook();
  if (!workbook) return null;

  let sheetNames: string[] = [];
  if (checklistVariant) {
    sheetNames = workbook.SheetNames.filter((sheet) => sheet.trim().startsWith(`${checklistVariant}.`));
  }
  if (sheetNames.length === 0) {
    sheetNames = resolveSheetNamesForPresentation(workbook, clinicalPresentation);
  }
  if (!sheetNames || sheetNames.length === 0) return null;

  const merged = new Map<string, string[]>();
  for (const name of sheetNames) {
    const categories = parseChecklistFromSheet(workbook, name);
    for (const category of categories) {
      if (!merged.has(category.category)) merged.set(category.category, []);
      merged.get(category.category)!.push(...category.items);
    }
  }

  const result = Array.from(merged.entries()).map(([category, items]) => ({
    category,
    items,
  }));
  return result.length > 0 ? result : null;
}
