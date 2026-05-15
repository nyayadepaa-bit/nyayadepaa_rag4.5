/* USERS */
let uQ = '', uR = '', uS = 0;
async function loadUsers(skip = 0) {
  uS = skip; const c = $('#pg-users');
  c.innerHTML = `<div class="tbl-wrap"><div class="tbl-bar">
    <div class="tbl-search"><input id="u-q" placeholder="Search users..." value="${uQ}" /></div>
    <select class="tbl-filter" id="u-r"><option value="">All roles</option><option value="user" ${uR==='user'?'selected':''}>User</option><option value="admin" ${uR==='admin'?'selected':''}>Admin</option></select>
    <button id="bulk-del-btn" class="act act-danger" style="display:none;margin-left:8px" onclick="bulkDel()">Delete Selected</button>
    <span class="tbl-count" id="u-c">—</span></div>
    <div id="u-b"><div class="loader"><div class="spin-ring"></div>Loading</div></div></div>`;
  let t; $('#u-q').addEventListener('input', e => { uQ = e.target.value; clearTimeout(t); t = setTimeout(() => loadUsers(0), 300); });
  $('#u-r').addEventListener('change', e => { uR = e.target.value; loadUsers(0); });
  try {
    const p = new URLSearchParams({search:uQ,role:uR,skip,limit:50});
    const d = await api(`/admin/users?${p}`);
    $('#u-c').textContent = `${d.length} users`;
    if (!d.length) { $('#u-b').innerHTML = `<div class="empty">No users found</div>`; return; }
    $('#u-b').innerHTML = `<div style="overflow-x:auto"><table>
      <thead><tr><th style="width:40px"><input type="checkbox" id="chk-all" onchange="$$('.chk-u').forEach(c => c.checked = this.checked); updateBulkBtn();"></th><th>Name</th><th>Email</th><th>City</th><th>Role</th><th>Status</th><th>Activity</th><th>Joined</th><th>Actions</th></tr></thead>
      <tbody>${d.map(u => `<tr>
        <td>${u.role!=='admin'?`<input type="checkbox" class="chk-u" value="${u.id}" onchange="updateBulkBtn()">`:''}</td>
        <td><span class="cell-name">${u.name}</span><br><span class="cell-mono">${(u.id||'').slice(0,8)}</span></td>
        <td class="cell-mono">${u.email||'—'}</td>
        <td>${u.city||'—'}</td>
        <td><span class="tag ${u.role==='admin'?'tag-admin':'tag-user'}">${u.role}</span></td>
        <td><span class="tag ${u.is_active?'tag-active':'tag-inactive'}">${u.is_active?'Active':'Disabled'}</span></td>
        <td>${fmt(u.activity_count)}</td>
        <td>${fmtD(u.created_at)}</td>
        <td><div class="acts">
          <button class="act" onclick="togUser('${u.id}',${!u.is_active})">${u.is_active?'Disable':'Enable'}</button>
          ${u.role!=='admin'?`<button class="act act-danger" onclick="delUser('${u.id}','${u.name}')">Delete</button>`:''}
        </div></td></tr>`).join('')}</tbody></table></div>
    <div class="pager"><span>${skip+1}–${skip+d.length}</span>
      <div class="pager-btns"><button class="pg" ${skip===0?'disabled':''} onclick="loadUsers(${Math.max(0,skip-50)})">‹</button><button class="pg" ${d.length<50?'disabled':''} onclick="loadUsers(${skip+50})">›</button></div></div>`;
  } catch (x) { $('#u-b').innerHTML = `<div class="empty">${x.message}</div>`; }
}
function updateBulkBtn() {
  const sel = $$('.chk-u:checked').length;
  const btn = $('#bulk-del-btn');
  if (btn) {
    btn.style.display = sel > 0 ? 'inline-block' : 'none';
    btn.textContent = `Delete Selected (${sel})`;
  }
}
async function bulkDel() {
  const ids = $$('.chk-u:checked').map(c => c.value);
  if (!ids.length || !confirm(`Delete ${ids.length} selected users?`)) return;
  if (demo) { toast(`Deleted ${ids.length} users`); loadUsers(uS); return; }
  try {
    $('#bulk-del-btn').textContent = 'Deleting...';
    await api('/admin/users/bulk-delete', { method: 'POST', body: JSON.stringify({ user_ids: ids }) });
    toast(`Deleted ${ids.length} users`);
    loadUsers(uS);
  } catch(x) { toast(x.message); $('#bulk-del-btn').textContent = `Delete Selected`; }
}
async function togUser(id, s) { if (demo) { toast(`User ${s?'enabled':'disabled'}`); loadUsers(uS); return; }
  try { await api(`/admin/users/${id}/toggle`,{method:'PATCH',body:JSON.stringify({is_active:s})}); toast('Updated'); loadUsers(uS); } catch(x){ toast(x.message); } }
