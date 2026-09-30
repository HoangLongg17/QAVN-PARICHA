const API_BASE = '/api';
const STORAGE_KEY = 'paricha_auth';
const state = {
  token: localStorage.getItem(STORAGE_KEY) || '',
  currentUser: null,
  tickets: [],
  notifications: [],
  adminTickets: [],
  adminSuggestions: [],
  adminMatchedPairs: [],
  activeTab: 'tickets',
  profileEditing: false,
  selectedTicketId: null,
};

const $ = (selector) => document.querySelector(selector);
const authView = () => $('#authView');
const appView = () => $('#appView');

function safeToggleView({ showAuth = true, showApp = true } = {}) {
  const auth = authView();
  const app = appView();
  if (auth) auth.classList.toggle('hidden', !showAuth);
  if (app) app.classList.toggle('hidden', !showApp);
}

function safeSetText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value;
}

function safeSetHtml(selector, html) {
  const el = $(selector);
  if (el) el.innerHTML = html;
}

function buildUserAppShell() {
  return `
    <div class="grid three">
      <div class="card stat"><span>Uy tín</span><strong id="reputation">100</strong><small>Hủy phiếu: -20 / lần</small></div>
      <div class="card stat"><span>Phiếu hiện tại</span><strong id="myTicket">-</strong><small>1 phiếu / lần</small></div>
      <div class="card stat"><span>Thông báo</span><strong id="noticeCount">0</strong><small>Ghép đôi & trạng thái</small></div>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="tickets">Đặt phiếu</button>
      <button class="tab" data-tab="mytickets">Phiếu của tôi</button>
      <button class="tab" data-tab="notifications">Thông báo</button>
      <button class="tab" data-tab="profile">Hồ sơ</button>
    </div>

    <div id="ticketsTab" class="tabContent">
      <div class="card">
        <h2>Đặt phiếu mới</h2>
        <p class="muted">Chọn ngày giờ và yêu cầu về đối phương. Admin sẽ duyệt và ghép nối với phiếu phù hợp.</p>
        <button type="button" id="newTicketBtn" class="btn-primary">+ Đặt phiếu mới</button>
        <div id="ticketList" class="ticketList" style="margin-top: 20px;"></div>
      </div>
    </div>

    <div id="myticketsTab" class="tabContent hidden">
      <div class="card">
        <h2>Phiếu đặt của tôi</h2>
        <div id="myTicketList"></div>
      </div>
    </div>

    <div id="notificationsTab" class="tabContent hidden">
      <div class="card">
        <h2>Thông báo gần đây</h2>
        <div id="notificationList"></div>
      </div>
    </div>

    <div id="profileTab" class="tabContent hidden">
      <div id="profilePanel" class="profile-board"></div>
    </div>
  `;
}

function resetAppShell(role = 'guest') {
  const app = appView();
  if (!app) return;

  app.dataset.role = role;
  app.innerHTML = role === 'admin' ? '' : buildUserAppShell();
}

function saveSession(token, user) {
  const normalizedUser = user ? {
    ...user,
    role: String(user.role || (user.username ? 'admin' : 'user')).toLowerCase(),
  } : null;

  state.token = token;
  state.currentUser = normalizedUser;
  state.notifications = [];
  state.tickets = [];
  state.adminTickets = [];
  state.adminSuggestions = [];
  state.adminMatchedPairs = [];
  state.activeTab = 'tickets';
  state.profileEditing = false;
  state.selectedTicketId = null;

  if (normalizedUser) {
    const role = normalizedUser.role || 'guest';
    resetAppShell(role);
  } else {
    resetAppShell('guest');
  }

  localStorage.setItem(STORAGE_KEY, token);
}

