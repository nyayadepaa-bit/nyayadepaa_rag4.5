/* NyayaDepaaAI Admin — Core */
const API = window.location.hostname === 'localhost' && window.location.port === '7890' ? 'http://localhost:8001/api' : '/api';
let token = sessionStorage.getItem('nd_token') || '';
let email = sessionStorage.getItem('nd_email') || '';
let demo = false;

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const fmt = n => n == null ? '—' : Number(n).toLocaleString();
const fmtD = d => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function toast(msg) {
  const w = $('#toasts'); if (!w) return;
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  w.appendChild(t); setTimeout(() => t.remove(), 3000);
}

async function api(path, opts = {}) {
  if (demo) return mockData(path);
  try {
    const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || `Error ${r.status}`); }
    return r.json();
  } catch (e) {
    if (demo || e.message === 'Failed to fetch') { demo = true; return mockData(path); }
    throw e;
  }
}

function countUp(el, to) {
  const d = 700, s = performance.now();
  const f = n => { const p = Math.min((n - s) / d, 1); const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(to * eased).toLocaleString(); if (p < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}

/* ─── Chart.js — ANIMATED defaults ─── */
Chart.defaults.color = '#9ca3af'; Chart.defaults.borderColor = '#e5e7eb';
Chart.defaults.font.family = 'Inter'; Chart.defaults.font.size = 11;
const charts = {};
function kill(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

/* Delayed-reveal animation plugin */
const delayPlugin = {
  id: 'delayedReveal',
  beforeDraw(chart) {
    if (chart._delayDone) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data.length) return;
    meta.data.forEach((pt, i) => {
      pt.options = pt.options || {};
    });
  }
};

function lineChart(id, labels, sets) {
  kill(id); const c = document.getElementById(id); if (!c) return;
  charts[id] = new Chart(c, { type: 'line', data: { labels, datasets: sets },
    options: { responsive: true, maintainAspectRatio: false,
      animation: { duration: 1400, easing: 'easeInOutQuart',
        delay(ctx) { return ctx.type === 'data' ? ctx.dataIndex * 30 + ctx.datasetIndex * 200 : 0; } },
      transitions: { active: { animation: { duration: 200 } } },
      plugins: { legend: { display: sets.length > 1, labels: { font: { size: 11, weight: '500' }, usePointStyle: true, pointStyle: 'circle', padding: 16 } },
        tooltip: { mode: 'index', intersect: false, backgroundColor: '#111827', titleFont: { weight: '600' }, bodyFont: { size: 12 }, cornerRadius: 6, padding: 10,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}` } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { weight: '500' } } },
        y: { grid: { color: '#f3f4f620' }, beginAtZero: true, ticks: { font: { weight: '500' } } } },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      elements: { point: { hoverRadius: 6, hoverBorderWidth: 2 }, line: { borderWidth: 2 } } } });
}

function barChart(id, labels, data, color = '#6b7280', opts = {}) {
  kill(id); const c = document.getElementById(id); if (!c) return;
  charts[id] = new Chart(c, { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: color + 'cc', hoverBackgroundColor: color, borderRadius: 4, barPercentage: 0.65 }] },
    options: { responsive: true, maintainAspectRatio: false,
      animation: { duration: 1000, easing: 'easeOutQuart',
        delay(ctx) { return ctx.type === 'data' ? ctx.dataIndex * 50 : 0; } },
      plugins: { legend: { display: false },
        tooltip: { backgroundColor: '#111827', cornerRadius: 6, padding: 10,
          callbacks: { label: ctx => ` ${ctx.parsed.y.toLocaleString()}` } } },
      scales: { x: { grid: { display: false }, ticks: { font: { weight: '500' } } },
        y: { grid: { color: '#f3f4f620' }, beginAtZero: true } }, ...opts } });
}

function donut(id, labels, data, colors) {
  kill(id); const c = document.getElementById(id); if (!c) return;
  charts[id] = new Chart(c, { type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
    options: { responsive: true, maintainAspectRatio: false,
      animation: { duration: 1200, easing: 'easeOutQuart', animateRotate: true, animateScale: true },
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11, weight: '500' }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: { backgroundColor: '#111827', cornerRadius: 6,
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${(ctx.parsed / ctx.dataset.data.reduce((a,b) => a+b, 0) * 100).toFixed(1)}%)` } } },
      cutout: '70%' } });
}

