
const state = {
  token: localStorage.getItem('ea_auth_token') || null,
  currentUser: JSON.parse(localStorage.getItem('ea_auth_user') || 'null'),
  locations: [],
  visits: [],
  pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
  filters: { status: '', location_id: '' },
  activeTab: 'visits',
};

document.addEventListener('DOMContentLoaded', async () => {
  if (state.token && state.currentUser) {
    showWorkspace();
    await loadLocations();
  } else {
    showAuth();
  }
});

async function handleLoginSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  await performLogin(email, password);
}

async function quickLogin(email) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = 'Password123!';
  await performLogin(email, 'Password123!');
}

async function performLogin(email, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      
      handleApiError({ status: res.status }, data);
      return;
    }

    state.token = data.token;
    state.currentUser = data.user;
    localStorage.setItem('ea_auth_token', data.token);
    localStorage.setItem('ea_auth_user', JSON.stringify(data.user));

    showNotification(`Welcome back, ${data.user.full_name}!`, 'success');
    showWorkspace();
    await loadLocations();
  } catch (err) {
    
    handleApiError(err);
  }
}

function handleLogout() {
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem('ea_auth_token');
  localStorage.removeItem('ea_auth_user');
  showNotification('You have signed out.', 'success');
  showAuth();
}

function showAuth() {
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('workspace-section').classList.add('hidden');
  document.getElementById('user-nav-panel').classList.add('hidden');
}

function showWorkspace() {
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('workspace-section').classList.remove('hidden');
  document.getElementById('user-nav-panel').classList.remove('hidden');

  document.getElementById('user-display-name').textContent = state.currentUser.full_name;
  const roleBadge = document.getElementById('user-role-badge');
  roleBadge.textContent = state.currentUser.role.replace('_', ' ');
  roleBadge.className = 'badge badge-role';

  const banner = document.getElementById('role-context-text');
  if (state.currentUser.role === 'FIELD_OFFICER') {
    banner.innerHTML = `<strong>Field Officer Mode:</strong> You can plan new visits (starts in DRAFT), submit them to HQ for approval, edit returned visits, and mark your approved visits as completed. You only see your own visits.`;
    document.getElementById('tab-summary').classList.add('hidden');
    document.getElementById('tab-create').classList.remove('hidden');
  } else if (state.currentUser.role === 'HQ_APPROVER') {
    banner.innerHTML = `<strong>HQ Approver Mode:</strong> You can review submitted field visits awaiting decision (PENDING), approve or reject with written remarks, and inspect program-wide summaries and budget allocations across locations.`;
    document.getElementById('tab-summary').classList.remove('hidden');
    document.getElementById('tab-create').classList.add('hidden');
  } else if (state.currentUser.role === 'ADMIN') {
    banner.innerHTML = `<strong>HQ Admin Mode:</strong> Full administrative privileges. You can view all visits (including all officer drafts), plan visits, approve/reject pending visits, and view program-wide HQ summary numbers.`;
    document.getElementById('tab-summary').classList.remove('hidden');
    document.getElementById('tab-create').classList.remove('hidden');
  }

  switchTab('visits');
}

function canAccessSummary() {
  return state.currentUser && (state.currentUser.role === 'HQ_APPROVER' || state.currentUser.role === 'ADMIN');
}

function switchTab(tabName) {
  state.activeTab = tabName;
  ['visits', 'create', 'summary'].forEach(t => {
    const tabBtn = document.getElementById(`tab-${t}`);
    const tabView = document.getElementById(`view-${t}`);
    if (tabBtn) tabBtn.classList.toggle('active', t === tabName);
    if (tabView) tabView.classList.toggle('hidden', t !== tabName);
  });

  if (tabName === 'visits') loadVisits();
  if (tabName === 'summary') loadSummary();
}

