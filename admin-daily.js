import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  collection,
  getDocs,
  getDoc,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  query,
  where,
  $,
  show,
  esc
} from './app.js';

import {
  parseQuestions,
  blankQuestion
} from './parser.js';

let user = null;
let questions = [];
let previewIndex = 0;
let lastCodes = [];
let lastExam = null;
let institutes = [];
let batches = [];
let batchStudents = [];

let __draftTimer=null,__healthTimer=null;
function scheduleDraftSave(){clearTimeout(__draftTimer);__draftTimer=setTimeout(saveDraft,350)}
function scheduleHealth(){clearTimeout(__healthTimer);__healthTimer=setTimeout(renderHealth,120)}

const norm = value =>
  String(value || '')
    .trim()
    .toUpperCase();

function flash(message, type = 'ok') {
  let box = document.getElementById('floatingNotice');

  if (!box) {
    box = document.createElement('div');
    box.id = 'floatingNotice';
    document.body.appendChild(box);
  }

  box.className = `floatingNotice ${type}`;
  box.textContent = message;
  box.hidden = false;

  clearTimeout(window.__ksrNoticeTimer);

  window.__ksrNoticeTimer = setTimeout(() => {
    box.hidden = true;
  }, 2600);
}

onAuthStateChanged(auth, u => {
  if (!u) {
    location.href = 'login.html';
    return;
  }

  user = u;
  setDefaultTimes();
  loadMasters();
  clearCreateForm(false);
});

$('logout').onclick = () => signOut(auth);

$('instituteId').onchange = async () => {
  batchStudents = [];
  renderBatchOptions();
  syncInstituteName();
  updateCodeCount();
  await loadBatchStudents();
  saveDraft();
};

$('batchId').onchange = async () => {
  batchStudents = [];
  updateCodeCount();
  await loadBatchStudents();
  saveDraft();
};

function setDefaultTimes() {
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const formatDate = d => {
    const two = n => String(n).padStart(2, '0');

    return (
      `${d.getFullYear()}-` +
      `${two(d.getMonth() + 1)}-` +
      `${two(d.getDate())}T` +
      `${two(d.getHours())}:` +
      `${two(d.getMinutes())}`
    );
  };

  $('startTime').value = formatDate(now);
  $('endTime').value = formatDate(end);
}

function clearCreateForm(showNotice = true) {
  questions = [];
  previewIndex = 0;

  [
    'examId',
    'examTitle',
    'loginBefore',
    'rawBits'
  ].forEach(id => {
    if ($(id)) {
      $(id).value = '';
    }
  });

  if ($('backupCodeCount')) $('backupCodeCount').value = '10';
  updateCodeCount();

  if ($('secondsPerQuestion')) {
    $('secondsPerQuestion').value = '60';
  }

  if ($('status')) {
    $('status').value = 'active';
  }

  setDefaultTimes();

  if ($('questionEditor')) {
    $('questionEditor').innerHTML = '';
    $('questionEditor').dataset.open = '0';
  }

  if ($('parseBtn')) {
    $('parseBtn').textContent = 'Parse Questions';
  }

  if ($('previewCard')) {
    $('previewCard').hidden = true;
  }

  renderHealth();

  if (showNotice) {
    flash('Fresh exam form ready ✅');
  }
}

window.addEventListener('ksr:new-exam', () => {
  clearCreateForm(false);
});

$('clearExamFormBtn')?.addEventListener('click', () => {
  if (confirm('Current form clear cheyyala?')) {
    localStorage.removeItem(DRAFT_KEY);
    clearCreateForm(true);
  }
});

$('recoverDraftBtn')?.addEventListener('click', () => {
  restoreDraft(true);
});

$('examId').addEventListener('input', () => {
  $('examId').value = norm($('examId').value).replace(/\s+/g, '-');
  saveDraft();
});

[
  'examTitle',
  'startTime',
  'endTime',
  'loginBefore',
  'secondsPerQuestion',
  'status',
  'qbSubject',
  'qbClass',
  'qbLesson',
  'rawBits'
].forEach(id => {
  $(id)?.addEventListener('input', scheduleDraftSave);
});
$('backupCodeCount')?.addEventListener('input', () => {
  updateCodeCount();
  scheduleDraftSave();
});

async function loadMasters() {
  try {
    const [instituteSnapshot, batchSnapshot] = await Promise.all([
      getDocs(collection(db, 'institutes')),
      getDocs(collection(db, 'batches'))
    ]);

    institutes = [];
    batches = [];

    instituteSnapshot.forEach(documentSnapshot => {
      institutes.push({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      });
    });

    batchSnapshot.forEach(documentSnapshot => {
      batches.push({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      });
    });

    institutes.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''))
    );

    $('instituteId').innerHTML = institutes
      .map(
        institute =>
          `<option value="${institute.id}">${esc(
            institute.name || 'Institute'
          )}</option>`
      )
      .join('');

    renderBatchOptions();
    syncInstituteName();
    await loadBatchStudents();
  } catch (error) {
    show('Institute/Batch load avvaledu: ' + error.message, 'err');
  }
}

function renderBatchOptions() {
  const instituteId = $('instituteId').value;

  const filteredBatches = batches.filter(
    batch => batch.instituteId === instituteId
  );

  $('batchId').innerHTML = filteredBatches
    .map(
      batch =>
        `<option value="${batch.id}">${esc(
          batch.name || 'Batch'
        )}</option>`
    )
    .join('');
  batchStudents = [];
  updateCodeCount();
}

function updateCodeCount(){
  const activeCount = batchStudents.length;
  const backupCount = Math.max(0, Math.min(100, Number($('backupCodeCount')?.value || 10)));
  if ($('activeStudentCount')) $('activeStudentCount').value = activeCount;
  if ($('codeCount')) $('codeCount').value = activeCount + backupCount;
}

function syncInstituteName() {
  const selectedInstitute = institutes.find(
    institute => institute.id === $('instituteId').value
  );

  $('instituteName').value = selectedInstitute?.name || '';
}

