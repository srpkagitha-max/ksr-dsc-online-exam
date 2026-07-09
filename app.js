import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function getSavedConfig(){
  try{
    const saved = localStorage.getItem('ksrFirebaseConfig');
    if(saved){
      const parsed = JSON.parse(saved);
      if(configOk(parsed)) return parsed;
    }
  }catch(e){}
  return window.KSR_FIREBASE_CONFIG || null;
}
export function configOk(cfg){
  return !!(cfg && cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.messagingSenderId && cfg.appId && !String(cfg.apiKey).includes('PASTE') && !String(cfg.appId).includes('PASTE'));
}
export const cfg = getSavedConfig();
export const ready = configOk(cfg);
let appInstance = null;
try { appInstance = ready ? initializeApp(cfg) : null; } catch(e) { appInstance = null; }
export const app = appInstance;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const F = {signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,onAuthStateChanged,collection,doc,setDoc,getDoc,getDocs,addDoc,query,where,orderBy,serverTimestamp};
export function el(id){return document.getElementById(id)}
export function show(id,msg,type='ok'){const x=el(id); if(x){x.className=type; x.innerHTML=msg; x.style.display='block'}}
export function hide(id){const x=el(id); if(x)x.style.display='none'}
export function cleanCode(s){return (s||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'')}
export function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
export async function requireLogin(){
 return new Promise(resolve=>{
  if(!ready || !auth){resolve(null);return}
  F.onAuthStateChanged(auth,u=>resolve(u||null));
 })
}
