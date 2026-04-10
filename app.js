window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbwO4odNrbx0XKB8lOPwckkWtbD42LRPvvbSL2izBbr9d5WD2_e0uq32H3ls7rrDURge/exec"
};

const $ = (id) => document.getElementById(id);
const API_URL = window.APP_CONFIG.API_URL;

const state = {
  currentUser: null,
  subjects: [],
  adminStep: 1,
  selectedAdminSubject: '',
  adminItemCount: 0,
  loadedExamQuestions: [],
  fullSubjectQuestions: [],
  selectedExamSubject: '',
  selectedExamMode: null,
  examCarousel: null,
  examModalInstance: null,
  currentExamIndex: 0
};

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
});

function bindEvents() {
  $('btnLogin').addEventListener('click', handleLogin);
  $('btnLogout').addEventListener('click', handleLogout);

  $('btnNext').addEventListener('click', handleAdminNext);
  $('btnPrev').addEventListener('click', handleAdminPrev);
  $('btnSubmitQuestions').addEventListener('click', handleSaveQuestions);
  $('btnRebuildQuestions').addEventListener('click', buildQuestionForms);

  $('subjectSelect').addEventListener('change', (e) => {
    state.selectedAdminSubject = e.target.value;
    $('selectedSubjectLabel').textContent = state.selectedAdminSubject
      ? `Selected Subject: ${state.selectedAdminSubject}`
      : '';
  });

  $('itemCount').addEventListener('input', (e) => {
    state.adminItemCount = parseInt(e.target.value, 10) || 0;
  });

  $('examSubjectSelect').addEventListener('change', handleStudentSubjectChange);
  $('btnLoadExam').addEventListener('click', handleLoadExam);
  $('btnSubmitExam').addEventListener('click', handleSubmitExam);
  $('btnExamPrev').addEventListener('click', goPrevExamSlide);
  $('btnExamNext').addEventListener('click', goNextExamSlide);

  const examCarouselEl = $('examCarousel');
  if (examCarouselEl) {
    examCarouselEl.addEventListener('slid.bs.carousel', updateExamCarouselUI);
  }
}

async function handleLogin() {
  try {
    const email = $('loginEmail').value.trim().toLowerCase();
    if (!email) throw new Error('Please enter your email.');

    setLoading(true);

    const res = await fetch(`${API_URL}?action=login&email=${encodeURIComponent(email)}`);
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Login failed.');

    state.currentUser = data.data;

    $('loginSection').classList.add('d-none');
    $('appSection').classList.remove('d-none');

    $('userInfoText').textContent = `${state.currentUser.email} | ${state.currentUser.role}`;
    $('dashRole').textContent = state.currentUser.role;

    if (state.currentUser.role === 'Admin') {
      $('adminSection').classList.remove('d-none');
    } else {
      $('adminSection').classList.add('d-none');
    }

    await loadSubjects();
    await loadDashboard();

    showLoginAlert(`Welcome, ${state.currentUser.email}`, 'success');
  } catch (error) {
    showLoginAlert(error.message, 'danger');
  } finally {
    setLoading(false);
  }
}

function handleLogout() {
  state.currentUser = null;
  state.subjects = [];
  state.loadedExamQuestions = [];
  state.fullSubjectQuestions = [];
  state.selectedExamSubject = '';
  state.selectedExamMode = null;
  state.adminStep = 1;
  state.selectedAdminSubject = '';
  state.adminItemCount = 0;
  state.currentExamIndex = 0;
  state.examCarousel = null;
  state.examModalInstance = null;

  $('loginSection').classList.remove('d-none');
  $('appSection').classList.add('d-none');
  $('loginEmail').value = '';
  $('questionsContainer').innerHTML = '';
  $('itemCount').value = '';
  $('subjectSelect').innerHTML = `<option value="">Select Subject</option>`;
  $('examSubjectSelect').innerHTML = `<option value="">Select Subject</option>`;
  $('examModeOptions').innerHTML = `<div class="empty-mode-note">Select a subject first.</div>`;
  $('selectedExamSetupText').textContent = 'No setup selected yet.';
  $('selectedSubjectLabel').textContent = '';
  $('examCarouselInner').innerHTML = '';
  $('examModalMeta').textContent = '';
  $('examProgressText').textContent = '';
  $('btnSubmitExam').classList.add('d-none');

  clearGlobalAlerts();
  updateAdminWizard();
}