async function loadBatchStudents() {
  const instituteId = $('instituteId').value;
  const batchId = $('batchId').value;
  batchStudents = [];
  updateCodeCount();
  if (!instituteId || !batchId) return;
  try {
    const snapshot = await getDocs(query(collection(db, 'studentMaster'), where('batchId', '==', batchId)));
    snapshot.forEach(documentSnapshot => {
      const data = documentSnapshot.data();
      const sameInstitute = !data.instituteId || data.instituteId === instituteId;
      if (sameInstitute && data.active !== false) batchStudents.push({ id: documentSnapshot.id, ...data });
    });
    batchStudents.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    updateCodeCount();
    flash(`${batchStudents.length} active students loaded + ${Number($('backupCodeCount')?.value || 10)} backup codes`);
  } catch (error) {
    updateCodeCount();
    show('Students load avvaledu: ' + error.message, 'err');
  }
}

const DRAFT_KEY = 'ksrDailyV5Draft';

function saveDraft() {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        instituteId: $('instituteId')?.value,
        batchId: $('batchId')?.value,
        examId: $('examId')?.value,
        examTitle: $('examTitle')?.value,
        codeCount: $('codeCount')?.value,
        backupCodeCount: $('backupCodeCount')?.value,
        startTime: $('startTime')?.value,
        endTime: $('endTime')?.value,
        loginBefore: $('loginBefore')?.value,
        secondsPerQuestion: $('secondsPerQuestion')?.value,
        status: $('status')?.value,
        qbSubject: $('qbSubject')?.value,
        qbClass: $('qbClass')?.value,
        qbLesson: $('qbLesson')?.value,
        rawBits: $('rawBits')?.value,
        questions
      })
    );
  } catch (error) {
    console.error('Draft save error:', error);
  }
}

function restoreDraft(notify = true) {
  try {
    const draft = JSON.parse(
      localStorage.getItem(DRAFT_KEY) || 'null'
    );

    if (!draft) {
      if (notify) {
        flash('Saved draft ledu.', 'err');
      }

      return;
    }

    [
      'examId',
      'examTitle',
      'backupCodeCount',
      'startTime',
      'endTime',
      'loginBefore',
      'secondsPerQuestion',
      'status',
      'qbSubject',
      'qbClass',
      'qbLesson',
      'rawBits'
    ].forEach(id => {
      if (draft[id] != null && $(id)) {
        $(id).value = draft[id];
      }
    });

    if (Array.isArray(draft.questions) && draft.questions.length) {
      questions = draft.questions;
      renderHealth();
    }

    if (notify) {
      flash('Previous draft restored ✅', 'ok');
    }
  } catch (error) {
    if (notify) {
      flash('Draft restore avvaledu.', 'err');
    }
  }
}

$('parseBtn').onclick = () => {
  const editor = $('questionEditor');

  if (editor.dataset.open === '1') {
    sync();

    $('rawBits').value = questionsToText(questions);

    editor.innerHTML = '';
    editor.dataset.open = '0';

    $('parseBtn').textContent = 'Parse Questions';

    flash(`${questions.length} questions edits saved ✅`);

    saveDraft();
    renderHealth();

    return;
  }

  const parsed = parseQuestions(
    $('rawBits').value,
    'General'
  );

  if (!parsed.length) {
    return show(
      'Questions detect avvaledu. Format check cheyyandi.',
      'err'
    );
  }

  questions = parsed;

  renderEditor();

  editor.dataset.open = '1';
  $('parseBtn').textContent = 'Save Edits & Close';

  flash(`${parsed.length} questions detected ✅`);

  saveDraft();
};

function questionsToText(list) {
  return list
    .map(
      (question, index) =>
        `${index + 1}. ${question.question}\n` +
        question.options
          .map(
            option =>
              `${option.key}) ${option.text}${
                question.answer === option.key ? ' ●' : ''
              }`
          )
          .join('\n')
    )
    .join('\n\n');
}

$('addQuestionBtn').onclick = () => {
  questions.push(blankQuestion('General'));

  renderEditor();

  $('questionEditor').dataset.open = '1';
  $('parseBtn').textContent = 'Save Edits & Close';

  flash(`Question ${questions.length} added ✅`);
};

function validate() {
  const issues = [];

  questions.forEach((question, index) => {
    if (!String(question.question || '').trim()) {
      issues.push(`Q${index + 1}: Question missing`);
    }

    const filledOptions = question.options.filter(option =>
      String(option.text || '').trim()
    ).length;

    if (filledOptions < 4) {
      issues.push(
        `Q${index + 1}: ${4 - filledOptions} option(s) missing`
      );
    }

    if (!['A', 'B', 'C', 'D'].includes(question.answer)) {
      issues.push(`Q${index + 1}: Correct answer missing`);
    }
  });

  const seen = new Map();

  questions.forEach((question, index) => {
    const key = String(question.question || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    if (key && seen.has(key)) {
      issues.push(
        `Q${index + 1}: Duplicate of Q${seen.get(key) + 1}`
      );
    } else {
      seen.set(key, index);
    }
  });

  return issues;
}

function renderHealth() {
  const issues = validate();

  $('health').innerHTML = `
    <b>Exam Health</b>

    <div class="health-grid">
      <span>
        Questions:
        <b>${questions.length}</b>
      </span>

      <span>
        Issues:
        <b>${issues.length}</b>
      </span>

      <span>
        Status:
        <b class="${issues.length ? 'badText' : 'goodText'}">
          ${
            questions.length && !issues.length
              ? 'READY'
              : 'CHECK REQUIRED'
          }
        </b>
      </span>
    </div>

    ${
      issues.length
        ? `
          <details>
            <summary>View Issues</summary>

            <div class="issue-list">
              ${issues
                .map(issue => `<div>${esc(issue)}</div>`)
                .join('')}
            </div>
          </details>
        `
        : ''
    }
  `;

  $('saveGenerateBtn').disabled =
    !questions.length || Boolean(issues.length);
}

function renderEditor() {
  $('questionEditor').dataset.open = '1';

  $('questionEditor').innerHTML = questions
    .map(
      (question, index) => `
        <div class="qcard">
          <div class="qhead">
            <b>Q${index + 1}</b>

            <div>
              <button
                class="gray moveUp"
                data-i="${index}"
              >
                ↑
              </button>

              <button
                class="gray moveDown"
                data-i="${index}"
              >
                ↓
              </button>

              <button
                class="danger deleteQ"
                data-i="${index}"
              >
                Delete
              </button>
            </div>
          </div>

          <label>Question</label>

          <textarea
            class="editQ"
            data-i="${index}"
          >${esc(question.question)}</textarea>

          <div class="grid two">
            ${question.options
              .map(
                (option, optionIndex) => `
                  <div>
                    <label>${option.key}) Option</label>

                    <input
                      class="editOpt"
                      data-i="${index}"
                      data-j="${optionIndex}"
                      value="${esc(option.text)}"
                    >
                  </div>
                `
              )
              .join('')}
          </div>

          <label>Correct Answer</label>

          <select
            class="editAns"
            data-i="${index}"
          >
            ${['A', 'B', 'C', 'D']
              .map(
                key =>
                  `<option ${
                    question.answer === key ? 'selected' : ''
                  }>${key}</option>`
              )
              .join('')}
          </select>
        </div>
      `
    )
    .join('');

  bindEditor();
  renderHealth();
}

