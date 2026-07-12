const MARK_RE = /[●⚫✅✓✔]/;
const MARKS_GLOBAL = /[●⚫✅✓✔]/g;
const LETTER_OPTION_RE = /^([A-D])\s*[\)\.\:\-]\s*(.*)$/i;
const NUMBER_OPTION_RE = /^([1-4])\s*[\)\.\:\-]\s*(.*)$/;
const Q_PREFIX_RE = /^ప్రశ్న\s*(\d{1,4})\s*[\.:\-) ]*\s*(.*)$/i;
const Q_NUMBER_RE = /^(\d{1,4})\s*[\.:\)]\s*(.*)$/;
const ROMAN_RE = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*[\)\.\:\-]\s*/;
const LIST_HEADER_RE = /^(?:జాబితా|List)\s*[–—\-:]?\s*(?:I{1,3}|1|2)\b/i;
const IGNORE_LINE_RE = /^(?:daily\s*test|dialy\s*test|డైలీ\s*టెస్ట్)\s*$/i;

export function parseQuestions(raw, defaultSubject='General'){
  const lines = normalizeLines(raw);
  if(!lines.length) return [];
  const blocks = splitQuestionBlocks(lines);
  return blocks
    .map((block,index)=>parseBlock(block,index,defaultSubject))
    .filter(q=>q.question && q.options.filter(o=>o.text).length >= 2);
}

function normalizeLines(raw){
  let text = String(raw||'')
    .replace(/\r/g,'')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g,'')
    .replace(/[‐‑‒–—]/g,'-')
    .replace(/\u00A0/g,' ');

  // Put question prefixes and letter options on their own lines when copied inline.
  text = text
    .replace(/\s+(ప్రశ్న\s*\d{1,4}\s*[\.:])/gi,'\n$1')
    .replace(/\s+([A-D]\s*[\)\:]\s*)/g,'\n$1');

  return text.split('\n')
    .map(line=>line.replace(/[ \t]+/g,' ').trim())
    .filter(Boolean)
    .filter(line=>!IGNORE_LINE_RE.test(line));
}

function questionStart(line){
  let m=line.match(Q_PREFIX_RE);
  if(m) return {number:Number(m[1]), text:m[2]||''};
  m=line.match(Q_NUMBER_RE);
  if(m) return {number:Number(m[1]), text:m[2]||''};
  return null;
}

function optionProgress(lines){
  const letters=new Set(), numbers=new Set();
  for(const line of lines){
    let m=line.match(LETTER_OPTION_RE); if(m) letters.add(m[1].toUpperCase());
    m=line.match(NUMBER_OPTION_RE); if(m) numbers.add(m[1]);
  }
  return {letters:letters.size,numbers:numbers.size,complete:letters.size===4||numbers.size===4};
}

function splitQuestionBlocks(lines){
  const blocks=[]; let current=[]; let currentNumber=null;
  for(const line of lines){
    const start=questionStart(line);
    if(!current.length){
      if(start){ current=[line]; currentNumber=start.number; }
      continue;
    }
    const progress=optionProgress(current);
    // A new question is accepted only after the previous one has a full option set.
    // This prevents List-II items 1.,2.,3.,4. from becoming fake questions.
    if(start && progress.complete && (currentNumber===null || start.number>currentNumber)){
      blocks.push(current); current=[line]; currentNumber=start.number;
    }else{
      current.push(line);
    }
  }
  if(current.length) blocks.push(current);
  return blocks;
}

function parseBlock(lines,index,defaultSubject){
  const first=questionStart(lines[0]);
  const body=[first?.text||lines[0],...lines.slice(1)].filter(Boolean);
  const letterLines=body.filter(x=>LETTER_OPTION_RE.test(x));
  const numberLines=body.filter(x=>NUMBER_OPTION_RE.test(x));
  // Prefer A-D only when all four exist. Otherwise use 1-4 when all four exist.
  const letterKeys=new Set(letterLines.map(x=>x.match(LETTER_OPTION_RE)[1].toUpperCase()));
  const numberKeys=new Set(numberLines.map(x=>x.match(NUMBER_OPTION_RE)[1]));
  const scheme=letterKeys.size===4?'letter':numberKeys.size===4?'number':letterKeys.size>=numberKeys.size?'letter':'number';

  const qLines=[]; const opts={A:'',B:'',C:'',D:''}; let answer=''; let currentOpt=null;
  const mapNum={1:'A',2:'B',3:'C',4:'D'};

  for(const original of body){
    let line=original.trim(); if(!line) continue;
    const answerLine=line.match(/^(?:Answer|Ans|Correct Answer|సమాధానం)\s*[:\-]\s*([A-D1-4])/i);
    if(answerLine){ answer=toLetter(answerLine[1]); currentOpt=null; continue; }

    let match = scheme==='letter' ? line.match(LETTER_OPTION_RE) : line.match(NUMBER_OPTION_RE);
    if(match){
      const key=scheme==='letter'?match[1].toUpperCase():mapNum[match[1]];
      let text=match[2].trim();
      if(MARK_RE.test(text)){answer=key;text=stripMarks(text);}
      opts[key]=text; currentOpt=key; continue;
    }

    // Lines that resemble the other option style are question content (A/B statements or List-II 1-4).
    const otherStyle = scheme==='letter' ? NUMBER_OPTION_RE.test(line) : LETTER_OPTION_RE.test(line);
    if(currentOpt && !otherStyle && !isQuestionStructure(line)){
      if(MARK_RE.test(line)) answer=currentOpt;
      opts[currentOpt]+=(opts[currentOpt]?' ':'')+stripMarks(line);
    }else{
      currentOpt=null;
      qLines.push(formatQuestionLine(stripMarks(line)));
    }
  }

  return {
    id:`q${Date.now()}_${index}`,
    subject:defaultSubject||'General',
    question:compactQuestion(qLines),
    options:['A','B','C','D'].map(key=>({key,text:opts[key]||''})),
    answer:answer||'',
    marks:1
  };
}

function toLetter(value){const v=String(value).toUpperCase();return ({1:'A',2:'B',3:'C',4:'D'})[v]||v;}
function stripMarks(text){return String(text||'').replace(MARKS_GLOBAL,'').replace(/\s+\*\s*$/,'').trim();}
function isQuestionStructure(line){return ROMAN_RE.test(line)||LIST_HEADER_RE.test(line)||/^పై\s/.test(line)||/^(?:A|B)\s*[\.:]\s+/.test(line);}
function formatQuestionLine(line){
  if(ROMAN_RE.test(line)||LIST_HEADER_RE.test(line)||/^పై\s/.test(line)||/^(?:A|B)\s*[\.:]\s+/.test(line)) return '\n'+line;
  return line;
}
function compactQuestion(lines){return lines.join('\n').replace(/\n{3,}/g,'\n\n').replace(/[ \t]+\n/g,'\n').trim();}

export function blankQuestion(subject='General'){
  return {id:'q'+Date.now(),subject,question:'',options:[{key:'A',text:''},{key:'B',text:''},{key:'C',text:''},{key:'D',text:''}],answer:'A',marks:1};
}
export function studentShuffle(questions,seedText=''){
  const bySubject={};questions.forEach(q=>{const s=q.subject||'General';(bySubject[s]||=[]).push(q);});
  const rnd=mulberry32(hash(seedText||'KSR'));let out=[];Object.keys(bySubject).forEach(s=>out=out.concat(shuffle([...bySubject[s]],rnd)));return out;
}
function shuffle(a,rnd){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function hash(str){let h=1779033703;for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return h>>>0;}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
