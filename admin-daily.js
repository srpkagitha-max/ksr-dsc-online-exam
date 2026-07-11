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

$('instituteId').onchange = () => {
  renderBatchOptions();
  syncInstituteName();
  saveDraft();
};

$('batchId').onchange = () => {
  loadBatchStudents();
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

  if ($('codeCount')) {
    $('codeCount').value = '50';
  }

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
  'codeCount',
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
  $(id)?.addEventListener('input', saveDraft);
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
  const institute
