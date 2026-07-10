import{auth,db,onAuthStateChanged,signOut,collection,getDocs,addDoc,doc,setDoc,serverTimestamp,$,show,esc}from'./app.js';
import{parseQuestions,blankQuestion}from'./parser.js';
let user=null,questions=[],previewIndex=0,lastCodes=[],lastExam=null;
const norm=v=>String(v||'').trim().toUpperCase();
function flash(message,type='ok'){let box=document.getElementById('floatingNotice');if(!box){box=document.createElement('div');box.id='floatingNotice';document.body.appendChild(box)}box.className=`floatingNotice ${type}`;box.textContent=message;box.hidden=false;clearTimeout(window.__ksrNoticeTimer);window.__ksrNoticeTimer=setTimeout(()=>box.hidden=true,2600)}
onAuthStateChanged(auth,u=>{if(!u)location.href='login.html';else{user=u;setDefaultTimes();}});
$('logout').onclick=()=>signOut(auth);
function setDefaultTimes(){const now=new Date(),end=new Date(now.getTime()+2*60*60*1000),fmt=d=>{const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`};$('startTime').value=fmt(now);$('endTime').value=fmt(end)}
$('examId').addEventListener('input',()=>{$('examId').value=norm($('examId').value).replace(/\s+/g,'-')});
$('parseBtn').onclick=()=>{
  const editor=$('questionEditor');
  if(editor.dataset.open==='1'){
    sync();
    $('rawBits').value=questionsToText(questions);
    editor.innerHTML='';editor.dataset.open='0';
    $('parseBtn').textContent='Parse Questions';
    flash(`${questions.length} questions edits saved ✅`);
    renderHealth();
    return;
  }
  const parsed=parseQuestions($('rawBits').value,'General');
  if(!parsed.length)return show('Questions detect avvaledu. Format check cheyyandi.','err');
  questions=parsed;renderEditor();editor.dataset.open='1';$('parseBtn').textContent='Save Edits & Close';
  flash(`${parsed.length} questions detected ✅`);
};
function questionsToText(list){return list.map((q,i)=>`${i+1}. ${q.question}
${q.options.map(o=>`${o.key}) ${o.text}${q.answer===o.key?' ●':''}`).join('\n')}`).join('\n\n')}
$('addQuestionBtn').onclick=()=>{questions.push(blankQuestion('General'));renderEditor();$('questionEditor').dataset.open='1';$('parseBtn').textContent='Save Edits & Close';flash(`Question ${questions.length} added ✅`)};
function validate(){const issues=[];questions.forEach((q,i)=>{if(!q.question.trim())issues.push(`Q${i+1}: Question missing`);const filled=q.options.filter(o=>o.text.trim()).length;if(filled<4)issues.push(`Q${i+1}: ${4-filled} option(s) missing`);if(!['A','B','C','D'].includes(q.answer))issues.push(`Q${i+1}: Correct answer missing`)});const seen=new Map();questions.forEach((q,i)=>{const key=q.question.toLowerCase().replace(/\s+/g,' ').trim();if(key&&seen.has(key))issues.push(`Q${i+1}: Duplicate of Q${seen.get(key)+1}`);else seen.set(key,i)});return issues}
function renderHealth(){const issues=validate();$('health').innerHTML=`<b>Exam Health</b><div class="health-grid"><span>Questions: <b>${questions.length}</b></span><span>Issues: <b>${issues.length}</b></span><span>Status: <b class="${issues.length?'badText':'goodText'}">${questions.length&&!issues.length?'READY':'CHECK REQUIRED'}</b></span></div>${issues.length?`<details><summary>View Issues</summary><div class="issue-list">${issues.map(x=>`<div>${esc(x)}</div>`).join('')}</div></details>`:''}`;$('saveGenerateBtn').disabled=!questions.length||!!issues.length}
function renderEditor(){$('questionEditor').dataset.open='1';$('questionEditor').innerHTML=questions.map((q,i)=>`<div class="qcard"><div class="qhead"><b>Q${i+1}</b><div><button class="gray moveUp" data-i="${i}">↑</button><button class="gray moveDown" data-i="${i}">↓</button><button class="danger deleteQ" data-i="${i}">Delete</button></div></div><label>Question</label><textarea class="editQ" data-i="${i}">${esc(q.question)}</textarea><div class="grid two">${q.options.map((o,j)=>`<div><label>${o.key}) Option</label><input class="editOpt" data-i="${i}" data-j="${j}" value="${esc(o.text)}"></div>`).join('')}</div><label>Correct Answer</label><select class="editAns" data-i="${i}">${['A','B','C','D'].map(k=>`<option ${q.answer===k?'selected':''}>${k}</option>`).join('')}</select></div>`).join('');bindEditor();renderHealth()}
function sync(){document.querySelectorAll('.editQ').forEach(x=>questions[+x.dataset.i].question=x.value);document.querySelectorAll('.editOpt').forEach(x=>questions[+x.dataset.i].options[+x.dataset.j].text=x.value);document.querySelectorAll('.editAns').forEach(x=>questions[+x.dataset.i].answer=x.value)}
function bindEditor(){document.querySelectorAll('.editQ,.editOpt,.editAns').forEach(x=>x.oninput=()=>{sync();renderHealth()});document.querySelectorAll('.deleteQ').forEach(b=>b.onclick=()=>{questions.splice(+b.dataset.i,1);renderEditor()});document.querySelectorAll('.moveUp').forEach(b=>b.onclick=()=>{sync();const i=+b.dataset.i;if(i>0)[questions[i-1],questions[i]]=[questions[i],questions[i-1]];renderEditor()});document.querySelectorAll('.moveDown').forEach(b=>b.onclick=()=>{sync();const i=+b.dataset.i;if(i<questions.length-1)[questions[i+1],questions[i]]=[questions[i],questions[i+1]];renderEditor()})}
$('previewBtn').onclick=()=>{sync();if(!questions.length)return show('Preview ki questions levu.','err');previewIndex=0;$('previewCard').hidden=false;renderPreview();location.hash='previewCard'};
function renderPreview(){const q=questions[previewIndex];$('previewTitle').textContent=$('examTitle').value.trim()||$('examId').value.trim()||'Exam Preview';$('previewTimer').textContent=`${$('secondsPerQuestion').value||60} sec / Q`;$('previewContent').innerHTML=`<div class="questionText"><b>Question ${previewIndex+1} of ${questions.length}</b><h3>${esc(q.question).replace(/\n/g,'<br>')}</h3></div>${q.options.map(o=>`<label class="optionCard"><input type="radio" name="previewAnswer"><b>${o.key}</b><span>${esc(o.text)}</span></label>`).join('')}<div class="controls"><button class="gray" id="pPrev">Previous</button><button class="green" id="pNext">Save & Next</button></div>`;$('previewNav').innerHTML=questions.map((_,i)=>`<button class="pbtn ${i===previewIndex?'cur':'not'}" data-p="${i}">${i+1}</button>`).join('');document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{previewIndex=+b.dataset.p;renderPreview()});$('pPrev').onclick=()=>{if(previewIndex>0){previewIndex--;renderPreview()}};$('pNext').onclick=()=>{if(previewIndex<questions.length-1){previewIndex++;renderPreview()}}}
function makeCode(examId,i){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let r='';for(let n=0;n<6;n++)r+=chars[Math.floor(Math.random()*chars.length)];return `${examId}-${String(i+1).padStart(3,'0')}-${r}`}
$('saveGenerateBtn').onclick=async()=>{sync();const instituteName=$('instituteName').value.trim(),examPublicId=norm($('examId').value),title=$('examTitle').value.trim()||examPublicId,start=$('startTime').value,end=$('endTime').value,seconds=Math.max(5,Number($('secondsPerQuestion').value||60)),count=Math.max(1,Math.min(1000,Number($('codeCount').value||1))),issues=validate();if(!instituteName||!examPublicId||!start||!end)return show('Institute Name, Exam ID, Start Time, End Time enter cheyyandi.','err');if(Date.parse(end)<=Date.parse(start))return show('End Time, Start Time తర్వాత ఉండాలి.','err');if(issues.length||!questions.length)return show('Questions lo issues fix cheyyandi.','err');$('saveGenerateBtn').disabled=true;try{const all=await getDocs(collection(db,'exams'));let duplicate=false;all.forEach(d=>{if(norm(d.data().examId||d.data().examCode)===examPublicId)duplicate=true});if(duplicate)return show('Ee Exam ID already undi. Vere Exam ID use cheyyandi.','err');const totalSeconds=seconds*questions.length;const examRef=await addDoc(collection(db,'exams'),{instituteName,instituteCode:instituteName,title,examId:examPublicId,examCode:examPublicId,startTime:new Date(start).toISOString(),endTime:new Date(end).toISOString(),start:new Date(start).toISOString(),end:new Date(end).toISOString(),secondsPerQuestion:seconds,totalMinutes:Math.ceil(totalSeconds/60),status:$('status').value,questionCount:questions.length,allowPrevious:true,shuffleQuestions:false,shuffleOptions:false,createdBy:user.email,createdAt:serverTimestamp()});await setDoc(doc(db,'examQuestions',examRef.id),{examId:examRef.id,questions,questionCount:questions.length,updatedAt:serverTimestamp()});lastCodes=[];for(let i=0;i<count;i++){let code=makeCode(examPublicId,i),ref=await addDoc(collection(db,'studentAccess'),{examId:examRef.id,examPublicId,code,status:'unused',studentName:'',mobile:'',createdAt:serverTimestamp()});lastCodes.push({id:ref.id,code,status:'unused'})}lastExam={docId:examRef.id,examId:examPublicId,title,instituteName,startTime:new Date(start).toISOString(),endTime:new Date(end).toISOString(),secondsPerQuestion:seconds,questionCount:questions.length,totalMinutes:Math.ceil(totalSeconds/60)};$('resultExamId').value=examPublicId;renderCodes();flash(`Exam saved ✅ ${count} codes generated.`);show(`Exam saved ✅ ${count} codes generated.`)}catch(e){show(e.message,'err')}finally{$('saveGenerateBtn').disabled=false;renderHealth()}};
function formatDateTime(value){if(!value)return '-';const d=new Date(value);return Number.isNaN(d.getTime())?'-':d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function renderCodes(){
  const exam=lastExam||{};
  $('codesBox').innerHTML=lastCodes.length?`<div class="print-header codePdfHeader premiumCodesHeader">
    <div class="codesBrand"><div class="brandSeal">KSR</div><div><h1>${esc(exam.instituteName||'Institute')}</h1><h3>${esc(exam.title||'Daily Test')}</h3></div></div>
    <p class="examIdHighlight">Exam ID: <b>${esc(exam.examId||'')}</b></p>
    <div class="examInfoCards">
      <div><span>Exam Starts</span><b>${esc(formatDateTime(exam.startTime))}</b></div>
      <div><span>Login Before</span><b>${esc(formatDateTime(exam.endTime))}</b></div>
      <div><span>Total Bits</span><b>${Number(exam.questionCount||0)}</b></div>
      <div><span>Exam Time</span><b>${Number(exam.totalMinutes||0)} Minutes</b></div>
    </div>
    <div class="loginInstructions colorfulInstructions"><h3>Student Login Instructions</h3>
      <p><b>Name:</b> మీ పేరు</p><p><b>Exam ID:</b> ${esc(exam.examId||'')} ఇవ్వండి</p>
      <p><b>Exam Code:</b> కింద ఉన్న codes లో మీకు కేటాయించిన code ఇవ్వండి</p><p><b>Phone No:</b> మీ phone number ఇవ్వండి</p>
    </div></div>
    <table class="table codesTable"><tr><th>No.</th><th>Exam Code</th><th>Status</th></tr>${lastCodes.map((x,i)=>`<tr><td>${i+1}</td><td><b>${esc(x.code)}</b></td><td>${esc(x.status)}</td></tr>`).join('')}</table>`:'<p>No codes</p>'
}
$('copyCodes').onclick=async()=>{if(!lastCodes.length)return show('Codes levu.','err');await navigator.clipboard.writeText(`${lastExam.instituteName}\nExam ID: ${lastExam.examId}\n\nStudent Login:\nName: మీ పేరు\nExam ID: ${lastExam.examId}\nExam Code: కింద codes లో మీకు కేటాయించిన code\nPhone No: మీ phone number\n\nCodes:\n`+lastCodes.map(x=>x.code).join('\n'));show('Exam ID + Codes copied ✅')};
$('printCodes').onclick=()=>{if(!lastCodes.length)return show('Codes levu.','err');printSection('codesBox','Generated Exam Codes')};
$('loadResults').onclick=loadResults;$('printResults').onclick=()=>printSection('resultsBox','Exam Results & Ranks');
async function loadResults(){
  const publicId=norm($('resultExamId').value);
  if(!publicId)return show('Results kosam Exam ID enter cheyyandi.','err');
  let examDocId='',examData=null;
  const exams=await getDocs(collection(db,'exams'));
  exams.forEach(d=>{const data=d.data();if(norm(data.examId||data.examCode)===publicId){examDocId=d.id;examData={id:d.id,...data}}});
  if(!examDocId)return show('Exam ID dorakaledu.','err');
  const snap=await getDocs(collection(db,'results'));let rows=[];
  snap.forEach(d=>{const r=d.data();if(r.examId===examDocId)rows.push(r)});
  rows.sort((a,b)=>(Number(b.score||0)-Number(a.score||0))||((Number(a.totalTime)||999999)-(Number(b.totalTime)||999999))||String(a.name||'').localeCompare(String(b.name||'')));
  let rank=0,lastScore=null;
  rows=rows.map((r,i)=>{if(Number(r.score)!==lastScore)rank=i+1;lastScore=Number(r.score);return{...r,rank}});
  if(!rows.length){$('resultsBox').innerHTML='<p class="msg warn">No results yet.</p>';return;}
  const participants=rows.length;
  const highest=Math.max(...rows.map(r=>Number(r.score||0)));
  const totalMarks=Math.max(...rows.map(r=>Number(r.total||0)),0);
  const avg=(rows.reduce((a,r)=>a+Number(r.score||0),0)/participants).toFixed(2);
  const avgPct=totalMarks?((Number(avg)/totalMarks)*100).toFixed(1):'0.0';
  const top3=rows.filter(r=>r.rank<=3).slice(0,3);
  const medal=['🥇','🥈','🥉'];
  const institute=examData?.instituteName||examData?.instituteCode||'KSR Institute';
  const title=examData?.title||'Daily Test';
  $('resultsBox').innerHTML=`
    <div class="print-header premiumPrintHeader">
      <div class="brandSeal">KSR</div>
      <div><h1>${esc(institute)}</h1><h3>${esc(title)}</h3><p>Exam ID: <b>${esc(publicId)}</b></p></div>
    </div>
    <div class="resultSummaryGrid">
      <div class="summaryCard"><span>Participants</span><b>${participants}</b></div>
      <div class="summaryCard"><span>Highest Score</span><b>${highest} / ${totalMarks}</b></div>
      <div class="summaryCard"><span>Average Score</span><b>${avg}</b></div>
      <div class="summaryCard"><span>Average Accuracy</span><b>${avgPct}%</b></div>
    </div>
    <h3 class="sectionTitle">🏆 Top 3 Ranks</h3>
    <div class="topRankGrid">${top3.map((r,i)=>`<div class="rankCard rank${i+1}"><div class="medal">${medal[i]}</div><div class="rankNo">Rank ${r.rank}</div><h3>${esc(r.name||r.studentName||'-')}</h3><p>Exam Code: <b>${esc(r.studentCode||r.examCode||'-')}</b></p><strong>${Number(r.score||0)} / ${Number(r.total||0)}</strong></div>`).join('')}</div>
    <h3 class="sectionTitle">Complete Rank List</h3>
    <table class="table resultTable"><tr><th>Rank</th><th>Name</th><th>Exam Code</th><th>Score</th><th>Total</th></tr>${rows.map(r=>`<tr><td><b>${r.rank}</b></td><td>${esc(r.name||r.studentName||'-')}</td><td>${esc(r.studentCode||r.examCode||'-')}</td><td><b>${Number(r.score||0)}</b></td><td>${Number(r.total||0)}</td></tr>`).join('')}</table>
    <div class="pdfFooter">${esc(institute)} • Generated by KSR EXAMOS • ${new Date().toLocaleString('en-IN')}</div>`;
}
function printSection(id,title){
  const el=$(id);if(!el||!el.innerHTML.trim())return show('Print cheyyadaniki data ledu.','err');
  const w=window.open('','_blank');
  w.document.write(`<html><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="style.css"><style>body{padding:24px;background:#fff}.table{width:100%;border-collapse:collapse}.table th,.table td{border:1px solid #b8c6d6;padding:8px;text-align:left}.pdfFooter{margin-top:20px;padding-top:8px;border-top:1px solid #94a3b8;text-align:center;font-size:11px;color:#475569}@page{margin:14mm}@media print{button{display:none!important}.card{box-shadow:none!important}.topRankGrid{break-inside:avoid}.resultSummaryGrid{break-inside:avoid}}</style></head><body>${el.innerHTML}<script>setTimeout(()=>window.print(),500)<\/script></body></html>`);w.document.close();
}
let allSavedExams=[];
$('searchExam').onclick=async()=>{await ensureExamsLoaded();renderSavedExams($('examSearch').value)};
$('loadAllExams').onclick=async()=>{await ensureExamsLoaded(true);$('examSearch').value='';renderSavedExams('')};
$('examSearch').addEventListener('keydown',e=>{if(e.key==='Enter')$('searchExam').click()});
async function ensureExamsLoaded(force=false){if(allSavedExams.length&&!force)return;const snap=await getDocs(collection(db,'exams'));allSavedExams=[];snap.forEach(d=>allSavedExams.push({id:d.id,...d.data()}));allSavedExams.sort((a,b)=>Number(b.createdAt?.seconds||0)-Number(a.createdAt?.seconds||0))}
function renderSavedExams(term=''){
  const key=String(term||'').trim().toLowerCase();
  const arr=key?allSavedExams.filter(e=>[e.title,e.examId,e.examCode,e.instituteName,e.instituteCode].some(v=>String(v||'').toLowerCase().includes(key))):allSavedExams;
  $('savedExams').innerHTML=arr.map(e=>`<div class="qcard"><b>${esc(e.title||e.examId||'Exam')}</b><p>Exam ID: <b>${esc(e.examId||e.examCode||e.id)}</b></p><p>${esc(e.instituteName||'')} • Questions: ${Number(e.questionCount||0)} • Status: ${esc(e.status||'')}</p><div class="action-row"><button class="gray useResult" data-id="${esc(e.examId||e.examCode||'')}">View Results</button></div></div>`).join('')||(key?'<p class="msg warn">Matching exam dorakaledu.</p>':'<p>No exams</p>');
  document.querySelectorAll('.useResult').forEach(b=>b.onclick=()=>{$('resultExamId').value=b.dataset.id;loadResults();location.hash='resultsBox'})
}