function showToast(message, type = 'success') {
  const container = $('#toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}

function showConfirmDialog(message, onConfirm) {
  const dialog = $('#confirmDialog');
  const text = $('#confirmDialogText');
  const okBtn = $('#confirmOkBtn');
  const cancelBtn = $('#confirmCancelBtn');

  if (!dialog || !text || !okBtn || !cancelBtn) return false;

  text.textContent = message;
  dialog.classList.remove('hidden');

  const close = () => dialog.classList.add('hidden');

  const handleConfirm = () => {
    close();
    onConfirm();
  };

  okBtn.onclick = handleConfirm;
  cancelBtn.onclick = close;
  dialog.onclick = (event) => {
    if (event.target === dialog) close();
  };

  return true;
}

function clearSession() {
  state.token = '';
  state.currentUser = null;
  state.tickets = [];
  state.notifications = [];
  state.adminTickets = [];
  state.adminSuggestions = [];
  state.adminMatchedPairs = [];
  state.activeTab = 'tickets';
  state.profileEditing = false;
  state.selectedTicketId = null;
  localStorage.removeItem(STORAGE_KEY);

  const app = appView();
  if (app) {
    app.dataset.role = 'guest';
    app.innerHTML = '';
  }

  safeToggleView({ showAuth: true, showApp: false });
  renderSession();
  render();
}

function showApp() {
  safeToggleView({ showAuth: false, showApp: true });
  render();
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateTime(value) {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN');
}

function statusClass(status) {
  switch (status) {
    case 'Hủy': return 'cancelled';
    case 'Đang chờ': return 'pending';
    case 'Ghép thành công chờ đặt cọc': return 'matched';
    case 'Đặt cọc thành công': return 'deposit';
    default: return 'pending';
  }
}

async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Yêu cầu không thành công.');
  }
  return data;
}

async function loadUserData() {
  try {
    const profileRes = await apiRequest('/profile');
    const nextUser = profileRes?.user ? {
      ...profileRes.user,
      role: String(profileRes.user.role || (profileRes.user.username ? 'admin' : 'user')).toLowerCase(),
    } : null;
    state.currentUser = nextUser;

    if (state.currentUser?.role === 'admin') {
      const overview = await apiRequest('/admin/overview');
      state.adminTickets = Array.isArray(overview.tickets) ? overview.tickets : [];
      state.adminSuggestions = Array.isArray(overview.suggestions) ? overview.suggestions : [];
      state.adminMatchedPairs = Array.isArray(overview.matchedPairs) ? overview.matchedPairs : [];
      state.notifications = Array.isArray(profileRes.notifications) ? profileRes.notifications : [];
      state.tickets = state.adminTickets;
      showApp();
      return;
    }

    const [ticketsRes, noticesRes] = await Promise.all([
      apiRequest('/tickets'),
      apiRequest('/notifications')
    ]);

    state.notifications = Array.isArray(noticesRes.notifications) ? noticesRes.notifications : [];
    state.tickets = Array.isArray(ticketsRes.tickets) ? ticketsRes.tickets : [];
    state.adminTickets = [];
    state.adminSuggestions = [];
    showApp();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Không thể tải dữ liệu.', 'error');
    if (!state.token) {
      clearSession();
    }
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const regPhone = $('#regPhone');
  const regEmail = $('#regEmail');
  const regName = $('#regName');
  const regGender = $('#regGender');
  const regDob = $('#regDob');
  const regPassword = $('#regPassword');
  const regPreferredGender = $('#regPreferredGender');
  const regPreferredAge = $('#regPreferredAge');
  const regOccupation = $('#regOccupation');
  const regFavoriteCuisine = $('#regFavoriteCuisine');
  const regPersonality = $('#regPersonality');
  const regPreferredInterest = $('#regPreferredInterest');

  if (!regPhone || !regName || !regDob || !regPassword) {
    return alert('Form đăng ký chưa sẵn sàng. Vui lòng tải lại trang và thử lại.');
  }

  const phone = regPhone.value.trim();
  const email = regEmail ? regEmail.value.trim() : '';
  const name = regName.value.trim();
  const gender = regGender ? regGender.value : '';
  const dob = regDob.value;
  const password = regPassword.value.trim();
  const preferredGender = regPreferredGender ? regPreferredGender.value : '';
  const preferredAge = regPreferredAge ? regPreferredAge.value : '';
  const occupation = regOccupation ? regOccupation.value : '';
  const favoriteCuisine = regFavoriteCuisine ? regFavoriteCuisine.value : '';
  const personality = regPersonality ? regPersonality.value : '';
  const preferredInterest = regPreferredInterest ? regPreferredInterest.value : '';

  if (!phone || !name || !dob || !password) {
    return alert('Số điện thoại, tên, ngày sinh và mật khẩu là bắt buộc.');
  }

  if (password.length < 6) {
    return alert('Mật khẩu phải có ít nhất 6 ký tự.');
  }

  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: {
        phone,
        email,
        name,
        gender,
        dob,
        password,
        preferredGender,
        preferredAge,
        occupation,
        favoriteCuisine,
        personality,
        preferredInterest,
      }
    });
    saveSession(data.token, data.user);
    showApp();
    await loadUserData();
  } catch (error) {
    alert(error.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const loginPhone = $('#loginPhone');
  const loginPassword = $('#loginPassword');

  if (!loginPhone || !loginPassword) {
    return alert('Form đăng nhập chưa sẵn sàng. Vui lòng tải lại trang và thử lại.');
  }

  const identifier = loginPhone.value.trim();
  const password = loginPassword.value.trim();

  if (!identifier) return alert('Vui lòng nhập số điện thoại hoặc tên tài khoản admin.');
  if (!password) return alert('Vui lòng nhập mật khẩu.');

  const isAdminLogin = !/^0\d{9}$/.test(identifier.replace(/\D/g, '')) && /[A-Za-z]/.test(identifier);

  try {
    const endpoint = isAdminLogin ? '/auth/admin-login' : '/auth/login';
    const body = isAdminLogin
      ? { username: identifier, password }
      : { phone: identifier, password };

    const data = await apiRequest(endpoint, {
      method: 'POST',
      body,
    });
    saveSession(data.token, data.user);
    showApp();
    await loadUserData();
  } catch (error) {
    alert(error.message);
  }
}

async function demoLogin() {
  const phone = '0900000000';
  const password = 'demo123';

  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: { phone, password }
    });
    saveSession(data.token, data.user);
    await loadUserData();
  } catch (error) {
    try {
      const data = await apiRequest('/auth/register', {
        method: 'POST',
        body: {
          phone,
          email: 'demo@paricha.vn',
          name: 'Khách demo',
          gender: 'Nữ',
          dob: '2000-01-01',
          password,
        }
      });
      saveSession(data.token, data.user);
      await loadUserData();
    } catch (registerError) {
      alert(registerError.message);
    }
  }
}

function applyTicketRequirementDefaults() {
  const ticketGenderReq = $('#ticketGenderReq');
  if (!ticketGenderReq) return;

  const userGender = state.currentUser?.gender;
  if (userGender === 'Nam') {
    ticketGenderReq.value = 'Nữ';
    ticketGenderReq.disabled = true;
    ticketGenderReq.title = 'Người dùng Nam bắt buộc tìm đối tượng Nữ.';
    return;
  }

  ticketGenderReq.disabled = false;
  ticketGenderReq.title = '';
}

async function createTicket(event) {
  event.preventDefault();
  const ticketDateTime = $('#ticketDateTime');
  const ticketGenderReq = $('#ticketGenderReq');
  const ticketAgeReq = $('#ticketAgeReq');
  const ticketInterestReq = $('#ticketInterestReq');
  const ticketPersonalityReq = $('#ticketPersonalityReq');

  if (!ticketDateTime || !ticketGenderReq || !ticketAgeReq || !ticketInterestReq || !ticketPersonalityReq) {
    return alert('Form đặt phiếu chưa sẵn sàng. Vui lòng tải lại trang và thử lại.');
  }

  const forcedGender = state.currentUser?.gender === 'Nam' ? 'Nữ' : ticketGenderReq.value;
  const preferenceParts = [ticketInterestReq.value, ticketPersonalityReq.value].filter(Boolean);

  const payload = {
    dateTime: ticketDateTime.value,
    preferredGender: forcedGender,
    preferredAge: ticketAgeReq.value,
    preferredInterest: preferenceParts.join('; '),
  };

  if (!payload.dateTime) {
    return alert('Vui lòng chọn ngày giờ đặt phiếu.');
  }

  try {
    await apiRequest('/tickets', {
      method: 'POST',
      body: payload,
    });
    const ticketModal = $('#ticketModal');
    const ticketForm = $('#ticketForm');
    if (ticketModal) ticketModal.classList.add('hidden');
    if (ticketForm) ticketForm.reset();
    applyTicketRequirementDefaults();
    await loadUserData();
  } catch (error) {
    alert(error.message);
  }
}

