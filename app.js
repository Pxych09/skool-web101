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
  currentExamIndex: 0,
  announcements: [],
  rankings: [],
  rankingViewType: 'overall',
  rankingSubject: '',
  rankingChart: null,
  announcementRefreshTimer: null,
  rankingRefreshTimer: null,
  pendingLoginUser: null,
  usernameModalInstance: null,
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

  $('btnPostAnnouncement').addEventListener('click', handlePostAnnouncement);
  $('btnRefreshAnnouncements').addEventListener('click', loadAnnouncements);
  $('rankingViewType').addEventListener('change', handleRankingViewChange);
  $('btnLoadRankings').addEventListener('click', loadRankings);
  $('btnSaveUsername').addEventListener('click', handleSaveUsername);

  $('rankingSubjectSelect').addEventListener('change', (e) => {
    state.rankingSubject = e.target.value;
  });

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

    state.pendingLoginUser = data.data;

    if (data.data.needsUsernameSetup) {
      $('usernameInput').value = '';
      const modalEl = $('usernameSetupModal');
      state.usernameModalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
      state.usernameModalInstance.show();
      return;
    }

    await completeLogin(data.data);
  } catch (error) {
    showLoginAlert(error.message, 'danger');
  } finally {
    setLoading(false);
  }
}

async function completeLogin(userData) {
  state.currentUser = userData;
  state.pendingLoginUser = null;

  $('loginSection').classList.add('d-none');
  $('appSection').classList.remove('d-none');

  const displayName = userData.username || userData.email;
  $('userInfoText').textContent = `${displayName} | ${state.currentUser.role}`;
  $('dashRole').textContent = state.currentUser.role;

  if (state.currentUser.role === 'Admin') {
    $('adminSection').classList.remove('d-none');
  } else {
    $('adminSection').classList.add('d-none');
  }

  $('rankingSection').classList.remove('d-none');

  await loadSubjects();
  renderRankingSubjects();
  await loadDashboard();
  await loadRankings();
  startAutoRefresh();
  await loadAnnouncements();

  showLoginAlert(`Welcome, <a href="#"> ${escapeHtml(displayName)}</a>!`, 'success');
}

