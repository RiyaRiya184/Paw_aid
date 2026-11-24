/* ==========================================================================
   Paw Aid — front-end logic
   Data, logins and photos are stored in Supabase (see supabase/schema.sql).
   Every page loads: supabase-js (CDN) → config.js → this file.
   The pages' look and layout are unchanged; this file only makes the
   existing forms, tables and buttons work against the real database.
   ========================================================================== */

const PHOTO_BUCKET = 'report-photos';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const DASHBOARDS = { citizen: 'citizen-dashboard.html', ngo: 'ngo-dashboard.html', admin: 'admin-dashboard.html' };

/* ------------------------------ Supabase client ------------------------------ */

const CONFIG = window.PAWAID_CONFIG || {};
const CONFIGURED = !!(window.supabase && CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT')
  && CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_ANON_KEY.includes('YOUR-'));
const sb = CONFIGURED ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

/* --------------------------------- Helpers ---------------------------------- */

function $(id){ return document.getElementById(id); }

function esc(value){
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatDate(d){
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d){
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusBadge(status){
  const map = { 'Pending': 'badge-pending', 'In Progress': 'badge-progress', 'Resolved': 'badge-resolved', 'Rejected': 'badge-rejected' };
  return `<span class="badge ${map[status] || 'badge-pending'}">${esc(status)}</span>`;
}

function photoUrl(path){
  if (!path || !sb) return '';
  return sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Uses the pages' existing .alert boxes (hidden until .show is added).
function showAlert(el, message, type = 'error'){
  if (!el) return;
  el.classList.remove('alert-error', 'alert-success');
  el.classList.add('alert', type === 'success' ? 'alert-success' : 'alert-error', 'show');
  el.innerHTML = message;
}

function hideAlert(el){ if (el) el.classList.remove('show'); }

// Login and reset pages have no alert box in the design; add a hidden one.
function ensureAlert(form){
  let box = form.parentElement.querySelector('.alert');
  if (!box){
    box = document.createElement('div');
    box.className = 'alert';
    form.parentElement.insertBefore(box, form);
  }
  return box;
}

function friendlyError(err){
  const msg = (err && (err.message || err.error_description)) || String(err || 'Something went wrong');
  if (/Invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/Email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link.';
  if (/User already registered/i.test(msg)) return 'An account with this email already exists. Try logging in.';
  if (/Failed to fetch/i.test(msg)) return 'Could not reach the server. Check your internet connection.';
  return msg;
}

function setBusy(button, busy, busyText){
  if (!button) return;
  if (busy){
    button.dataset.label = button.textContent;
    button.textContent = busyText || 'Please wait…';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function emptyRow(cols, html){
  return `<tr><td colspan="${cols}" style="text-align:center;color:var(--brown-500);padding:30px;">${html}</td></tr>`;
}

function reportLink(r){
  return `<a href="#" class="report-link" data-open-report="${r.id}" title="View details and photo">${esc(r.code)}</a>`;
}

// Description text plus a "View photo" link when the report has a photo.
function descWithPhoto(r){
  const photo = r.photo_path
    ? `<br><a href="#" class="photo-link" data-open-report="${r.id}">📷 View photo</a>` : '';
  return esc(r.dog_description) + photo;
}

function showConfigBanner(){
  const bar = document.createElement('div');
  bar.className = 'config-banner';
  bar.innerHTML = 'Paw Aid is not connected to its database yet. Add your Supabase URL and key to <code>config.js</code> (see README).';
  document.body.prepend(bar);
}

/* ------------------------------- Session / auth ------------------------------- */

let profileCache = null;

async function currentUser(){
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

async function currentProfile(){
  if (profileCache) return profileCache;
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  profileCache = data;
  return data;
}

// Dashboards call this. Visitors go to login; users go to their own dashboard.
async function requireRole(role){
  const profile = await currentProfile();
  if (!profile){
    window.location.replace('login.html');
    return null;
  }
  if (profile.role !== role){
    window.location.replace(DASHBOARDS[profile.role] || 'index.html');
    return null;
  }
  return profile;
}

function fillUserChip(name, roleLabel){
  document.querySelectorAll('.user-chip').forEach(chip => {
    const n = chip.querySelector('.name');
    const a = chip.querySelector('.avatar');
    const r = chip.querySelector('.role');
    if (n && name) n.textContent = name;
    if (a && name) a.textContent = name.trim().charAt(0).toUpperCase();
    if (r && roleLabel) r.textContent = roleLabel;
  });
}

function isLogoutLink(a){
  return a && a.textContent.replace(/[^A-Za-z ]/g, '').trim().toLowerCase() === 'log out';
}

// Every "Log Out" link in the design really signs out now.
function initLogoutLinks(){
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('a');
    if (!isLogoutLink(a)) return;
    e.preventDefault();
    if (sb) await sb.auth.signOut();
    profileCache = null;
    window.location.href = 'index.html';
  });
}

// On public pages, once signed in, "Log In / Register" become "My Dashboard / Log Out"
// (same buttons, same styles).
async function initNavSession(){
  const actions = document.querySelector('.nav-actions');
  if (!actions || !actions.querySelector('a[href="login.html"], a[href="register.html"]')) return;
  const profile = await currentProfile().catch(() => null);
  if (!profile) return;
  const buttons = actions.querySelectorAll('a');
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  first.textContent = 'My Dashboard';
  first.href = DASHBOARDS[profile.role];
  if (last !== first){
    last.textContent = 'Log Out';
    last.href = 'index.html';
  }
}

/* ------------------------------ Shared UI bits ------------------------------ */

function initNav(){
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => links.classList.toggle('open'));
}

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

function initSeverityChips(){
  const chips = document.querySelectorAll('.severity-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      $('severityValue').value = chip.dataset.value;
    });
  });
}

function initFileUpload(){
  const box = document.querySelector('.upload-box');
  const input = $('photoInput');
  if (!box || !input) return;
  box.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const label = box.querySelector('.upload-text');
    const file = input.files && input.files[0];
    if (!label) return;
    if (!file){ label.textContent = 'Click to upload a photo'; return; }
    if (file.size > MAX_PHOTO_BYTES){
      label.textContent = 'That photo is over 5MB — please choose a smaller one';
      input.value = '';
      return;
    }
    label.textContent = file.name;
  });
}

