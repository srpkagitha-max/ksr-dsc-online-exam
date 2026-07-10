import './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, getDocs, query, where, orderBy, serverTimestamp, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const cfg = window.KSR_FIREBASE_CONFIG;
if(!cfg || !cfg.apiKey){ alert('Firebase config missing. Please upload firebase-config.js correctly.'); }
export const app = initializeApp(cfg);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, doc, setDoc, getDoc, addDoc, collection, getDocs, query, where, orderBy, serverTimestamp, updateDoc, deleteDoc };
export function $(id){return document.getElementById(id)}
export function show(msg,type='ok'){const m=$('msg'); if(m){m.className='msg '+(type==='err'?'err':type==='warn'?'warn':'ok');m.textContent=msg;}}
export function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

// ===== L5 Checkpoint 2: Archive / Restore / Permanent Delete =====
export async function archiveExam(examId){
  if(!examId) throw new Error('Exam ID missing');
  await updateDoc(doc(db,'exams',examId),{status:'archived',archivedAt:serverTimestamp(),updatedAt:serverTimestamp()});
}
export async function restoreExam(examId){
  if(!examId) throw new Error('Exam ID missing');
  await updateDoc(doc(db,'exams',examId),{status:'draft',archivedAt:null,restoredAt:serverTimestamp(),updatedAt:serverTimestamp()});
}
export async function permanentDeleteExam(examId){
  if(!examId) throw new Error('Exam ID missing');
  await deleteDoc(doc(db,'examQuestions',examId)).catch(()=>{});
  await deleteDoc(doc(db,'exams',examId));
}
export async function archiveInstitute(code){
  code=String(code||'').trim().toUpperCase();
  if(!code) throw new Error('Institute code missing');
  await updateDoc(doc(db,'institutes',code),{active:false,status:'archived',archivedAt:serverTimestamp(),updatedAt:serverTimestamp()});
}
export async function restoreInstitute(code){
  code=String(code||'').trim().toUpperCase();
  if(!code) throw new Error('Institute code missing');
  await updateDoc(doc(db,'institutes',code),{active:true,status:'active',archivedAt:null,restoredAt:serverTimestamp(),updatedAt:serverTimestamp()});
}
export async function permanentDeleteInstitute(code){
  code=String(code||'').trim().toUpperCase();
  if(!code) throw new Error('Institute code missing');
  const examSnap=await getDocs(query(collection(db,'exams'),where('instituteCode','==',code)));
  if(!examSnap.empty) throw new Error('Ee institute ki exams unnayi. Mundhu avi archive/delete cheyyandi.');
  await deleteDoc(doc(db,'institutes',code));
}

// ===== L5 Question Bank =====
export async function saveQuestionToBank(instituteCode,q){
  instituteCode=String(instituteCode||'').trim().toUpperCase();
  if(!instituteCode) throw new Error('Institute code kavali');
  if(!q || !String(q.question||'').trim()) throw new Error('Question text kavali');
  const data={
    instituteCode,
    subject:String(q.subject||'General').trim()||'General',
    lesson:String(q.lesson||'General').trim()||'General',
    difficulty:String(q.difficulty||'Medium'),
    question:String(q.question||'').trim(),
    options:(q.options||[]).map(o=>({key:o.key,text:String(o.text||'').trim()})),
    answer:String(q.answer||'').toUpperCase(),
    marks:Number(q.marks||1),
    active:true,
    createdAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  };
  return (await addDoc(collection(db,'questionBank'),data)).id;
}
export async function listQuestionBank(instituteCode,subject=''){
  instituteCode=String(instituteCode||'').trim().toUpperCase();
  if(!instituteCode) throw new Error('Institute code kavali');
  const snap=await getDocs(query(collection(db,'questionBank'),where('instituteCode','==',instituteCode)));
  let rows=snap.docs.map(d=>({id:d.id,...d.data()}));
  if(subject) rows=rows.filter(x=>(x.subject||'General')===subject);
  return rows.sort((a,b)=>String(a.subject||'').localeCompare(String(b.subject||'')));
}
export async function deleteBankQuestion(id){
  if(!id) throw new Error('Question ID missing');
  await deleteDoc(doc(db,'questionBank',id));
}