async function loadLocations() {
  try {
    const res = await fetch('/api/locations', {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    state.locations = data.locations;

    const filterLoc = document.getElementById('filter-location');
    filterLoc.innerHTML = '<option value="">All Locations</option>';
    state.locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = `${loc.name} (${loc.state})`;
      filterLoc.appendChild(opt);
    });

    const createLoc = document.getElementById('create-location');
    createLoc.innerHTML = '<option value="">Select a location...</option>';
    state.locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = `${loc.name} - ${loc.district}, ${loc.state}`;
      createLoc.appendChild(opt);
    });

    const editLoc = document.getElementById('edit-location');
    editLoc.innerHTML = '';
    state.locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = `${loc.name} - ${loc.district}, ${loc.state}`;
      editLoc.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load locations', err);
  }
}

async function loadVisits() {
  const tbody = document.getElementById('visits-table-body');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Refreshing visits...</td></tr>';

  try {
    const params = new URLSearchParams({
      page: state.pagination.page,
      limit: state.pagination.limit,
    });
    if (state.filters.status) params.append('status', state.filters.status);
    if (state.filters.location_id) params.append('location_id', state.filters.location_id);

    const res = await fetch(`/api/visits?${params.toString()}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });

    if (!res.ok) {
      const data = await res.json();
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${data.error || 'Failed to load visits'}</td></tr>`;
      return;
    }

    const data = await res.json();
    state.visits = data.visits;
    state.pagination = data.pagination;

    renderVisitsTable();
    updatePaginationUI();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to connect to API server.</td></tr>';
  }
}

function renderVisitsTable() {
  const tbody = document.getElementById('visits-table-body');
  if (state.visits.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">No visits found matching criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = state.visits.map(v => {
    const isCreator = v.officer_id === state.currentUser.id;
    const isApproverOrAdmin = state.currentUser.role === 'HQ_APPROVER' || state.currentUser.role === 'ADMIN';
    const costFormatted = Number(v.estimated_cost).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    const plannedDateStr = v.planned_date.split('T')[0];

    let badgeClass = 'badge-draft';
    if (v.status === 'PENDING') badgeClass = 'badge-pending';
    if (v.status === 'APPROVED') badgeClass = 'badge-approved';
    if (v.status === 'REJECTED') badgeClass = 'badge-rejected';
    if (v.status === 'COMPLETED') badgeClass = 'badge-completed';

    let actionButtons = `
      <button class="btn btn-outline btn-sm" onclick="viewVisitDetails('${v.id}')">View</button>
    `;

    if (v.status === 'DRAFT' && isCreator) {
      actionButtons += `
        <button class="btn btn-primary btn-sm" onclick="submitVisit('${v.id}')">Submit</button>
        <button class="btn btn-secondary btn-sm" onclick="openEditModal('${v.id}')">Edit</button>
      `;
    }

    if (v.status === 'PENDING') {
      
      if (isApproverOrAdmin && !isCreator) {
        actionButtons += `
          <button class="btn btn-primary btn-sm" onclick="openDecisionModal('${v.id}', 'APPROVE')">Approve</button>
          <button class="btn btn-danger btn-sm" onclick="openDecisionModal('${v.id}', 'REJECT')">Reject</button>
        `;
      } else if (isCreator) {
        actionButtons += `<span class="text-muted" style="font-size:11px;">(Under Review)</span>`;
      }
    }

    if (v.status === 'REJECTED' && isCreator) {
      actionButtons += `
        <button class="btn btn-secondary btn-sm" onclick="openEditModal('${v.id}')">Edit</button>
        <button class="btn btn-primary btn-sm" onclick="submitVisit('${v.id}')">Resubmit</button>
      `;
    }

    if (v.status === 'APPROVED' && isCreator) {
      actionButtons += `
        <button class="btn btn-primary btn-sm" onclick="completeVisit('${v.id}')">Complete</button>
      `;
    }

    return `
      <tr>
        <td><span class="badge ${badgeClass}">${v.status}</span></td>
        <td>
          <strong>${escapeHtml(v.title)}</strong>
          <div class="text-muted" style="font-size: 11px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(v.purpose)}
          </div>
        </td>
        <td>
          ${escapeHtml(v.location_name)}<br>
          <small class="text-muted">${escapeHtml(v.location_district)}, ${escapeHtml(v.location_state)}</small>
        </td>
        <td>${plannedDateStr}</td>
        <td><strong>${costFormatted}</strong></td>
        <td>${escapeHtml(v.officer_name)}</td>
        <td><div class="actions-cell">${actionButtons}</div></td>
      </tr>
    `;
  }).join('');
}