async function loadSubjects() {
  const res = await fetch(`${API_URL}?action=getSubjects`);
  const data = await res.json();

  if (!data.success) throw new Error(data.message || 'Failed to load subjects.');

  state.subjects = data.data || [];
  renderSubjects();
}

function renderSubjects() {
  const adminSelect = $('subjectSelect');
  const examSelect = $('examSubjectSelect');

  adminSelect.innerHTML = `<option value="">Select Subject</option>`;
  examSelect.innerHTML = `<option value="">Select Subject</option>`;

  state.subjects.forEach(item => {
    const opt1 = document.createElement('option');
    opt1.value = item.subject;
    opt1.textContent = item.subject;
    adminSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = item.subject;
    opt2.textContent = item.subject;
    examSelect.appendChild(opt2);
  });
}

async function loadDashboard() {
  const email = state.currentUser.email;
  const res = await fetch(`${API_URL}?action=getUserDashboard&email=${encodeURIComponent(email)}`);
  const data = await res.json();

  if (!data.success) throw new Error(data.message || 'Failed to load dashboard.');

  const dash = data.data;

  $('dashTotalExams').textContent = dash.totalExamsTaken || 0;
  $('dashSubjectsTaken').textContent = (dash.subjectsTaken || []).length;

  renderAverages(dash.averagesBySubject || []);
  renderRecentResults(dash.recentResults || []);
}

function renderAverages(items) {
  const box = $('averagesContainer');

  if (!items.length) {
    box.innerHTML = `<div class="table-card">No subject averages yet.</div>`;
    return;
  }

  box.innerHTML = items.map(item => `
    <div class="table-card">
      <div class="d-flex justify-content-between">
        <strong>${item.subject}</strong>
        <span>${item.averagePercentage}%</span>
      </div>
      <div class="small text-muted-school">
        Average Score: ${item.averageScore} | Attempts: ${item.attempts}
      </div>
    </div>
  `).join('');
}

function renderRecentResults(items) {
  const box = $('recentResultsContainer');

  if (!items.length) {
    box.innerHTML = `<div class="table-card">No exam history yet.</div>`;
    return;
  }

  box.innerHTML = items.map(item => `
    <div class="result-row">
      <div>
        <strong>${item.subject}</strong><br>
        <small class="text-muted-school">${formatDate(item.dateTaken)}</small>
      </div>
      <div class="text-end">
        <strong>${item.score}/${item.totalItems}</strong><br>
        <small>${item.percentage}%</small>
      </div>
    </div>
  `).join('');
}

function handleAdminNext() {
  if (state.adminStep === 1) {
    const subject = $('subjectSelect').value;
    if (!subject) {
      showAdminAlert('Please select a subject first.', 'warning');
      return;
    }
    state.selectedAdminSubject = subject;
  }

  if (state.adminStep === 2) {
    const itemCount = parseInt($('itemCount').value, 10);
    if (!itemCount || itemCount < 1) {
      showAdminAlert('Please enter a valid number of items.', 'warning');
      return;
    }
    state.adminItemCount = itemCount;
    buildQuestionForms();
  }

  if (state.adminStep < 3) {
    state.adminStep++;
    updateAdminWizard();
  }
}

function handleAdminPrev() {
  if (state.adminStep > 1) {
    state.adminStep--;
    updateAdminWizard();
  }
}

function updateAdminWizard() {
  document.querySelectorAll('.wizard-step').forEach(step => {
    step.classList.remove('active');
    if (Number(step.dataset.genPage) === state.adminStep) {
      step.classList.add('active');
    }
  });

  document.querySelectorAll('.wizard-dot').forEach(dot => {
    dot.classList.remove('active');
    if (Number(dot.dataset.stepDot) === state.adminStep) {
      dot.classList.add('active');
    }
  });

  $('btnPrev').style.visibility = state.adminStep === 1 ? 'hidden' : 'visible';
  $('btnNext').classList.toggle('d-none', state.adminStep === 3);
  $('btnSubmitQuestions').classList.toggle('d-none', state.adminStep !== 3);
  $('selectedSubjectLabel').textContent = state.selectedAdminSubject
    ? `Selected Subject: ${state.selectedAdminSubject}`
    : '';
}