async function handleSaveUsername() {
  try {
    const username = $('usernameInput').value.trim();
    if (!username) throw new Error('Please enter a username.');

    if (!state.pendingLoginUser?.email) {
      throw new Error('No pending user found.');
    }

    setLoading(true);

    const url = `${API_URL}?action=setUsername&email=${encodeURIComponent(state.pendingLoginUser.email)}&username=${encodeURIComponent(username)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Failed to save username.');

    const completedUser = {
      ...state.pendingLoginUser,
      username: data.data.username,
      needsUsernameSetup: false
    };

    if (state.usernameModalInstance) {
      state.usernameModalInstance.hide();
    }

    await completeLogin(completedUser);
  } catch (error) {
    showGlobalAlert(error.message, 'danger');
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
  state.announcements = [];
  state.rankings = [];
  state.rankingViewType = 'overall';
  state.rankingSubject = '';
  

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
  $('announcementMessage').value = '';
  $('announcementList').innerHTML = `<div class="empty-mode-note">No announcements yet.</div>`;
  $('rankingViewType').value = 'overall';
  $('rankingSubjectSelect').innerHTML = `<option value="">Select Subject</option>`;
  $('rankingSubjectWrap').classList.add('d-none');
  $('rankingTableContainer').innerHTML = `<div class="empty-mode-note">Load rankings to see student standings.</div>`;
  $('yourRankCard').classList.add('d-none');
  $('yourRankCard').innerHTML = '';
  $('rankingStatusText').textContent = 'Waiting for ranking data...';

  clearGlobalAlerts();
  updateAdminWizard();
  stopAutoRefresh();
  destroyRankingChart();
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

function renderRankingSubjects() {
  const select = $('rankingSubjectSelect');
  if (!select) return;

  select.innerHTML = `<option value="">Select Subject</option>`;

  state.subjects.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.subject;
    opt.textContent = item.subject;
    select.appendChild(opt);
  });
}

function handleRankingViewChange(e) {
  state.rankingViewType = e.target.value;
  const isSubject = state.rankingViewType === 'subject';

  $('rankingSubjectWrap').classList.toggle('d-none', !isSubject);

  if (!isSubject) {
    state.rankingSubject = '';
    $('rankingSubjectSelect').value = '';
  }
}

async function loadRankings(isSilent = false) {
  try {
    state.rankingViewType = $('rankingViewType').value;
    state.rankingSubject = $('rankingSubjectSelect').value;

    if (state.rankingViewType === 'subject' && !state.rankingSubject) {
      throw new Error('Please select a subject for subject ranking.');
    }

    if (!isSilent) {
      setLoading(true);
    }

    $('rankingStatusText').textContent = 'Refreshing leaderboard...';

    const url = `${API_URL}?action=getRankings&viewType=${encodeURIComponent(state.rankingViewType)}&subject=${encodeURIComponent(state.rankingSubject)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Failed to load rankings.');

    if (Array.isArray(data.data)) {
      state.rankings = data.data;
    } else {
      state.rankings = data.data?.items || [];
    }

    renderYourRankCard();
    renderRankingChart();
    renderRankingTable();

    const now = new Date();
    $('rankingStatusText').textContent = `Last updated: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    $('rankingTableContainer').innerHTML = `<div class="empty-mode-note">${error.message}</div>`;
    $('rankingStatusText').textContent = 'Unable to refresh leaderboard.';
  } finally {
    if (!isSilent) {
      setLoading(false);
    }
  }
}

function renderRankingTable() {
  const box = $('rankingTableContainer');
  const items = state.rankings || [];
  const myEmail = String(state.currentUser?.email || '').trim().toLowerCase();

  if (!items.length) {
    const isSubject = state.rankingViewType === 'subject';
    const message = isSubject
    ? `No official leaderboard data yet for subject: ${state.rankingSubject || '(none selected)'}. Only exams with 20+ items count.`
    : 'No official leaderboard data yet. Only exams with 20+ items count.';

    box.innerHTML = `<div class="empty-mode-note">${message}</div>`;
    return;
  }

  box.innerHTML = `
    <div class="table-responsive ranking-table-wrap">
      <table class="table ranking-table align-middle mb-0">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Email</th>
            <th>Avg %</th>
            <th>Attempts</th>
            <th>Last Taken</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => {
            const rowClass = getRankingRowClass(item, myEmail);
            return `
              <tr class="${rowClass}">
                <td data-label="Rank">${renderRankBadge(item.rank)}</td>
                <td class="email-cell" data-label="Email">
                  <span class="email-text" title="${escapeHtml(item.username || item.email || '')}">
                    ${escapeHtml(item.username || item.email || '')}
                  </span>
                </td>
                <td class="ranking-strong" data-label="Avg %">${item.averagePercentage}%</td>
                <td data-label="Attempts">${item.attempts}</td>
                <td class="last-taken-small" data-label="Last Taken" title="${escapeHtml(new Date(item.lastTaken).toLocaleString())}">
                  ${escapeHtml(formatDate(item.lastTaken))}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderRankBadge(rank) {
  if (rank === 1) {
    return `<span class="medal-badge medal-gold" title="1st Place">🥇 1st</span>`;
  }
  if (rank === 2) {
    return `<span class="medal-badge medal-silver" title="2nd Place">🥈 2nd</span>`;
  }
  if (rank === 3) {
    return `<span class="medal-badge medal-bronze" title="3rd Place">🥉 3rd</span>`;
  }
  return `<span class="medal-badge medal-default" title="Rank ${rank}">#${rank}</span>`;
}

function getRankingRowClass(item, myEmail) {
  const classes = [];

  if (item.rank === 1) classes.push('leader-row', 'leader-gold');
  if (item.rank === 2) classes.push('leader-row', 'leader-silver');
  if (item.rank === 3) classes.push('leader-row', 'leader-bronze');

  if (String(item.email || '').trim().toLowerCase() === myEmail) {
    classes.push('my-rank-row');
  }

  return classes.join(' ');
}

function truncateEmail(value, maxLength = 18) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
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
        <strong>${escapeHtml(item.subject)}</strong>
        <span>${item.averagePercentage}%</span>
      </div>
      <div class="small text-muted-school">
        Average Score: ${item.averageScore} | Attempts: ${item.attempts}
      </div>
    </div>
  `).join('');
}

function renderYourRankCard() {
  const box = $('yourRankCard');
  if (!box || !state.currentUser) return;

  const myEmail = String(state.currentUser.email || '').trim().toLowerCase();
  const me = (state.rankings || []).find(item => String(item.email || '').trim().toLowerCase() === myEmail);

  box.classList.remove('d-none');

  if (!me) {
    box.innerHTML = `
      <div class="your-rank-clean">
        <div class="your-rank-clean-left">
          <div class="your-rank-clean-label">Your Rank</div>
          <div class="your-rank-clean-main">Not ranked yet</div>
          <div class="your-rank-clean-sub">Take an official exam with 20+ items to appear on the leaderboard.</div>
        </div>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="your-rank-clean">
      <div class="your-rank-clean-left">
        <div class="your-rank-clean-label">Your Rank</div>
        <div class="your-rank-clean-main">${renderRankBadge(me.rank)}</div>
        <div class="your-rank-clean-sub">${escapeHtml(me.username || me.email || '')}</div>
      </div>

      <div class="your-rank-clean-stats">
        <div class="your-rank-clean-stat">
          <span class="your-rank-clean-stat-value">${me.averagePercentage}%</span>
          <span class="your-rank-clean-stat-label">Average</span>
        </div>
        <div class="your-rank-clean-stat">
          <span class="your-rank-clean-stat-value">${me.attempts}</span>
          <span class="your-rank-clean-stat-label">Attempts</span>
        </div>
        <div class="your-rank-clean-stat">
          <span class="your-rank-clean-stat-value">${escapeHtml(formatDate(me.lastTaken))}</span>
          <span class="your-rank-clean-stat-label">Last Taken</span>
        </div>
      </div>
    </div>
  `;
}

function destroyRankingChart() {
  if (state.rankingChart) {
    state.rankingChart.destroy();
    state.rankingChart = null;
  }
}

function renderRankingChart() {
  const canvas = $('rankingChart');
  if (!canvas || typeof Chart === 'undefined') return;

  destroyRankingChart();

  const topItems = (state.rankings || []).slice(0, 5);
  if (!topItems.length) return;

  const labels = topItems.map(item => truncateEmail(item.email || '', 18));
  const values = topItems.map(item => Number(item.averagePercentage || 0));

  state.rankingChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Average %',
        data: values,
        borderWidth: 1,
        borderRadius: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: function(context) {
              const index = context[0].dataIndex;
              return topItems[index].email || '';
            },
            label: function(context) {
              return `Average: ${context.raw}%`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100
        }
      }
    }
  });
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
        <strong>${escapeHtml(item.subject)}</strong><br>
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

    const url = `${API_URL}?action=saveExamQuestions&subject=${encodeURIComponent(state.selectedAdminSubject)}&items=${encodeURIComponent(JSON.stringify(items))}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Failed to save questions.');

    showAdminAlert(`Saved successfully. IDs: ${data.data.ids.join(', ')}`, 'success');

    $('itemCount').value = '';
    $('questionsContainer').innerHTML = '';
    state.adminItemCount = 0;
    state.adminStep = 1;
    updateAdminWizard();
  } catch (error) {
    showAdminAlert(error.message || 'Failed to fetch', 'danger');
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
    $('examModeOptions').innerHTML = `<div class="empty-mode-note">${escapeHtml(error.message)}</div>`;
  }
}

function renderExamModeOptions(totalQuestions) {
  const box = $('examModeOptions');

  if (!totalQuestions) {
    box.innerHTML = `<div class="empty-mode-note">No available questions for this subject yet.</div>`;
    return;
  }

  const practiceOptions = [];
  const officialOptions = [];

  if (totalQuestions >= 5) {
    practiceOptions.push(
      {
        count: 5,
        mode: 'ordered',
        label: '5 items only',
        isOfficial: false
      },
      {
        count: 5,
        mode: 'random',
        label: '5 randoms',
        isOfficial: false
      }
    );
  }

  if (totalQuestions >= 50) {
    officialOptions.push(
      {
        count: 50,
        mode: 'ordered',
        label: '50 items only',
        isOfficial: true
      },
      {
        count: 50,
        mode: 'random',
        label: '50 randoms',
        isOfficial: true
      }
    );
  } else if (totalQuestions >= 20) {
    officialOptions.push(
      {
        count: totalQuestions,
        mode: 'ordered',
        label: `${totalQuestions} items only`,
        isOfficial: true
      },
      {
        count: totalQuestions,
        mode: 'random',
        label: `${totalQuestions} randoms`,
        isOfficial: true
      }
    );
  }

  const renderOptionButton = (opt, isActive = false) => `
    <button
      type="button"
      class="exam-mode-option ${isActive ? 'active' : ''} ${opt.isOfficial ? 'official-mode' : 'practice-mode'}"
      data-count="${opt.count}"
      data-mode="${opt.mode}"
      data-label="${opt.label}"
      data-official="${opt.isOfficial ? '1' : '0'}"
    >
      <span class="exam-mode-title">${escapeHtml(opt.label)}</span>
      <small class="exam-mode-subtext">
        ${opt.isOfficial ? 'Official • counted in leaderboard' : 'Practice • not counted in leaderboard'}
      </small>
    </button>
  `;

  let html = '';

  if (practiceOptions.length) {
    html += `
      <div class="exam-mode-group">
        <div class="exam-mode-group-head practice-head">
          <span class="exam-mode-group-title">Practice</span>
          <span class="exam-mode-group-note">Quick review only</span>
        </div>
        <div class="exam-mode-group-grid">
          ${practiceOptions.map((opt, index) => renderOptionButton(opt, index === 0)).join('')}
        </div>
      </div>
    `;
  }

  if (officialOptions.length) {
    html += `
      <div class="exam-mode-group">
        <div class="exam-mode-group-head official-head">
          <span class="exam-mode-group-title">Official</span>
          <span class="exam-mode-group-note">Affects leaderboard</span>
        </div>
        <div class="exam-mode-group-grid">
          ${officialOptions.map(opt => renderOptionButton(opt, false)).join('')}
        </div>
      </div>
    `;
  }

  box.innerHTML = html;

  const firstOption = practiceOptions[0] || officialOptions[0];
  if (!firstOption) {
    box.innerHTML = `<div class="empty-mode-note">No valid exam modes available.</div>`;
    return;
  }

  state.selectedExamMode = {
    count: firstOption.count,
    mode: firstOption.mode,
    label: firstOption.label,
    isOfficial: firstOption.isOfficial
  };

  updateSelectedExamSetupText();

  box.querySelectorAll('.exam-mode-option').forEach(btn => {
    btn.addEventListener('click', () => {
      box.querySelectorAll('.exam-mode-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.selectedExamMode = {
        count: Number(btn.dataset.count),
        mode: btn.dataset.mode,
        label: btn.dataset.label,
        isOfficial: btn.dataset.official === '1'
      };

      updateSelectedExamSetupText();
    });
  });
}

function updateSelectedExamSetupText() {
  if (!state.selectedExamSubject || !state.selectedExamMode) {
    $('selectedExamSetupText').textContent = 'No setup selected yet.';
    return;
  }

  const typeLabel = state.selectedExamMode.isOfficial
    ? 'Official • counted in leaderboard'
    : 'Practice • not counted in leaderboard';

  $('selectedExamSetupText').textContent =
    `${state.selectedExamSubject} | ${state.selectedExamMode.label} | ${typeLabel}`;
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
        <div class="exam-question-text">${escapeHtml(q.question)}</div>

        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="exam_${q.id}" value="Option A" id="${q.id}_A">
          <label class="form-check-label" for="${q.id}_A">${escapeHtml(q.optionA)}</label>
        </div>

        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="exam_${q.id}" value="Option B" id="${q.id}_B">
          <label class="form-check-label" for="${q.id}_B">${escapeHtml(q.optionB)}</label>
        </div>

        <div class="form-check mb-2">
          <input class="form-check-input" type="radio" name="exam_${q.id}" value="Option C" id="${q.id}_C">
          <label class="form-check-label" for="${q.id}_C">${escapeHtml(q.optionC)}</label>
        </div>

        <div class="form-check">
          <input class="form-check-input" type="radio" name="exam_${q.id}" value="Option D" id="${q.id}_D">
          <label class="form-check-label" for="${q.id}_D">${escapeHtml(q.optionD)}</label>
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

    const examMode = state.selectedExamMode?.mode || '';
    const itemCount = state.selectedExamMode?.count || answers.length;
    const examLabel = state.selectedExamMode?.label || '';

    const url = `${API_URL}?action=submitExam&email=${encodeURIComponent(state.currentUser.email)}&subject=${encodeURIComponent(subject)}&answers=${encodeURIComponent(JSON.stringify(answers))}&examMode=${encodeURIComponent(examMode)}&itemCount=${encodeURIComponent(itemCount)}&examLabel=${encodeURIComponent(examLabel)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Failed to submit exam.');
    if (!data.data) throw new Error(data.message || 'No exam result returned from server.');

    if (state.examModalInstance) {
      state.examModalInstance.hide();
    }

    const isOfficial = Number(data.data.itemCount || data.data.totalItems || 0) >= 20;
    const examTypeText = isOfficial
      ? 'This result was recorded as an official exam and affects the leaderboard.'
      : 'This result was recorded as practice only and does not affect the official leaderboard.';

    showUserExamAlert(
      `Exam submitted successfully.<br>
      Score: ${data.data.score}/${data.data.totalItems}<br>
      Percentage: ${data.data.percentage}%<br>
      <small>${examTypeText}</small>`,
      'success'
    );

    await loadDashboard();
    await loadRankings(true);
  } catch (error) {
    showUserExamAlert(error.message || 'Failed to fetch', 'danger');
  } finally {
    setLoading(false);
  }
}

/* =========================
   ANNOUNCEMENTS
========================= */

async function loadAnnouncements() {
  try {
    const res = await fetch(`${API_URL}?action=getAnnouncements`);
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Failed to load announcements.');

    state.announcements = data.data || [];
    renderAnnouncements();
  } catch (error) {
    $('announcementList').innerHTML = `<div class="empty-mode-note">${escapeHtml(error.message)}</div>`;
  }
}

function renderAnnouncements() {
  const box = $('announcementList');
  const currentEmail = state.currentUser?.email?.toLowerCase?.() || '';

  if (!state.announcements.length) {
    box.innerHTML = `<div class="empty-mode-note">No announcements yet.</div>`;
    return;
  }

  box.innerHTML = state.announcements.map(item => {
    const userReaction = item.reactionsByUser?.[currentEmail] || '';
    const likeActive = userReaction === 'like' ? 'active' : '';
    const dislikeActive = userReaction === 'dislike' ? 'active' : '';

    return `
      <div class="announcement-card">
        <div class="announcement-top">
          <div class="announcement-avatar">${escapeHtml(item.profileLabel || 'S')}</div>
          <div class="announcement-meta">
            <div class="announcement-author-row">
            <span class="announcement-email">${escapeHtml(item.username || item.email || '')}</span>
            </div>
            <div class="announcement-submeta">
              <span>${escapeHtml(item.role || 'User')}</span>
              <span>•</span>
              <span title="${escapeHtml(formatDate(item.createdAt))}">${escapeHtml(formatRelativeTime(item.createdAt))}</span>
            </div>
          </div>
        </div>

        <div class="announcement-message">${escapeHtml(item.message || '')}</div>

        <div class="announcement-actions">
          <button
            class="reaction-btn ${likeActive}"
            type="button"
            data-announcement-id="${item.announcementId}"
            data-reaction="like"
          >
            <i class="bi bi-hand-thumbs-up-fill me-1"></i>
            Like
            <span class="reaction-count">${item.likes || 0}</span>
          </button>

          <button
            class="reaction-btn dislike ${dislikeActive}"
            type="button"
            data-announcement-id="${item.announcementId}"
            data-reaction="dislike"
          >
            <i class="bi bi-hand-thumbs-down-fill me-1"></i>
            Dislike
            <span class="reaction-count">${item.dislikes || 0}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  box.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const announcementId = btn.dataset.announcementId;
      const reaction = btn.dataset.reaction;
      await handleReactAnnouncement(announcementId, reaction);
    });
  });
}