/* ------------------------------- Report popup -------------------------------
   Opens when an NGO or admin clicks a report ID, so they can see the photo,
   full details and the reporter's phone number. */

async function openReportModal(reportId){
  let modal = $('reportModal');
  if (!modal){
    modal = document.createElement('div');
    modal.id = 'reportModal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-card"><button class="modal-close" aria-label="Close">×</button><div class="modal-body"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('.modal-close')) modal.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.remove('open'); });
  }
  const body = modal.querySelector('.modal-body');
  body.innerHTML = '<p>Loading…</p>';
  modal.classList.add('open');

  const [{ data: r, error }, { data: updates }] = await Promise.all([
    sb.from('reports').select('*, ngos(name)').eq('id', reportId).maybeSingle(),
    sb.from('report_updates').select('*').eq('report_id', reportId).order('created_at')
  ]);
  if (error || !r){
    body.innerHTML = `<p>${esc(error ? friendlyError(error) : 'Report not found.')}</p>`;
    return;
  }
  body.innerHTML = `
    <div class="panel-head">
      <div>
        <h3>${esc(r.code)}</h3>
        <p style="margin:0;color:var(--brown-500);font-size:0.9rem;">${esc(r.dog_description)}</p>
      </div>
      ${statusBadge(r.status)}
    </div>
    ${r.photo_path ? `<img class="report-photo" src="${esc(photoUrl(r.photo_path))}" alt="Photo of the reported dog">` : ''}
    <p><strong>Severity:</strong> ${esc(r.severity)}</p>
    <p><strong>Location:</strong> ${esc(r.location)}</p>
    ${r.description ? `<p><strong>Details:</strong> ${esc(r.description)}</p>` : ''}
    <p><strong>Reporter:</strong> ${esc(r.reporter_name)} · <a href="tel:${esc(r.reporter_phone)}" style="color:var(--orange-700);font-weight:600;">${esc(r.reporter_phone)}</a></p>
    <p><strong>Reported on:</strong> ${formatDateTime(r.created_at)}</p>
    <p><strong>Assigned NGO:</strong> ${esc(r.ngos ? r.ngos.name : 'Not assigned yet')}</p>
    <ul class="timeline" style="margin-top:18px;">
      ${(updates || []).map(u => `
        <li class="done">
          <div class="t-title">${esc(u.note || u.status)}</div>
          <div class="t-time">${formatDateTime(u.created_at)}${u.actor_label ? ' · ' + esc(u.actor_label) : ''}</div>
        </li>`).join('')}
    </ul>`;
}