async function delUser(id, n) { if (!confirm(`Delete "${n}"?`)) return;
  if (demo) { toast(`Deleted "${n}"`); loadUsers(uS); return; }
  try { await api(`/admin/users/${id}`,{method:'DELETE'}); toast('Deleted'); loadUsers(uS); } catch(x){ toast(x.message); } }

/* ACTIVITY */
let aQ = '';
async function loadActivity(pg = 1) {
  const c = $('#pg-activity');
  c.innerHTML = `<div class="tbl-wrap"><div class="tbl-bar">
    <div class="tbl-search"><input id="a-q" placeholder="Search..." value="${aQ}" /></div>
    <span class="tbl-count" id="a-c">—</span></div>
    <div id="a-b"><div class="loader"><div class="spin-ring"></div>Loading</div></div></div>`;
  $('#a-q').addEventListener('input', e => { aQ = e.target.value; loadActivity(1); });
  try {
    const d = await api(`/admin/activity?search=${aQ}&page=${pg}&page_size=50`);
    $('#a-c').textContent = `${d.total} records`;
    if (!d.items.length) { $('#a-b').innerHTML = `<div class="empty">No activity</div>`; return; }
    $('#a-b').innerHTML = `<div style="overflow-x:auto"><table>
      <thead><tr><th>User</th><th>Type</th><th>Input</th><th>IP</th><th>Time</th></tr></thead>
      <tbody>${d.items.map(a => `<tr>
        <td><span class="cell-name">${a.user_name||'—'}</span><br><span class="cell-mono">${a.user_email||''}</span></td>
        <td><span class="tag tag-user">${a.action_type}</span></td>
        <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.input_text||'—'}</td>
        <td class="cell-mono">${a.ip_address||'—'}</td>
        <td>${fmtD(a.timestamp)}</td></tr>`).join('')}</tbody></table></div>
    <div class="pager"><span>Page ${d.page}/${d.pages} — ${d.total} total</span>
      <div class="pager-btns">
        <button class="pg" ${d.page<=1?'disabled':''} onclick="loadActivity(${d.page-1})">‹</button>
        ${Array.from({length:Math.min(5,d.pages)},(_,i)=>{const p=Math.max(1,d.page-2)+i;return p<=d.pages?`<button class="pg ${p===d.page?'on':''}" onclick="loadActivity(${p})">${p}</button>`:''}).join('')}
        <button class="pg" ${d.page>=d.pages?'disabled':''} onclick="loadActivity(${d.page+1})">›</button>
      </div></div>`;
  } catch (x) { $('#a-b').innerHTML = `<div class="empty">${x.message}</div>`; }
}