function sync() {
  document.querySelectorAll('.editQ').forEach(element => {
    questions[Number(element.dataset.i)].question =
      element.value;
  });

  document.querySelectorAll('.editOpt').forEach(element => {
    questions[Number(element.dataset.i)].options[
      Number(element.dataset.j)
    ].text = element.value;
  });

  document.querySelectorAll('.editAns').forEach(element => {
    questions[Number(element.dataset.i)].answer =
      element.value;
  });

  scheduleDraftSave();
}

function bindEditor() {
  document
    .querySelectorAll('.editQ,.editOpt,.editAns')
    .forEach(element => {
      element.oninput = () => {
        sync();
        scheduleHealth();
      };
    });

  document.querySelectorAll('.deleteQ').forEach(button => {
    button.onclick = () => {
      questions.splice(Number(button.dataset.i), 1);
      renderEditor();
    };
  });

  document.querySelectorAll('.moveUp').forEach(button => {
    button.onclick = () => {
      sync();

      const index = Number(button.dataset.i);

      if (index > 0) {
        [questions[index - 1], questions[index]] = [
          questions[index],
          questions[index - 1]
        ];
      }

      renderEditor();
    };
  });

  document.querySelectorAll('.moveDown').forEach(button => {
    button.onclick = () => {
      sync();

      const index = Number(button.dataset.i);

      if (index < questions.length - 1) {
        [questions[index + 1], questions[index]] = [
          questions[index],
          questions[index + 1]
        ];
      }

      renderEditor();
    };
  });
}

$('previewBtn').onclick = () => {
  sync();

  if (!questions.length) {
    return show('Preview ki questions levu.', 'err');
  }

  previewIndex = 0;

  $('previewCard').hidden = false;

  renderPreview();

  location.hash = 'previewCard';
};

function renderPreview() {
  const question = questions[previewIndex];

  $('previewTitle').textContent =
    $('examTitle').value.trim() ||
    $('examId').value.trim() ||
    'Exam Preview';

  $('previewTimer').textContent =
    `${$('secondsPerQuestion').value || 60} sec / Q`;

  $('previewContent').innerHTML = `
    <div class="questionText">
      <b>
        Question ${previewIndex + 1} of ${questions.length}
      </b>

      <h3>
        ${esc(question.question).replace(/\n/g, '<br>')}
      </h3>
    </div>

    ${question.options
      .map(
        option => `
          <label class="optionCard">
            <input
              type="radio"
              name="previewAnswer"
            >

            <b>${option.key}</b>

            <span>${esc(option.text)}</span>
          </label>
        `
      )
      .join('')}

    <div class="controls">
      <button
        class="gray"
        id="pPrev"
      >
        Previous
      </button>

      <button
        class="green"
        id="pNext"
      >
        Save & Next
      </button>
    </div>
  `;

  $('previewNav').innerHTML = questions
    .map(
      (_, index) => `
        <button
          class="pbtn ${
            index === previewIndex ? 'cur' : 'not'
          }"
          data-p="${index}"
        >
          ${index + 1}
        </button>
      `
    )
    .join('');

  document.querySelectorAll('[data-p]').forEach(button => {
    button.onclick = () => {
      previewIndex = Number(button.dataset.p);
      renderPreview();
    };
  });

  $('pPrev').onclick = () => {
    if (previewIndex > 0) {
      previewIndex--;
      renderPreview();
    }
  };

  $('pNext').onclick = () => {
    if (previewIndex < questions.length - 1) {
      previewIndex++;
      renderPreview();
    }
  };
}

function makeCode(examId, index) {
  const characters =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let randomPart = '';

  for (let i = 0; i < 6; i++) {
    randomPart +=
      characters[
        Math.floor(Math.random() * characters.length)
      ];
  }

  return (
    `${examId}-` +
    `${String(index + 1).padStart(3, '0')}-` +
    `${randomPart}`
  );
}

function bankFolder(value) {
  return String(value || '').trim() || 'General';
}