/* Area chart variant */
function areaChart(id, labels, data, color, label = '') {
  kill(id); const c = document.getElementById(id); if (!c) return;
  const grad = c.getContext('2d');
  const g = grad.createLinearGradient(0, 0, 0, 250);
  g.addColorStop(0, color + '30'); g.addColorStop(1, color + '02');
  charts[id] = new Chart(c, { type: 'line',
    data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: g, fill: true,
      tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: color, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false,
      animation: { duration: 1600, easing: 'easeInOutQuart',
        delay(ctx) { return ctx.type === 'data' ? ctx.dataIndex * 20 : 0; } },
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: '#111827', cornerRadius: 6, padding: 10 } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { weight: '500' } } },
        y: { grid: { color: '#f3f4f620' }, beginAtZero: true } },
      interaction: { mode: 'nearest', axis: 'x', intersect: false } } });
}

/* MOCK DATA */
function mockData(path) {
  const now = new Date(); const d30 = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); d30.push(d.toISOString().slice(0, 10)); }
  const R = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const names = ['Priya Sharma','Meera Patel','Anita Desai','Kavya Reddy','Sunita Gupta','Deepa Nair','Ritu Singh','Neha Joshi','Lakshmi Rao','Pooja Verma','Sanya Khan','Divya Pillai'];
  const cities = ['Mumbai','Delhi','Bangalore','Chennai','Hyderabad','Pune','Kolkata','Ahmedabad','Jaipur','Lucknow'];

  if (path.includes('/analytics/enhanced')) return {
    total_users:1847,active_users:1623,total_inputs:12450,queries_today:189,users_today:34,inputs_today:312,server_uptime:'14d 6h',admin_count:3,avg_queries_per_user:6.74,
    users_per_day:d30.map(d=>({date:d,count:R(15,85)})), queries_per_day:d30.map(d=>({date:d,count:R(80,420)})),
    active_users_per_day:d30.map(d=>({date:d,count:R(40,180)})),
    top_action_types:[{name:'chat_query',count:8234},{name:'legal_summary',count:2890},{name:'follow_up',count:1567},{name:'doc_view',count:890},{name:'prediction',count:456}],
    users_by_city:cities.map(c=>({name:c,count:R(50,400)})),
    users_by_role:[{name:'user',count:1844},{name:'admin',count:3}],
    hourly_activity:Array.from({length:24},(_,i)=>({name:`${String(i).padStart(2,'0')}:00`,count:i>=8&&i<=22?R(80,320):R(5,30)})),
    ai_query_status_breakdown:[{name:'completed',count:11200},{name:'pending',count:180},{name:'error',count:42}]};
  if (path.includes('/analytics')) return {total_users:1847,active_users:1623,total_inputs:12450,queries_today:189,users_today:34,inputs_today:312,server_uptime:'14d 6h',admin_count:3};
  if (path.includes('/admin/users')) return names.map((n,i)=>({id:crypto.randomUUID(),name:n,email:n.toLowerCase().replace(' ','.')+'@gmail.com',age:R(20,55),city:cities[i%cities.length],role:i===0?'admin':'user',is_active:Math.random()>0.15,activity_count:R(2,120),created_at:new Date(now-R(1,90)*864e5).toISOString()}));
  if (path.match(/\/admin\/activity/)){const items=Array.from({length:20},(_,i)=>({id:i+1,user_name:names[i%names.length],user_email:names[i%names.length].toLowerCase().replace(' ','.')+'@gmail.com',input_text:['What are my legal rights?','I need help with DV case','How to file FIR?','Child custody rights','Workplace harassment'][i%5],action_type:['chat_query','legal_summary','follow_up'][i%3],timestamp:new Date(now-R(0,7)*864e5).toISOString(),ip_address:`192.168.${R(1,10)}.${R(1,254)}`}));return{items,total:156,page:1,page_size:50,pages:4};}
  if (path.match(/\/admin\/conversations\/[a-f0-9-]+/)) return Array.from({length:5},(_,i)=>({id:i+1,input_text:['Tell me about my rights','I am facing domestic violence','What legal action can I take?','How long will the case take?','Thank you'][i],response_text:['Based on Indian law, you have several rights under the Protection of Women from Domestic Violence Act 2005...','I understand your situation. Under Section 498A of IPC and PWDVA...','You can file an FIR at the nearest police station. Under Section 12 of PWDVA...','Cases like yours typically take 6-18 months depending on court backlog...','You are welcome. Please reach out anytime you need help.'][i],timestamp:new Date(now-(5-i)*36e5).toISOString()}));
  if (path.match(/\/admin\/conversations/)){const items=names.slice(0,8).map((n,i)=>({user_id:crypto.randomUUID(),user_name:n,user_email:n.toLowerCase().replace(' ','.')+'@gmail.com',city:cities[i%cities.length],message_count:R(3,25),last_active:new Date(now-R(0,14)*864e5).toISOString()}));return{items,total:8,page:1,page_size:20,pages:1};}
  if (path.includes('/audit-log')) return Array.from({length:10},(_,i)=>({id:i+1,admin_email:'admin@nyayadepaa.com',action:['user_enabled','user_disabled','user_deleted','conversations_deleted','user_enabled'][i%5],target_email:names[i%names.length].toLowerCase().replace(' ','.')+'@gmail.com',details:`Action on ${names[i%names.length]}`,timestamp:new Date(now-R(0,30)*864e5).toISOString(),ip_address:`103.21.${R(1,255)}.${R(1,255)}`}));
  return {};
}

