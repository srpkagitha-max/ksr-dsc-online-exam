const MARKS = /[●⚫✅✓✔]/g;
const ROMAN_RE = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\s*[\.:]/i;
const SMALL_ROMAN_RE = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*[\.:]/;
const PRAKATANA_RE = /^(ప్రకటన\s*\d+|Statement\s*\d+)\s*[:\.:]/i;
const LIST_RE = /^(జాబితా\s*-?\s*[12I]+|List\s*-?\s*[12I]+)\s*[:\.:]/i;
const OPTION_RE = /^([A-D])\s*[\)\.:\-]\s*(.*)$/i;
const QUESTION_START_RE = /^[\u200B\s]*(\d{1,4})\s*[\.)]\s*(.+)?$/;

export function parseQuestions(raw, defaultSubject='General'){
  raw = normalizeRaw(raw);
  if(!raw) return [];
  const lines = raw.split('\n').map(x=>x.trim()).filter(Boolean);
  const blocks=[]; let cur=[];
  for(const line of lines){
    if(QUESTION_START_RE.test(line) && cur.length){ blocks.push(cur); cur=[line]; }
    else cur.push(line);
  }
  if(cur.length) blocks.push(cur);
  return blocks.map((b,i)=>parseBlock(b,i,defaultSubject)).filter(q=>q.question && q.options.some(o=>o.text));
}

function normalizeRaw(raw){
  return String(raw||'')
    .replace(/\r/g,'')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g,'')
    .replace(/(\d{1,4})\s*[\.)]\s*/g, '\n$1. ')
    .replace(/\s+([A-D])\s*[\)\.:]\s*/g, '\n$1) ')
    .replace(/\s+(జాబితా\s*-?\s*[12I]+\s*[:\.:])/g, '\n$1 ')
    .replace(/\s+(ప్రకటన\s*\d+\s*[:\.:])/g, '\n$1 ')
    .replace(/\s+((?:I|II|III|IV|V|VI|VII|VIII|IX|X)\s*[\.:])/g, '\n$1 ')
    .replace(/\s+((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*[\.:])/g, '\n$1 ')
    .trim();
}

function cleanQuestionStart(s){return s.replace(QUESTION_START_RE,(_,n,rest)=>rest||'').trim();}
function stripMarks(s){return String(s||'').replace(MARKS,'').replace(/\s+\*\s*$/,'').trim();}
function hasMark(s){return MARKS.test(s) || /\*\s*$/.test(s);}
function resetMarkRegex(){MARKS.lastIndex=0;}

function parseBlock(lines, idx, defaultSubject){
  let qLines=[]; let opts={A:'',B:'',C:'',D:''}; let ans=''; let currentOpt=null; let subject=defaultSubject || 'General';
  for(let rawLine of lines){
    let line=rawLine.trim(); if(!line) continue;
    const subj=line.match(/^\[?Subject\]?\s*[:\-]\s*(.+)$/i) || line.match(/^విషయం\s*[:\-]\s*(.+)$/i);
    if(subj){ subject=subj[1].trim(); continue; }
    const ansLine=line.match(/^(Answer|Ans|Correct Answer|సమాధానం)\s*[:\-]\s*([A-D])/i);
    if(ansLine){ ans=ansLine[2].toUpperCase(); continue; }
    let m=line.match(OPTION_RE);
    if(m){
      currentOpt=m[1].toUpperCase(); let txt=m[2].trim(); resetMarkRegex();
      if(hasMark(txt)){ ans=currentOpt; txt=stripMarks(txt); }
      opts[currentOpt]=txt; continue;
    }
    if(currentOpt && !isQuestionMetaLine(line) && !QUESTION_START_RE.test(line)){
      // Continuation for long option only when options already started and line is not statement/list.
      opts[currentOpt] += (opts[currentOpt]?' ':'') + stripMarks(line);
      continue;
    }
    currentOpt=null;
    resetMarkRegex();
    if(hasMark(line)) line=stripMarks(line);
    qLines.push(formatQuestionLine(qLines.length?line:cleanQuestionStart(line)));
  }
  const question = compactQuestion(qLines);
  return { id:'q'+Date.now()+idx, subject, question, options:['A','B','C','D'].map(k=>({key:k,text:opts[k]||''})), answer:ans||'', marks:1 };
}
function isQuestionMetaLine(line){return ROMAN_RE.test(line)||SMALL_ROMAN_RE.test(line)||PRAKATANA_RE.test(line)||LIST_RE.test(line)||/^పై/.test(line);}
function formatQuestionLine(line){
  line=line.trim();
  if(ROMAN_RE.test(line) || SMALL_ROMAN_RE.test(line) || PRAKATANA_RE.test(line) || LIST_RE.test(line)) return '\n'+line;
  if(/^పై /.test(line) || /^సరైన/.test(line)) return '\n'+line;
  return line;
}
function compactQuestion(lines){
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').replace(/[ \t]+\n/g,'\n').trim();
}
export function blankQuestion(subject='General'){return {id:'q'+Date.now(),subject,question:'',options:[{key:'A',text:''},{key:'B',text:''},{key:'C',text:''},{key:'D',text:''}],answer:'A',marks:1}}
export function studentShuffle(questions, seedText=''){
  const bySubject={};
  questions.forEach(q=>{const s=q.subject||'General'; (bySubject[s] ||= []).push(q);});
  const subjects=Object.keys(bySubject);
  const rnd=mulberry32(hash(seedText||'KSR'));
  let out=[];
  subjects.forEach(s=>{out=out.concat(shuffle([...bySubject[s]],rnd));});
  return out;
}
function shuffle(a,rnd){for(let i=a.length-1;i>0;i--){let j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function hash(str){let h=1779033703; for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19;} return h>>>0;}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}}