function bankHash(text) {
  let hash = 2166136261;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function bankQuestionId(question) {
  return (
    'QB-' +
    bankHash(
      [
        question.question,
        ...question.options.map(option => option.text),
        question.answer
      ]
        .join('|')
        .toLowerCase()
        .replace(/\s+/g, ' ')
    )
  );
}

async function saveQuestionsToBank(sourceExamId = '') {
  sync();

  const issues = validate();

  if (!questions.length || issues.length) {
    throw new Error(
      'Question Bank save mundu question issues fix cheyyandi.'
    );
  }

  const subject = bankFolder($('qbSubject')?.value);
  const className = bankFolder($('qbClass')?.value);
  const lesson = bankFolder($('qbLesson')?.value);

  for (
    let startIndex = 0;
    startIndex < questions.length;
    startIndex += 450
  ) {
    const batch = writeBatch(db);

    questions
      .slice(startIndex, startIndex + 450)
      .forEach(question => {
        batch.set(
          doc(
            db,
            'questionBank',
            bankQuestionId(question)
          ),
          {
            ...question,
            subject,
            className,
            lesson,
            sourceExamId,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
          },
          {
            merge: true
          }
        );
      });

    await batch.commit();
  }

  return questions.length;
}

$('saveToBankBtn')?.addEventListener(
  'click',
  async () => {
    try {
      const count = await saveQuestionsToBank(
        norm($('examId')?.value)
      );

      flash(
        `${count} questions Question Bank lo saved ✅`
      );
    } catch (error) {
      show(error.message, 'err');
    }
  }
);

$('openBankBtn')?.addEventListener('click', () => {
  $('bankPicker').hidden = false;

  $('bankSubjectFilter').value =
    $('qbSubject')?.value || '';

  $('bankClassFilter').value =
    $('qbClass')?.value || '';

  $('bankLessonFilter').value =
    $('qbLesson')?.value || '';

  $('bankPicker').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
});

$('closeBankBtn')?.addEventListener('click', () => {
  $('bankPicker').hidden = true;
});

let loadedBankQuestions = [];

$('loadBankBtn')?.addEventListener(
  'click',
  async () => {
    try {
      const snapshot = await getDocs(
        collection(db, 'questionBank')
      );

      loadedBankQuestions = [];

      const subjectFilter = String(
        $('bankSubjectFilter').value || ''
      )
        .trim()
        .toLowerCase();

      const classFilter = String(
        $('bankClassFilter').value || ''
      )
        .trim()
        .toLowerCase();

      const lessonFilter = String(
        $('bankLessonFilter').value || ''
      )
        .trim()
        .toLowerCase();

      snapshot.forEach(documentSnapshot => {
        const question = {
          id: documentSnapshot.id,
          ...documentSnapshot.data()
        };

        const matchesSubject =
          !subjectFilter ||
          String(question.subject || '')
            .toLowerCase()
            .includes(subjectFilter);

        const matchesClass =
          !classFilter ||
          String(question.className || '')
            .toLowerCase()
            .includes(classFilter);

        const matchesLesson =
          !lessonFilter ||
          String(question.lesson || '')
            .toLowerCase()
            .includes(lessonFilter);

        if (
          matchesSubject &&
          matchesClass &&
          matchesLesson
        ) {
          loadedBankQuestions.push(question);
        }
      });

      $('bankPickerList').innerHTML =
        loadedBankQuestions.length
          ? loadedBankQuestions
              .map(
                (question, index) => `
                  <label class="bankQuestionRow">
                    <input
                      type="checkbox"
                      class="bankPick"
                      value="${esc(question.id)}"
                    >

                    <span>
                      <b>
                        ${index + 1}.
                        ${esc(question.question || '')}
                      </b>

                      <small>
                        ${esc(
                          question.subject || 'General'
                        )}
                        →
                        ${esc(
                          question.className || 'General'
                        )}
                        →
                        ${esc(
                          question.lesson || 'General'
                        )}
                      </small>
                    </span>
                  </label>
                `
              )
              .join('')
          : '<p class="msg warn">Matching questions levu.</p>';

      flash(
        `${loadedBankQuestions.length} bank questions loaded`
      );
    } catch (error) {
      show(error.message, 'err');
    }
  }
);

$('addSelectedBankBtn')?.addEventListener(
  'click',
  () => {
    const selectedIds = [
      ...document.querySelectorAll('.bankPick:checked')
    ].map(element => element.value);

    const selectedQuestions =
      loadedBankQuestions.filter(question =>
        selectedIds.includes(question.id)
      );

    if (!selectedQuestions.length) {
      return show(
        'Bank nundi questions select cheyyandi.',
        'err'
      );
    }

    const existingQuestions = new Set(
      questions.map(question =>
        String(question.question || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim()
      )
    );

    let added = 0;

    selectedQuestions.forEach(question => {
      const key = String(question.question || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

      if (!existingQuestions.has(key)) {
        questions.push({
          question: question.question,
          options: question.options,
          answer: question.answer,
          subject: question.subject || 'General'
        });

        existingQuestions.add(key);
        added++;
      }
    });

    $('rawBits').value = questionsToText(questions);

    renderHealth();
    saveDraft();

    $('bankPicker').hidden = true;

    flash(`${added} questions exam ki added ✅`);
  }
);

/* =========================================================
   SAVE EXAM + GENERATE CODES
   Existing Exam ID unte confirmation vastundi.
   OK press chesthe existing exam update avutundi.
========================================================= */

$('saveGenerateBtn').onclick = async () => {
  sync();

  const instituteId = $('instituteId').value;
  const batchId = $('batchId').value;

  const instituteName =
    $('instituteName').value.trim();

  const batchName =
    batches.find(batch => batch.id === batchId)?.name ||
    '';

  const examPublicId = norm($('examId').value);

  const title =
    $('examTitle').value.trim() || examPublicId;

  const start = $('startTime').value;
  const end = $('endTime').value;

  const loginBefore =
    $('loginBefore').value || start;

  const seconds = Math.max(
    5,
    Number($('secondsPerQuestion').value || 60)
  );

  const backupCount = Math.max(
    0,
    Math.min(100, Number($('backupCodeCount')?.value || 10))
  );
  const count = Math.min(1000, batchStudents.length + backupCount);

  const issues = validate();

  if (
    !instituteId ||
    !batchId ||
    !instituteName ||
    !examPublicId ||
    !start ||
    !end
  ) {
    return show(
      'Institute, Batch, Exam ID, Start Time, End Time enter cheyyandi.',
      'err'
    );
  }

  if (Date.parse(end) <= Date.parse(start)) {
    return show(
      'End Time, Start Time తర్వాత ఉండాలి.',
      'err'
    );
  }

  if (issues.length || !questions.length) {
    return show(
      'Questions lo issues fix cheyyandi.',
      'err'
    );
  }

  const selectedBatch = batches.find(batch => batch.id === batchId);
  if (!selectedBatch || selectedBatch.instituteId !== instituteId) {
    return show('Selected Batch ee Institute ki sambandhinchindi kaadu. Institute/Batch malli select cheyyandi.', 'err');
  }

  await loadBatchStudents();
  const freshBatchId = $('batchId').value;
  const freshInstituteId = $('instituteId').value;
  if (freshBatchId !== batchId || freshInstituteId !== instituteId) {
    return show('Institute/Batch selection marindi. Malli Save + Generate Codes nokkandi.', 'err');
  }

  $('saveGenerateBtn').disabled = true;

  try {
    const examRef = doc(
      db,
      'exams',
      examPublicId
    );

    const oldExamSnapshot = await getDoc(examRef);

    let isUpdatingExistingExam = false;

    if (oldExamSnapshot.exists()) {
      const overwriteConfirmed = confirm(
        `Exam ID "${examPublicId}" database lo already undi.\n\nExisting exam ni update cheyyala?\n\nOK = Update\nCancel = Save Cancel`
      );

      if (!overwriteConfirmed) {
        show(
          'Exam save cancel chesaru. Vere Exam ID use cheyyandi.',
          'err'
        );

        return;
      }

      isUpdatingExistingExam = true;
    }

    const totalSeconds =
      seconds * questions.length;

    const selectedInstitute =
      institutes.find(
        institute =>
          institute.id === instituteId
      );

    const existingCreatedAt =
      oldExamSnapshot.exists()
        ? oldExamSnapshot.data().createdAt
        : null;

    await setDoc(
      examRef,
      {
        instituteId,
        batchId,
        batchName,
        instituteName,

        logoUrl:
          selectedInstitute?.logoUrl || '',

        instituteCode: instituteName,

        title,

        examId: examPublicId,
        examCode: examPublicId,

        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),

        loginBefore: new Date(
          loginBefore
        ).toISOString(),

        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),

        secondsPerQuestion: seconds,

        totalMinutes: Math.ceil(
          totalSeconds / 60
        ),

        status: $('status').value,

        questionCount: questions.length,

        allowPrevious: true,
        shuffleQuestions: false,
        shuffleOptions: false,

        createdBy:
          user?.email || 'admin',

        createdAt:
          existingCreatedAt ||
          serverTimestamp(),

        updatedAt: serverTimestamp()
      },
      {
        merge: true
      }
    );

    await setDoc(
      doc(
        db,
        'examQuestions',
        examPublicId
      ),
      {
        examId: examPublicId,
        questions,
        questionCount: questions.length,
        updatedAt: serverTimestamp()
      },
      {
        merge: true
      }
    );

    await saveQuestionsToBank(
      examPublicId
    );

    /*
      Existing Exam update chesthe mundu codes delete cheyyadam ledu.
      Kotha codes generate chestundi.
    */

    lastCodes = [];

    const selectedStudents = batchStudents.map(student => ({ ...student, isBackup: false }));
    for (let i = 0; i < backupCount; i++) {
      selectedStudents.push({
        name: `Backup-${String(i + 1).padStart(2, '0')}`,
        roll: '',
        id: '',
        isBackup: true
      });
    }

    for (
      let startIndex = 0;
      startIndex < selectedStudents.length;
      startIndex += 450
    ) {
      const batch = writeBatch(db);

      const chunk = selectedStudents.slice(
        startIndex,
        startIndex + 450
      );

      chunk.forEach((student, chunkIndex) => {
        const index =
          startIndex + chunkIndex;

        const code = makeCode(
          examPublicId,
          index
        );

        const accessRef = doc(
          db,
          'studentAccess',
          code
        );

        batch.set(accessRef, {
          examId: examPublicId,
          examPublicId,

          instituteId,
          batchId,
          batchName,

          studentMasterId:
            student.id || '',

          assignedName:
            student.isBackup ? '' : (student.name || ''),

          studentName: '',

          roll:
            student.roll || '',

          code,

          status: 'unused',

          mobile: '',
          isBackup: Boolean(student.isBackup),

          createdAt: serverTimestamp()
        });

        lastCodes.push({
          id: accessRef.id,
          code,
          status: 'unused',

          studentName:
            student.isBackup ? `Backup-${String(index - batchStudents.length + 1).padStart(2, '0')}` : (student.name || ''),

          roll:
            student.roll || ''
        });
      });

      await batch.commit();
    }

    lastExam = {
      docId: examPublicId,
      examId: examPublicId,
      title,

      instituteId,
      batchId,
      batchName,
      instituteName,

      logoUrl:
        selectedInstitute?.logoUrl || '',

      startTime:
        new Date(start).toISOString(),

      endTime:
        new Date(end).toISOString(),

      loginBefore:
        new Date(loginBefore).toISOString(),

      secondsPerQuestion: seconds,

      questionCount: questions.length,

      totalMinutes:
        Math.ceil(totalSeconds / 60)
    };

    $('resultExamId').value =
      examPublicId;

    renderCodes();

    localStorage.removeItem(DRAFT_KEY);

    if (isUpdatingExistingExam) {
      flash(
        `Exam updated ✅ ${lastCodes.length} codes generated.`
      );

      show(
        `Exam updated successfully ✅ ${lastCodes.length} codes generated.`
      );
    } else {
      flash(
        `Exam saved ✅ ${lastCodes.length} codes generated.`
      );

      show(
        `Exam saved successfully ✅ ${lastCodes.length} codes generated.`
      );
    }
  } catch (error) {
    console.error('Exam save error:', error);

    show(
      `Exam save avvaledu: ${error.message}`,
      'err'
    );
  } finally {
    $('saveGenerateBtn').disabled = false;
    renderHealth();
  }
};

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderCodes() {
  const exam = lastExam || {};

  $('codesBox').innerHTML = lastCodes.length
    ? `
      <div class="print-header codePdfHeader premiumCodesHeader">
        <div class="codesBrand">
          ${
            exam.logoUrl
              ? `
                <img
                  src="${esc(exam.logoUrl)}"
                  class="pdfLogo"
                >
              `
              : '<div class="brandSeal">KSR</div>'
          }

          <div>
            <h1>
              ${esc(
                exam.instituteName || 'Institute'
              )}
            </h1>

            <h3>
              ${esc(exam.title || 'Daily Test')}
              •
              ${esc(exam.batchName || 'Batch')}
            </h3>
          </div>
        </div>

        <p class="examIdHighlight">
          Exam ID:
          <b>${esc(exam.examId || '')}</b>
        </p>

        <div class="examInfoCards">
          <div>
            <span>Exam Starts</span>
            <b>
              ${esc(
                formatDateTime(exam.startTime)
              )}
            </b>
          </div>

          <div>
            <span>Login Before</span>
            <b>
              ${esc(
                formatDateTime(
                  exam.loginBefore ||
                  exam.startTime
                )
              )}
            </b>
          </div>

          <div>
            <span>Total Bits</span>
            <b>
              ${Number(
                exam.questionCount || 0
              )}
            </b>
          </div>

          <div>
            <span>Exam Time</span>
            <b>
              ${Number(
                exam.totalMinutes || 0
              )}
              Minutes
            </b>
          </div>
        </div>

        <div class="loginInstructions colorfulInstructions">
          <h3>Student Login Instructions</h3>

          <p>
            <b>Name:</b>
            మీ పేరు
          </p>

          <p>
            <b>Exam ID:</b>
            ${esc(exam.examId || '')}
            ఇవ్వండి
          </p>

          <p>
            <b>Exam Code:</b>
            కింద ఉన్న codes లో మీకు కేటాయించిన code ఇవ్వండి
          </p>

          <p>
            <b>Phone No:</b>
            మీ phone number ఇవ్వండి
          </p>
        </div>
      </div>

      <table class="table codesTable">
        <tr>
          <th>S.No</th>
          <th>Student Name</th>
          <th>Exam Code</th>
          <th>Signature</th>
        </tr>

        ${lastCodes
          .map(
            (codeData, index) => `
              <tr>
                <td>${index + 1}</td>

                <td>
                  <b>
                    ${esc(
                      codeData.studentName || ''
                    )}
                  </b>
                </td>

                <td>
                  <b>${esc(codeData.code)}</b>
                </td>

                <td></td>
              </tr>
            `
          )
          .join('')}
      </table>
    `
    : '<p>No codes</p>';
}

$('copyCodes').onclick = async () => {
  if (!lastCodes.length) {
    return show('Codes levu.', 'err');
  }

  await navigator.clipboard.writeText(
    `${lastExam.instituteName}\n` +
    `Exam ID: ${lastExam.examId}\n\n` +
    `Student Login:\n` +
    `Name: మీ పేరు\n` +
    `Exam ID: ${lastExam.examId}\n` +
    `Exam Code: కింద codes లో మీకు కేటాయించిన code\n` +
    `Phone No: మీ phone number\n\n` +
    `Codes:\n` +
    lastCodes
      .map(codeData => codeData.code)
      .join('\n')
  );

  show('Exam ID + Codes copied ✅');
};

$('printCodes').onclick = () => {
  if (!lastCodes.length) {
    return show('Codes levu.', 'err');
  }

  printSection(
    'codesBox',
    'Generated Exam Codes'
  );
};

$('shareWhatsapp').onclick = () => {
  if (!lastExam) {
    return show(
      'First exam save + generate codes cheyyandi.',
      'err'
    );
  }

  const link = location.href.replace(
    /dashboard\.html.*$/,
    'index.html'
  );

  const text =
    `🏆 KSR Online Exams\n\n` +
    `Institute: ${lastExam.instituteName}\n` +
    `Batch: ${lastExam.batchName || '-'}\n` +
    `Exam: ${lastExam.title}\n` +
    `Exam ID: ${lastExam.examId}\n` +
    `Start: ${formatDateTime(
      lastExam.startTime
    )}\n` +
    `Login Before: ${formatDateTime(
      lastExam.loginBefore ||
      lastExam.startTime
    )}\n` +
    `Questions: ${lastExam.questionCount}\n` +
    `Time: ${lastExam.totalMinutes} Minutes\n\n` +
    `Exam Link: ${link}\n` +
    `Contact: 9063012104`;

  window.open(
    'https://wa.me/?text=' +
      encodeURIComponent(text),
    '_blank'
  );
};

$('loadResults').onclick = loadResults;

$('printResults').onclick = () => {
  printSection(
    'resultsBox',
    'Exam Results & Ranks'
  );
};

async function loadResults() {
  const publicId = norm(
    $('resultExamId').value
  );

  if (!publicId) {
    return show(
      'Results kosam Exam ID enter cheyyandi.',
      'err'
    );
  }

  let examDocId = '';
  let examData = null;

  const examSnapshot = await getDocs(
    collection(db, 'exams')
  );

  examSnapshot.forEach(documentSnapshot => {
    const data = documentSnapshot.data();

    if (
      norm(data.examId || data.examCode) ===
      publicId
    ) {
      examDocId = documentSnapshot.id;

      examData = {
        id: documentSnapshot.id,
        ...data
      };
    }
  });

  if (!examDocId) {
    return show(
      'Exam ID dorakaledu.',
      'err'
    );
  }

  const resultSnapshot = await getDocs(
    collection(db, 'results')
  );

  let rows = [];

  resultSnapshot.forEach(documentSnapshot => {
    const result = documentSnapshot.data();
    const resultDocId = norm(documentSnapshot.id);

    const possibleExamIds = [
      result.examId,
      result.examPublicId,
      result.examCode,
      result.publicExamId,
      result.exam?.id,
      result.exam?.examId,
      result.accessId
    ].map(norm).filter(Boolean);

    const matchesExam =
      possibleExamIds.includes(norm(examDocId)) ||
      possibleExamIds.includes(publicId) ||
      resultDocId === publicId ||
      resultDocId.startsWith(publicId + '_') ||
      resultDocId.startsWith(publicId + '-') ||
      resultDocId.includes('_' + publicId + '_');

    if (matchesExam) {
      rows.push({
        id: documentSnapshot.id,
        ...result,
        name: result.name || result.studentName || result.assignedName || result.student?.name || '-',
        studentName: result.studentName || result.name || result.assignedName || result.student?.name || '-',
        studentCode: result.studentCode || result.examCode || result.accessId || result.code || '-',
        examCode: result.examCode || result.studentCode || result.accessId || result.code || '-',
        batchName: result.batchName || examData?.batchName || '-',
        totalTime: Number(result.totalTime || result.timeTaken || result.durationSeconds || 0),
        score: Number(result.score || result.marks || result.obtainedMarks || 0),
        total: Number(result.total || result.totalMarks || result.questionCount || examData?.questionCount || 0)
      });
    }
  });

  rows.sort(
    (a, b) =>
      Number(b.score || 0) -
        Number(a.score || 0) ||
      (Number(a.totalTime) || 999999) -
        (Number(b.totalTime) || 999999) ||
      String(a.name || '').localeCompare(
        String(b.name || '')
      )
  );

  let rank = 0;
  let lastScore = null;

  rows = rows.map((result, index) => {
    if (Number(result.score) !== lastScore) {
      rank = index + 1;
    }

    lastScore = Number(result.score);

    return {
      ...result,
      rank
    };
  });

  if (!rows.length) {
    $('resultsBox').innerHTML =
      '<p class="msg warn">No results yet.</p>';

    return;
  }

  const participants = rows.length;

  const highest = Math.max(
    ...rows.map(result =>
      Number(result.score || 0)
    )
  );

  const totalMarks = Math.max(
    ...rows.map(result =>
      Number(result.total || 0)
    ),
    0
  );

  const average = (
    rows.reduce(
      (total, result) =>
        total + Number(result.score || 0),
      0
    ) / participants
  ).toFixed(2);

  const averagePercentage = totalMarks
    ? (
        (Number(average) / totalMarks) *
        100
      ).toFixed(1)
    : '0.0';

  const topThree = rows
    .filter(result => result.rank <= 3)
    .slice(0, 3);

  const medals = ['🥇', '🥈', '🥉'];

  const institute =
    examData?.instituteName ||
    examData?.instituteCode ||
    'KSR Institute';

  const title =
    examData?.title || 'Daily Test';

  $('resultsBox').innerHTML = `
    <div class="print-header premiumPrintHeader">
      <div class="brandSeal">KSR</div>

      <div>
        <h1>${esc(institute)}</h1>

        <h3>
          ${esc(title)}
          •
          ${esc(examData?.batchName || '')}
        </h3>

        <p>
          Exam ID:
          <b>${esc(publicId)}</b>
        </p>
      </div>
    </div>

    <div class="resultSummaryGrid">
      <div class="summaryCard">
        <span>Participants</span>
        <b>${participants}</b>
      </div>

      <div class="summaryCard">
        <span>Highest Score</span>
        <b>${highest} / ${totalMarks}</b>
      </div>

      <div class="summaryCard">
        <span>Average Score</span>
        <b>${average}</b>
      </div>

      <div class="summaryCard">
        <span>Average Accuracy</span>
        <b>${averagePercentage}%</b>
      </div>
    </div>

    <h3 class="sectionTitle">
      🏆 Top 3 Ranks
    </h3>

    <div class="topRankGrid">
      ${topThree
        .map(
          (result, index) => `
            <div class="rankCard rank${index + 1}">
              <div class="medal">
                ${medals[index]}
              </div>

              <div class="rankNo">
                Rank ${result.rank}
              </div>

              <h3>
                ${esc(
                  result.name ||
                  result.studentName ||
                  '-'
                )}
              </h3>

              <p>
                Exam Code:
                <b>
                  ${esc(
                    result.studentCode ||
                    result.examCode ||
                    '-'
                  )}
                </b>
              </p>

              <strong>
                ${Number(result.score || 0)}
                /
                ${Number(result.total || 0)}
              </strong>
            </div>
          `
        )
        .join('')}
    </div>

    <h3 class="sectionTitle">
      Complete Rank List
    </h3>

    <table class="table resultTable">
      <tr>
        <th>Rank</th>
        <th>Name</th>
        <th>Batch</th>
        <th>Exam Code</th>
        <th>Score</th>
        <th>Total</th>
      </tr>

      ${rows
        .map(
          result => `
            <tr>
              <td>
                <b>${result.rank}</b>
              </td>

              <td>
                ${esc(
                  result.name ||
                  result.studentName ||
                  '-'
                )}
              </td>

              <td>
                ${esc(
                  result.batchName ||
                  examData?.batchName ||
                  '-'
                )}
              </td>

              <td>
                ${esc(
                  result.studentCode ||
                  result.examCode ||
                  '-'
                )}
              </td>

              <td>
                <b>
                  ${Number(result.score || 0)}
                </b>
              </td>

              <td>
                ${Number(result.total || 0)}
              </td>
            </tr>
          `
        )
        .join('')}
    </table>

    <div class="pdfFooter">
      ${esc(institute)}
      • Generated by KSR EXAMOS •
      ${new Date().toLocaleString('en-IN')}
    </div>
  `;
}

function printSection(id, title) {
  const element = $(id);

  if (
    !element ||
    !element.innerHTML.trim()
  ) {
    return show(
      'Print cheyyadaniki data ledu.',
      'err'
    );
  }

  const printWindow = window.open(
    '',
    '_blank'
  );

  printWindow.document.write(`
    <html>
      <head>
        <meta charset="utf-8">

        <title>${esc(title)}</title>

        <link
          rel="stylesheet"
          href="style.css"
        >

        <style>
          body {
            padding: 24px;
            background: #fff;
          }

          .table {
            width: 100%;
            border-collapse: collapse;
          }

          .table th,
          .table td {
            border: 1px solid #b8c6d6;
            padding: 8px;
            text-align: left;
          }

          .pdfFooter {
            margin-top: 20px;
            padding-top: 8px;
            border-top: 1px solid #94a3b8;
            text-align: center;
            font-size: 11px;
            color: #475569;
          }

          @page {
            margin: 14mm;
          }

          @media print {
            button {
              display: none !important;
            }

            .card {
              box-shadow: none !important;
            }

            .topRankGrid,
            .resultSummaryGrid {
              break-inside: avoid;
            }
          }
        </style>
      </head>

      <body>
        ${element.innerHTML}

        <script>
          setTimeout(() => window.print(), 500);
        <\/script>
      </body>
    </html>
  `);

  printWindow.document.close();
}

let allSavedExams = [];
let savedView = 'active';

$('searchExam').onclick = async () => {
  await ensureExamsLoaded();

  renderSavedExams(
    $('examSearch').value
  );
};

$('loadAllExams').onclick = async () => {
  await ensureExamsLoaded(true);

  $('examSearch').value = '';

  renderSavedExams('');
};

$('examSearch').addEventListener(
  'keydown',
  event => {
    if (event.key === 'Enter') {
      $('searchExam').click();
    }
  }
);

document
  .querySelectorAll('.examViewBtn')
  .forEach(button => {
    button.onclick = () => {
      savedView = button.dataset.view;

      document
        .querySelectorAll('.examViewBtn')
        .forEach(element => {
          element.classList.remove('active');
        });

      button.classList.add('active');

      renderSavedExams(
        $('examSearch').value
      );
    };
  });

async function ensureExamsLoaded(
  force = false
) {
  if (allSavedExams.length && !force) {
    return;
  }

  const snapshot = await getDocs(
    collection(db, 'exams')
  );

  allSavedExams = [];

  snapshot.forEach(documentSnapshot => {
    allSavedExams.push({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    });
  });

  allSavedExams.sort(
    (a, b) =>
      Number(b.createdAt?.seconds || 0) -
      Number(a.createdAt?.seconds || 0)
  );
}

function examBucket(exam) {
  if (
    exam.status === 'deleted' ||
    exam.deletedAt
  ) {
    return 'deleted';
  }

  if (
    exam.status === 'archived' ||
    exam.archivedAt
  ) {
    return 'archived';
  }

  return 'active';
}

function renderSavedExams(term = '') {
  const searchKey = String(term || '')
    .trim()
    .toLowerCase();

  let filteredExams = allSavedExams.filter(
    exam =>
      examBucket(exam) === savedView
  );

  if (searchKey) {
    filteredExams = filteredExams.filter(
      exam =>
        [
          exam.title,
          exam.examId,
          exam.examCode,
          exam.instituteName,
          exam.instituteCode,
          exam.batchName
        ].some(value =>
          String(value || '')
            .toLowerCase()
            .includes(searchKey)
        )
    );
  }

  $('savedExams').innerHTML =
    filteredExams.length
      ? filteredExams
          .map(exam => {
            const publicId =
              exam.examId ||
              exam.examCode ||
              exam.id;

            let actions = '';

            if (savedView === 'active') {
              actions = `
                <button
                  class="gray useResult"
                  data-id="${esc(publicId)}"
                >
                  Results
                </button>

                <button
                  class="orange archiveExam"
                  data-doc="${esc(exam.id)}"
                >
                  Archive
                </button>

                <button
                  class="danger trashExam"
                  data-doc="${esc(exam.id)}"
                >
                  Delete
                </button>
              `;
            } else if (
              savedView === 'archived'
            ) {
              actions = `
                <button
                  class="green restoreExam"
                  data-doc="${esc(exam.id)}"
                >
                  Restore
                </button>

                <button
                  class="danger trashExam"
                  data-doc="${esc(exam.id)}"
                >
                  Move to Bin
                </button>
              `;
            } else {
              actions = `
                <button
                  class="green restoreExam"
                  data-doc="${esc(exam.id)}"
                >
                  Restore
                </button>

                <button
                  class="danger permanentDeleteExam"
                  data-doc="${esc(exam.id)}"
                  data-name="${esc(publicId)}"
                >
                  Delete Permanently
                </button>
              `;
            }

            return `
              <div class="qcard">
                <b>
                  ${esc(
                    exam.title ||
                    publicId ||
                    'Exam'
                  )}
                </b>

                <p>
                  Exam ID:
                  <b>${esc(publicId)}</b>
                </p>

                <p>
                  ${esc(
                    exam.instituteName || ''
                  )}

                  ${
                    exam.batchName
                      ? '• ' +
                        esc(exam.batchName)
                      : ''
                  }

                  • Questions:
                  ${Number(
                    exam.questionCount || 0
                  )}

                  • Status:
                  ${esc(
                    exam.status || 'active'
                  )}
                </p>

                <div class="action-row">
                  ${actions}
                </div>
              </div>
            `;
          })
          .join('')
      : searchKey
      ? '<p class="msg warn">Matching exam dorakaledu.</p>'
      : '<p class="msg warn">Ee section lo exams levu.</p>';

  document
    .querySelectorAll('.useResult')
    .forEach(button => {
      button.onclick = () => {
        $('resultExamId').value =
          button.dataset.id;

        document
          .querySelector(
            '[data-open="resultsPanel"]'
          )
          ?.click();

        loadResults();
      };
    });

  document
    .querySelectorAll('.archiveExam')
    .forEach(button => {
      button.onclick = () =>
        changeExamState(
          button.dataset.doc,
          'archived'
        );
    });

  document
    .querySelectorAll('.trashExam')
    .forEach(button => {
      button.onclick = () =>
        changeExamState(
          button.dataset.doc,
          'deleted'
        );
    });

  document
    .querySelectorAll('.restoreExam')
    .forEach(button => {
      button.onclick = () =>
        changeExamState(
          button.dataset.doc,
          'active'
        );
    });

  document
    .querySelectorAll(
      '.permanentDeleteExam'
    )
    .forEach(button => {
      button.onclick = () =>
        permanentDeleteExam(
          button.dataset.doc,
          button.dataset.name
        );
    });
}

async function changeExamState(
  documentId,
  state
) {
  const labels = {
    archived: 'Archive',
    deleted: 'Recycle Bin',
    active: 'Restore'
  };

  if (
    !confirm(
      `${labels[state]} cheyyala?`
    )
  ) {
    return;
  }

  try {
    await updateDoc(
      doc(db, 'exams', documentId),
      {
        status: state,

        archivedAt:
          state === 'archived'
            ? serverTimestamp()
            : null,

        deletedAt:
          state === 'deleted'
            ? serverTimestamp()
            : null,

        restoredAt:
          state === 'active'
            ? serverTimestamp()
            : null
      }
    );

    allSavedExams = [];

    await ensureExamsLoaded(true);

    renderSavedExams(
      $('examSearch').value
    );

    flash(
      `Exam ${labels[state]} complete ✅`
    );
  } catch (error) {
    show(error.message, 'err');
  }
}

async function deleteMatchingDocs(
  collectionName,
  field,
  value
) {
  const snapshot = await getDocs(
    collection(db, collectionName)
  );

  const references = [];

  snapshot.forEach(documentSnapshot => {
    const data = documentSnapshot.data();

    if (
      data[field] === value ||
      documentSnapshot.id === value
    ) {
      references.push(
        documentSnapshot.ref
      );
    }
  });

  for (
    let startIndex = 0;
    startIndex < references.length;
    startIndex += 450
  ) {
    const batch = writeBatch(db);

    references
      .slice(
        startIndex,
        startIndex + 450
      )
      .forEach(reference => {
        batch.delete(reference);
      });

    await batch.commit();
  }
}

async function permanentDeleteExam(
  documentId,
  publicId
) {
  const typedExamId = prompt(
    `Permanent delete kosam Exam ID type cheyyandi:\n${publicId}`
  );

  if (
    norm(typedExamId) !==
    norm(publicId)
  ) {
    return flash(
      'Exam ID match avvaledu. Delete cancel.',
      'err'
    );
  }

  if (
    !confirm(
      'Exam, Questions, Codes, Results permanently delete avutayi. Continue?'
    )
  ) {
    return;
  }

  try {
    await deleteMatchingDocs(
      'examQuestions',
      'examId',
      documentId
    );

    await deleteMatchingDocs(
      'studentAccess',
      'examId',
      documentId
    );

    await deleteMatchingDocs(
      'results',
      'examId',
      documentId
    );

    await deleteDoc(
      doc(db, 'exams', documentId)
    );

    allSavedExams = [];

    await ensureExamsLoaded(true);

    renderSavedExams('');

    flash(
      'Exam permanently deleted ✅'
    );
  } catch (error) {
    show(error.message, 'err');
  }
  }
