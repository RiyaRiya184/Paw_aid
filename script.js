/* ==========================================================================
   Paw Aid — shared front-end logic
   All data is stored in localStorage so every page works together
   without a backend. Replace the STORAGE section with real API calls
   when you connect a server.
   ========================================================================== */

const STORAGE_KEY = 'pawaid_reports';
const USER_KEY = 'pawaid_session';

/* ---------------------------- Seed demo data ---------------------------- */

function seedReports(){
  if (localStorage.getItem(STORAGE_KEY)) return;
  const sample = [
    {
      id: 'PA-1042',
      dog: 'Brown mixed-breed, limping on front leg',
      location: 'Sector 21, Green Park',
      severity: 'Injured',
      description: 'Dog seen near the bus stop, appears to have a hurt paw and is not moving much.',
      reporter: 'Aisha Khan',
      phone: '9876543210',
      date: '2026-09-08',
      status: 'Resolved',
      ngo: 'Compassion Paws NGO',
      photo: ''
    },
    {
      id: 'PA-1043',
      dog: 'White & tan puppy, very thin',
      location: 'Model Town Market',
      severity: 'Malnourished',
      description: 'Small puppy looks underfed, has been near the vegetable stalls for two days.',
      reporter: 'Rohit Sharma',
      phone: '9812345678',
      date: '2026-09-10',
      status: 'In Progress',
      ngo: 'Street Paws Trust',
      photo: ''
    },
    {
      id: 'PA-1044',
      dog: 'Black dog with wound on ear',
      location: 'Lajpat Nagar Central Market',
      severity: 'Injured',
      description: 'Visible wound on the left ear, dog is aggressive when approached.',
      reporter: 'Meera Iyer',
      phone: '9900112233',
      date: '2026-09-11',
      status: 'Pending',
      ngo: '',
      photo: ''
    },
    {
      id: 'PA-1045',
      dog: 'Grey stray, skin infection',
      location: 'Rohini Sector 9',
      severity: 'Sick',
      description: 'Visible patches of hair loss and scratching constantly.',
      reporter: 'You',
      phone: '9000000000',
      date: '2026-09-12',
      status: 'Pending',
      ngo: '',
      photo: ''
    }
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
}

function getReports(){
  seedReports();
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function saveReports(reports){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

function nextReportId(reports){
  const nums = reports.map(r => parseInt(r.id.replace('PA-', ''), 10)).filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1040;
  return 'PA-' + (max + 1);
}

/* ------------------------------ Nav toggle ------------------------------ */

function initNav(){
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => links.classList.toggle('open'));
}

/* --------------------------- Role toggle (auth) -------------------------- */

function initRoleToggle(){
  const wrap = document.querySelector('.role-toggle');
  if (!wrap) return;
  const buttons = wrap.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      wrap.dataset.role = btn.dataset.role;
    });
  });
}

/* --------------------------- Severity chips ------------------------------ */

function initSeverityChips(){
  const chips = document.querySelectorAll('.severity-chip');
  if (!chips.length) return;
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const input = document.getElementById('severityValue');
      if (input) input.value = chip.dataset.value;
    });
  });
}

/* ------------------------------ File upload ------------------------------ */

function initFileUpload(){
  const box = document.querySelector('.upload-box');
  const input = document.getElementById('photoInput');
  if (!box || !input) return;
  box.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const label = box.querySelector('.upload-text');
    if (input.files && input.files[0] && label){
      label.textContent = input.files[0].name;
    }
  });
}

/* ------------------------------ Auth forms -------------------------------- */

function initLoginForm(){
  const form = document.getElementById('loginForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const roleWrap = document.querySelector('.role-toggle');
    const role = roleWrap ? roleWrap.dataset.role : 'citizen';
    const email = document.getElementById('email').value;
    localStorage.setItem(USER_KEY, JSON.stringify({ email, role }));
    const destinations = {
      citizen: 'citizen-dashboard.html',
      ngo: 'ngo-dashboard.html',
      admin: 'admin-dashboard.html'
    };
    window.location.href = destinations[role] || 'citizen-dashboard.html';
  });
}

function initRegisterForm(){
  const form = document.getElementById('registerForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const success = document.getElementById('formSuccess');
    if (success) success.classList.add('show');
    form.reset();
    setTimeout(() => { window.location.href = 'login.html'; }, 1200);
  });
}