/* APP SHELL */
function renderApp() {
  const hasAccess = token || demo;
  document.getElementById('app').innerHTML = `
    ${!hasAccess ? `<div id="login-screen">
      <div class="login-card">
        <div class="login-header"><h1>NyayaDepaaAI Admin</h1><p>Access restricted. Log in from the main bot page.</p></div>
        <a href="/" class="btn-primary" style="display:block;text-align:center;text-decoration:none;color:#fff">Go to NyayaSakhi Bot</a>
        <div class="login-alt"><button class="btn-ghost" id="demo-btn">View with sample data</button></div>
      </div>
    </div>` : ''}
    <div id="app-layout" class="${hasAccess?'':'hidden'}">
      <aside class="sidebar">
        <a href="/" class="sidebar-brand" style="text-decoration:none;color:inherit"><div class="brand-mark">N</div><span>NyayaAdmin</span></a>
        <nav class="sidebar-nav">
          <div class="nav-group"><div class="nav-group-label">Overview</div>
            <div class="nav-link active" data-p="overview"><i class="nav-ico">~</i><span>Dashboard</span></div></div>
          <div class="nav-group"><div class="nav-group-label">Manage</div>
            <div class="nav-link" data-p="users"><i class="nav-ico">#</i><span>Users</span></div>
            <div class="nav-link" data-p="activity"><i class="nav-ico">></i><span>Activity</span></div>
            <div class="nav-link" data-p="conversations"><i class="nav-ico">"</i><span>Conversations</span></div></div>
          <div class="nav-group"><div class="nav-group-label">Insights</div>
            <div class="nav-link" data-p="analytics"><i class="nav-ico">%</i><span>Analytics</span></div>
            <div class="nav-link" data-p="audit"><i class="nav-ico">!</i><span>Audit Log</span></div></div>
          <div class="nav-group"><div class="nav-group-label">System</div>
            <div class="nav-link" data-p="export"><i class="nav-ico">^</i><span>Export</span></div></div>
        </nav>
        <div class="sidebar-footer"><div class="user-block"><div class="avatar" id="s-av">A</div><div class="uinfo"><div class="uname" id="s-name">Admin</div><div class="urole">Administrator</div></div><button class="btn-logout" id="logout-btn">Sign out</button></div></div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="topbar-title" id="pg-title">Dashboard</div>
          <div class="topbar-right">
            <a href="/" class="btn-sm" style="text-decoration:none">Back to Bot</a>
            <div class="chip" id="uptime"><span class="dot"></span>Uptime: —</div>
            <button class="btn-sm" id="refresh-btn">Refresh</button>
          </div>
        </header>
        <div class="page active" id="pg-overview"></div>
        <div class="page" id="pg-users"></div>
        <div class="page" id="pg-activity"></div>
        <div class="page" id="pg-conversations"></div>
        <div class="page" id="pg-analytics"></div>
        <div class="page" id="pg-audit"></div>
        <div class="page" id="pg-export"></div>
      </main>
    </div>
    <div class="overlay" id="overlay"><div class="modal" id="modal"></div></div>
    <div class="toasts" id="toasts"></div>`;
  bind();
  if (hasAccess) { setSidebar(); loadOverview(); }
}

function bind() {
  $$('.nav-link').forEach(n => n.addEventListener('click', () => {
    $$('.nav-link').forEach(x => x.classList.remove('active')); n.classList.add('active');
    const p = n.dataset.p; $$('.page').forEach(x => x.classList.remove('active')); $(`#pg-${p}`).classList.add('active');
    const t = {overview:'Dashboard',users:'Users',activity:'Activity',conversations:'Conversations',analytics:'Analytics',audit:'Audit Log',export:'Export'};
    $('#pg-title').textContent = t[p] || p;
    ({overview:loadOverview,users:loadUsers,activity:loadActivity,conversations:loadConversations,analytics:loadAnalytics,audit:loadAudit,export:renderExport})[p]?.();
  }));
  $('#refresh-btn')?.addEventListener('click', () => { const p = $('.nav-link.active')?.dataset.p; ({overview:loadOverview,users:loadUsers,activity:loadActivity,conversations:loadConversations,analytics:loadAnalytics,audit:loadAudit})[p]?.(); toast('Refreshed'); });
  $('#overlay')?.addEventListener('click', e => { if (e.target === $('#overlay')) closeModal(); });
  $('#demo-btn')?.addEventListener('click', () => { demo = true; const ls = $('#login-screen'); if (ls) ls.remove(); $('#app-layout').classList.remove('hidden'); setSidebar(); loadOverview(); toast('Showing sample data'); });
  $('#logout-btn')?.addEventListener('click', () => { token = ''; email = ''; sessionStorage.removeItem('nd_token'); sessionStorage.removeItem('nd_email'); window.location.href = '/'; });
}

