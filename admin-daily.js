import{auth,db,onAuthStateChanged,signOut,collection,getDocs,getDoc,addDoc,doc,setDoc,updateDoc,deleteDoc,serverTimestamp,writeBatch,$,show,esc}from'./app.js';
import{parseQuestions,blankQuestion}from'./parser.js';
let user=null,questions=[],previewIndex=0,lastCodes=[],lastExam=null,institutes=[],batches=[],batchStudents=[];
const norm=v=>String(v||'').trim().toUpperCase();
function flash(message,type='ok'){let box=document.getElementById('floatingNotice');if(!box){box=document.createElement('div');box.id='floatingNotice';document.body.appendChild(box)}box.className=`floatingNotice ${type}`;box.textContent=message;box.hidden=false;clearTimeout(window.__ksrNoticeTimer);window.__ksrNoticeTimer=setTimeout(()=>box.hidden=true,2600)}
onAuthStateChanged(auth,u=>{if(!u)location.href='login.html';else{user=u;setDefaultTimes();loadMasters();clearCreateForm(false);}});
$('logout').onclick=()=>signOut(auth);
$('instituteId').onchange=()=>{renderBatchOptions();syncInstituteName();saveDraft()};$('batchId').onchange=()=>{loadBatchStudents();saveDraft()};
function setDefaultTimes(){const now=new Date(),end=new Date(now.getTime()+2*60*60*1000),fmt=d=>{const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`};$('startTime').value=fmt(now);$('endTime').value=fmt(end)}
function clearCreateForm(showNotice=true){
  questions=[];previewIndex=0;
  ['examId','examTitle','loginBefore','rawBits'].forEach(id=>{if($(id))$(id).value=''});
  if($('codeCount'))$('codeCount').value='50';
  if($('secondsPerQuestion'))$('secondsPerQuestion').value='60';
  if($('status'))$('status').value='active';
  setDefaultTimes();
  if($('questionEditor')){$('questionEditor').innerHTML='';$('questionEditor').dataset.open='0'}
  if($('parseBtn'))$('parseBtn').textContent='Parse Questions';
  if($('previewCard'))$('previewCard').hidden=true;
  renderHealth();
  if(showNotice)flash('Fresh exam form ready ✅');
}
window.addEventListener('ksr:new-exam',()=>clearCreateForm(false));
$('clearExamFormBtn')?.addEventListener('click',()=>{if(confirm('Current form clear cheyyala?')){localStorage.removeItem(DRAFT_KEY);clearCreateForm(true)}});
$('recoverDraftBtn')?.addEventListener('click',()=>restoreDraft(true));

$('examId').addEventListener('input',()=>{$('examId').value=norm($('examId').value).replace(/\s+/g,'-');saveDraft()});
['examTitle','codeCount','startTime','endTime','loginBefore','secondsPerQuestion','status','rawBits'].forEach(id=>$(id)?.addEventListener('input',saveDraft));

async function loadMasters(){
  const [is,bs]=await Promise.all([getDocs(collection(db,'institutes')),getDocs(collection(db,'batches'))]);
  institutes=[];batches=[];is.forEach(d=>institutes.push({id:d.id,...d.data()}));bs.forEach(d=>batches.push({id:d.id,...d.data()}));
  institutes.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  $('instituteId').innerHTML=institutes.map(i=>`<option value="${i.id}">${esc(i.name||'Institute')}</option>`).join('');
  renderBatchOptions();syncInstituteName();await loadBatchStudents();
}
function renderBatchOptions(){const iid=$('instituteId').value;const arr=batches.filter(b=>b.instituteId===iid);$('batchId').innerHTML=arr.map(b=>`<option value="${b.id}">${esc(b.name||'Batch')}</option>`).join('')}
function syncInstituteName(){const i=institutes.find(x=>x.id===$('instituteId').value);$('instituteName').value=i?.name||''}
async function loadBatchStudents(){const bid=$('batchId').value;batchStudents=[];if(!bid)return;const snap=await getDocs(collection(db,'studentMaster'));snap.forEach(d=>{const x=d.data();if(x.batchId===bid&&x.active!==false)batchStudents.push({id:d.id,...x})});batchStudents.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));if(batchStudents.length)$('codeCount').value=batchStudents.length}
const DRAFT_KEY='ksrDailyV5Draft';
function saveDraft(){try{localStorage.setItem(DRAFT_KEY,JSON.stringify({instituteId:$('instituteId')?.value,batchId:$('batchId')?.value,examId:$('examId')?.value,examTitle:$('examTitle')?.value,codeCount:$('codeCount')?.value,startTime:$('startTime')?.value,endTime:$('endTime')?.value,loginBefore:$('loginBefore')?.value,secondsPerQuestion:$('secondsPerQuestion')?.value,status:$('status')?.value,rawBits:$('rawBits')?.value,questions}))}catch(e){}}
function restoreDraft(notify=true){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(!d){if(notify)flash('Saved draft ledu.','err');return}['examId','examTitle','codeCount','startTime','endTime','loginBefore','secondsPerQuestion','status','rawBits'].forEach(id=>{if(d[id]!=null&&$(id))$(id).value=d[id]});if(Array.isArray(d.questions)&&d.questions.length){questions=d.questions;renderHealth()}if(notify)flash('Previous draft restored ✅','ok')}catch(e){if(notify)flash('Draft restore avvaledu.','err')}}

$('parseBtn').onclick=()=>{
  const editor=$('questionEditor');
  if(editor.dataset.open==='1'){
    sync();
    $('rawBits').value=questionsToText(questions);
    editor.innerHTML='';editor.dataset.open='0';
    $('parseBtn').textContent='Parse Questions';
    flash(`${questions.length} questions edits saved ✅`);saveDraft();
    renderHealth();
    return;
  }
  const parsed=parseQuestions($('rawBits').value,'General');
  if(!parsed.length)return show('Questions detect avvaledu. Format check cheyyandi.','err');
  questions=parsed;renderEditor();editor.dataset.open='1';$('parseBtn').textContent='Save Edits & Close';
  flash(`${parsed.length} questions detected ✅`);saveDraft();
};
function questionsToText(list){return list.map((q,i)=>`${i+1}. ${q.question}
${q.options.map(o=>`${o.key}) ${o.text}${q.answer===o.key?' ●':''}`).join('\n')}`).join('\n\n')}
$('addQuestionBtn').onclick=()=>{questions.push(blankQuestion('General'));renderEditor();$('questionEditor').dataset.open='1';$('parseBtn').textContent='Save Edits & Close';flash(`Question ${questions.length} added ✅`)};
function validate(){const issues=[];questions.forEach((q,i)=>{if(!q.question.trim())issues.push(`Q${i+1}: Question missing`);const filled=q.options.filter(o=>o.text.trim()).length;if(filled<4)issues.push(`Q${i+1}: ${4-filled} option(s) missing`);if(!['A','B','C','D'].includes(q.answer))issues.push(`Q${i+1}: Correct answer missing`)});const seen=new Map();questions.forEach((q,i)=>{const key=q.question.toLowerCase().replace(/\s+/g,' ').trim();if(key&&seen.has(key))issues.push(`Q${i+1}: Duplicate of Q${seen.get(key)+1}`);else seen.set(key,i)});return issues}
function renderHealth(){const issues=validate();$('health').innerHTML=`<b>Exam Health</b><div class="health-grid"><span>Questions: <b>${questions.length}</b></span><span>Issues: <b>${issues.length}</b></span><span>Status: <b class="${issues.length?'badText':'goodText'}">${questions.length&&!issues.length?'READY':'CHECK REQUIRED'}</b></span></div>${issues.length?`<details><summary>View Issues</summary><div class="issue-list">${issues.map(x=>`<div>${esc(x)}</div>`).join('')}</div></details>`:''}`;$('saveGenerateBtn').disabled=!questions.length||!!issues.length}
function renderEditor(){$('questionEditor').dataset.open='1';$('questionEditor').innerHTML=questions.map((q,i)=>`<div class="qcard"><div class="qhead"><b>Q${i+1}</b><div><button class="gray moveUp" data-i="${i}">↑</button><button class="gray moveDown" data-i="${i}">↓</button><button class="danger deleteQ" data-i="${i}">Delete</button></div></div><label>Question</label><textarea class="editQ" data-i="${i}">${esc(q.question)}</textarea><div class="grid two">${q.options.map((o,j)=>`<div><label>${o.key}) Option</label><input class="editOpt" data-i="${i}" data-j="${j}" value="${esc(o.text)}"></div>`).join('')}</div><label>Correct Answer</label><select class="editAns" data-i="${i}">${['A','B','C','D'].map(k=>`<option ${q.answer===k?'selected':''}>${k}</option>`).join('')}</select></div>`).join('');bindEditor();renderHealth()}
function sync(){document.querySelectorAll('.editQ').forEach(x=>questions[+x.dataset.i].question=x.value);document.querySelectorAll('.editOpt').forEach(x=>questions[+x.dataset.i].options[+x.dataset.j].text=x.value);document.querySelectorAll('.editAns').forEach(x=>questions[+x.dataset.i].answer=x.value);saveDraft()}
function bindEditor(){document.querySelectorAll('.editQ,.editOpt,.editAns').forEach(x=>x.oninput=()=>{sync();renderHealth()});document.querySelectorAll('.deleteQ').forEach(b=>b.onclick=()=>{questions.splice(+b.dataset.i,1);renderEditor()});document.querySelectorAll('.moveUp').forEach(b=>b.onclick=()=>{sync();const i=+b.dataset.i;if(i>0)[questions[i-1],questions[i]]=[questions[i],questions[i-1]];renderEditor()});document.querySelectorAll('.moveDown').forEach(b=>b.onclick=()=>{sync();const i=+b.dataset.i;if(i<questions.length-1)[questions[i+1],questions[i]]=[questions[i],questions[i+1]];renderEditor()})}
$('previewBtn').onclick=()=>{sync();if(!questions.length)return show('Preview ki questions levu.','err');previewIndex=0;$('previewCard').hidden=false;renderPreview();location.hash='previewCard'};
function renderPreview(){const q=questions[previewIndex];$('previewTitle').textContent=$('examTitle').value.trim()||$('examId').value.trim()||'Exam Preview';$('previewTimer').textContent=`${$('secondsPerQuestion').value||60} sec / Q`;$('previewContent').innerHTML=`<div class="questionText"><b>Question ${previewIndex+1} of ${questions.length}</b><h3>${esc(q.question).replace(/\n/g,'<br>')}</h3></div>${q.options.map(o=>`<label class="optionCard"><input type="radio" name="previewAnswer"><b>${o.key}</b><span>${esc(o.text)}</span></label>`).join('')}<div class="controls"><button class="gray" id="pPrev">Previous</button><button class="green" id="pNext">Save & Next</button></div>`;$('previewNav').innerHTML=questions.map((_,i)=>`<button class="pbtn ${i===previewIndex?'cur':'not'}" data-p="${i}">${i+1}</button>`).join('');document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{previewIndex=+b.dataset.p;renderPreview()});$('pPrev').onclick=()=>{if(previewIndex>0){previewIndex--;renderPreview()}};$('pNext').onclick=()=>{if(previewIndex<questions.length-1){previewIndex++;renderPreview()}}}
function makeCode(examId,i){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let r='';for(let n=0;n<6;n++)r+=chars[Math.floor(Math.random()*chars.length)];return `${examId}-${String(i+1).padStart(3,'0')}-${r}`}
$('saveGenerateBtn').onclick=async()=>{sync();const instituteId=$('instituteId').value,batchId=$('batchId').value,instituteName=$('instituteName').value.trim(),batchName=(batches.find(b=>b.id===batchId)?.name||''),examPublicId=norm($('examId').value),title=$('examTitle').value.trim()||examPublicId,start=$('startTime').value,end=$('endTime').value,loginBefore=$('loginBefore').value||start,seconds=Math.max(5,Number($('secondsPerQuestion').value||60)),count=Math.max(1,Math.min(1000,Number($('codeCount').value||1))),issues=validate();if(!instituteId||!batchId||!instituteName||!examPublicId||!start||!end)return show('Institute Name, Exam ID, Start Time, End Time enter cheyyandi.','err');if(Date.parse(end)<=Date.parse(start))return show('End Time, Start Time తర్వాత ఉండాలి.','err');if(issues.length||!questions.length)return show('Questions lo issues fix cheyyandi.','err');$('saveGenerateBtn').disabled=true;try{const examRef=doc(db,'exams',examPublicId);const oldExam=await getDoc(examRef);if(oldExam.exists())return show('Ee Exam ID already undi. Vere Exam ID use cheyyandi.','err');const totalSeconds=seconds*questions.length;await setDoc(examRef,{instituteId,batchId,batchName,instituteName,logoUrl:(institutes.find(i=>i.id===instituteId)?.logoUrl||''),instituteCode:instituteName,title,examId:examPublicId,examCode:examPublicId,startTime:new Date(start).toISOString(),endTime:new Date(end).toISOString(),loginBefore:new Date(loginBefore).toISOString(),start:new Date(start).toISOString(),end:new Date(end).toISOString(),secondsPerQuestion:seconds,totalMinutes:Math.ceil(totalSeconds/60),status:$('status').value,questionCount:questions.length,allowPrevious:true,shuffleQuestions:false,shuffleOptions:false,createdBy:user.email,createdAt:serverTimestamp()});await setDoc(doc(db,'examQuestions',examRef.id),{examId:examRef.id,questions,questionCount:questions.length,updatedAt:serverTimestamp()});lastCodes=[];let selectedStudents=batchStudents.length?batchStudents.slice(0,count):[];while(selectedStudents.length<count)selectedStudents.push({name:'',roll:'',id:''});for(let startIndex=0;startIndex<selectedStudents.length;startIndex+=450){const wb=writeBatch(db),chunk=selectedStudents.slice(startIndex,startIndex+450);chunk.forEach((st,j)=>{const i=startIndex+j,code=makeCode(examPublicId,i),ref=doc(db,'studentAccess',code);wb.set(ref,{examId:examRef.id,examPublicId,instituteId,batchId,batchName,studentMasterId:st.id||'',assignedName:st.name||'',studentName:'',roll:st.roll||'',code,status:'unused',mobile:'',createdAt:serverTimestamp()});lastCodes.push({id:ref.id,code,status:'unused',studentName:st.name||'',roll:st.roll||''})});await wb.commit()}lastExam={docId:examRef.id,examId:examPublicId,title,instituteId,batchId,batchName,instituteName,logoUrl:(institutes.find(i=>i.id===instituteId)?.logoUrl||''),startTime:new Date(start).toISOString(),endTime:new Date(end).toISOString(),loginBefore:new Date(loginBefore).toISOString(),secondsPerQuestion:seconds,questionCount:questions.length,totalMinutes:Math.ceil(totalSeconds/60)};$('resultExamId').value=examPublicId;renderCodes();localStorage.removeItem(DRAFT_KEY);flash(`Exam saved ✅ ${lastCodes.length} codes generated.`);show(`Exam saved ✅ ${lastCodes.length} codes generated.`)}catch(e){show(e.message,'err')}finally{$('saveGenerateBtn').disabled=false;renderHealth()}};
function formatDateTime(value){if(!value)return '-';const d=new Date(value);return Number.isNaN(d.getTime())?'-':d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function renderCodes(){
  const exam=lastExam||{};
  $('codesBox').innerHTML=lastCodes.length?`<div class="print-header codePdfHeader premiumCodesHeader">
    <div class="codesBrand">${exam.logoUrl?`<img src="${esc(exam.logoUrl)}" class="pdfLogo">`:'<div class="brandSeal">KSR</div>'}<div><h1>${esc(exam.instituteName||'Institute')}</h1><h3>${esc(exam.title||'Daily Test')} • ${esc(exam.batchName||'Batch')}</h3></div></div>
    <p class="examIdHighlight">Exam ID: <b>${esc(exam.examId||'')}</b></p>
    <div class="examInfoCards">
      <div><span>Exam Starts</span><b>${esc(formatDateTime(exam.startTime))}</b></div>
      <div><span>Login Before</span><b>${esc(formatDateTime(exam.loginBefore||exam.startTime))}</b></div>
      <div><span>Total Bits</span><b>${Number(exam.questionCount||0)}</b></div>
      <div><span>Exam Time</span><b>${Number(exam.totalMinutes||0)} Minutes</b></div>
    </div>
    <div class="loginInstructions colorfulInstructions"><h3>Student Login Instructions</h3>
      <p><b>Name:</b> మీ పేరు</p><p><b>Exam ID:</b> ${esc(exam.examId||'')} ఇవ్వండి</p>
      <p><b>Exam Code:</b> కింద ఉన్న codes లో మీకు కేటాయించిన code ఇవ్వండి</p><p><b>Phone No:</b> మీ phone number ఇవ్వండి</p>
    </div></div>
    <table class="table codesTable"><tr><th>S.No</th><th>Student Name</th><th>Exam Code</th><th>Signature</th></tr>${lastCodes.map((x,i)=>`<tr><td>${i+1}</td><td><b>${esc(x.studentName||'')}</b></td><td><b>${esc(x.code)}</b></td><td></td></tr>`).join('')}</table>`:'<p>No codes</p>'
}
$('copyCodes').onclick=async()=>{if(!lastCodes.length)return show('Codes levu.','err');await navigator.clipboard.writeText(`${lastExam.instituteName}\nExam ID: ${lastExam.examId}\n\nStudent Login:\nName: మీ పేరు\nExam ID: ${lastExam.examId}\nExam Code: కింద codes లో మీకు కేటాయించిన code\nPhone No: మీ phone number\n\nCodes:\n`+lastCodes.map(x=>x.code).join('\n'));show('Exam ID + Codes copied ✅')};
$('printCodes').onclick=()=>{if(!lastCodes.length)return show('Codes levu.','err');printSection('codesBox','Generated Exam Codes')};

$('shareWhatsapp').onclick=()=>{if(!lastExam)return show('First exam save + generate codes cheyyandi.','err');const link=location.href.replace(/dashboard\.html.*$/,'index.html');const text=`🏆 KSR Online Exams\n\nInstitute: ${lastExam.instituteName}\nBatch: ${lastExam.batchName||'-'}\nExam: ${lastExam.title}\nExam ID: ${lastExam.examId}\nStart: ${formatDateTime(lastExam.startTime)}\nLogin Before: ${formatDateTime(lastExam.loginBefore||lastExam.startTime)}\nQuestions: ${lastExam.questionCount}\nTime: ${lastExam.totalMinutes} Minutes\n\nExam Link: ${link}\nContact: 9063012104`;window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank')};

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
      <div><h1>${esc(institute)}</h1><h3>${esc(title)} • ${esc(examData?.batchName||'')}</h3><p>Exam ID: <b>${esc(publicId)}</b></p></div>
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
    <table class="table resultTable"><tr><th>Rank</th><th>Name</th><th>Batch</th><th>Exam Code</th><th>Score</th><th>Total</th></tr>${rows.map(r=>`<tr><td><b>${r.rank}</b></td><td>${esc(r.name||r.studentName||'-')}</td><td>${esc(r.batchName||examData?.batchName||'-')}</td><td>${esc(r.studentCode||r.examCode||'-')}</td><td><b>${Number(r.score||0)}</b></td><td>${Number(r.total||0)}</td></tr>`).join('')}</table>
    <div class="pdfFooter">${esc(institute)} • Generated by KSR EXAMOS • ${new Date().toLocaleString('en-IN')}</div>`;
}
function printSection(id,title){
  const el=$(id);if(!el||!el.innerHTML.trim())return show('Print cheyyadaniki data ledu.','err');
  const w=window.open('','_blank');
  w.document.write(`<html><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="style.css"><style>body{padding:24px;background:#fff}.table{width:100%;border-collapse:collapse}.table th,.table td{border:1px solid #b8c6d6;padding:8px;text-align:left}.pdfFooter{margin-top:20px;padding-top:8px;border-top:1px solid #94a3b8;text-align:center;font-size:11px;color:#475569}@page{margin:14mm}@media print{button{display:none!important}.card{box-shadow:none!important}.topRankGrid{break-inside:avoid}.resultSummaryGrid{break-inside:avoid}}</style></head><body>${el.innerHTML}<script>setTimeout(()=>window.print(),500)<\/script></body></html>`);w.document.close();
}
let allSavedExams=[],savedView='active';
$('searchExam').onclick=async()=>{await ensureExamsLoaded();renderSavedExams($('examSearch').value)};
$('loadAllExams').onclick=async()=>{await ensureExamsLoaded(true);$('examSearch').value='';renderSavedExams('')};
$('examSearch').addEventListener('keydown',e=>{if(e.key==='Enter')$('searchExam').click()});
document.querySelectorAll('.examViewBtn').forEach(b=>b.onclick=()=>{savedView=b.dataset.view;document.querySelectorAll('.examViewBtn').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderSavedExams($('examSearch').value)});
async function ensureExamsLoaded(force=false){if(allSavedExams.length&&!force)return;const snap=await getDocs(collection(db,'exams'));allSavedExams=[];snap.forEach(d=>allSavedExams.push({id:d.id,...d.data()}));allSavedExams.sort((a,b)=>Number(b.createdAt?.seconds||0)-Number(a.createdAt?.seconds||0))}
function examBucket(e){if(e.status==='deleted'||e.deletedAt)return'deleted';if(e.status==='archived'||e.archivedAt)return'archived';return'active'}
function renderSavedExams(term=''){
  const key=String(term||'').trim().toLowerCase();
  let arr=allSavedExams.filter(e=>examBucket(e)===savedView);
  if(key)arr=arr.filter(e=>[e.title,e.examId,e.examCode,e.instituteName,e.instituteCode,e.batchName].some(v=>String(v||'').toLowerCase().includes(key)));
  $('savedExams').innerHTML=arr.map(e=>{const publicId=e.examId||e.examCode||e.id;let actions='';
    if(savedView==='active')actions=`<button class="gray useResult" data-id="${esc(publicId)}">Results</button><button class="orange archiveExam" data-doc="${esc(e.id)}">Archive</button><button class="danger trashExam" data-doc="${esc(e.id)}">Delete</button>`;
    else if(savedView==='archived')actions=`<button class="green restoreExam" data-doc="${esc(e.id)}">Restore</button><button class="danger trashExam" data-doc="${esc(e.id)}">Move to Bin</button>`;
    else actions=`<button class="green restoreExam" data-doc="${esc(e.id)}">Restore</button><button class="danger permanentDeleteExam" data-doc="${esc(e.id)}" data-name="${esc(publicId)}">Delete Permanently</button>`;
    return `<div class="qcard"><b>${esc(e.title||publicId||'Exam')}</b><p>Exam ID: <b>${esc(publicId)}</b></p><p>${esc(e.instituteName||'')} ${e.batchName?'• '+esc(e.batchName):''} • Questions: ${Number(e.questionCount||0)} • Status: ${esc(e.status||'active')}</p><div class="action-row">${actions}</div></div>`}).join('')||(key?'<p class="msg warn">Matching exam dorakaledu.</p>':'<p class="msg warn">Ee section lo exams levu.</p>');
  document.querySelectorAll('.useResult').forEach(b=>b.onclick=()=>{$('resultExamId').value=b.dataset.id;document.querySelector('[data-open="resultsPanel"]')?.click();loadResults()});
  document.querySelectorAll('.archiveExam').forEach(b=>b.onclick=()=>changeExamState(b.dataset.doc,'archived'));
  document.querySelectorAll('.trashExam').forEach(b=>b.onclick=()=>changeExamState(b.dataset.doc,'deleted'));
  document.querySelectorAll('.restoreExam').forEach(b=>b.onclick=()=>changeExamState(b.dataset.doc,'active'));
  document.querySelectorAll('.permanentDeleteExam').forEach(b=>b.onclick=()=>permanentDeleteExam(b.dataset.doc,b.dataset.name));
}
async function changeExamState(docId,state){
  const labels={archived:'Archive',deleted:'Recycle Bin',active:'Restore'};
  if(!confirm(`${labels[state]} cheyyala?`))return;
  try{await updateDoc(doc(db,'exams',docId),{status:state,archivedAt:state==='archived'?serverTimestamp():null,deletedAt:state==='deleted'?serverTimestamp():null,restoredAt:state==='active'?serverTimestamp():null});allSavedExams=[];await ensureExamsLoaded(true);renderSavedExams($('examSearch').value);flash(`Exam ${labels[state]} complete ✅`)}catch(e){show(e.message,'err')}
}
async function deleteMatchingDocs(collectionName,field,value){const snap=await getDocs(collection(db,collectionName));const refs=[];snap.forEach(d=>{const x=d.data();if(x[field]===value||d.id===value)refs.push(d.ref)});for(let i=0;i<refs.length;i+=450){const wb=writeBatch(db);refs.slice(i,i+450).forEach(r=>wb.delete(r));await wb.commit()}}
async function permanentDeleteExam(docId,publicId){
  const typed=prompt(`Permanent delete kosam Exam ID type cheyyandi:\n${publicId}`);
  if(norm(typed)!==norm(publicId))return flash('Exam ID match avvaledu. Delete cancel.','err');
  if(!confirm('Exam, Questions, Codes, Results permanently delete avutayi. Continue?'))return;
  try{await deleteMatchingDocs('examQuestions','examId',docId);await deleteMatchingDocs('studentAccess','examId',docId);await deleteMatchingDocs('results','examId',docId);await deleteDoc(doc(db,'exams',docId));allSavedExams=[];await ensureExamsLoaded(true);renderSavedExams('');flash('Exam permanently deleted ✅')}catch(e){show(e.message,'err')}
}
