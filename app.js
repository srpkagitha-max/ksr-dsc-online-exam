import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, serverTimestamp, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const $ = id => document.getElementById(id);
export function toast(text,type='msg'){ const box=$('message'); if(box){box.className='msg '+type; box.textContent=text; box.classList.remove('hidden');} else alert(text); }
export function safeCode(v){ return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,''); }
export async function currentUserDoc(){ if(!auth.currentUser) return null; const snap=await getDoc(doc(db,'users',auth.currentUser.uid)); return snap.exists()?{id:snap.id,...snap.data()}:null; }
export async function requireLogin(){ return new Promise(resolve=>onAuthStateChanged(auth,async u=>{ if(!u){ location.href='login.html'; return; } resolve(await currentUserDoc()); })); }
export async function login(email,password){ await signInWithEmailAndPassword(auth,email,password); }
export async function logout(){ await signOut(auth); location.href='login.html'; }
export async function createInstitute(code,name){ code=safeCode(code); if(!code||!name) throw new Error('Institute code/name required'); await setDoc(doc(db,'institutes',code),{code,name,active:true,public:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true}); return code; }
export async function createAdmin(email,password,name,instituteCode,role='instituteAdmin'){ const cred=await createUserWithEmailAndPassword(auth,email,password); await setDoc(doc(db,'users',cred.user.uid),{email,name,role,instituteCode:safeCode(instituteCode),active:true,createdAt:serverTimestamp()}); return cred.user.uid; }
export async function createExam(instituteCode,data){ instituteCode=safeCode(instituteCode); const examId=(data.title||'EXAM').toUpperCase().replace(/[^A-Z0-9]+/g,'-').slice(0,25)+'-'+Date.now(); await setDoc(doc(db,'institutes',instituteCode,'exams',examId),{id:examId,instituteCode,title:data.title,startTime:data.startTime,endTime:data.endTime,duration:Number(data.duration||150),status:data.status||'draft',totalQuestions:Number(data.totalQuestions||0),createdAt:serverTimestamp(),updatedAt:serverTimestamp()}); return examId; }
export async function listInstitutes(){ const s=await getDocs(query(collection(db,'institutes'),orderBy('createdAt','desc'))); return s.docs.map(d=>({id:d.id,...d.data()})); }
export async function listExams(code){ const s=await getDocs(query(collection(db,'institutes',safeCode(code),'exams'),orderBy('createdAt','desc'))); return s.docs.map(d=>({id:d.id,...d.data()})); }
export async function getInstitute(code){ const s=await getDoc(doc(db,'institutes',safeCode(code))); return s.exists()?{id:s.id,...s.data()}:null; }