/* ----------------------------------- Login ----------------------------------- */

function initLoginForm(){
  const form = $('loginForm');
  if (!form) return;
  const alertBox = ensureAlert(form);

  // Already signed in? Go straight to the dashboard.
  currentProfile().then(p => { if (p) window.location.replace(DASHBOARDS[p.role]); }).catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    const btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Logging in…');
    const { error } = await sb.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value
    });
    if (error){
      setBusy(btn, false);
      showAlert(alertBox, esc(friendlyError(error)));
      return;
    }
    profileCache = null;
    const profile = await currentProfile();
    // The account's real role decides the dashboard, whichever tab was picked.
    window.location.href = DASHBOARDS[profile && profile.role] || 'citizen-dashboard.html';
  });

  const forgot = Array.from(form.querySelectorAll('a')).find(a => /forgot password/i.test(a.textContent));
  if (forgot){
    forgot.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = $('email').value.trim();
      if (!email){
        showAlert(alertBox, 'Type your email address above, then click “Forgot password?” again.');
        return;
      }
      const redirectTo = new URL('reset-password.html', location.href).href;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) showAlert(alertBox, esc(friendlyError(error)));
      else showAlert(alertBox, 'If an account exists for that email, a password reset link is on its way.', 'success');
    });
  }
}

/* --------------------------------- Register --------------------------------- */

function initRegisterForm(){
  const form = $('registerForm');
  if (!form) return;
  const alertBox = $('formSuccess');
  const roleWrap = document.querySelector('.role-toggle');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    const password = $('regPassword').value;
    if (password.length < 8){
      showAlert(alertBox, 'Password must be at least 8 characters.');
      return;
    }
    const role = roleWrap && roleWrap.dataset.role === 'ngo' ? 'ngo' : 'citizen';
    const name = $('fullName').value.trim();
    const btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Creating account…');

    const { data, error } = await sb.auth.signUp({
      email: $('regEmail').value.trim(),
      password,
      options: {
        emailRedirectTo: new URL('login.html', location.href).href,
        // For NGOs the "Full name / Organization name" field is the NGO's name.
        data: { role, full_name: name, phone: $('regPhone').value.trim(), org_name: role === 'ngo' ? name : '' }
      }
    });
    setBusy(btn, false);
    if (error){
      showAlert(alertBox, esc(friendlyError(error)));
      return;
    }
    form.reset();
    const ngoNote = role === 'ngo' ? ' Your NGO can take cases once an admin approves it.' : '';
    if (data.session){
      showAlert(alertBox, 'Account created! Taking you to your dashboard…' + ngoNote, 'success');
      setTimeout(() => { window.location.href = DASHBOARDS[role]; }, 1500);
    } else {
      showAlert(alertBox, 'Account created! We sent a confirmation link to your email — click it, then log in.' + ngoNote, 'success');
    }
  });
}

/* ------------------------------ Reset password ------------------------------ */

function initResetPasswordForm(){
  const form = $('resetForm');
  if (!form) return;
  const alertBox = ensureAlert(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('newPassword').value;
    if (pw.length < 8){ showAlert(alertBox, 'Password must be at least 8 characters.'); return; }
    if (pw !== $('confirmPassword').value){ showAlert(alertBox, 'The two passwords do not match.'); return; }
    if (!(await currentUser())){
      showAlert(alertBox, 'This reset link has expired. Go to <a href="login.html">Log In</a> and request a new one.');
      return;
    }
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error){ showAlert(alertBox, esc(friendlyError(error))); return; }
    showAlert(alertBox, 'Password updated! Taking you to your dashboard…', 'success');
    const profile = await currentProfile();
    setTimeout(() => { window.location.href = DASHBOARDS[profile && profile.role] || 'index.html'; }, 1200);
  });
}

/* ------------------------------- Report a dog ------------------------------- */

