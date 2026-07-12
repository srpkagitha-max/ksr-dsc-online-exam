const MARKS = /[●⚫✅✓✔]/g;
const ROMAN_RE = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\s*[\.:\-\)]/i;
const SMALL_ROMAN_RE = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*[\.:\-\)]/;
const NUMBERED_LIST_RE = /^\d{1,3}\s*[\.:\-\)]\s*\S+/;
const PRAKATANA_RE = /^(ప్రకటన\s*\d+|Statement\s*\d+)\s*[:\.:\-]/i;
const LIST_RE = /^(జాబితా\s*-?\s*[12I]+|List\s*-?\s*[12I]+)\s*[:\.:\-]?/i;
const OPTION_RE = /^([A-D])\s*[\)\].:\-]\s*(.*)$/i;
const QUESTION_START_RE = /^[\u200B\s]*(\d{1,4})\s*[\.)]\s*(.*)$/;

export function parseQuestions(raw, defaultSubject='General'){
  raw = normalizeRaw(raw);
  if(!raw) return [];

  const lines = raw
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);

  const blocks = [];
  let current = [];

  for(const line of lines){
    const start = line.match(QUESTION_START_RE);

    if(start && current.length && shouldStartNewQuestion(current, Number(start[1]))){
      blocks.push(current);
      current = [line];
    }else{
      current.push(line);
    }
  }

  if(current.length) blocks.push(current);

  return blocks
    .map((block, index) => parseBlock(block, index, defaultSubject))
    .filter(q => q.question && q.options.some(o => o.text));
}

function shouldStartNewQuestion(currentLines, candidateNumber){
  const first = currentLines.find(Boolean) || '';
  const firstMatch = first.match(QUESTION_START_RE);
  const currentNumber = firstMatch ? Number(firstMatch[1]) : null;
  const optionCount = currentLines.filter(line => OPTION_RE.test(line)).length;

  // A genuine next question normally comes after the previous question's options.
  if(optionCount >= 2) return true;

  // Never split matching-list numbers such as 1., 2., 3., 4. inside a question.
  if(currentNumber !== null && candidateNumber <= currentNumber) return false;

  // Without options, split only for an immediately sequential question number
  // and only when the current block already has enough body text.
  return currentNumber !== null &&
    candidateNumber === currentNumber + 1 &&
    currentLines.length >= 3 &&
    !currentLines.some(line => LIST_RE.test(line));
}

function normalizeRaw(raw){
  return String(raw || '')
    .replace(/\r/g, '')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // Put question numbers and option labels on separate lines when pasted continuously.
    .replace(/(^|\s)(\d{1,4})\s*[\.)]\s+/g, '$1\n$2. ')
    .replace(/\s+([A-D])\s*[\)\].:]\s*/g, '\n$1) ')
    .replace(/\s+(జాబితా\s*-?\s*[12I]+\s*[:\.:]?)/g, '\n$1 ')
    .replace(/\s+(List\s*-?\s*[12I]+\s*[:\.:]?)/gi, '\n$1 ')
    .replace(/\s+(ప్రకటన\s*\d+\s*[:\.:\-])/g, '\n$1 ')
    .replace(/\s+(Statement\s*\d+\s*[:\.:\-])/gi, '\n$1 ')
    .replace(/\s+((?:I|II|III|IV|V|VI|VII|VIII|IX|X)\s*[\.:\)])\s+(?=[^0-9])/g, '\n$1 ')
    .trim();
}

function cleanQuestionStart(text){
  return text.replace(QUESTION_START_RE, (_, number, rest) => rest || '').trim();
}

function stripMarks(text){
  return String(text || '')
    .replace(MARKS, '')
    .replace(/\s+\*\s*$/, '')
    .trim();
}

function hasMark(text){
  MARKS.lastIndex = 0;
  const found = MARKS.test(text) || /\*\s*$/.test(text);
  MARKS.lastIndex = 0;
  return found;
}