/* CONVERSATIONS */
let cQ = '';
async function loadConversations(pg = 1) {
  const c = $('#pg-conversations');
  c.innerHTML = `<div class="tbl-wrap"><div class="tbl-bar">
    <div class="tbl-search"><input id="cv-q" placeholder="Search user..." value="${cQ}" /></div>
    <span class="tbl-count" id="cv-c">—</span></div>
    <div id="cv-b"><div class="loader"><div class="spin-ring"></div>Loading</div></div></div>`;
  $('#cv-q').addEventListener('input', e => { cQ = e.target.value; loadConversations(1); });
  try {
    const d = await api(`/admin/conversations?search=${cQ}&page=${pg}&page_size=20`);
    $('#cv-c').textContent = `${d.total} users`;
    if (!d.items.length) { $('#cv-b').innerHTML = `<div class="empty">No conversations</div>`; return; }
    $('#cv-b').innerHTML = `<div style="overflow-x:auto"><table>
      <thead><tr><th>User</th><th>City</th><th>Messages</th><th>Last active</th><th></th></tr></thead>
      <tbody>${d.items.map(x => `<tr>
        <td><span class="cell-name">${x.user_name}</span><br><span class="cell-mono">${x.user_email}</span></td>
        <td>${x.city||'—'}</td>
        <td>${x.message_count}</td>
        <td>${fmtD(x.last_active)}</td>
        <td><button class="act" onclick="viewConv('${x.user_id}','${x.user_name}')">View</button></td></tr>`).join('')}</tbody></table></div>`;
  } catch (x) { $('#cv-b').innerHTML = `<div class="empty">${x.message}</div>`; }
}
async function viewConv(id, name) {
  openModal(`${name} — Conversation`, `<div class="loader"><div class="spin-ring"></div>Loading</div>`);
  try {
    const m = await api(`/admin/conversations/${id}?limit=200`);
    if (!m.length) { $('#modal-c').innerHTML = `<div class="empty">No messages</div>`; return; }
    $('#modal-c').innerHTML = m.map(x => `<div style="margin-bottom:12px">
      <div class="msg msg-user"><strong>User:</strong> ${x.input_text||'—'}<div class="msg-ts">${fmtD(x.timestamp)}</div></div>
      ${x.response_text?`<div class="msg msg-ai"><strong>AI:</strong> ${x.response_text.slice(0,500)}${x.response_text.length>500?'...':''}</div>`:''}</div>`).join('');
  } catch (x) { $('#modal-c').innerHTML = `<div class="empty">${x.message}</div>`; }
}

/* ANALYTICS — enhanced with animated area charts */
async function loadAnalytics() {
  const c = $('#pg-analytics'); c.innerHTML = `<div class="loader"><div class="spin-ring"></div>Loading</div>`;
  try {
    const e = await api('/admin/analytics/enhanced');
    c.innerHTML = `
      <div class="stat-row">
        <div class="stat" style="animation-delay:0ms"><div class="stat-label">Total users</div><div class="stat-val" data-t="${e.total_users}">0</div></div>
        <div class="stat" style="animation-delay:80ms"><div class="stat-label">Active</div><div class="stat-val" data-t="${e.active_users}">0</div></div>
        <div class="stat" style="animation-delay:160ms"><div class="stat-label">Inputs</div><div class="stat-val" data-t="${e.total_inputs}">0</div></div>
        <div class="stat" style="animation-delay:240ms"><div class="stat-label">Avg Q/User</div><div class="stat-val">${e.avg_queries_per_user}</div></div>
        <div class="stat" style="animation-delay:320ms"><div class="stat-label">Today</div><div class="stat-val" data-t="${e.queries_today}">0</div></div>
      </div>
      <div class="grid-2">
        <div class="card full"><div class="card-head"><span class="card-title">30-day trend — Users vs Activity</span></div><div class="chart-box tall"><canvas id="a1"></canvas></div></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><span class="card-title">Active users / day</span></div><div class="chart-box"><canvas id="a2"></canvas></div></div>
        <div class="card"><div class="card-head"><span class="card-title">Top actions</span></div><div class="chart-box"><canvas id="a3"></canvas></div></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><span class="card-title">By city</span></div><div class="chart-box"><canvas id="a4"></canvas></div></div>
        <div class="card"><div class="card-head"><span class="card-title">Query status</span></div><div class="chart-box"><canvas id="a5"></canvas></div></div>
      </div>`;
    $$('.stat-val[data-t]').forEach(el => countUp(el, parseFloat(el.dataset.t) || 0));
    setTimeout(() => {
      const u=e.users_per_day||[],q=e.queries_per_day||[];
      const all=[...new Set([...u.map(d=>d.date),...q.map(d=>d.date)])].sort();
      const um=Object.fromEntries(u.map(d=>[d.date,d.count])),qm=Object.fromEntries(q.map(d=>[d.date,d.count]));
      lineChart('a1',all.map(d=>d.slice(5)),[
        {label:'Users',data:all.map(d=>um[d]||0),borderColor:'#111827',backgroundColor:'#11182710',fill:true,tension:0.4,pointRadius:0,pointHoverRadius:5,borderWidth:2},
        {label:'Activity',data:all.map(d=>qm[d]||0),borderColor:'#2563eb',backgroundColor:'#2563eb10',fill:true,tension:0.4,pointRadius:0,pointHoverRadius:5,borderWidth:2}]);
      const au=e.active_users_per_day||[];
      areaChart('a2', au.map(d=>d.date.slice(5)), au.map(d=>d.count), '#059669', 'Active');
      barChart('a3',(e.top_action_types||[]).map(a=>a.name),(e.top_action_types||[]).map(a=>a.count),'#6b7280');
      barChart('a4',(e.users_by_city||[]).map(c=>c.name),(e.users_by_city||[]).map(c=>c.count),'#4b5563');
      const qs=e.ai_query_status_breakdown||[];
      donut('a5',qs.map(s=>s.name),qs.map(s=>s.count),['#059669','#d97706','#dc2626']);
    }, 80);
  } catch (x) { c.innerHTML = `<div class="empty">${x.message}</div>`; }
}