function buildQuestionForms() {
  const count = parseInt($('itemCount').value, 10);
  if (!count || count < 1) {
    showAdminAlert('Enter a valid number first.', 'warning');
    return;
  }

  const container = $('questionsContainer');
  container.innerHTML = '';

  for (let i = 1; i <= count; i++) {
    const block = document.createElement('div');
    block.className = 'question-card';
    block.innerHTML = `
      <h6>Question ${i}</h6>
      <div class="mb-3">
        <label class="form-label">Question</label>
        <input type="text" class="form-control school-input" data-field="question" data-index="${i}">
      </div>
      <div class="mb-3">
        <label class="form-label">Option A</label>
        <input type="text" class="form-control school-input" data-field="optionA" data-index="${i}">
      </div>
      <div class="mb-3">
        <label class="form-label">Option B</label>
        <input type="text" class="form-control school-input" data-field="optionB" data-index="${i}">
      </div>
      <div class="mb-3">
        <label class="form-label">Option C</label>
        <input type="text" class="form-control school-input" data-field="optionC" data-index="${i}">
      </div>
      <div class="mb-3">
        <label class="form-label">Option D</label>
        <input type="text" class="form-control school-input" data-field="optionD" data-index="${i}">
      </div>
      <div class="mb-3">
        <label class="form-label">Answer Key</label>
        <select class="form-select school-input" data-field="answerKey" data-index="${i}">
          <option value="">Select correct answer</option>
          <option value="Option A">Option A</option>
          <option value="Option B">Option B</option>
          <option value="Option C">Option C</option>
          <option value="Option D">Option D</option>
        </select>
      </div>
    `;
    container.appendChild(block);
  }
}

function collectAdminQuestions() {
  const items = [];

  for (let i = 1; i <= state.adminItemCount; i++) {
    const question = document.querySelector(`[data-field="question"][data-index="${i}"]`)?.value.trim() || '';
    const optionA = document.querySelector(`[data-field="optionA"][data-index="${i}"]`)?.value.trim() || '';
    const optionB = document.querySelector(`[data-field="optionB"][data-index="${i}"]`)?.value.trim() || '';
    const optionC = document.querySelector(`[data-field="optionC"][data-index="${i}"]`)?.value.trim() || '';
    const optionD = document.querySelector(`[data-field="optionD"][data-index="${i}"]`)?.value.trim() || '';
    const answerKey = document.querySelector(`[data-field="answerKey"][data-index="${i}"]`)?.value || '';

    if (!question || !optionA || !optionB || !optionC || !optionD || !answerKey) {
      throw new Error(`Please complete all fields for Question ${i}.`);
    }

    items.push({ question, optionA, optionB, optionC, optionD, answerKey });
  }

  return items;
}

async function handleSaveQuestions() {
  try {
    const items = collectAdminQuestions();

    setLoading(true);

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveExamQuestions',
        subject: state.selectedAdminSubject,
        items
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to save questions.');

    showAdminAlert(`Saved successfully. IDs: ${data.data.ids.join(', ')}`, 'success');

    $('itemCount').value = '';
    $('questionsContainer').innerHTML = '';
    state.adminItemCount = 0;
    state.adminStep = 1;
    updateAdminWizard();
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  } finally {
    setLoading(false);
  }
}

async function handleStudentSubjectChange(e) {
  const subject = e.target.value;
  state.selectedExamSubject = subject;
  state.selectedExamMode = null;
  state.fullSubjectQuestions = [];
  $('selectedExamSetupText').textContent = 'No setup selected yet.';
  $('examModeOptions').innerHTML = `<div class="empty-mode-note">Loading options...</div>`;

  if (!subject) {
    $('examModeOptions').innerHTML = `<div class="empty-mode-note">Select a subject first.</div>`;
    return;
  }

  try {
    const res = await fetch(`${API_URL}?action=getExamMeta&subject=${encodeURIComponent(subject)}`);
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Failed to load exam info.');

    renderExamModeOptions(data.data.totalQuestions || 0);
  } catch (error) {
    $('examModeOptions').innerHTML = `<div class="empty-mode-note">${error.message}</div>`;
  }
}