function initReportForm(){
  const form = $('reportForm');
  if (!form) return;
  const alertBox = $('reportSuccess');

  // Pre-fill name/phone for signed-in users.
  currentProfile().then(p => {
    if (!p) return;
    if (!$('reporterName').value) $('reporterName').value = p.full_name || '';
    if (!$('reporterPhone').value) $('reporterPhone').value = p.phone || '';
  }).catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    const btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Submitting…');

    try {
      let photoPath = null;
      const file = $('photoInput').files[0];
      if (file){
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
        if (!['jpg', 'png', 'webp', 'gif'].includes(ext)) throw new Error('Photo must be a JPG, PNG, WEBP or GIF image.');
        if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo must be 5MB or smaller.');
        photoPath = `reports/${crypto.randomUUID().replace(/-/g, '')}.${ext}`;
        const { error: upErr } = await sb.storage.from(PHOTO_BUCKET).upload(photoPath, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
      }

      const { data: code, error } = await sb.rpc('submit_report', {
        p_dog_description: $('dogDesc').value.trim(),
        p_severity: $('severityValue').value || 'Other',
        p_location: $('location').value.trim(),
        p_description: $('description').value.trim(),
        p_reporter_name: $('reporterName').value.trim(),
        p_reporter_phone: $('reporterPhone').value.trim(),
        p_photo_path: photoPath
      });
      if (error) throw error;

      showAlert(alertBox, `Report submitted! Your tracking ID is <strong>${esc(code)}</strong>. Save it to track progress.`, 'success');
      form.reset();
      document.querySelectorAll('.severity-chip').forEach(c => c.classList.remove('active'));
      $('severityValue').value = '';
      const label = document.querySelector('.upload-box .upload-text');
      if (label) label.textContent = 'Click to upload a photo';
    } catch (err){
      showAlert(alertBox, esc(friendlyError(err)));
    } finally {
      setBusy(btn, false);
    }
  });
}

/* ------------------------------ Track a report ------------------------------ */

function initTrackSearch(){
  const form = $('trackForm');
  const result = $('trackResult');
  if (!form || !result) return;

  async function showResult(code){
    const { data: r, error } = await sb.rpc('track_report', { p_code: code });
    if (error || !r){
      result.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><h3>No report found</h3><p>Double check the tracking ID and try again.</p></div>`;
      result.style.display = 'block';
      return;
    }

    // Same five steps as the original design, now driven by real history.
    const updates = r.updates || [];
    const firstTime = (fn) => { const u = updates.find(fn); return u ? u.at : null; };
    const accepted = firstTime(u => /accepted|assigned/i.test(u.note));
    const progress = firstTime(u => u.status === 'In Progress');
    const resolved = firstTime(u => u.status === 'Resolved');
    const steps = [
      { label: 'Report submitted', done: true, at: r.created_at },
      { label: 'Under review by team', done: true },
      { label: 'Assigned to NGO', done: !!r.ngo_name, at: accepted },
      { label: 'Rescue in progress', done: r.status === 'In Progress' || r.status === 'Resolved', at: progress },
      { label: r.status === 'Rejected' ? 'Case closed' : 'Case resolved', done: r.status === 'Resolved' || r.status === 'Rejected',
        at: resolved || firstTime(u => u.status === 'Rejected') }
    ];

    result.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>${esc(r.code)}</h3>
            <p style="margin:0;color:var(--brown-500);font-size:0.9rem;">${esc(r.dog_description)}</p>
          </div>
          ${statusBadge(r.status)}
        </div>
        <p><strong>Location:</strong> ${esc(r.location)}</p>
        <p><strong>Reported on:</strong> ${formatDate(r.created_at)}</p>
        ${r.ngo_name ? `<p><strong>Assigned NGO:</strong> ${esc(r.ngo_name)}</p>` : ''}
        <ul class="timeline">
          ${steps.map(s => `<li class="${s.done ? 'done' : ''}"><div class="t-title">${s.label}</div>${s.done && s.at ? `<div class="t-time">${formatDateTime(s.at)}</div>` : ''}</li>`).join('')}
        </ul>
      </div>`;
    result.style.display = 'block';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    showResult($('trackId').value);
  });

  const id = new URLSearchParams(location.search).get('id');
  if (id){
    $('trackId').value = id;
    showResult(id);
  }
}

/* --------------------------- Citizen: dashboard + list --------------------------- */

