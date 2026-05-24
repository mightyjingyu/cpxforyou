import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { getFirebaseDb } from './client';
import { stripUndefinedDeep } from './sanitizeForFirestore';
import { PastExam } from '@/types/pastExam';

export async function listPastExamsFromFirestore(): Promise<PastExam[]> {
  const db = getFirebaseDb();
  const col = collection(db, 'pastExams');
  const snap = await getDocs(col);
  const list: PastExam[] = [];
  snap.forEach((d) => {
    const data = d.data() as Omit<PastExam, 'id'>;
    list.push({
      ...data,
      id: d.id,
    });
  });
  return list;
}

export async function savePastExam(exam: PastExam): Promise<void> {
  const db = getFirebaseDb();
  const ref = doc(db, 'pastExams', exam.id);
  const payload = stripUndefinedDeep(exam);
  await setDoc(ref, payload, { merge: true });
}

export async function deletePastExam(id: string): Promise<void> {
  const db = getFirebaseDb();
  const ref = doc(db, 'pastExams', id);
  await deleteDoc(ref);
}