function renderExamModeOptions(totalQuestions) {
  const box = $('examModeOptions');

  if (!totalQuestions) {
    box.innerHTML = `<div class="empty-mode-note">No available questions for this subject yet.</div>`;
    return;
  }

  const candidateCounts = [5, 10, 50].filter(n => n <= totalQuestions);
  if (!candidateCounts.includes(totalQuestions)) {
    candidateCounts.push(totalQuestions);
  }

  const uniqueCounts = [...new Set(candidateCounts)].sort((a, b) => a - b);

  const options = [];
  uniqueCounts.forEach(count => {
    options.push({
      count,
      mode: 'ordered',
      label: `${count} items only`
    });
    options.push({
      count,
      mode: 'random',
      label: `${count} randoms`
    });
  });

  box.innerHTML = options.map((opt, index) => `
    <button
      type="button"
      class="exam-mode-option ${index === 0 ? 'active' : ''}"
      data-count="${opt.count}"
      data-mode="${opt.mode}"
    >
      ${opt.label}
    </button>
  `).join('');

  state.selectedExamMode = {
    count: options[0].count,
    mode: options[0].mode,
    label: options[0].label
  };

  $('selectedExamSetupText').textContent = `${state.selectedExamSubject} | ${state.selectedExamMode.label} | total available: ${totalQuestions}`;

  box.querySelectorAll('.exam-mode-option').forEach(btn => {
    btn.addEventListener('click', () => {
      box.querySelectorAll('.exam-mode-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.selectedExamMode = {
        count: Number(btn.dataset.count),
        mode: btn.dataset.mode,
        label: btn.textContent.trim()
      };

      $('selectedExamSetupText').textContent = `${state.selectedExamSubject} | ${state.selectedExamMode.label} | total available: ${totalQuestions}`;
    });
  });
}

async function handleLoadExam() {
  try {
    const subject = $('examSubjectSelect').value;
    if (!subject) throw new Error('Please select a subject.');
    if (!state.selectedExamMode) throw new Error('Please choose an exam type first.');

    setLoading(true);

    const res = await fetch(`${API_URL}?action=getExamQuestions&subject=${encodeURIComponent(subject)}`);
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Failed to load exam.');

    const allQuestions = data.data || [];
    if (!allQuestions.length) throw new Error('No questions found for this subject.');

    state.fullSubjectQuestions = allQuestions;
    state.loadedExamQuestions = buildExamQuestionSet(allQuestions, state.selectedExamMode);

    if (!state.loadedExamQuestions.length) {
      throw new Error('Unable to prepare exam questions.');
    }

    renderExamModalCarousel(state.loadedExamQuestions, subject, state.selectedExamMode);

    const examModalEl = $('examModal');
    if (!examModalEl) {
      throw new Error('Exam modal element not found.');
    }

    if (!window.bootstrap || !bootstrap.Modal) {
      throw new Error('Bootstrap modal is not loaded.');
    }

    state.examModalInstance = bootstrap.Modal.getOrCreateInstance(examModalEl);
    state.examModalInstance.show();
  } catch (error) {
    showUserExamAlert(error.message, 'danger');
  } finally {
    setLoading(false);
  }
}