/* ---------------------------- Report a dog form --------------------------- */

function initReportForm(){
  const form = document.getElementById('reportForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const reports = getReports();
    const id = nextReportId(reports);
    const newReport = {
      id,
      dog: document.getElementById('dogDesc').value,
      location: document.getElementById('location').value,
      severity: document.getElementById('severityValue').value || 'Unknown',
      description: document.getElementById('description').value,
      reporter: document.getElementById('reporterName').value || 'You',
      phone: document.getElementById('reporterPhone').value,
      date: new Date().toISOString().slice(0, 10),
      status: 'Pending',
      ngo: '',
      photo: ''
    };
    reports.unshift(newReport);
    saveReports(reports);

    const successBox = document.getElementById('reportSuccess');
    if (successBox){
      successBox.classList.add('show');
      successBox.innerHTML = `Report submitted! Your tracking ID is <strong>${id}</strong>. Save it to track progress.`;
    }
    form.reset();
    document.querySelectorAll('.severity-chip').forEach(c => c.classList.remove('active'));
  });
}

/* ------------------------------ My reports -------------------------------- */

function renderMyReports(){
  const tbody = document.getElementById('myReportsBody');
  if (!tbody) return;
  const reports = getReports();
  const mine = reports.filter(r => r.reporter === 'You');
  const emptyState = document.getElementById('emptyState');

  if (!mine.length){
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  tbody.innerHTML = mine.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.dog}</td>
      <td>${r.location}</td>
      <td>${formatDate(r.date)}</td>
      <td>${statusBadge(r.status)}</td>
      <td><a class="btn btn-outline btn-sm" href="track-reports.html?id=${r.id}">Track</a></td>
    </tr>
  `).join('');
}

/* ----------------------------- Track reports ------------------------------ */

function statusBadge(status){
  const map = {
    'Pending': 'badge-pending',
    'In Progress': 'badge-progress',
    'Resolved': 'badge-resolved',
    'Rejected': 'badge-rejected'
  };
  return `<span class="badge ${map[status] || 'badge-pending'}">${status}</span>`;
}

function formatDate(d){
  const date = new Date(d);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initTrackSearch(){
  const form = document.getElementById('trackForm');
  const result = document.getElementById('trackResult');
  if (!form || !result) return;

  function showResult(id){
    const reports = getReports();
    const report = reports.find(r => r.id.toLowerCase() === id.trim().toLowerCase());
    if (!report){
      result.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>No report found</h3><p>Double check the tracking ID and try again.</p></div>`;
      result.style.display = 'block';
      return;
    }

    const steps = [
      { label: 'Report submitted', done: true },
      { label: 'Under review by team', done: report.status !== 'Pending' || true },
      { label: 'Assigned to NGO', done: !!report.ngo },
      { label: 'Rescue in progress', done: report.status === 'In Progress' || report.status === 'Resolved' },
      { label: 'Case resolved', done: report.status === 'Resolved' }
    ];

    result.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>${report.id}</h3>
            <p style="margin:0;color:var(--brown-500);font-size:0.9rem;">${report.dog}</p>
          </div>
          ${statusBadge(report.status)}
        </div>
        <p><strong>Location:</strong> ${report.location}</p>
        <p><strong>Reported on:</strong> ${formatDate(report.date)}</p>
        ${report.ngo ? `<p><strong>Assigned NGO:</strong> ${report.ngo}</p>` : ''}
        <ul class="timeline">
          ${steps.map(s => `<li class="${s.done ? 'done' : ''}"><div class="t-title">${s.label}</div></li>`).join('')}
        </ul>
      </div>
    `;
    result.style.display = 'block';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    showResult(document.getElementById('trackId').value);
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('id')){
    document.getElementById('trackId').value = params.get('id');
    showResult(params.get('id'));
  }
}

/* ------------------------------ Citizen dashboard -------------------------- */

function renderCitizenDashboard(){
  const el = document.getElementById('citizenStats');
  if (!el) return;
  const reports = getReports();
  const mine = reports.filter(r => r.reporter === 'You');
  const pending = mine.filter(r => r.status === 'Pending').length;
  const progress = mine.filter(r => r.status === 'In Progress').length;
  const resolved = mine.filter(r => r.status === 'Resolved').length;

  document.getElementById('kpiTotal').textContent = mine.length;
  document.getElementById('kpiPending').textContent = pending;
  document.getElementById('kpiProgress').textContent = progress;
  document.getElementById('kpiResolved').textContent = resolved;

  const tbody = document.getElementById('recentReportsBody');
  if (tbody){
    const recent = mine.slice(0, 5);
    tbody.innerHTML = recent.length ? recent.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.dog}</td>
        <td>${formatDate(r.date)}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="4" style="text-align:center;color:var(--brown-500);padding:30px;">No reports yet. <a href="report-dog.html" style="color:var(--orange-700);font-weight:600;">Report a dog</a></td></tr>`;
  }
}