function updatePaginationUI() {
  const { page, total, limit, totalPages } = state.pagination;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  document.getElementById('pagination-info').textContent = `Showing ${start}-${end} of ${total} visits`;
  document.getElementById('current-page-num').textContent = `Page ${page} of ${totalPages}`;
  document.getElementById('btn-prev-page').disabled = page <= 1;
  document.getElementById('btn-next-page').disabled = page >= totalPages;
}

function changePage(delta) {
  state.pagination.page += delta;
  loadVisits();
}

function applyFilters() {
  state.filters.status = document.getElementById('filter-status').value;
  state.filters.location_id = document.getElementById('filter-location').value;
  state.pagination.page = 1;
  loadVisits();
}

async function handleCreateVisitSubmit(event) {
  event.preventDefault();
  const title = document.getElementById('create-title').value;
  const purpose = document.getElementById('create-purpose').value;
  const location_id = document.getElementById('create-location').value;
  const planned_date = document.getElementById('create-date').value;
  const estimated_cost = document.getElementById('create-cost').value;

  try {
    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({
        title,
        purpose,
        location_id,
        planned_date,
        estimated_cost: parseFloat(estimated_cost),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      handleApiError({ status: res.status }, data);
      return;
    }

    showNotification('Visit planned and created in DRAFT status!', 'success');
    document.getElementById('create-visit-form').reset();
    switchTab('visits');
  } catch (err) {
    handleApiError(err);
  }
}

async function submitVisit(visitId) {
  if (!confirm('Submit this visit to HQ for approval review?')) return;

  try {
    const res = await fetch(`/api/visits/${visitId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      handleApiError({ status: res.status }, data);
      return;
    }

    showNotification(data.message, 'success');
    await loadVisits();
  } catch (err) {
    handleApiError(err);
  }
}

async function completeVisit(visitId) {
  if (!confirm('Mark this approved visit as COMPLETED? Once completed, it cannot be modified.')) return;

  try {
    const res = await fetch(`/api/visits/${visitId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      handleApiError({ status: res.status }, data);
      return;
    }

    showNotification(data.message, 'success');
    await loadVisits();
  } catch (err) {
    handleApiError(err);
  }
}

function openDecisionModal(visitId, action) {
  document.getElementById('decision-visit-id').value = visitId;
  document.getElementById('decision-action-type').value = action;
  document.getElementById('decision-remarks').value = '';

  const titleEl = document.getElementById('decision-modal-title');
  const instructionEl = document.getElementById('decision-instruction');
  const requiredBadge = document.getElementById('remarks-required-badge');
  const helpText = document.getElementById('decision-help-text');
  const confirmBtn = document.getElementById('btn-decision-confirm');

  if (action === 'APPROVE') {
    titleEl.textContent = 'Approve Field Visit';
    instructionEl.innerHTML = `You are approving this field visit. Written remarks are <strong>optional</strong>.`;
    requiredBadge.classList.add('hidden');
    helpText.textContent = 'Optional: provide operational guidance or budget approval notes.';
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'Confirm Approval';
  } else {
    titleEl.textContent = 'Reject Field Visit';
    instructionEl.innerHTML = `<span class="text-danger">You are rejecting this field visit.</span> A written remark is <strong>strictly mandatory</strong>.`;
    requiredBadge.classList.remove('hidden');
    helpText.textContent = 'Mandatory: Explain reasons for refusal so the officer can revise and resubmit.';
    confirmBtn.className = 'btn btn-danger';
    confirmBtn.textContent = 'Confirm Rejection';
  }

  document.getElementById('decision-modal').classList.remove('hidden');
}

async function handleDecisionSubmit(event) {
  event.preventDefault();
  const visitId = document.getElementById('decision-visit-id').value;
  const action = document.getElementById('decision-action-type').value;
  const remarks = document.getElementById('decision-remarks').value;

  if (action === 'REJECT' && (!remarks || remarks.trim().length === 0)) {
    alert('A rejection must carry a written remark explaining the refusal.');
    return;
  }

  try {
    const res = await fetch(`/api/visits/${visitId}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({ action, remarks }),
    });

    const data = await res.json();
    if (!res.ok) {
      handleApiError({ status: res.status }, data);
      return;
    }

    showNotification(data.message, 'success');
    closeModal('decision-modal');
    await loadVisits();
    if (canAccessSummary()) await loadSummary();
  } catch (err) {
    handleApiError(err);
  }
}

async function viewVisitDetails(visitId) {
  try {
    const res = await fetch(`/api/visits/${visitId}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      handleApiError({ status: res.status }, data);
      return;
    }

    const v = data.visit;
    const cost = Number(v.estimated_cost).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    const content = document.getElementById('modal-details-content');

    let decisionsHtml = '<p class="text-muted" style="margin-top: 10px;">No HQ decisions recorded yet (visit is in initial draft or pending review).</p>';
    if (v.decisions && v.decisions.length > 0) {
      decisionsHtml = `
        <div class="history-timeline">
          ${v.decisions.map(d => `
            <div class="history-item">
              <div class="history-meta">
                <strong class="${d.action === 'APPROVED' ? 'text-success' : 'text-danger'}">${d.action}</strong>
                by ${escapeHtml(d.decider_name)} (${d.decider_role}) • ${new Date(d.created_at).toLocaleString()}
              </div>
              ${d.remarks ? `<div class="history-remarks">“${escapeHtml(d.remarks)}”</div>` : '<div class="text-muted" style="font-size:11px;">(No written remarks provided)</div>'}
            </div>
          `).join('')}
        </div>
      `;
    }

    content.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h4 style="font-size: 16px; margin-bottom: 4px;">${escapeHtml(v.title)}</h4>
        <span class="badge ${getStatusBadgeClass(v.status)}">${v.status}</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; background: #f8fafc; padding: 12px; border-radius: 4px;">
        <div><strong>Location:</strong><br>${escapeHtml(v.location_name)}<br><small class="text-muted">${escapeHtml(v.location_district)}, ${escapeHtml(v.location_state)}</small></div>
        <div><strong>Officer:</strong><br>${escapeHtml(v.officer_name)}<br><small class="text-muted">${escapeHtml(v.officer_email)}</small></div>
        <div><strong>Planned Date:</strong><br>${v.planned_date.split('T')[0]}</div>
        <div><strong>Estimated Cost:</strong><br>${cost}</div>
      </div>

      <div style="margin-bottom: 16px;">
        <strong>Operational Purpose:</strong>
        <p style="margin-top: 4px; color: #334155; white-space: pre-wrap;">${escapeHtml(v.purpose)}</p>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 14px;">
        <strong>HQ Decision History &amp; Audit Trail:</strong>
        ${decisionsHtml}
      </div>
    `;

    document.getElementById('details-modal').classList.remove('hidden');
  } catch (err) {
    handleApiError(err);
  }
}

async function openEditModal(visitId) {
  try {
    const res = await fetch(`/api/visits/${visitId}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      handleApiError({ status: res.status }, data);
      return;
    }

    const v = data.visit;
    document.getElementById('edit-visit-id').value = v.id;
    document.getElementById('edit-title').value = v.title;
    document.getElementById('edit-purpose').value = v.purpose;
    document.getElementById('edit-location').value = v.location_id;
    document.getElementById('edit-date').value = v.planned_date.split('T')[0];
    document.getElementById('edit-cost').value = v.estimated_cost;

    document.getElementById('edit-modal').classList.remove('hidden');
  } catch (err) {
    handleApiError(err);
  }
}

async function handleEditVisitSubmit(event) {
  event.preventDefault();
  const visitId = document.getElementById('edit-visit-id').value;
  const title = document.getElementById('edit-title').value;
  const purpose = document.getElementById('edit-purpose').value;
  const location_id = document.getElementById('edit-location').value;
  const planned_date = document.getElementById('edit-date').value;
  const estimated_cost = parseFloat(document.getElementById('edit-cost').value);

  try {
    const res = await fetch(`/api/visits/${visitId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({
        title,
        purpose,
        location_id,
        planned_date,
        estimated_cost,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      handleApiError({ status: res.status }, data);
      return;
    }

    showNotification('Visit successfully updated.', 'success');
    closeModal('edit-modal');
    await loadVisits();
  } catch (err) {
    handleApiError(err);
  }
}

async function loadSummary() {
  if (!canAccessSummary()) return;

  try {
    const res = await fetch('/api/summary', {
      headers: { Authorization: `Bearer ${state.token}` },
    });

    if (!res.ok) {
      const data = await res.json();
      console.warn('Summary fetch rejected:', data.error);
      return;
    }

    const { summary } = await res.json();

    document.getElementById('kpi-total-visits').textContent = summary.total_visits;
    document.getElementById('kpi-pending-visits').textContent = summary.status_counts.PENDING.count;
    document.getElementById('kpi-approved-visits').textContent = summary.status_counts.APPROVED.count;
    document.getElementById('kpi-completed-visits').textContent = summary.status_counts.COMPLETED.count;
    document.getElementById('kpi-rejected-visits').textContent = summary.status_counts.REJECTED.count;
    document.getElementById('kpi-total-cost').textContent = Number(summary.total_planned_cost).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
    });

    const tbody = document.getElementById('summary-locations-body');
    if (!summary.location_breakdown || summary.location_breakdown.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No location summary data available.</td></tr>';
      return;
    }

    tbody.innerHTML = summary.location_breakdown.map(loc => {
      const costStr = Number(loc.total_planned_cost).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
      return `
        <tr>
          <td><strong>${escapeHtml(loc.location_name)}</strong></td>
          <td>${escapeHtml(loc.district)}</td>
          <td>${escapeHtml(loc.state)}</td>
          <td><strong>${loc.total_visits}</strong></td>
          <td><span class="badge badge-pending">${loc.pending_visits}</span></td>
          <td><span class="badge badge-approved">${loc.approved_visits}</span></td>
          <td><span class="badge badge-completed">${loc.completed_visits}</span></td>
          <td><strong>${costStr}</strong></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    
    handleApiError(err);
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

function showNotification(message, type = 'info', duration = 5000) {
  const bar = document.getElementById('notification-bar');

  bar.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button
      onclick="document.getElementById('notification-bar').classList.add('hidden')"
      style="background:none;border:none;cursor:pointer;font-size:18px;line-height:1;padding:0 0 0 12px;color:inherit;opacity:0.7;"
      title="Dismiss"
    >&times;</button>
  `;
  bar.style.display = 'flex';
  bar.style.justifyContent = 'space-between';
  bar.style.alignItems = 'center';

  bar.className = `notification ${type}`;
  bar.classList.remove('hidden');

  if (bar._hideTimer) clearTimeout(bar._hideTimer);

  if (duration > 0) {
    bar._hideTimer = setTimeout(() => {
      bar.classList.add('hidden');
    }, duration);
  }
}

function handleApiError(err, data = null) {
  
  if (err instanceof TypeError || (err && !err.status && !data)) {
    showNotification(
      'Unable to reach the server right now. Please check your connection and try again.',
      'error',
      0   
    );
    console.error('[Network Error]', err);
    return;
  }

  const message = (data && data.error)
    ? data.error
    : 'Something went wrong. Please try again in a moment.';

  const type = (err && err.status && err.status < 500) ? 'error' : 'error';

  showNotification(message, type, 6000);
  console.error('[API Error]', err.status || '', message);
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'DRAFT': return 'badge-draft';
    case 'PENDING': return 'badge-pending';
    case 'APPROVED': return 'badge-approved';
    case 'REJECTED': return 'badge-rejected';
    case 'COMPLETED': return 'badge-completed';
    default: return 'badge-draft';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
