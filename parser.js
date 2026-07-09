export function parseQuestions(raw){
  raw = (raw||'').replace(/\r/g,'').trim();
  if(!raw) return [];
  let lines = raw.split('\n').map(x=>x.trim()).filter(Boolean);
  let blocks=[]; let cur=[];
  const qStart=/^(\d+\s*[\).:-]|Q\s*\d+\s*[\).:-]?)/i;
  for(const line of lines){
    if(qStart.test(line) && cur.length){blocks.push(cur);cur=[line];} else cur.push(line);
  }
  if(cur.length) blocks.push(cur);
  return blocks.map((b,i)=>parseBlock(b,i)).filter(q=>q.question && q.options.some(o=>o.text));
}
function cleanQ(s){return s.replace(/^(\d+\s*[\).:-]|Q\s*\d+\s*[\).:-]?)/i,'').trim()}
function parseBlock(lines,idx){
  let q=[]; let opts={A:'',B:'',C:'',D:''}; let ans='';
  const optRe=/^([A-D])\s*[\).:-]\s*(.*)$/i;
  for(let line of lines){
    let ansLine=line.match(/^(Answer|Ans|Correct)\s*[:\-]\s*([A-D])/i);
    if(ansLine){ans=ansLine[2].toUpperCase(); continue;}
    let m=line.match(optRe);
    if(m){
      let key=m[1].toUpperCase(); let txt=m[2].trim();
      if(/[●⚫✅✓✔]$/.test(txt) || /\*$/.test(txt)){ ans=key; txt=txt.replace(/[●⚫✅✓✔*]+$/,'').trim(); }
      opts[key]=txt; continue;
    }
    if(/[●⚫✅✓✔]$/.test(line) || /\*$/.test(line)){
      // option without A/B/C/D, ignore as question text fallback
      line=line.replace(/[●⚫✅✓✔*]+$/,'').trim();
    }
    q.push(line);
  }
  return { id:'q'+Date.now()+idx, question:cleanQ(q.join(' ')), options:['A','B','C','D'].map(k=>({key:k,text:opts[k]})), answer:ans||'A', marks:1 };
}
export function blankQuestion(){return {id:'q'+Date.now(),question:'',options:[{key:'A',text:''},{key:'B',text:''},{key:'C',text:''},{key:'D',text:''}],answer:'A',marks:1}}