/* -------------------------------- NGO dashboard ---------------------------- */

function renderNgoDashboard(){
  const tbody = document.getElementById('ngoReportsBody');
  if (!tbody) return;

  function render(filter = 'all'){
    const reports = getReports();
    const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);

    document.getElementById('kpiNgoTotal').textContent = reports.length;
    document.getElementById('kpiNgoPending').textContent = reports.filter(r => r.status === 'Pending').length;
    document.getElementById('kpiNgoProgress').textContent = reports.filter(r => r.status === 'In Progress').length;
    document.getElementById('kpiNgoResolved').textContent = reports.filter(r => r.status === 'Resolved').length;

    tbody.innerHTML = filtered.length ? filtered.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.dog}</td>
        <td>${r.location}</td>
        <td>${r.severity}</td>
        <td>${formatDate(r.date)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>
          <select class="status-select" data-id="${r.id}" style="min-width:140px;padding:8px 10px;font-size:0.82rem;">
            <option ${r.status==='Pending'?'selected':''}>Pending</option>
            <option ${r.status==='In Progress'?'selected':''}>In Progress</option>
            <option ${r.status==='Resolved'?'selected':''}>Resolved</option>
            <option ${r.status==='Rejected'?'selected':''}>Rejected</option>
          </select>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="7" style="text-align:center;color:var(--brown-500);padding:30px;">No reports match this filter.</td></tr>`;

    tbody.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const reports = getReports();
        const idx = reports.findIndex(r => r.id === sel.dataset.id);
        if (idx > -1){
          reports[idx].status = sel.value;
          if (!reports[idx].ngo) reports[idx].ngo = 'Compassion Paws NGO';
          saveReports(reports);
          render(document.getElementById('ngoFilter').value);
        }
      });
    });
  }

  const filterSelect = document.getElementById('ngoFilter');
  if (filterSelect){
    filterSelect.addEventListener('change', () => render(filterSelect.value));
  }
  render('all');
}

/* -------------------------------- Admin dashboard --------------------------- */

const PARTNER_NGOS = ['Compassion Paws NGO', 'Street Paws Trust', 'Second Chance Animal Rescue'];

function renderAdminDashboard(){
  const tbody = document.getElementById('adminReportsBody');
  if (!tbody) return;
  const reports = getReports();

  document.getElementById('kpiAdminReports').textContent = reports.length;
  document.getElementById('kpiAdminPending').textContent = reports.filter(r => r.status === 'Pending').length;
  document.getElementById('kpiAdminResolved').textContent = reports.filter(r => r.status === 'Resolved').length;
  const ngoSet = new Set(reports.map(r => r.ngo).filter(Boolean));
  PARTNER_NGOS.forEach(n => ngoSet.add(n));
  document.getElementById('kpiAdminNgos').textContent = ngoSet.size;

  // Overview: most recent 5 reports
  const overviewBody = document.getElementById('adminOverviewBody');
  if (overviewBody){
    const recent = reports.slice(0, 5);
    overviewBody.innerHTML = recent.length ? recent.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.reporter}</td>
        <td>${r.location}</td>
        <td>${formatDate(r.date)}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>
    `).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--brown-500);padding:30px;">No reports yet.</td></tr>`;
  }

  // All reports table
  tbody.innerHTML = reports.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.reporter}</td>
      <td>${r.location}</td>
      <td>${r.ngo || '—'}</td>
      <td>${formatDate(r.date)}</td>
      <td>${statusBadge(r.status)}</td>
      <td><button class="btn btn-outline btn-sm delete-report" data-id="${r.id}">Remove</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.delete-report').forEach(btn => {
    btn.addEventListener('click', () => {
      const remaining = getReports().filter(r => r.id !== btn.dataset.id);
      saveReports(remaining);
      renderAdminDashboard();
    });
  });

  renderAdminNgos(reports);
  renderAdminUsers(reports);
}