/* AUDIT */
async function loadAudit(skip = 0) {
  const c = $('#pg-audit'); c.innerHTML = `<div class="loader"><div class="spin-ring"></div>Loading</div>`;
  try {
    const d = await api(`/admin/audit-log?skip=${skip}&limit=50`);
    const cls = a => a.includes('delete')||a.includes('disabled')?'del':a.includes('enabled')?'ok':'info';
    c.innerHTML = `<div class="sec-head"><span class="sec-title">Audit trail</span></div>
      <div class="card" style="padding:16px">
        ${d.length ? d.map(a => `<div class="audit-row">
          <div class="audit-dot ${cls(a.action)}"></div>
          <div style="flex:1"><div class="audit-label">${a.action.replace(/_/g,' ')}</div>
            <div class="audit-meta">By ${a.admin_email||'system'}${a.target_email?` → ${a.target_email}`:''}${a.ip_address?` · ${a.ip_address}`:''} · ${fmtD(a.timestamp)}</div>
            ${a.details?`<div class="audit-meta">${a.details}</div>`:''}</div></div>`).join('') : '<div class="empty">No records</div>'}
      </div>
      <div class="pager" style="border:none;padding:12px 0"><span>${skip+1}–${skip+d.length}</span>
        <div class="pager-btns"><button class="pg" ${skip===0?'disabled':''} onclick="loadAudit(${Math.max(0,skip-50)})">‹</button><button class="pg" ${d.length<50?'disabled':''} onclick="loadAudit(${skip+50})">›</button></div></div>`;
  } catch (x) { c.innerHTML = `<div class="empty">${x.message}</div>`; }
}

/* EXPORT */
function renderExport() {
  $('#pg-export').innerHTML = `
    <div class="sec-head"><span class="sec-title">Data export</span></div>
    <div class="export-row">
      <div class="export-opt" onclick="doExport('json')"><h4>JSON</h4><p>Structured data — conversations, users, queries</p></div>
      <div class="export-opt" onclick="doExport('txt')"><h4>Text</h4><p>Human-readable conversation transcripts</p></div>
      <div class="export-opt" onclick="toast('Coming soon')"><h4>CSV</h4><p>Spreadsheet-compatible user data</p></div>
    </div>`;
}
async function doExport(f) {
  if (demo) { toast('Not available in sample mode'); return; }
  toast('Preparing...'); try {
    const r = await fetch(`${API}/admin/export?format=${f}`,{headers:{Authorization:`Bearer ${token}`}});
    if (!r.ok) throw new Error(`Error ${r.status}`);
    const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a');
    a.href = u; a.download = r.headers.get('Content-Disposition')?.match(/filename=(.+)/)?.[1]||`export.${f}`;
    a.click(); URL.revokeObjectURL(u); toast('Downloaded');
  } catch (x) { toast(`Failed: ${x.message}`); }
}

function navTo(p) { $$('.nav-link').forEach(n=>{n.classList.remove('active');if(n.dataset.p===p)n.classList.add('active')}); $$('.page').forEach(x=>x.classList.remove('active')); $(`#pg-${p}`).classList.add('active'); ({overview:loadOverview,users:loadUsers,activity:loadActivity,conversations:loadConversations,analytics:loadAnalytics,audit:loadAudit,export:renderExport})[p]?.(); }

renderApp();