async function loadMyReports(profile){
  const { data, error } = await sb.from('reports')
    .select('id, code, dog_description, location, status, created_at')
    .eq('reporter_id', profile.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function initCitizenDashboard(){
  if (!$('citizenStats')) return;
  const profile = await requireRole('citizen');
  if (!profile) return;
  fillUserChip(profile.full_name, 'Citizen');

  const mine = await loadMyReports(profile);
  $('kpiTotal').textContent = mine.length;
  $('kpiPending').textContent = mine.filter(r => r.status === 'Pending').length;
  $('kpiProgress').textContent = mine.filter(r => r.status === 'In Progress').length;
  $('kpiResolved').textContent = mine.filter(r => r.status === 'Resolved').length;

  $('recentReportsBody').innerHTML = mine.length ? mine.slice(0, 5).map(r => `
    <tr>
      <td><a href="track-reports.html?id=${encodeURIComponent(r.code)}">${esc(r.code)}</a></td>
      <td>${esc(r.dog_description)}</td>
      <td>${formatDate(r.created_at)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('')
    : emptyRow(4, 'No reports yet. <a href="report-dog.html" style="color:var(--orange-700);font-weight:600;">Report a dog</a>');
}

async function initMyReports(){
  const tbody = $('myReportsBody');
  if (!tbody) return;
  const profile = await requireRole('citizen');
  if (!profile) return;
  fillUserChip(profile.full_name, 'Citizen');

  const mine = await loadMyReports(profile);
  const emptyState = $('emptyState');
  if (!mine.length){
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';
  tbody.innerHTML = mine.map(r => `
    <tr>
      <td>${esc(r.code)}</td>
      <td>${esc(r.dog_description)}</td>
      <td>${esc(r.location)}</td>
      <td>${formatDate(r.created_at)}</td>
      <td>${statusBadge(r.status)}</td>
      <td><a class="btn btn-outline btn-sm" href="track-reports.html?id=${encodeURIComponent(r.code)}">Track</a></td>
    </tr>`).join('');
}

/* ------------------------------- NGO dashboard -------------------------------
   The table shows open cases (unassigned, Pending) plus this NGO's own cases.
   The existing "Update" dropdown does everything:
     open case  → pick "In Progress" (or Resolved/Rejected) to accept it
     own case   → pick any status to update it; "Pending" hands it back */

async function initNgoDashboard(){
  const tbody = $('ngoReportsBody');
  if (!tbody) return;
  const profile = await requireRole('ngo');
  if (!profile) return;

  const { data: ngo, error } = await sb.from('ngos').select('*').eq('owner_id', profile.id).maybeSingle();
  if (error) throw error;
  fillUserChip(ngo ? ngo.name : profile.full_name, 'NGO Partner');
  initNgoNav(ngo ? ngo.name : 'your NGO');
  if (ngo) initNgoTeam(ngo);

  if (!ngo || ngo.status !== 'approved'){
    const msg = ngo && ngo.status === 'suspended'
      ? 'Your NGO account has been suspended. Please contact the Paw Aid team.'
      : 'Your NGO is waiting for admin approval. You can accept rescue cases once it is approved.';
    $('ngoViewSubtitle').textContent = msg;
    tbody.innerHTML = emptyRow(7, msg);
    return;
  }

  let reports = [];

  async function load(){
    const { data, error } = await sb.from('reports')
      .select('id, code, dog_description, location, severity, status, ngo_id, photo_path, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    reports = data;
    render();
  }

  function render(){
    const filter = $('ngoFilter').value;
    $('kpiNgoTotal').textContent = reports.length;
    $('kpiNgoPending').textContent = reports.filter(r => r.status === 'Pending').length;
    $('kpiNgoProgress').textContent = reports.filter(r => r.status === 'In Progress').length;
    $('kpiNgoResolved').textContent = reports.filter(r => r.status === 'Resolved').length;

    const list = filter === 'all' ? reports : reports.filter(r => r.status === filter);
    tbody.innerHTML = list.length ? list.map(r => `
      <tr>
        <td>${reportLink(r)}</td>
        <td>${descWithPhoto(r)}</td>
        <td>${esc(r.location)}</td>
        <td>${esc(r.severity)}</td>
        <td>${formatDate(r.created_at)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>
          <select class="status-select" data-id="${r.id}" style="min-width:140px;padding:8px 10px;font-size:0.82rem;">
            ${['Pending', 'In Progress', 'Resolved', 'Rejected'].map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('') : emptyRow(7, 'No reports match this filter.');
  }

  tbody.addEventListener('change', async (e) => {
    const sel = e.target.closest('.status-select');
    if (!sel) return;
    const r = reports.find(x => x.id === sel.dataset.id);
    const status = sel.value;
    sel.disabled = true;
    let err = null;
    if (!r.ngo_id){
      if (status !== 'Pending'){
        ({ error: err } = await sb.rpc('ngo_accept_report', { p_report: r.id }));
        if (!err && status !== 'In Progress'){
          ({ error: err } = await sb.rpc('update_report_status', { p_report: r.id, p_status: status, p_note: '' }));
        }
      }
    } else if (status === 'Pending'){
      if (confirm('Hand this case back so another NGO can take it?')){
        ({ error: err } = await sb.rpc('ngo_release_report', { p_report: r.id }));
      }
    } else {
      ({ error: err } = await sb.rpc('update_report_status', { p_report: r.id, p_status: status, p_note: '' }));
    }
    if (err) alert(friendlyError(err));
    await load();
  });

  $('ngoFilter').addEventListener('change', render);
  await load();
}

/* -------------------------------- NGO team --------------------------------
   The Team view lists the NGO's own members (stored in ngo_members).
   Add with the form under the table; Edit / Remove on each row. */

function initNgoTeam(ngo){
  const tbody = $('ngoTeamBody');
  const form = $('teamForm');
  if (!tbody || !form) return;
  const alertBox = $('teamAlert');
  let members = [];
  let editingId = null;

  async function load(){
    const { data, error } = await sb.from('ngo_members').select('*').eq('ngo_id', ngo.id).order('created_at');
    if (error){ showAlert(alertBox, esc(friendlyError(error))); return; }
    members = data;
    render();
  }

  function viewRow(m){
    return `
      <tr>
        <td>${esc(m.name)}</td>
        <td>${esc(m.role || '—')}</td>
        <td>${m.cases_handled}</td>
        <td>${esc(m.contact || '—')}</td>
        <td class="team-actions">
          <button type="button" class="btn btn-outline btn-sm" data-edit-member="${m.id}">Edit</button>
          <button type="button" class="btn btn-outline btn-sm" data-remove-member="${m.id}">Remove</button>
        </td>
      </tr>`;
  }

  function editRow(m){
    return `
      <tr data-editing="${m.id}">
        <td><input type="text" class="team-input" name="name" value="${esc(m.name)}" maxlength="120"></td>
        <td><input type="text" class="team-input" name="role" value="${esc(m.role)}" maxlength="80"></td>
        <td><input type="number" class="team-input" name="cases" value="${m.cases_handled}" min="0" max="100000" style="width:80px;"></td>
        <td><input type="text" class="team-input" name="contact" value="${esc(m.contact)}" maxlength="200"></td>
        <td class="team-actions">
          <button type="button" class="btn btn-primary btn-sm" data-save-member="${m.id}">Save</button>
          <button type="button" class="btn btn-outline btn-sm" data-cancel-edit>Cancel</button>
        </td>
      </tr>`;
  }

  function render(){
    tbody.innerHTML = members.length
      ? members.map(m => m.id === editingId ? editRow(m) : viewRow(m)).join('')
      : emptyRow(5, 'No team members yet. Add your first one using the form below.');
  }

  function readCases(value){
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 100000) : 0;
  }

  tbody.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit-member]');
    const remove = e.target.closest('[data-remove-member]');
    const save = e.target.closest('[data-save-member]');
    const cancel = e.target.closest('[data-cancel-edit]');
    hideAlert(alertBox);

    if (edit){ editingId = edit.dataset.editMember; render(); return; }
    if (cancel){ editingId = null; render(); return; }

    if (remove){
      const m = members.find(x => x.id === remove.dataset.removeMember);
      if (!confirm(`Remove ${m ? m.name : 'this member'} from your team?`)) return;
      const { error } = await sb.from('ngo_members').delete().eq('id', remove.dataset.removeMember);
      if (error) showAlert(alertBox, esc(friendlyError(error)));
      await load();
      return;
    }

    if (save){
      const row = save.closest('tr');
      const val = name => row.querySelector(`[name="${name}"]`).value.trim();
      if (!val('name')){ showAlert(alertBox, 'Name cannot be empty.'); return; }
      setBusy(save, true, 'Saving…');
      const { error } = await sb.from('ngo_members').update({
        name: val('name'),
        role: val('role'),
        cases_handled: readCases(val('cases')),
        contact: val('contact')
      }).eq('id', save.dataset.saveMember);
      if (error){ setBusy(save, false); showAlert(alertBox, esc(friendlyError(error))); return; }
      editingId = null;
      await load();
      showAlert(alertBox, 'Team member updated.', 'success');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertBox);
    const btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Adding…');
    const { error } = await sb.from('ngo_members').insert({
      ngo_id: ngo.id,
      name: $('memberName').value.trim(),
      role: $('memberRole').value.trim(),
      cases_handled: readCases($('memberCases').value),
      contact: $('memberContact').value.trim()
    });
    setBusy(btn, false);
    if (error){ showAlert(alertBox, esc(friendlyError(error))); return; }
    form.reset();
    await load();
    showAlert(alertBox, 'Team member added.', 'success');
  });

  load();
}