function renderAdminNgos(reports){
  const tbody = document.getElementById('adminNgosBody');
  if (!tbody) return;

  const rows = PARTNER_NGOS.map(name => {
    const assigned = reports.filter(r => r.ngo === name);
    const resolved = assigned.filter(r => r.status === 'Resolved');
    const active = assigned.some(r => r.status === 'Pending' || r.status === 'In Progress');
    return `
      <tr>
        <td>${name}</td>
        <td>${assigned.length}</td>
        <td>${resolved.length}</td>
        <td>${active || assigned.length ? '<span class="badge badge-resolved">Active</span>' : '<span class="badge badge-pending">No cases yet</span>'}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rows.join('');
}

function renderAdminUsers(reports){
  const tbody = document.getElementById('adminUsersBody');
  if (!tbody) return;

  const byUser = {};
  reports.forEach(r => {
    const key = r.reporter || 'Unknown';
    if (!byUser[key]) byUser[key] = { phone: r.phone || '—', count: 0 };
    byUser[key].count += 1;
  });

  const entries = Object.entries(byUser);
  tbody.innerHTML = entries.length ? entries.map(([name, info]) => `
    <tr>
      <td>${name}</td>
      <td>${info.phone}</td>
      <td>${info.count}</td>
    </tr>
  `).join('') : `<tr><td colspan="3" style="text-align:center;color:var(--brown-500);padding:30px;">No users yet.</td></tr>`;
}

function initAdminNav(){
  const links = document.querySelectorAll('.side-nav a[data-view]');
  const viewLinks = document.querySelectorAll('.view-link[data-view]');
  if (!links.length) return;

  const titles = {
    overview: ['Admin Overview', 'Platform-wide activity across all citizens and NGOs.'],
    reports: ['All Reports', 'Every report submitted across the platform.'],
    ngos: ['Partner NGOs', 'Organizations helping resolve rescue cases.'],
    users: ['Users', 'Citizens who have filed reports on Paw Aid.']
  };

  function switchView(view){
    document.querySelectorAll('.admin-view').forEach(v => v.style.display = 'none');
    const target = document.getElementById('view-' + view);
    if (target) target.style.display = 'block';

    links.forEach(l => l.classList.toggle('active', l.dataset.view === view));

    const title = document.getElementById('adminViewTitle');
    const subtitle = document.getElementById('adminViewSubtitle');
    if (title && titles[view]){
      title.textContent = titles[view][0];
      subtitle.textContent = titles[view][1];
    }
  }

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });

  viewLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });
}

function initNgoNav(){
  const links = document.querySelectorAll('.side-nav a[data-ngo-view]');
  if (!links.length) return;

  const titles = {
    'reports-all': ['NGO Dashboard', 'Review incoming reports and manage rescue status.'],
    'reports-In Progress': ['Active Rescues', 'Cases your team is currently working on.'],
    'reports-Resolved': ['Resolved Cases', 'Rescues your team has successfully completed.'],
    'team': ['Our Team', 'People handling rescues for Compassion Paws.']
  };

  function switchView(view, filter){
    document.querySelectorAll('.ngo-view').forEach(v => v.style.display = 'none');
    const target = document.getElementById('ngo-view-' + view);
    if (target) target.style.display = 'block';

    links.forEach(l => l.classList.remove('active'));

    const title = document.getElementById('ngoViewTitle');
    const subtitle = document.getElementById('ngoViewSubtitle');
    const key = view === 'reports' ? 'reports-' + filter : view;
    if (title && titles[key]){
      title.textContent = titles[key][0];
      subtitle.textContent = titles[key][1];
    }

    if (view === 'reports'){
      const select = document.getElementById('ngoFilter');
      if (select){
        select.value = filter;
        select.dispatchEvent(new Event('change'));
      }
    }
  }

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      link.classList.add('active');
      switchView(link.dataset.ngoView, link.dataset.filter);
    });
  });
}

/* ---------------------------------- Init ---------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initRoleToggle();
  initSeverityChips();
  initFileUpload();
  initLoginForm();
  initRegisterForm();
  initReportForm();
  renderMyReports();
  initTrackSearch();
  renderCitizenDashboard();
  renderNgoDashboard();
  renderAdminDashboard();
  initAdminNav();
  initNgoNav();
});