async function cancelTicket(ticketId) {
  if (!ticketId) return;

  try {
    const res = await apiRequest(`/tickets/${ticketId}/cancel`, { method: 'POST' });
    alert(res.message || 'Hủy phiếu thành công.');
    await loadUserData();
  } catch (error) {
    alert(error.message);
  }
}

async function confirmDeposit(ticketId) {
  if (!ticketId) return;

  try {
    const data = await apiRequest(`/tickets/${ticketId}/deposit`, { method: 'POST' });
    alert(data.message || 'Đặt cọc thành công.');
    const depositModal = $('#depositModal');
    if (depositModal) depositModal.classList.add('hidden');
    await loadUserData();
  } catch (error) {
    alert(error.message);
  }
}

function closeTicketDetailModal() {
  const modal = $('#ticketDetailModal');
  if (modal) modal.classList.add('hidden');
}

function viewTicketDetail(ticketId) {
  const ticket = state.tickets.find((item) => String(item.id) === String(ticketId));
  if (!ticket) return;

  state.selectedTicketId = ticket.id;
  const detailTicketId = $('#detailTicketId');
  const detailStatus = $('#detailStatus');
  const detailDateTime = $('#detailDateTime');
  const detailRequirements = $('#detailRequirements');
  const detailPartnerRequirements = $('#detailPartnerRequirements');
  const ticketDetailModal = $('#ticketDetailModal');

  if (detailTicketId) detailTicketId.textContent = ticket.id;
  if (detailStatus) {
    detailStatus.textContent = ticket.status || 'Đang chờ';
    detailStatus.className = `status-badge ${statusClass(ticket.status || 'Đang chờ')}`;
  }
  if (detailDateTime) detailDateTime.textContent = formatDateTime(ticket.dateTime);
  if (detailRequirements) {
    detailRequirements.innerHTML = `
      <p><b>Giới tính:</b> ${escapeHtml(ticket.preferredGender || 'Không yêu cầu')}</p>
      <p><b>Độ tuổi:</b> ${escapeHtml(ticket.preferredAge || 'Không yêu cầu')}</p>
      <p><b>Sở thích:</b> ${escapeHtml(ticket.preferredInterest || 'Không có')}</p>
    `;
  }
  if (detailPartnerRequirements) {
    detailPartnerRequirements.innerHTML = ticket.matchReason
      ? `<p>${escapeHtml(ticket.matchReason)}</p>`
      : '<p>Chưa có thông tin ghép với đối phương.</p>';
  }

  if (ticketDetailModal) ticketDetailModal.classList.remove('hidden');
}

function openDepositModal(ticketId) {
  const ticket = state.tickets.find((item) => String(item.id) === String(ticketId));
  if (!ticket) return;

  state.selectedTicketId = ticket.id;
  const depositReference = $('#depositReference');
  const depositModal = $('#depositModal');
  if (depositReference) depositReference.textContent = ticket.depositReferenceCode || `PARICHA-${ticket.id}`;
  if (depositModal) depositModal.classList.remove('hidden');
}

function scrollToAuthForm(mode = 'login') {
  const loginForm = $('#loginForm');
  const registerForm = $('#registerForm');
  const targetForm = mode === 'register' ? registerForm : loginForm;
  const targetInput = mode === 'register' ? $('#regPhone') : $('#loginPhone');
  const auth = authView();

  if (!targetForm || !auth) return;

  safeToggleView({ showAuth: true, showApp: false });

  if (mode === 'register') {
    registerForm?.classList.add('active');
    loginForm?.classList.remove('active');
  } else {
    loginForm?.classList.add('active');
    registerForm?.classList.remove('active');
  }

  requestAnimationFrame(() => {
    const headerHeight = document.querySelector('header')?.offsetHeight || 90;
    const rect = targetForm.getBoundingClientRect();
    const scrollTop = window.scrollY + rect.top - headerHeight - 20;

    window.scrollTo({ top: Math.max(scrollTop, 0), behavior: 'smooth' });
    targetInput?.focus();
  });
}

function openAuthForm(mode = 'login') {
  scrollToAuthForm(mode);
}

function bindHeaderAuthButtons() {
  const loginBtn = $('#loginPromptBtn');
  const registerBtn = $('#registerPromptBtn');

  loginBtn?.addEventListener('click', () => openAuthForm('login'));
  registerBtn?.addEventListener('click', () => openAuthForm('register'));
}

function renderSession() {
  const session = $('#session');
  if (!session) return;

  if (!state.currentUser) {
    session.innerHTML = `
      <div class="header-auth-actions">
        <button class="auth-button" id="loginPromptBtn" type="button">Đăng nhập</button>
        <button class="auth-button secondary" id="registerPromptBtn" type="button">Đăng ký</button>
      </div>
    `;

    bindHeaderAuthButtons();
    safeToggleView({ showAuth: true, showApp: false });
    return;
  }

  const userName = state.currentUser.username || state.currentUser.phone || state.currentUser.name || 'U';
  session.innerHTML = `
    <div class="avatar-button-wrap">
      <button class="avatar-button" id="avatarBtn" type="button" aria-label="Tài khoản">
        <span class="avatar-circle">${String(userName).slice(-1).toUpperCase()}</span>
        <span>${escapeHtml(userName)}</span>
      </button>
    </div>
  `;

  const avatarBtn = $('#avatarBtn');
  const accountMenu = $('#accountMenu');

  avatarBtn?.addEventListener('click', () => {
    accountMenu?.classList.toggle('hidden');
  });

  const profileAction = accountMenu?.querySelector('.menu-item[data-action="profile"]');
  const logoutAction = accountMenu?.querySelector('.menu-item[data-action="logout"]');

  profileAction && (profileAction.onclick = () => {
    state.activeTab = 'profile';
    state.profileEditing = false;
    accountMenu?.classList.add('hidden');
    render();
  });

  logoutAction && (logoutAction.onclick = () => {
    clearSession();
    state.profileEditing = false;
    const loginPhone = $('#loginPhone');
    const regPhone = $('#regPhone');
    if (loginPhone) loginPhone.value = '';
    if (regPhone) regPhone.value = '';
    accountMenu?.classList.add('hidden');
  });
}

