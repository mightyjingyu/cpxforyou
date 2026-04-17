import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { getFirebaseAuth } from './client';

const provider = new GoogleAuthProvider();

export function subscribeAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  return signInWithPopup(auth, provider);
}

export async function signOutGoogle() {
  return signOut(getFirebaseAuth());
}