function parseBlock(lines, index, defaultSubject){
  const questionLines = [];
  const options = {A:'', B:'', C:'', D:''};
  let answer = '';
  let currentOption = null;
  let subject = defaultSubject || 'General';

  lines.forEach((rawLine, lineIndex) => {
    let line = rawLine.trim();
    if(!line) return;

    const subjectMatch =
      line.match(/^\[?Subject\]?\s*[:\-]\s*(.+)$/i) ||
      line.match(/^విషయం\s*[:\-]\s*(.+)$/i);

    if(subjectMatch){
      subject = subjectMatch[1].trim();
      return;
    }

    const answerMatch = line.match(/^(Answer|Ans|Correct Answer|సమాధానం)\s*[:\-]\s*([A-D])/i);
    if(answerMatch){
      answer = answerMatch[2].toUpperCase();
      return;
    }

    const optionMatch = line.match(OPTION_RE);
    if(optionMatch){
      currentOption = optionMatch[1].toUpperCase();
      let text = optionMatch[2].trim();
      if(hasMark(text)){
        answer = currentOption;
        text = stripMarks(text);
      }
      options[currentOption] = text;
      return;
    }

    // Lines after an option belong to that option only when they are ordinary continuation text.
    // Statements, lists and numbered matching items stay in the question body.
    if(currentOption && !isQuestionBodyLine(line) && !QUESTION_START_RE.test(line)){
      options[currentOption] += (options[currentOption] ? ' ' : '') + stripMarks(line);
      return;
    }

    currentOption = null;
    if(hasMark(line)) line = stripMarks(line);

    const cleaned = lineIndex === 0 ? cleanQuestionStart(line) : line;
    questionLines.push(formatQuestionLine(cleaned));
  });

  return {
    id: 'q' + Date.now() + index,
    subject,
    question: compactQuestion(questionLines),
    options: ['A','B','C','D'].map(key => ({key, text: options[key] || ''})),
    answer: answer || '',
    marks: 1
  };
}

function isQuestionBodyLine(line){
  return ROMAN_RE.test(line) ||
    SMALL_ROMAN_RE.test(line) ||
    NUMBERED_LIST_RE.test(line) ||
    PRAKATANA_RE.test(line) ||
    LIST_RE.test(line) ||
    /^పై\b/.test(line) ||
    /^కింది\b/.test(line) ||
    /^సరైన/.test(line);
}

function formatQuestionLine(line){
  line = line.trim();
  if(!line) return '';

  if(
    ROMAN_RE.test(line) ||
    SMALL_ROMAN_RE.test(line) ||
    NUMBERED_LIST_RE.test(line) ||
    PRAKATANA_RE.test(line) ||
    LIST_RE.test(line) ||
    /^పై\b/.test(line) ||
    /^కింది\b/.test(line) ||
    /^సరైన/.test(line)
  ) return '\n' + line;

  return line;
}

function compactQuestion(lines){
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function blankQuestion(subject='General'){
  return {
    id:'q' + Date.now(),
    subject,
    question:'',
    options:[
      {key:'A', text:''},
      {key:'B', text:''},
      {key:'C', text:''},
      {key:'D', text:''}
    ],
    answer:'A',
    marks:1
  };
}

export function studentShuffle(questions, seedText=''){
  const bySubject = {};
  questions.forEach(q => {
    const subject = q.subject || 'General';
    (bySubject[subject] ||= []).push(q);
  });

  const random = mulberry32(hash(seedText || 'KSR'));
  let output = [];
  Object.keys(bySubject).forEach(subject => {
    output = output.concat(shuffle([...bySubject[subject]], random));
  });
  return output;
}

function shuffle(array, random){
  for(let i = array.length - 1; i > 0; i--){
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function hash(text){
  let h = 1779033703;
  for(let i = 0; i < text.length; i++){
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return h >>> 0;
}

function mulberry32(seed){
  return function(){
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
