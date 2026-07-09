function cleanLine(x){return (x||'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();}
function normalizeAnswer(v){v=(v||'').toString().trim().toUpperCase(); if(['1','A'].includes(v))return'A'; if(['2','B'].includes(v))return'B'; if(['3','C'].includes(v))return'C'; if(['4','D'].includes(v))return'D'; return v[0]||'';}
function parseBits(raw){
  raw=(raw||'').replace(/\r/g,'').replace(/[⚫●]/g,' ● ');
  const lines=raw.split('\n').map(cleanLine).filter(Boolean);
  const qs=[]; let cur=null;
  function push(){ if(cur&&cur.question){ ['A','B','C','D'].forEach(k=>cur.options[k]=cur.options[k]||''); cur.answer=normalizeAnswer(cur.answer); qs.push(cur);} }
  for(let line of lines){
    let ans=line.match(/^(answer|ans|correct|సమాధానం)\s*[:\-]\s*([A-D1-4])/i); if(ans&&cur){cur.answer=normalizeAnswer(ans[2]);continue;}
    let q=line.match(/^\s*(\d+)[\.)\-\s]+(.+)/); let op=line.match(/^\s*([A-Da-d])\s*[\)\.\-:]\s*(.+)/);
    if(q){push(); cur={question:q[2].replace(/●|\*/g,'').trim(),options:{A:'',B:'',C:'',D:''},answer:'',marks:1}; if(/●|\*/.test(q[2]))cur.answer='A'; continue;}
    if(!cur){cur={question:line.replace(/●|\*/g,'').trim(),options:{A:'',B:'',C:'',D:''},answer:'',marks:1};continue;}
    if(op){let k=op[1].toUpperCase(); let txt=op[2]; if(/●|\*/.test(txt))cur.answer=k; cur.options[k]=txt.replace(/●|⚫|\*/g,'').trim(); continue;}
    // inline options support
    const inline=line.match(/(.+?)\s+A[\)\.\-:]\s*(.+?)\s+B[\)\.\-:]\s*(.+?)\s+C[\)\.\-:]\s*(.+?)\s+D[\)\.\-:]\s*(.+)/i);
    if(inline){cur.question += ' '+inline[1]; cur.options.A=inline[2];cur.options.B=inline[3];cur.options.C=inline[4];cur.options.D=inline[5];continue;}
    cur.question += ' '+line.replace(/●|\*/g,'').trim();
  }
  push();
  return qs.filter(q=>q.question&&Object.values(q.options).some(Boolean));
}
function uid(){return 'ksr_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)}
function load(key,def){try{return JSON.parse(localStorage.getItem(key))??def}catch(e){return def}}
function save(key,val){localStorage.setItem(key,JSON.stringify(val))}
function getExams(){return load('ksr_exams',[])}
function setExams(v){save('ksr_exams',v)}
function getResults(){return load('ksr_results',[])}
function setResults(v){save('ksr_results',v)}