function buildExamQuestionSet(allQuestions, examMode) {
  const cloned = [...allQuestions];

  if (examMode.mode === 'random') {
    shuffleArray(cloned);
    return cloned.slice(0, examMode.count);
  }

  return cloned.slice(0, examMode.count);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderExamModalCarousel(questions, subject, examMode) {
  const inner = $('examCarouselInner');
  const examCarouselEl = $('examCarousel');

  if (!inner) {
    throw new Error('examCarouselInner not found.');
  }

  if (!examCarouselEl) {
    throw new Error('examCarousel not found.');
  }

  inner.innerHTML = questions.map((q, index) => `
    <div class="carousel-item ${index === 0 ? 'active' : ''}">
      <div class="exam-slide-card">
        <div class="exam-question-text">${q.question}</div>

        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="exam_${q.id}" value="Option A" id="${q.id}_A">
          <label class="form-check-label" for="${q.id}_A">${q.optionA}</label>
        </div>

        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="exam_${q.id}" value="Option B" id="${q.id}_B">
          <label class="form-check-label" for="${q.id}_B">${q.optionB}</label>
        </div>

        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="exam_${q.id}" value="Option C" id="${q.id}_C">
          <label class="form-check-label" for="${q.id}_C">${q.optionC}</label>
        </div>

        <div class="form-check">
          <input class="form-check-input" type="radio" name="exam_${q.id}" value="Option D" id="${q.id}_D">
          <label class="form-check-label" for="${q.id}_D">${q.optionD}</label>
        </div>
      </div>
    </div>
  `).join('');

  state.currentExamIndex = 0;
  $('examModalMeta').textContent = `${subject} | ${examMode.label}`;
  $('btnSubmitExam').classList.add('d-none');

  state.examCarousel = bootstrap.Carousel.getOrCreateInstance(examCarouselEl, {
    interval: false,
    touch: false,
    wrap: false
  });

  updateExamCarouselUI();
}

function updateExamCarouselUI() {
  const items = [...document.querySelectorAll('#examCarouselInner .carousel-item')];
  const activeIndex = items.findIndex(item => item.classList.contains('active'));
  state.currentExamIndex = activeIndex >= 0 ? activeIndex : 0;

  const total = items.length;
  const current = state.currentExamIndex + 1;

  $('examProgressText').textContent = total ? `Question ${current} of ${total}` : '';

  $('btnExamPrev').disabled = state.currentExamIndex <= 0;

  const isLast = state.currentExamIndex >= total - 1;
  $('btnExamNext').classList.toggle('d-none', isLast);
  $('btnSubmitExam').classList.toggle('d-none', !isLast);
}

function goPrevExamSlide() {
  if (state.examCarousel) {
    state.examCarousel.prev();
  }
}

function goNextExamSlide() {
  const currentQuestion = state.loadedExamQuestions[state.currentExamIndex];
  if (!currentQuestion) return;

  const checked = document.querySelector(`input[name="exam_${currentQuestion.id}"]:checked`);
  if (!checked) {
    showUserExamAlert(`Please answer Question ${state.currentExamIndex + 1} before going next.`, 'warning');
    return;
  }

  if (state.examCarousel) {
    state.examCarousel.next();
  }
}

function collectExamAnswers() {
  return state.loadedExamQuestions.map(q => {
    const checked = document.querySelector(`input[name="exam_${q.id}"]:checked`);
    return {
      id: q.id,
      answer: checked ? checked.value : ''
    };
  });
}

async function handleSubmitExam() {
  try {
    const subject = $('examSubjectSelect').value;
    if (!subject) throw new Error('No subject selected.');

    const answers = collectExamAnswers();

    if (answers.some(a => !a.answer)) {
      throw new Error('Please answer all questions before submitting.');
    }

    setLoading(true);

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'submitExam',
        email: state.currentUser.email,
        subject,
        answers
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to submit exam.');

    if (state.examModalInstance) {
      state.examModalInstance.hide();
    }

    showUserExamAlert(
      `Exam submitted successfully.<br>Score: ${data.data.score}/${data.data.totalItems}<br>Percentage: ${data.data.percentage}%`,
      'success'
    );

    await loadDashboard();
  } catch (error) {
    showUserExamAlert(error.message, 'danger');
  } finally {
    setLoading(false);
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function setLoading(isLoading) {
  $('loadingOverlay').classList.toggle('d-none', !isLoading);
}

function showGlobalAlert(message, type = 'info') {
  const wrap = $('globalAlertWrap');
  if (!wrap) return;

  const item = document.createElement('div');
  item.className = `alert alert-${type} alert-dismissible fade show`;
  item.setAttribute('role', 'alert');

  item.innerHTML = `
    <div class="d-flex justify-content-between align-items-start gap-3">
      <div>${message}</div>
      <button type="button" class="btn-close" aria-label="Close"></button>
    </div>
  `;

  const closeBtn = item.querySelector('.btn-close');
  closeBtn.addEventListener('click', () => {
    item.remove();
  });

  wrap.appendChild(item);
}

function clearGlobalAlerts() {
  const wrap = $('globalAlertWrap');
  if (wrap) {
    wrap.innerHTML = '';
  }
}

function showLoginAlert(message, type='info') {
  showGlobalAlert(message, type);
}

function showAdminAlert(message, type='info') {
  showGlobalAlert(message, type);
}

function showUserExamAlert(message, type='info') {
  showGlobalAlert(message, type);
}