function initNgoNav(ngoName){
  const links = document.querySelectorAll('.side-nav a[data-ngo-view]');
  if (!links.length) return;

  const titles = {
    'reports-all': ['NGO Dashboard', 'Review incoming reports and manage rescue status.'],
    'reports-In Progress': ['Active Rescues', 'Cases your team is currently working on.'],
    'reports-Resolved': ['Resolved Cases', 'Rescues your team has successfully completed.'],
    'team': ['Our Team', `People handling rescues for ${ngoName}.`]
  };

  function switchView(view, filter){
    document.querySelectorAll('.ngo-view').forEach(v => v.style.display = 'none');
    const target = $('ngo-view-' + view);
    if (target) target.style.display = 'block';
    links.forEach(l => l.classList.remove('active'));
    const key = view === 'reports' ? 'reports-' + filter : view;
    if (titles[key]){
      $('ngoViewTitle').textContent = titles[key][0];
      $('ngoViewSubtitle').textContent = titles[key][1];
    }
    if (view === 'reports'){
      const select = $('ngoFilter');
      select.value = filter;
      select.dispatchEvent(new Event('change'));
    }
  }

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(link.dataset.ngoView, link.dataset.filter);
      link.classList.add('active');
    });
  });
}

/* ------------------------------ Admin dashboard ------------------------------
   All reports: the NGO column is a dropdown to assign/unassign an NGO.
   NGOs: lists every registered NGO with an Approve / Suspend button. */

