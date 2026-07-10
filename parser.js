const CORRECT_MARK_RE = /(?:●|⚫|✅|✓|✔|☑|⭐|\*)/g;
const QUESTION_START_RE = /^\s*(?:Q(?:uestion)?\s*)?(\d{1,4})\s*[\.)\]:\-]\s*(.*)$/i;
const OPTION_RE = /^\s*([A-D])\s*[\)\.\]:\-]\s*(.*)$/i;
const ANSWER_RE = /^\s*(?:answer|ans|correct\s*answer|సమాధానం|జవాబు)\s*[:\-]?\s*([A-D])\b/i;
const SUBJECT_RE = /^\s*(?:\[?subject\]?|విషయం)\s*[:\-]\s*(.+)$/i;
const HEADING_RE = /^\s*\*{0,2}[^\n]{1,80}\*{0,2}\s*$/;

export function normalizeRaw(raw=''){
  return String(raw)
    .replace(/\r/g,'')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g,'')
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/\t/g,' ')
    .replace(/\u00A0/g,' ')
    .replace(/[ ]{2,}/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

export function parseQuestions(raw, defaultSubject='General'){
  const report = parseQuestionsDetailed(raw, defaultSubject);
  return report.questions;
}

export function parseQuestionsDetailed(raw, defaultSubject='General'){
  const text = normalizeRaw(raw);
  if(!text) return {questions:[], issues:[issue('EMPTY_INPUT','No text pasted',0,'error')], stats:emptyStats()};

  const lines = text.split('\n').map((line,index)=>({text:line.trim(),line:index+1})).filter(x=>x.text);
  const blocks = splitIntoBlocks(lines);
  const questions=[];
  const issues=[];

  blocks.forEach((block,index)=>{
    const parsed = parseBlock(block,index,defaultSubject);
    if(parsed.question){
      questions.push(parsed.question);
      issues.push(...parsed.issues);
    }else{
      issues.push(issue('UNREADABLE_BLOCK','Question text could not be detected',block[0]?.line||0,'error',block.map(x=>x.text).join('\n')));
    }
  });

  const duplicateMap=new Map();
  questions.forEach((q,i)=>{
    const key=normalizeCompare(q.question);
    if(!key) return;
    if(duplicateMap.has(key)) issues.push(issue('DUPLICATE_QUESTION',`Q${i+1} duplicates Q${duplicateMap.get(key)+1}`,q.sourceLine||0,'warning'));
    else duplicateMap.set(key,i);
  });

  return {questions,issues,stats:buildStats(questions,issues)};
}

function splitIntoBlocks(lines){
  const blocks=[];
  let current=[];
  let seenOption=false;

  for(const item of lines){
    const isQ=QUESTION_START_RE.test(item.text);
    const isOpt=OPTION_RE.test(item.text);
    if(isQ && current.length){
      blocks.push(current);
      current=[item];
      seenOption=false;
      continue;
    }
    if(!isQ && current.length && seenOption && looksLikeUnnumberedQuestion(item.text)){
      blocks.push(current);
      current=[item];
      seenOption=false;
      continue;
    }
    current.push(item);
    if(isOpt) seenOption=true;
  }
  if(current.length) blocks.push(current);
  return blocks.filter(b=>b.some(x=>QUESTION_START_RE.test(x.text)||OPTION_RE.test(x.text)));
}

function looksLikeUnnumberedQuestion(line){
  if(OPTION_RE.test(line)||ANSWER_RE.test(line)||SUBJECT_RE.test(line)) return false;
  if(/^(I|II|III|IV|V|VI|VII|VIII|IX|X|i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*[\.:]/.test(line)) return false;
  if(/^(ప్రకటన|Statement|జాబితా|List)\s*[-\dI:]*/i.test(line)) return false;
  return /[?？]$/.test(line) || line.length>35;
}

function parseBlock(block,index,defaultSubject){
  let subject=defaultSubject||'General';
  let sourceNumber=null;
  let sourceLine=block[0]?.line||0;
  let answer='';
  let currentOption='';
  const optionText={A:'',B:'',C:'',D:''};
  const questionLines=[];
  const issues=[];
  let optionsStarted=false;

  block.forEach((item,pos)=>{
    let line=item.text;
    const subjectMatch=line.match(SUBJECT_RE);
    if(subjectMatch){subject=subjectMatch[1].trim()||subject;return;}
    const answerMatch=line.match(ANSWER_RE);
    if(answerMatch){answer=answerMatch[1].toUpperCase();return;}

    const qMatch=line.match(QUESTION_START_RE);
    if(qMatch && (pos===0 || !optionsStarted)){
      sourceNumber=Number(qMatch[1]);
      line=(qMatch[2]||'').trim();
      if(line) questionLines.push(cleanText(line));
      currentOption='';
      return;
    }

    const optionMatch=line.match(OPTION_RE);
    if(optionMatch){
      optionsStarted=true;
      currentOption=optionMatch[1].toUpperCase();
      let text=optionMatch[2].trim();
      if(hasCorrectMark(text)){answer=currentOption;text=stripCorrectMarks(text);}
      if(optionText[currentOption]) issues.push(issue('DUPLICATE_OPTION',`${currentOption} option repeated`,item.line,'warning'));
      optionText[currentOption]=(optionText[currentOption]+' '+cleanText(text)).trim();
      return;
    }

    if(currentOption && optionsStarted){
      if(hasCorrectMark(line)) answer=currentOption;
      optionText[currentOption]=(optionText[currentOption]+' '+cleanText(stripCorrectMarks(line))).trim();
      return;
    }

    if(!optionsStarted){
      if(pos===0 && HEADING_RE.test(line) && !QUESTION_START_RE.test(line) && block.some(x=>OPTION_RE.test(x.text))){
        // Keep likely headings only when they are part of the actual question block.
        const stripped=line.replace(/^\*+|\*+$/g,'').trim();
        if(stripped && stripped.length>3) questionLines.push(stripped);
      }else questionLines.push(cleanText(line));
    }
  });

  const questionText=questionLines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  const options=['A','B','C','D'].map(key=>({key,text:optionText[key]}));
  const id=`q_${Date.now()}_${index}_${Math.random().toString(36).slice(2,7)}`;
  const q={id,subject,question:questionText,options,answer:answer||'',marks:1,sourceNumber,sourceLine};

  if(!sourceNumber) issues.push(issue('MISSING_NUMBER',`Question ${index+1}: number missing; auto-number will be used`,sourceLine,'warning'));
  if(!questionText) issues.push(issue('MISSING_QUESTION_TEXT',`Question ${index+1}: question text missing`,sourceLine,'error'));
  const missing=options.filter(o=>!o.text).map(o=>o.key);
  if(missing.length) issues.push(issue('MISSING_OPTIONS',`Q${index+1}: missing option(s) ${missing.join(', ')}`,sourceLine,'error'));
  if(!answer) issues.push(issue('MISSING_ANSWER',`Q${index+1}: correct answer missing`,sourceLine,'error'));
  else if(!optionText[answer]) issues.push(issue('ANSWER_OPTION_EMPTY',`Q${index+1}: answer ${answer} points to an empty option`,sourceLine,'error'));

  return {question:q,issues};
}

export function validateQuestions(questions=[]){
  const issues=[];
  const seenIds=new Set();
  const seenText=new Map();
  questions.forEach((q,i)=>{
    const no=i+1;
    if(!q.id || seenIds.has(q.id)){q.id=`q_${Date.now()}_${i}_${Math.random().toString(36).slice(2,7)}`;issues.push(issue('ID_REPAIRED',`Q${no}: internal ID repaired`,0,'warning'));}
    seenIds.add(q.id);
    if(!String(q.question||'').trim()) issues.push(issue('MISSING_QUESTION_TEXT',`Q${no}: question text missing`,0,'error'));
    const keys=['A','B','C','D'];
    keys.forEach(k=>{const o=(q.options||[]).find(x=>x.key===k);if(!o||!String(o.text||'').trim())issues.push(issue('MISSING_OPTION',`Q${no}: option ${k} missing`,0,'error'));});
    if(!keys.includes(String(q.answer||'').toUpperCase())) issues.push(issue('MISSING_ANSWER',`Q${no}: select correct answer`,0,'error'));
    const key=normalizeCompare(q.question);
    if(key){if(seenText.has(key))issues.push(issue('DUPLICATE_QUESTION',`Q${no} duplicates Q${seenText.get(key)+1}`,0,'warning'));else seenText.set(key,i);}
  });
  return {issues,stats:buildStats(questions,issues),valid:!issues.some(x=>x.severity==='error')};
}

export function autoFixQuestions(questions=[]){
  return questions.map((q,i)=>({
    ...q,
    id:q.id||`q_${Date.now()}_${i}_${Math.random().toString(36).slice(2,7)}`,
    subject:String(q.subject||'General').trim()||'General',
    question:String(q.question||'').trim(),
    options:['A','B','C','D'].map(k=>{const found=(q.options||[]).find(o=>String(o.key).toUpperCase()===k);return {key:k,text:String(found?.text||'').trim()};}),
    answer:['A','B','C','D'].includes(String(q.answer||'').toUpperCase())?String(q.answer).toUpperCase():'',
    marks:Math.max(0,Number(q.marks||1))
  }));
}

function buildStats(questions,issues){
  const errors=issues.filter(x=>x.severity==='error').length;
  const warnings=issues.filter(x=>x.severity==='warning').length;
  const validQuestions=questions.filter(q=>String(q.question||'').trim()&&['A','B','C','D'].every(k=>(q.options||[]).some(o=>o.key===k&&String(o.text||'').trim()))&&['A','B','C','D'].includes(q.answer)).length;
  return {total:questions.length,valid:validQuestions,errors,warnings,ready:questions.length>0&&errors===0};
}
function emptyStats(){return {total:0,valid:0,errors:0,warnings:0,ready:false};}
function issue(code,message,line=0,severity='warning',raw=''){return {code,message,line,severity,raw};}
function cleanText(s=''){return String(s).replace(CORRECT_MARK_RE,'').replace(/\s+/g,' ').trim();}
function stripCorrectMarks(s=''){return String(s).replace(CORRECT_MARK_RE,'').trim();}
function hasCorrectMark(s=''){CORRECT_MARK_RE.lastIndex=0;return CORRECT_MARK_RE.test(String(s));}
function normalizeCompare(s=''){return String(s||'').toLowerCase().replace(/\s+/g,' ').replace(/[^\p{L}\p{N} ]/gu,'').trim();}

export function blankQuestion(subject='General'){
  return {id:`q_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,subject,question:'',options:['A','B','C','D'].map(key=>({key,text:''})),answer:'',marks:1};
}

export function studentShuffle(questions,seedText=''){
  const bySubject={};
  questions.forEach(q=>{const s=q.subject||'General';(bySubject[s]||=[]).push(q);});
  const rnd=mulberry32(hash(seedText||'KSR'));
  let out=[];
  Object.keys(bySubject).forEach(s=>{out=out.concat(shuffle([...bySubject[s]],rnd));});
  return out;
}
function shuffle(a,rnd){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function hash(str){let h=1779033703;for(let i=0;i<String(str).length;i++){h=Math.imul(h^String(str).charCodeAt(i),3432918353);h=h<<13|h>>>19;}return h>>>0;}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
