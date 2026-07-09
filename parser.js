export function parseBits(raw){
  const text=(raw||'').replace(/\r/g,'').trim();
  if(!text) return [];
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
  const questions=[]; let q=null;
  const qStart=/^(\d+)[\).\-\s]+(.+)/;
  const opt=/^([A-Da-d])[\).\-:\s]+(.+)/;
  function finish(){ if(q && q.text && q.options.length){ if(!q.correct) q.correct='A'; questions.push(q); } }
  for(const line0 of lines){
    let line=line0;
    const qm=line.match(qStart);
    const om=line.match(opt);
    if(qm && !om){ finish(); q={text:qm[2].trim(),options:[],correct:''}; continue; }
    if(!q){ q={text:line,options:[],correct:''}; continue; }
    if(om){
      const key=om[1].toUpperCase(); let val=om[2].trim();
      if(/[●⚫*✅✔]/.test(val)){ q.correct=key; val=val.replace(/[●⚫*✅✔]/g,'').trim(); }
      const ans=val.match(/answer\s*[:\-]\s*([A-D])/i); if(ans) q.correct=ans[1].toUpperCase();
      q.options.push({key,text:val}); continue;
    }
    const ans=line.match(/^answer\s*[:\-]\s*([A-D])/i); if(ans){ q.correct=ans[1].toUpperCase(); continue; }
    q.text += ' ' + line;
  }
  finish();
  return questions.map((x,i)=>({id:'q'+(i+1), text:x.text, options:x.options.slice(0,4), correct:x.correct||'A', marks:1}));
}
export function shuffle(arr){return [...arr].sort(()=>Math.random()-.5)}