async function initAdminDashboard(){
  const tbody = $('adminReportsBody');
  if (!tbody) return;
  const profile = await requireRole('admin');
  if (!profile) return;
  fillUserChip(profile.full_name || 'Admin', null);
  initAdminNav();

  let reports = [], ngos = [], users = [];

  async function load(){
    const [rRes, nRes, uRes] = await Promise.all([
      sb.from('reports').select('*').order('created_at', { ascending: false }),
      sb.from('ngos').select('*').order('created_at', { ascending: false }),
      sb.from('profiles').select('*').eq('role', 'citizen').order('created_at', { ascending: false })
    ]);
    for (const res of [rRes, nRes, uRes]) if (res.error) throw res.error;
    reports = rRes.data; ngos = nRes.data; users = uRes.data;
    render();
  }

  function render(){
    const approved = ngos.filter(n => n.status === 'approved');
    $('kpiAdminReports').textContent = reports.length;
    $('kpiAdminPending').textContent = reports.filter(r => r.status === 'Pending').length;
    $('kpiAdminResolved').textContent = reports.filter(r => r.status === 'Resolved').length;
    $('kpiAdminNgos').textContent = approved.length;

    $('adminOverviewBody').innerHTML = reports.length ? reports.slice(0, 5).map(r => `
      <tr>
        <td>${reportLink(r)}${r.photo_path ? `<br><a href="#" class="photo-link" data-open-report="${r.id}">📷 Photo</a>` : ''}</td>
        <td>${esc(r.reporter_name)}</td>
        <td>${esc(r.location)}</td>
        <td>${formatDate(r.created_at)}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>`).join('') : emptyRow(5, 'No reports yet.');

    tbody.innerHTML = reports.length ? reports.map(r => `
      <tr>
        <td>${reportLink(r)}${r.photo_path ? `<br><a href="#" class="photo-link" data-open-report="${r.id}">📷 Photo</a>` : ''}</td>
        <td>${esc(r.reporter_name)}</td>
        <td>${esc(r.location)}</td>
        <td>
          <select class="assign-select" data-id="${r.id}" style="width:auto;max-width:130px;padding:6px 8px;font-size:0.8rem;">
            <option value="">—</option>
            ${approved.map(n => `<option value="${n.id}" ${n.id === r.ngo_id ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}
          </select>
        </td>
        <td>${formatDate(r.created_at)}</td>
        <td>${statusBadge(r.status)}</td>
        <td><button class="btn btn-outline btn-sm delete-report" data-id="${r.id}" data-photo="${esc(r.photo_path || '')}">Remove</button></td>
      </tr>`).join('') : emptyRow(7, 'No reports yet.');

    const ngoBody = $('adminNgosBody');
    ngoBody.innerHTML = ngos.length ? ngos.map(n => {
      const assigned = reports.filter(r => r.ngo_id === n.id);
      const resolved = assigned.filter(r => r.status === 'Resolved');
      let status;
      if (n.status === 'approved'){
        status = `<span class="badge badge-resolved">Active</span>
          <button class="btn btn-outline btn-sm ngo-status" data-id="${n.id}" data-status="suspended" style="margin-left:6px;">Suspend</button>`;
      } else {
        const label = n.status === 'suspended' ? 'Suspended' : 'Awaiting approval';
        status = `<span class="badge ${n.status === 'suspended' ? 'badge-rejected' : 'badge-pending'}">${label}</span>
          <button class="btn btn-outline btn-sm ngo-status" data-id="${n.id}" data-status="approved" style="margin-left:6px;">Approve</button>`;
      }
      return `
        <tr>
          <td>${esc(n.name)}</td>
          <td>${assigned.length}</td>
          <td>${resolved.length}</td>
          <td>${status}</td>
        </tr>`;
    }).join('') : emptyRow(4, 'No NGOs have registered yet.');

    $('adminUsersBody').innerHTML = users.length ? users.map(u => `
      <tr>
        <td>${esc(u.full_name || u.email)}</td>
        <td>${esc(u.phone || '—')}</td>
        <td>${reports.filter(r => r.reporter_id === u.id).length}</td>
      </tr>`).join('') : emptyRow(3, 'No users yet.');
  }

  async function run(promise){
    const { error } = await promise;
    if (error) alert(friendlyError(error));
    await load();
  }

  document.addEventListener('change', (e) => {
    const sel = e.target.closest('.assign-select');
    if (sel) run(sb.rpc('admin_assign_report', { p_report: sel.dataset.id, p_ngo: sel.value || null }));
  });

  document.addEventListener('click', async (e) => {
    const del = e.target.closest('.delete-report');
    const ngoBtn = e.target.closest('.ngo-status');
    if (del){
      if (!confirm('Permanently remove this report? This cannot be undone.')) return;
      if (del.dataset.photo) await sb.storage.from(PHOTO_BUCKET).remove([del.dataset.photo]);
      run(sb.from('reports').delete().eq('id', del.dataset.id));
    }
    if (ngoBtn) run(sb.rpc('admin_set_ngo_status', { p_ngo: ngoBtn.dataset.id, p_status: ngoBtn.dataset.status }));
  });

  await load();
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
    const target = $('view-' + view);
    if (target) target.style.display = 'block';
    links.forEach(l => l.classList.toggle('active', l.dataset.view === view));
    if (titles[view]){
      $('adminViewTitle').textContent = titles[view][0];
      $('adminViewSubtitle').textContent = titles[view][1];
    }
  }

  [...links, ...viewLinks].forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });
}

/* ---------------------------------- Contact ---------------------------------- */

function initContactForm(){
  const form = $('contactForm');
  if (!form) return;
  const box = $('contactSuccess');
  const successText = box ? box.innerHTML : '';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    setBusy(btn, true, 'Sending…');
    const { error } = await sb.from('contact_messages').insert({
      name: $('contactName').value.trim(),
      email: $('contactEmail').value.trim(),
      message: $('contactMessage').value.trim()
    });
    setBusy(btn, false);
    if (error){ showAlert(box, esc(friendlyError(error))); return; }
    showAlert(box, successText, 'success');
    form.reset();
  });
}

/* ------------------------------------ Init ------------------------------------ */

document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initRoleToggle();
  initSeverityChips();
  initFileUpload();
  initLogoutLinks();

  if (!sb){
    showConfigBanner();
    return;
  }

  // Report IDs in the NGO and admin tables open the details popup.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-open-report]');
    if (!el) return;
    e.preventDefault();
    openReportModal(el.dataset.openReport);
  });

  try {
    initNavSession();
    initLoginForm();
    initRegisterForm();
    initResetPasswordForm();
    initReportForm();
    initTrackSearch();
    initContactForm();
    await initCitizenDashboard();
    await initMyReports();
    await initNgoDashboard();
    await initAdminDashboard();
  } catch (err){
    console.error(err);
    const main = document.querySelector('.dash-main') || document.querySelector('main');
    if (main){
      const box = document.createElement('div');
      main.prepend(box);
      showAlert(box, 'Something went wrong loading this page: ' + esc(friendlyError(err)));
    }
  }
});