async function handlePostAnnouncement() {
  try {
    const message = $('announcementMessage').value.trim();
    if (!message) throw new Error('Please write a message first.');

    setLoading(true);

    const url = `${API_URL}?action=postAnnouncement&email=${encodeURIComponent(state.currentUser.email)}&message=${encodeURIComponent(message)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Failed to post announcement.');

    $('announcementMessage').value = '';

    if (data.data) {
      state.announcements.unshift(data.data);
      renderAnnouncements();
    } else {
      await loadAnnouncements();
    }

    showGlobalAlert('Announcement posted successfully.', 'success');
  } catch (error) {
    showGlobalAlert(error.message || 'Failed to fetch', 'danger');
  } finally {
    setLoading(false);
  }
}

async function handleReactAnnouncement(announcementId, reaction) {
  try {
    const url = `${API_URL}?action=reactAnnouncement&email=${encodeURIComponent(state.currentUser.email)}&announcementId=${encodeURIComponent(announcementId)}&reaction=${encodeURIComponent(reaction)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) throw new Error(data.message || 'Failed to save reaction.');

    const post = state.announcements.find(item => item.announcementId === announcementId);
    if (post) {
      post.likes = data.data.likes || 0;
      post.dislikes = data.data.dislikes || 0;
      if (!post.reactionsByUser) post.reactionsByUser = {};
      post.reactionsByUser[state.currentUser.email.toLowerCase()] = data.data.userReaction || '';
    }

    renderAnnouncements();
  } catch (error) {
    showGlobalAlert(error.message || 'Failed to fetch', 'danger');
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return '-';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
function startAutoRefresh() {
  stopAutoRefresh();

  state.announcementRefreshTimer = setInterval(() => {
    if (state.currentUser) {
      loadAnnouncements();
    }
  }, 15000);

  state.rankingRefreshTimer = setInterval(() => {
    if (state.currentUser) {
      loadRankings(true);
    }
  }, 15000);
}

function stopAutoRefresh() {
  if (state.announcementRefreshTimer) {
    clearInterval(state.announcementRefreshTimer);
    state.announcementRefreshTimer = null;
  }

  if (state.rankingRefreshTimer) {
    clearInterval(state.rankingRefreshTimer);
    state.rankingRefreshTimer = null;
  }
}

function formatRelativeTime(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return '-';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;

  return formatDate(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
      <div><button type="button" class="btn-close" aria-label="Close"></button></div>
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