function renderStats() {
  const user = state.currentUser;
  if (!user) return;

  safeSetText('#reputation', user.reputation ?? 100);
  safeSetText('#myTicket', state.tickets.filter((ticket) => ticket.userId === user.id).length || '-');
  safeSetText('#noticeCount', state.notifications.length || 0);
}

function renderNotifications() {
  const notifications = state.notifications || [];
  if (!notifications.length) {
    safeSetHtml('#notificationList', '<p class="muted">Chưa có thông báo.</p>');
    return;
  }

  safeSetHtml('#notificationList', notifications.map((item) => `
    <div class="notice">
      <b>${formatDateTime(item.createdAt || item.created_at)}</b><br>
      ${escapeHtml(item.message || '')}
    </div>
  `).join(''));
}

function renderTickets() {
  const user = state.currentUser;
  if (!user) return;

  const tickets = state.tickets || [];
  const myTickets = tickets.filter((ticket) => ticket.userId === user.id);

  safeSetHtml('#ticketList', tickets.length ? tickets.map((ticket) => {
    const isMine = ticket.userId === user.id;
    const status = ticket.status || 'Đang chờ';
    const actionButtons = [];

    if (isMine && status !== 'Hủy' && status !== 'Đặt cọc thành công') {
      actionButtons.push(`<button type="button" class="secondary small" onclick="window.cancelTicket('${String(ticket.id).replace(/'/g, "\\'")}')">Hủy</button>`);
    }

    if (isMine && status === 'Ghép thành công chờ đặt cọc') {
      actionButtons.push(`<button type="button" class="small" onclick="window.openDepositModal('${String(ticket.id).replace(/'/g, "\\'")}')">Đặt cọc</button>`);
    }

    return `
      <div class="ticketCard">
        <div class="ticket-header">
          <div>
            <strong>Phiếu #${escapeHtml(ticket.id)}</strong>
            <span class="status-badge ${statusClass(status)}">${escapeHtml(status)}</span>
          </div>
          <small>${isMine ? 'Của bạn' : 'Khác'}</small>
        </div>
        <p><b>Ngày giờ:</b> ${formatDateTime(ticket.dateTime)}</p>
        <p><b>Yêu cầu:</b> ${escapeHtml(ticket.preferredGender || 'Không yêu cầu')} • ${escapeHtml(ticket.preferredAge || 'Không yêu cầu')} • ${escapeHtml(ticket.preferredInterest || 'Không có')}</p>
        ${ticket.matchReason ? `<p><b>Ghép:</b> ${escapeHtml(ticket.matchReason)}</p>` : ''}
        <div class="ticket-actions">
          <button type="button" class="secondary small" onclick="window.viewTicketDetail('${String(ticket.id).replace(/'/g, "\\'")}')">Chi tiết</button>
          ${actionButtons.join('')}
        </div>
      </div>
    `;
  }).join('') : '<p class="muted">Chưa có phiếu nào trong hệ thống.</p>');

  safeSetHtml('#myTicketList', myTickets.length ? myTickets.map((ticket) => `
    <div class="ticketCard">
      <div class="ticket-header">
        <strong>Phiếu #${escapeHtml(ticket.id)}</strong>
        <span class="status-badge ${statusClass(ticket.status || 'Đang chờ')}">${escapeHtml(ticket.status || 'Đang chờ')}</span>
      </div>
      <p><b>Ngày giờ:</b> ${formatDateTime(ticket.dateTime)}</p>
      <p><b>Yêu cầu:</b> ${escapeHtml(ticket.preferredGender || 'Không yêu cầu')} • ${escapeHtml(ticket.preferredAge || 'Không yêu cầu')} • ${escapeHtml(ticket.preferredInterest || 'Không có')}</p>
      <div class="ticket-actions">
        <button type="button" class="secondary small" onclick="window.viewTicketDetail('${String(ticket.id).replace(/'/g, "\\'")}')">Chi tiết</button>
        ${ticket.status === 'Ghép thành công chờ đặt cọc' ? `<button type="button" class="small" onclick="window.openDepositModal('${String(ticket.id).replace(/'/g, "\\'")}')">Đặt cọc</button>` : ''}
      </div>
    </div>
  `).join('') : '<p class="muted">Bạn chưa có phiếu nào.</p>');
}

function renderProfile() {
  const user = state.currentUser;
  if (!user) return;

  if (state.profileEditing) {
    const editFormHtml = `
      <div class="profile-card wide">
        <div class="profile-header-row">
          <h2>Chỉnh sửa hồ sơ</h2>
          <button type="button" class="secondary small" id="cancelEditBtn">Hủy</button>
        </div>
        <form id="profileForm" class="profile-form">
          <div class="form-grid two">
            <label>Giới tính
              <select id="editGender">
                <option value="">Chưa cập nhật</option>
                <option value="Nam" ${user.gender === 'Nam' ? 'selected' : ''}>Nam</option>
                <option value="Nữ" ${user.gender === 'Nữ' ? 'selected' : ''}>Nữ</option>
                <option value="Khác" ${user.gender === 'Khác' ? 'selected' : ''}>Khác</option>
              </select>
            </label>
            <label>Ngày sinh
              <input id="editDob" type="date" value="${user.dob || ''}">
            </label>
          </div>

          <div class="form-grid two">
            <label>Giới tính mong muốn
              <select id="editPreferredGender">
                <option value="">Không yêu cầu</option>
                <option value="Nam" ${user.preferredGender === 'Nam' ? 'selected' : ''}>Nam</option>
                <option value="Nữ" ${user.preferredGender === 'Nữ' ? 'selected' : ''}>Nữ</option>
                <option value="Khác" ${user.preferredGender === 'Khác' ? 'selected' : ''}>Khác</option>
              </select>
            </label>
            <label>Độ tuổi mong muốn
              <select id="editPreferredAge">
                <option value="">Không yêu cầu</option>
                <option value="18-25" ${user.preferredAge === '18-25' ? 'selected' : ''}>18-25</option>
                <option value="26-35" ${user.preferredAge === '26-35' ? 'selected' : ''}>26-35</option>
                <option value="36-45" ${user.preferredAge === '36-45' ? 'selected' : ''}>36-45</option>
                <option value="46+" ${user.preferredAge === '46+' ? 'selected' : ''}>46+</option>
              </select>
            </label>
          </div>

          <div class="form-grid two">
            <label>Nghề nghiệp
              <select id="editOccupation">
                <option value="">Không yêu cầu</option>
                <option value="Sinh viên" ${user.occupation === 'Sinh viên' ? 'selected' : ''}>Sinh viên</option>
                <option value="Nhân viên văn phòng" ${user.occupation === 'Nhân viên văn phòng' ? 'selected' : ''}>Nhân viên văn phòng</option>
                <option value="Kỹ sư" ${user.occupation === 'Kỹ sư' ? 'selected' : ''}>Kỹ sư</option>
                <option value="Marketing" ${user.occupation === 'Marketing' ? 'selected' : ''}>Marketing</option>
                <option value="Giáo viên" ${user.occupation === 'Giáo viên' ? 'selected' : ''}>Giáo viên</option>
                <option value="Khác" ${user.occupation === 'Khác' ? 'selected' : ''}>Khác</option>
              </select>
            </label>
            <label>Ưa thích ẩm thực
              <select id="editFavoriteCuisine">
                <option value="">Không yêu cầu</option>
                <option value="Việt Nam" ${user.favoriteCuisine === 'Việt Nam' ? 'selected' : ''}>Việt Nam</option>
                <option value="Hàn Quốc" ${user.favoriteCuisine === 'Hàn Quốc' ? 'selected' : ''}>Hàn Quốc</option>
                <option value="Nhật Bản" ${user.favoriteCuisine === 'Nhật Bản' ? 'selected' : ''}>Nhật Bản</option>
                <option value="Mỹ" ${user.favoriteCuisine === 'Mỹ' ? 'selected' : ''}>Mỹ</option>
                <option value="Ý" ${user.favoriteCuisine === 'Ý' ? 'selected' : ''}>Ý</option>
                <option value="Đài Loan" ${user.favoriteCuisine === 'Đài Loan' ? 'selected' : ''}>Đài Loan</option>
              </select>
            </label>
          </div>

          <div class="form-grid two">
            <label>Tính cách
              <select id="editPersonality">
                <option value="">Không yêu cầu</option>
                <option value="Hòa đồng" ${user.bio === 'Hòa đồng' ? 'selected' : ''}>Hòa đồng</option>
                <option value="Tĩnh lặng" ${user.bio === 'Tĩnh lặng' ? 'selected' : ''}>Tĩnh lặng</option>
                <option value="Năng động" ${user.bio === 'Năng động' ? 'selected' : ''}>Năng động</option>
                <option value="Lịch sự" ${user.bio === 'Lịch sự' ? 'selected' : ''}>Lịch sự</option>
                <option value="Nhiệt tình" ${user.bio === 'Nhiệt tình' ? 'selected' : ''}>Nhiệt tình</option>
              </select>
            </label>
            <label>Sở thích chính
              <select id="editPreferredInterest">
                <option value="">Không yêu cầu</option>
                <option value="Du lịch" ${user.preferredInterest === 'Du lịch' ? 'selected' : ''}>Du lịch</option>
                <option value="Ẩm thực" ${user.preferredInterest === 'Ẩm thực' ? 'selected' : ''}>Ẩm thực</option>
                <option value="Âm nhạc" ${user.preferredInterest === 'Âm nhạc' ? 'selected' : ''}>Âm nhạc</option>
                <option value="Phim" ${user.preferredInterest === 'Phim' ? 'selected' : ''}>Phim</option>
                <option value="Thể thao" ${user.preferredInterest === 'Thể thao' ? 'selected' : ''}>Thể thao</option>
                <option value="Đọc sách" ${user.preferredInterest === 'Đọc sách' ? 'selected' : ''}>Đọc sách</option>
              </select>
            </label>
          </div>

          <button type="submit">Lưu hồ sơ</button>
        </form>
      </div>
    `;

    safeSetHtml('#profilePanel', editFormHtml);

    const cancelEditBtn = $('#cancelEditBtn');
    cancelEditBtn && (cancelEditBtn.onclick = () => {
      state.profileEditing = false;
      render();
    });

    const profileForm = $('#profileForm');
    profileForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const editGender = $('#editGender');
      const editDob = $('#editDob');
      const editPreferredGender = $('#editPreferredGender');
      const editPreferredAge = $('#editPreferredAge');
      const editOccupation = $('#editOccupation');
      const editFavoriteCuisine = $('#editFavoriteCuisine');
      const editPersonality = $('#editPersonality');
      const editPreferredInterest = $('#editPreferredInterest');

      if (!editGender || !editDob || !editPreferredGender || !editPreferredAge || !editOccupation || !editFavoriteCuisine || !editPersonality || !editPreferredInterest) {
        return alert('Form hồ sơ chưa sẵn sàng. Vui lòng tải lại trang và thử lại.');
      }

      try {
        await apiRequest('/profile', {
          method: 'PUT',
          body: {
            gender: editGender.value,
            dob: editDob.value,
            preferredGender: editPreferredGender.value,
            preferredAge: editPreferredAge.value,
            occupation: editOccupation.value,
            favoriteCuisine: editFavoriteCuisine.value,
            bio: editPersonality.value,
            preferredInterest: editPreferredInterest.value,
          }
        });
        state.profileEditing = false;
        await loadUserData();
      } catch (error) {
        alert(error.message);
      }
    });
    return;
  }

  const myTickets = state.tickets.filter((ticket) => ticket.userId === user.id);
  const profileSummaryHtml = `
    <div class="profile-card">
      <div class="profile-header-row">
        <h2>Hồ sơ người dùng</h2>
        <button type="button" class="secondary small" id="editProfileBtn">Chỉnh sửa</button>
      </div>
      <ul class="meta-list">
        <li><span>Số điện thoại</span><strong>${escapeHtml(user.phone || '')}</strong></li>
        <li><span>Tên</span><strong>${escapeHtml(user.name || '')}</strong></li>
        <li><span>Email</span><strong>${escapeHtml(user.email || 'Chưa cập nhật')}</strong></li>
        <li><span>Ngày sinh</span><strong>${user.dob ? new Date(user.dob).toLocaleDateString('vi-VN') : 'Chưa cập nhật'}</strong></li>
        <li><span>Giới tính</span><strong>${escapeHtml(user.gender || 'Chưa cập nhật')}</strong></li>
        <li><span>Nghề nghiệp</span><strong>${escapeHtml(user.occupation || 'Không yêu cầu')}</strong></li>
        <li><span>Tính cách</span><strong>${escapeHtml(user.bio || 'Không yêu cầu')}</strong></li>
        <li><span>Ưa thích ẩm thực</span><strong>${escapeHtml(user.favoriteCuisine || 'Không yêu cầu')}</strong></li>
        <li><span>Yêu cầu giới tính</span><strong>${escapeHtml(user.preferredGender || 'Không yêu cầu')}</strong></li>
        <li><span>Độ tuổi mong muốn</span><strong>${escapeHtml(user.preferredAge || 'Không yêu cầu')}</strong></li>
        <li><span>Sở thích chính</span><strong>${escapeHtml(user.preferredInterest || 'Không yêu cầu')}</strong></li>
      </ul>
    </div>

    <div class="profile-card">
      <h2>Lịch sử phiếu</h2>
      <div class="stack">${myTickets.length ? myTickets.map((ticket) => `
        <div class="notice">
          <b>Phiếu #${escapeHtml(ticket.id)}</b><br>
          ${formatDateTime(ticket.dateTime)}<br>
          ${escapeHtml(ticket.status || 'Đang chờ')}
        </div>
      `).join('') : '<p class="muted">Chưa có phiếu nào.</p>'}</div>
    </div>
  `;

  safeSetHtml('#profilePanel', profileSummaryHtml);

  const editProfileBtn = $('#editProfileBtn');
  editProfileBtn && (editProfileBtn.onclick = () => {
    state.profileEditing = true;
    render();
  });
}

function getMatchScore(ticket1Id, ticket2Id) {
  const ticket1 = state.adminTickets.find((item) => String(item.id) === String(ticket1Id));
  const ticket2 = state.adminTickets.find((item) => String(item.id) === String(ticket2Id));
  if (!ticket1 || !ticket2) return 0;

  const normalize = (value) => String(value || '').trim().toLowerCase();
  const normalizeList = (value) => String(value || '')
    .toLowerCase()
    .replace(/\s*;\s*/g, ';')
    .split(/[;,+\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const normalizeAlias = (value) => {
    const normalized = normalize(value);
    const aliases = {
      'hoà đồng': 'hòa đồng',
      'hoa dong': 'hòa đồng',
      'hòa đồng': 'hòa đồng',
      'tĩnh lặng': 'tĩnh lặng',
      'tinh lang': 'tĩnh lặng',
      'năng động': 'năng động',
      'nang dong': 'năng động',
      'lịch sự': 'lịch sự',
      'lich su': 'lịch sự',
      'nhiệt tình': 'nhiệt tình',
      'nhiet tinh': 'nhiệt tình',
      'vui vẻ': 'vui vẻ',
      'vui ve': 'vui vẻ',
      'du lịch': 'du lịch',
      'dulich': 'du lịch',
      'ẩm thực': 'ẩm thực',
      'am thuc': 'ẩm thực',
      'âm nhạc': 'âm nhạc',
      'am nhac': 'âm nhạc',
      'phim': 'phim',
      'thể thao': 'thể thao',
      'the thao': 'thể thao',
      'đọc sách': 'đọc sách',
      'doc sach': 'đọc sách',
      'nấu ăn': 'nấu ăn',
      'nau an': 'nấu ăn',
      'café / trò chuyện': 'café / trò chuyện',
      'cafe / tro chuyen': 'café / trò chuyện',
      'cafe': 'café / trò chuyện',
      'tro chuyen': 'café / trò chuyện',
    };

    return aliases[normalized] || normalized;
  };

  let score = 0;
  const tagsA = normalizeList(ticket1.preferredInterest).map(normalizeAlias);
  const tagsB = normalizeList(ticket2.preferredInterest).map(normalizeAlias);
  const personalityKeywords = new Set(['hòa đồng', 'tĩnh lặng', 'năng động', 'lịch sự', 'nhiệt tình', 'vui vẻ']);
  const personalityA = tagsA.filter((tag) => personalityKeywords.has(tag));
  const personalityB = tagsB.filter((tag) => personalityKeywords.has(tag));
  const interestA = tagsA.filter((tag) => !personalityKeywords.has(tag));
  const interestB = tagsB.filter((tag) => !personalityKeywords.has(tag));

  if (!ticket1.preferredGender || !ticket2.preferredGender) {
    score += 12;
  } else if (ticket1.preferredGender === ticket2.preferredGender) {
    score += 30;
  } else {
    score -= 15;
  }

  if (!ticket1.preferredAge || !ticket2.preferredAge) {
    score += 8;
  } else if (ticket1.preferredAge === ticket2.preferredAge) {
    score += 20;
  } else {
    score -= 10;
  }

  if (!personalityA.length && !personalityB.length) {
    score += 8;
  } else {
    const personalityOverlap = personalityA.filter((tag) => personalityB.includes(tag));
    if (personalityOverlap.length) {
      score += Math.min(22, personalityOverlap.length * 11);
    } else if (personalityA.length && personalityB.length) {
      score -= 8;
    } else {
      score += 6;
    }
  }

  if (!interestA.length || !interestB.length) {
    score += 10;
  } else {
    const overlap = interestA.filter((item) => interestB.includes(item));
    if (overlap.length) {
      score += Math.min(28, overlap.length * 12);
    } else {
      score -= 8;
    }
  }

  return Math.max(0, Math.min(100, score + 12));
}

function isTicketMatchLocked(ticket) {
  const status = String(ticket?.status || 'Đang chờ').trim();
  if (status === 'Hủy' || status === 'Ghép thành công chờ đặt cọc' || status === 'Đặt cọc thành công') {
    return true;
  }

  if (ticket && (ticket.matchedTicketId || ticket.matchedTicketId === 0 || ticket.matchedUserId)) {
    return true;
  }

  return false;
}

function isTicketEligibleForManualMatch(ticket) {
  return !isTicketMatchLocked(ticket);
}

function confirmAdminMatch(ticket1Id, ticket2Id) {
  const ticket1 = state.adminTickets.find((item) => String(item.id) === String(ticket1Id));
  const ticket2 = state.adminTickets.find((item) => String(item.id) === String(ticket2Id));

  if (!ticket1 || !ticket2) {
    alert('Phiếu không hợp lệ.');
    return;
  }

  if (!isTicketEligibleForManualMatch(ticket1) || !isTicketEligibleForManualMatch(ticket2)) {
    const lockedLabel = !isTicketEligibleForManualMatch(ticket1)
      ? ticket1.status || 'Phiếu đang ở trạng thái đã ghép'
      : ticket2.status || 'Phiếu đang ở trạng thái đã ghép';
    alert(`Không thể ghép: ${lockedLabel}. Phiếu đã ghép hoặc đã hủy không được ghép lại.`);
    return;
  }

  const score = getMatchScore(ticket1Id, ticket2Id);

  if (score < 60) {
    showConfirmDialog(
      `Mức độ tương đồng giữa 2 phiếu chỉ còn ${score}%.\nBạn có chắc chắn muốn ghép 2 phiếu này không?`,
      () => approveAdminMatch(ticket1Id, ticket2Id)
    );
    return;
  }

  approveAdminMatch(ticket1Id, ticket2Id);
}

function renderAdminDashboard() {
  const user = state.currentUser;
  if (!user || user.role !== 'admin') return;

  const appViewElement = $('#appView');
  if (!appViewElement) return;

  appViewElement.classList.remove('hidden');
  $('#ticketsTab')?.classList.add('hidden');
  $('#myticketsTab')?.classList.add('hidden');
  $('#notificationsTab')?.classList.add('hidden');
  $('#profileTab')?.classList.add('hidden');

  const suggestions = state.adminSuggestions || [];
  const tickets = state.adminTickets || [];
  const matchedPairs = state.adminMatchedPairs || [];
  const eligibleTickets = tickets.filter(isTicketEligibleForManualMatch);

  appViewElement.innerHTML = `
    <div class="card admin-summary" style="margin-bottom: 20px;">
      <h2>Dashboard quản trị</h2>
      <div class="grid three">
        <div class="card stat"><span>Tổng phiếu</span><strong>${tickets.length}</strong><small>Toàn bộ hệ thống</small></div>
        <div class="card stat"><span>Đang chờ</span><strong>${tickets.filter((ticket) => (ticket.status || 'Đang chờ') === 'Đang chờ').length}</strong><small>Chưa ghép</small></div>
        <div class="card stat"><span>Gợi ý hợp lệ</span><strong>${suggestions.length}</strong><small>Đề xuất ghép</small></div>
        <div class="card stat"><span>Đã ghép</span><strong>${matchedPairs.length}</strong><small>Cặp đã hoàn tất</small></div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 20px;">
      <h3>Ghép phiếu thủ công</h3>
      <div class="form-grid two">
        <label>Phiếu 1
          <select id="adminMatchTicketA">
            <option value="">-- Chọn phiếu thứ nhất --</option>
            ${eligibleTickets.map((ticket) => `<option value="${ticket.id}">Phiếu ${escapeHtml(ticket.id)} · ${escapeHtml(ticket.status || 'Đang chờ')}</option>`).join('') || '<option value="" disabled>Không còn phiếu hợp lệ để ghép</option>'}
          </select>
        </label>
        <label>Phiếu 2
          <select id="adminMatchTicketB">
            <option value="">-- Chọn phiếu thứ hai --</option>
            ${eligibleTickets.map((ticket) => `<option value="${ticket.id}">Phiếu ${escapeHtml(ticket.id)} · ${escapeHtml(ticket.status || 'Đang chờ')}</option>`).join('') || '<option value="" disabled>Không còn phiếu hợp lệ để ghép</option>'}
          </select>
        </label>
      </div>
      <div class="ticket-actions" style="margin-top: 12px;">
        <button type="button" id="adminMatchConfirmBtn" ${eligibleTickets.length < 2 ? 'disabled' : ''}>Ghép ngay</button>
      </div>
    </div>

    <div class="grid two">
      <div class="card">
        <h3>Danh sách phiếu chờ duyệt</h3>
        <div class="stack">
          ${tickets.length ? tickets.map((ticket) => `
            <div class="notice">
              <b>Phiếu ${escapeHtml(ticket.id)}</b> - ${escapeHtml(ticket.status || 'Đang chờ')}<br>
              <small>${formatDateTime(ticket.dateTime)}</small><br>
              <small>Yêu cầu: ${escapeHtml(ticket.preferredGender || 'Không yêu cầu')} • ${escapeHtml(ticket.preferredAge || 'Không yêu cầu')} • ${escapeHtml(ticket.preferredInterest || 'Không có')}</small>
              <div class="ticket-actions" style="margin-top: 8px;">
                <button type="button" class="secondary small" onclick="window.viewTicketDetail('${String(ticket.id).replace(/'/g, "\\'")}')">Xem</button>
              </div>
            </div>
          `).join('') : '<p class="muted">Chưa có phiếu nào.</p>'}
        </div>
      </div>

      <div class="card">
        <h3>Gợi ý ghép phiếu</h3>
        <div class="stack">
          ${suggestions.length ? suggestions.map((item) => `
            <div class="notice">
              <b>${escapeHtml(item.ticket1Id)} ↔ ${escapeHtml(item.ticket2Id)}</b><br>
              <small>Độ phù hợp: ${item.score}%</small><br>
              <small>${escapeHtml(item.reason)}</small>
              <div class="ticket-actions" style="margin-top: 8px;">
                <button type="button" class="small" onclick="window.confirmAdminPair('${String(item.ticket1Id).replace(/'/g, "\\'")}','${String(item.ticket2Id).replace(/'/g, "\\'")}')">Ghép ngay</button>
              </div>
            </div>
          `).join('') : '<p class="muted">Chưa có gợi ý phù hợp cho lúc này.</p>'}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 20px;">
      <h3>Cặp phiếu đã ghép</h3>
      <div class="stack">
        ${matchedPairs.length ? matchedPairs.map((pair) => `
          <div class="notice">
            <b>${escapeHtml(pair.ticket1Id)} ↔ ${escapeHtml(pair.ticket2Id)}</b><br>
            <small>${escapeHtml(pair.status1 || 'Đã ghép')} · ${escapeHtml(pair.status2 || 'Đã ghép')}</small><br>
            <small>${pair.matchedAt ? formatDateTime(pair.matchedAt) : 'Đã ghép'}</small>
          </div>
        `).join('') : '<p class="muted">Chưa có cặp phiếu nào được ghép.</p>'}
      </div>
    </div>
  `;

  $('#adminMatchConfirmBtn')?.addEventListener('click', () => {
    const ticket1Id = $('#adminMatchTicketA')?.value;
    const ticket2Id = $('#adminMatchTicketB')?.value;

    if (!ticket1Id || !ticket2Id) {
      alert('Vui lòng chọn 2 phiếu để ghép.');
      return;
    }

    if (ticket1Id === ticket2Id) {
      alert('Bạn không thể ghép cùng một phiếu.');
      return;
    }

    const ticket1 = state.adminTickets.find((item) => String(item.id) === String(ticket1Id));
    const ticket2 = state.adminTickets.find((item) => String(item.id) === String(ticket2Id));

    if (!ticket1 || !ticket2 || !isTicketEligibleForManualMatch(ticket1) || !isTicketEligibleForManualMatch(ticket2)) {
      const lockedLabel = !isTicketEligibleForManualMatch(ticket1)
        ? ticket1.status || 'Phiếu đang ở trạng thái đã ghép'
        : ticket2.status || 'Phiếu đang ở trạng thái đã ghép';
      alert(`Không thể ghép: ${lockedLabel}. Phiếu đã ghép hoặc đã hủy không được ghép lại.`);
      return;
    }

    confirmAdminMatch(ticket1Id, ticket2Id);
  });
}

function render() {
  renderSession();
  const user = state.currentUser;
  const app = appView();

  if (!user) {
    if (app) {
      app.dataset.role = 'guest';
      app.innerHTML = '';
    }
    safeToggleView({ showAuth: true, showApp: false });
    return;
  }

  if (user.role === 'admin') {
    app && (app.dataset.role = 'admin');
    app && (app.innerHTML = '');
    renderAdminDashboard();
    return;
  }

  if (app) {
    const shouldResetUserShell = app.dataset.role !== 'user' || !app.querySelector('.tab');
    if (shouldResetUserShell) {
      app.dataset.role = 'user';
      app.innerHTML = buildUserAppShell();
    }
  }

  renderStats();
  renderTickets();
  renderNotifications();
  renderProfile();

  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.activeTab);
  });

  document.querySelectorAll('.tabContent').forEach((panel) => {
    const mappedTab = panel.id.replace('Tab', '');
    panel.classList.toggle('hidden', mappedTab !== state.activeTab);
  });

  bindUserAppEvents();
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.onclick = () => {
      state.activeTab = button.dataset.tab;
      render();
    };
  });
}

function bindUserAppEvents() {
  const ticketForm = $('#ticketForm');
  const newTicketBtn = $('#newTicketBtn');
  const closeTicketModal = $('#closeTicketModal');
  const closeDetailModal = $('#closeDetailModal');
  const ticketDetailModal = $('#ticketDetailModal');
  const closeDepositModal = $('#closeDepositModal');
  const confirmDepositBtn = $('#confirmDepositBtn');
  const cancelDepositBtn = $('#cancelDepositBtn');

  ticketForm?.addEventListener('submit', createTicket);
  newTicketBtn?.addEventListener('click', () => {
    applyTicketRequirementDefaults();
    $('#ticketModal')?.classList.remove('hidden');
  });
  closeTicketModal?.addEventListener('click', () => {
    $('#ticketModal')?.classList.add('hidden');
    if (ticketForm) ticketForm.reset();
    applyTicketRequirementDefaults();
  });
  closeDetailModal?.addEventListener('click', closeTicketDetailModal);
  ticketDetailModal?.addEventListener('click', (event) => {
    if (event.target === ticketDetailModal) {
      closeTicketDetailModal();
    }
  });
  closeDepositModal?.addEventListener('click', () => $('#depositModal')?.classList.add('hidden'));
  confirmDepositBtn?.addEventListener('click', () => {
    if (state.selectedTicketId) confirmDeposit(state.selectedTicketId);
  });
  cancelDepositBtn?.addEventListener('click', () => {
    if (state.selectedTicketId) {
      cancelTicket(state.selectedTicketId);
      $('#depositModal')?.classList.add('hidden');
    }
  });

  setupTabs();
}

function attachEvents() {
  bindHeaderAuthButtons();

  const toggleLogin = $('#toggleLogin');
  const toggleRegister = $('#toggleRegister');
  const registerForm = $('#registerForm');
  const loginForm = $('#loginForm');

  toggleLogin?.addEventListener('click', () => {
    toggleLogin.classList.add('active');
    toggleRegister?.classList.remove('active');
    loginForm?.classList.add('active');
    registerForm?.classList.remove('active');
  });

  toggleRegister?.addEventListener('click', () => {
    toggleRegister.classList.add('active');
    toggleLogin?.classList.remove('active');
    registerForm?.classList.add('active');
    loginForm?.classList.remove('active');
  });

  registerForm?.addEventListener('submit', handleRegister);
  loginForm?.addEventListener('submit', handleLogin);
  $('#demoBtn')?.addEventListener('click', demoLogin);
}

async function approveAdminMatch(ticket1Id, ticket2Id = null) {
  const firstId = ticket1Id || state.selectedTicketId;
  const secondId = ticket2Id || null;

  if (!firstId || !secondId) {
    alert('Vui lòng chọn 2 phiếu để duyệt ghép.');
    return;
  }

  try {
    const res = await apiRequest('/admin/match', {
      method: 'POST',
      body: { ticket1Id: firstId, ticket2Id: secondId }
    });
    alert(res.message || 'Duyệt ghép thành công.');
    await loadUserData();
  } catch (error) {
    alert(error.message);
  }
}

window.viewTicketDetail = viewTicketDetail;
window.closeTicketDetailModal = closeTicketDetailModal;
window.confirmAdminPair = confirmAdminMatch;
window.cancelTicket = cancelTicket;
window.openDepositModal = openDepositModal;
window.approveAdminMatch = approveAdminMatch;

async function bootstrap() {
  attachEvents();
  renderSession();

  if (!state.token || !localStorage.getItem(STORAGE_KEY)) {
    state.token = '';
    state.currentUser = null;
    safeToggleView({ showAuth: true, showApp: false });
    return;
  }

  try {
    await loadUserData();
  } catch (error) {
    clearSession();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