function setSidebar() {
  const n = $('#s-name'); if (n) n.textContent = demo ? 'Demo' : (email.split('@')[0] || 'Admin');
  const a = $('#s-av'); if (a) a.textContent = demo ? 'D' : (email?.[0]?.toUpperCase() || 'A');
}




function openModal(title, html) { $('#modal').innerHTML = `<div class="modal-head"><h3>${title}</h3><button class="modal-x" onclick="closeModal()">×</button></div><div id="modal-c">${html}</div>`; $('#overlay').classList.add('open'); }
function closeModal() { $('#overlay').classList.remove('open'); }

/* OVERVIEW — with animated area charts */
async function loadOverview() {
  const c = $('#pg-overview'); c.innerHTML = `<div class="loader"><div class="spin-ring"></div>Loading</div>`;
  try {
    const [b, e] = await Promise.all([api('/admin/analytics'), api('/admin/analytics/enhanced')]);
    if ($('#uptime')) $('#uptime').innerHTML = `<span class="dot"></span>Uptime: ${e.server_uptime||'—'}`;
    c.innerHTML = `
      <div class="stat-row" id="stats"></div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><span class="card-title">User registrations</span><span class="card-sub">30 days</span></div><div class="chart-box"><canvas id="c1"></canvas></div></div>
        <div class="card"><div class="card-head"><span class="card-title">Activity volume</span><span class="card-sub">30 days</span></div><div class="chart-box"><canvas id="c2"></canvas></div></div>
      </div>
      <div class="grid-3">
        <div class="card"><div class="card-head"><span class="card-title">Users by city</span></div><div class="chart-box tall"><canvas id="c3"></canvas></div></div>
        <div class="card"><div class="card-head"><span class="card-title">Hourly distribution</span></div><div class="chart-box tall"><canvas id="c4"></canvas></div></div>
        <div class="card"><div class="card-head"><span class="card-title">Composition</span></div><div class="chart-box tall"><canvas id="c5"></canvas></div></div>
      </div>`;
    const stats = [
      {l:'Total users',v:b.total_users,n:`+${b.users_today} today`},
      {l:'Active users',v:b.active_users,n:`${b.admin_count} admins`},
      {l:'Total inputs',v:b.total_inputs,n:`+${b.inputs_today} today`},
      {l:'Queries today',v:b.queries_today,n:'AI consultations'},
      {l:'Avg queries/user',v:e.avg_queries_per_user,n:'Engagement'},
    ];
    const g = $('#stats');
    stats.forEach((s, i) => { const d = document.createElement('div'); d.className = 'stat';
      d.style.animationDelay = `${i * 80}ms`;
      d.innerHTML = `<div class="stat-label">${s.l}</div><div class="stat-val" data-t="${s.v}">0</div><div class="stat-note">${s.n}</div>`;
      g.appendChild(d); });
    $$('.stat-val[data-t]').forEach(el => countUp(el, parseFloat(el.dataset.t) || 0));

    setTimeout(() => {
      const u = e.users_per_day||[], q = e.queries_per_day||[];
      areaChart('c1', u.map(d=>d.date.slice(5)), u.map(d=>d.count), '#111827', 'Users');
      areaChart('c2', q.map(d=>d.date.slice(5)), q.map(d=>d.count), '#2563eb', 'Activity');
      const ci = (e.users_by_city||[]).slice(0,10);
      barChart('c3', ci.map(c=>c.name), ci.map(c=>c.count), '#6b7280');
      const h = e.hourly_activity||[];
      barChart('c4', h.map(x=>x.name), h.map(x=>x.count), '#2563eb');
      const r = e.users_by_role||[], qs = e.ai_query_status_breakdown||[];
      donut('c5', [...r.map(x=>x.name),...qs.map(x=>x.name)], [...r.map(x=>x.count),...qs.map(x=>x.count)], ['#111827','#9ca3af','#059669','#d97706','#dc2626']);
    }, 80);
  } catch (x) { c.innerHTML = `<div class="empty">${x.message}</div>`; }
}
