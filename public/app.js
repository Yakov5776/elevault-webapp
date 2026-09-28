const appRoot = document.querySelector('#app');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const dashboardWidgetCatalog = [
  ['balance', 'Available balance'],
  ['vaults', 'Vaults'],
  ['activity', 'Activity'],
  ['accounts', 'Accounts'],
  ['goals', 'Savings goals'],
  ['rate', 'Deposit rate'],
  ['shortcuts', 'Quick actions']
];
const defaultDashboardWidgets = dashboardWidgetCatalog.map(([id]) => id);

function readThemePreference() {
  try { return localStorage.getItem('elevault.theme') === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

function applyTheme(theme) {
  const selectedTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = selectedTheme;
  try { localStorage.setItem('elevault.theme', selectedTheme); } catch {}
}

applyTheme(readThemePreference());

function readDashboardWidgets() {
  try {
    const saved = JSON.parse(localStorage.getItem('elevault.dashboard.widgets') || 'null');
    if (!Array.isArray(saved)) return [...defaultDashboardWidgets];
    return [...new Set(saved.filter(id => defaultDashboardWidgets.includes(id)))];
  } catch {
    return [...defaultDashboardWidgets];
  }
}

modal.addEventListener('click', event => {
  if (event.target === modal) modal.close();
});
const state = {
  configured: false,
  authenticated: false,
  siteVersion: '',
  page: 'dashboard',
  customer: null,
  vaults: [],
  selectedVaultId: '',
  vaultDetail: null,
  vaultDetailLoading: false,
  vaultKeyFilter: 'All',
  linkedAccounts: [],
  notifications: [],
  transactions: [],
  transactionTypes: [],
  slotTypes: [],
  dashboardWidgets: readDashboardWidgets(),
  dashboardDraftWidgets: [],
  customizingWidgets: false,
  moreTab: 'settings',
  moreData: {},
  moreLoading: false,
  moreLoaded: false,
  moreLoadPromise: null,
  loading: false
};

const slotTypeGuids = {
  main: 'FE446A6F-ECCD-4F56-9088-9F4111353BE9',
  saving: 'DB5ADD65-4B17-40E5-996F-0D0E0471312C',
  emergency: 'D059A31A-D58C-44EE-837E-809C9536F352',
  expenses: 'DC446A6F-ECCD-4F56-9088-9F4111353BF6',
  challenge: '8236B7CB-73C0-4BB5-8A24-AF225A100479',
  advance: '42B1677D-A498-41BF-81C5-C599C431A54D'
};

const icon = name => `<svg class="icon icon-${name}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const listFrom = value => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['items', 'data', 'results', 'value', 'rates', 'depositRates', 'slots', 'legacySlotNumberList', 'transactions', 'transactionTypeList', 'slotTypeList', 'linkedAccounts', 'notifications', 'customerLinkAccountACHList', 'individualAlertList']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
};
const valueFrom = (value, keys) => {
  if (!value || typeof value !== 'object') return undefined;
  for (const key of keys) if (value[key] !== undefined && value[key] !== null) return value[key];
  return undefined;
};
const unwrap = value => value?.data && typeof value.data === 'object' ? value.data : value;

function setMoneyPlaceholders(root) {
  root.querySelectorAll('input[type="number"]').forEach(input => {
    input.placeholder = '0.00';
    input.inputMode = 'decimal';
    input.addEventListener('beforeinput', event => {
      if (!event.data) return;
      if (!/^[0-9.]+$/.test(event.data) || (event.data.includes('.') && input.value.includes('.'))) event.preventDefault();
    });
    input.addEventListener('paste', event => {
      const pasted = event.clipboardData.getData('text');
      if (!/^\d*\.?\d*$/.test(pasted) || (pasted.includes('.') && input.value.includes('.'))) event.preventDefault();
    });
    input.addEventListener('drop', event => {
      const dropped = event.dataTransfer.getData('text');
      if (!/^\d*\.?\d*$/.test(dropped) || (dropped.includes('.') && input.value.includes('.'))) event.preventDefault();
    });
    input.addEventListener('input', () => {
      const [integer, ...fraction] = input.value.replace(/[^0-9.]/g, '').split('.');
      const cleaned = integer + (fraction.length ? `.${fraction.join('')}` : '');
      if (cleaned !== input.value) input.value = cleaned;
    });
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.authenticated) {
      state.authenticated = false;
      render();
    }
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(number);
}

function formatRate(response, field = 'rateValue') {
  const source = unwrap(response);
  const records = Array.isArray(source) ? source : listFrom(source);
  const rate = valueFrom(source, [field]) ?? valueFrom(records[0], [field]);
  const number = Number(rate);
  return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : '—';
}

function initials(name) {
  return String(name || 'E').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function displayName() {
  const customer = unwrap(state.customer) || {};
  return valueFrom(customer, ['alias', 'firstName', 'givenName', 'displayName', 'name']) ||
    [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email || 'Your Elevault';
}

function profilePhotoUrl() {
  try {
    const url = new URL(unwrap(state.customer)?.imageUrl || '');
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function totalBalance() {
  if (!state.vaults.length) return undefined;
  return state.vaults.reduce((total, vault) => total + Number(vaultAmount(vault) || 0), 0);
}

function activeVaults() {
  return state.vaults.filter(vault => vault && vault.deleted !== true);
}

function emergencyVault() {
  return activeVaults().find(vault => String(vault.slotTypeGuid || '').toUpperCase() === slotTypeGuids.emergency) || null;
}

function emergencySetupNeeded(vault) {
  return String(vault?.slotTypeGuid || '').toUpperCase() === slotTypeGuids.emergency && vault.slotGoal == null;
}

function regularVaults() {
  return activeVaults().filter(vault => String(vault.slotTypeGuid || '').toUpperCase() !== slotTypeGuids.emergency);
}

function vaultType(vault) {
  const typeGuid = String(vault?.slotTypeGuid || '').toUpperCase();
  const known = Object.entries(slotTypeGuids).find(([, guid]) => guid === typeGuid)?.[0];
  return ({ main: 'Main Vault', saving: 'Savings Vault', emergency: 'Emergency Fund', expenses: 'Expenses Vault', challenge: 'Challenge Vault', advance: 'Advance Vault' })[known] ||
    valueFrom(vault, ['slotTypeName', 'typeName', 'category']) || 'Vault';
}

function vaultId(vault) {
  return valueFrom(vault, ['slotGuid', 'guid', 'id']) || '';
}

function vaultName(vault) {
  if (String(vault?.slotTypeGuid || '').toUpperCase() === slotTypeGuids.emergency) return 'Emergency fund';
  return valueFrom(vault, ['description', 'slotName', 'name', 'title', 'displayName']) || 'Vault';
}

function vaultAmount(vault) {
  return valueFrom(vault, ['slotAvailableBalance', 'availableBalance']);
}

function dateLabel(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? safe(value) : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function shortDateLabel(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safe(value);
  const options = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

function transactionTitle(item) {
  return valueFrom(item, ['longSmartLabel', 'shortSmartLabel', 'description', 'merchantName', 'transactionDescription', 'name', 'type']) || 'Transaction';
}

function transactionAmount(item) {
  return valueFrom(item, ['transactionAmountDecimal', 'transactionAmount', 'amount', 'value']) ?? 0;
}

function transactionTypeFor(item) {
  const guid = String(valueFrom(item, ['transactionTypeGuid']) || '').toLowerCase();
  return state.transactionTypes.find(type => String(type.transactionTypeGuid || '').toLowerCase() === guid);
}

function visibleTransactions(items) {
  return items.filter(item => item?.includeInBalance !== false);
}

function fdicDisclosure() {
  return `<div class="fdic-disclosure"><svg class="fdic-mark" viewBox="0 0 37.797 17" role="img" aria-label="FDIC"><use href="#i-fdic"></use></svg><p>Elevault is a product of Southern Bancorp, Member FDIC. Deposits held at Southern Bancorp are FDIC-insured to at least $250,000 per Portfolio. <a href="https://intercom.help/elevault/en/articles/9195341-is-my-money-fdic-insured-with-elevault" target="_blank" rel="noopener noreferrer">Coverage details</a></p></div>`;
}

function renderLogin(step = 'credentials', error = '') {
  const configNotice = '';
  appRoot.innerHTML = `
    <section class="auth-page">
      <div class="auth-art">
        <a class="brand" href="/dashboard" aria-label="Elevault"><img class="brand-symbol" src="/assets/elevault-mark.png" alt=""><span class="brand-name">elevault</span></a>
        <span class="auth-online-label">Online banking</span>
      </div>
      <div class="auth-side"><form class="auth-form-wrap" id="login-form">
        <p class="eyebrow">Welcome back</p>
        <h2>${step === 'credentials' ? 'Sign in to Elevault' : 'Check your messages'}</h2>
        <p class="auth-lead">${step === 'credentials' ? 'Use your existing Elevault sign-in. We’ll send a one-time verification code.' : 'Enter the verification code sent to your registered contact.'}</p>
        ${step === 'credentials' ? `
          <div class="field"><label for="username">Email address</label><input id="username" name="username" type="email" autocomplete="username" required></div>
          <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
          <button class="button" type="submit" ${state.configured ? '' : 'disabled'}>Continue ${icon('arrow')}</button>` : `
          <div class="field"><label for="code">Verification code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required autofocus></div>
          <button class="button" type="submit">Verify and sign in ${icon('arrow')}</button>
          <button class="text-button" id="back-to-login" type="button">Use a different account</button>`}
        <p class="form-error" id="form-error" role="alert">${safe(error)}</p>
        ${configNotice}
      </form><div class="auth-compliance">${fdicDisclosure()}</div></div>
    </section>`;

  const form = document.querySelector('#login-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    document.querySelector('#form-error').textContent = '';
    try {
      if (step === 'credentials') {
        const formData = new FormData(form);
        await api('/api/auth/request-code', { method: 'POST', body: { username: formData.get('username'), password: formData.get('password') } });
        renderLogin('code');
      } else {
        const formData = new FormData(form);
        await api('/api/auth/verify-code', { method: 'POST', body: { code: formData.get('code') } });
        state.authenticated = true;
        await loadDashboard();
        loadMoreData();
        await applyLocationRoute();
      }
    } catch (requestError) {
      submit.disabled = false;
      document.querySelector('#form-error').textContent = requestError.message;
    }
  });
  document.querySelector('#back-to-login')?.addEventListener('click', () => renderLogin());
}

const navItems = [
  ['dashboard', 'Overview', 'grid'],
  ['vaults', 'Vaults', 'vault'],
  ['activity', 'Activity', 'swap'],
  ['accounts', 'Accounts', 'link'],
  ['notifications', 'Notifications', 'bell'],
  ['more', 'More', 'settings']
];

function renderShell(content, { animate = true } = {}) {
  const name = displayName();
  const profileImage = profilePhotoUrl();
  const navPage = state.page === 'vaultDetail' ? 'vaults' : state.page;
  const selectedVault = state.page === 'vaultDetail' ? state.vaults.find(vault => vaultId(vault) === state.selectedVaultId) : null;
  const breadcrumb = selectedVault
    ? `My vaults <span aria-hidden="true">/</span> <strong>${safe(vaultName(selectedVault))}</strong>`
    : state.page === 'dashboard' ? 'Overview'
      : `Your financial home <span aria-hidden="true">/</span> ${safe(navItems.find(item => item[0] === navPage)?.[1] || 'Overview')}`;
  const unread = state.notifications.filter(item => !valueFrom(item, ['read', 'isRead', 'readAt'])).length;
  const renderNavItems = items => items.map(([key, label, glyph]) => `
          <button class="nav-item ${navPage === key ? 'active' : ''}" data-page="${key}" type="button">${glyph ? icon(glyph) : ''}<span>${label}</span>${key === 'notifications' && unread ? `<span class="nav-count">${unread}</span>` : ''}</button>`).join('');
  appRoot.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="/dashboard" aria-label="Elevault home"><img class="brand-symbol" src="/assets/elevault-mark.png" alt=""><span class="brand-name">elevault</span></a>
        <p class="brand-caption">Your financial home</p>
        <nav class="nav-list" aria-label="Main navigation"><div class="nav-group">${renderNavItems(navItems.slice(0, 4))}</div><div class="nav-divider"></div><div class="nav-group">${renderNavItems(navItems.slice(4))}</div></nav>
        <div class="sidebar-bottom">
          <div class="sidebar-user"><span class="avatar">${safe(initials(name))}${profileImage ? `<img class="avatar-image" src="${safe(profileImage)}" alt="" referrerpolicy="no-referrer">` : ''}</span><span class="user-copy"><strong>${safe(name)}</strong><span>${safe(unwrap(state.customer)?.email || 'Elevault member')}</span></span><button class="icon-button" id="logout" type="button" aria-label="Sign out" title="Sign out">${icon('logout')}</button></div>
        </div>
      </aside>
      <section class="main-column">
        <header class="topbar"><button class="icon-button mobile-menu" id="menu-toggle" type="button" aria-label="Open navigation">${icon('menu')}</button><div class="mobile-brand"><img class="brand-symbol" src="/assets/elevault-mark.png" alt="">elevault</div><div class="crumb">${breadcrumb}</div><span class="site-version">Version ${safe(state.siteVersion)}</span></header>
        <div class="content${animate ? ' page-enter' : ''}">${content}</div>
      </section>
    </div>`;
  setMoneyPlaceholders(appRoot);
  bindTransactionMetadata(appRoot);
  appRoot.querySelectorAll('.nav-item[data-page]').forEach(button => button.addEventListener('click', () => {
    if (state.page === button.dataset.page) {
      document.querySelector('#sidebar')?.classList.remove('open');
      return;
    }
    document.querySelector('#sidebar')?.classList.remove('open');
    navigatePage(button.dataset.page);
  }));
  appRoot.querySelectorAll('[data-vault-link]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const vault = state.vaults.find(item => vaultId(item) === link.dataset.vaultLink);
    if (vault) openVaultDetail(vault);
  }));
  document.querySelector('#logout').addEventListener('click', logout);
  document.querySelector('#menu-toggle').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
  appRoot.querySelectorAll('.avatar-image').forEach(image => image.addEventListener('error', () => image.remove(), { once: true }));
}

function bindTransactionMetadata(root) {
  root.querySelectorAll('[data-transaction-metadata]').forEach(button => button.addEventListener('click', async () => {
    try {
      const metadata = await api(`/api/data/transactions/${encodeURIComponent(button.dataset.transactionMetadata)}/metadata`);
      openModal('Transaction details', 'Details provided by Elevault.', `<pre class="metadata-view">${safe(JSON.stringify(unwrap(metadata), null, 2))}</pre>`, 'Close', async () => ({}));
    } catch (error) { showToast(error.message, true); }
  }));
}

function pageHeading(eyebrow, title, subtitle, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="heading-sub">${subtitle}</p></div>${action}</div>`;
}

function vaultAccountRows(vaults) {
  return vaults.map(vault => {
    const id = vaultId(vault);
    if (!id) return '';
    const isEmergency = String(vault.slotTypeGuid || '').toUpperCase() === slotTypeGuids.emergency;
    const slotType = state.slotTypes.find(item => String(item.slotTypeGuid || '').toUpperCase() === String(vault.slotTypeGuid || '').toUpperCase());
    const goalSetup = emergencySetupNeeded(vault);
    const name = vaultName(vault);
    const type = vaultType(vault);
    const goalAmount = Number(vault.slotGoal?.amount) || 0;
    const detail = goalSetup ? 'Savings goal setup needed'
      : isEmergency ? `Savings goal · ${goalAmount > 0 ? formatMoney(goalAmount) : 'Not yet funded'}`
        : goalAmount > 0 ? `Savings goal · ${formatMoney(goalAmount)}`
        : name.toLowerCase() === type.toLowerCase() ? '' : type;
    const vaultIcon = isEmergency && slotType?.imageUrl
      ? `<img class="vault-type-image" src="${safe(slotType.imageUrl)}" alt="">`
      : icon(isEmergency ? 'umbrella' : 'vault');
    const rowContent = `<span class="bank-list-account"><span class="bank-list-icon${isEmergency ? ' bank-list-icon-emergency' : ''}">${vaultIcon}</span><span class="bank-list-copy"><strong>${safe(name)}</strong>${detail ? `<small>${safe(detail)}</small>` : ''}</span></span>${goalSetup ? '' : `<span class="bank-list-balance"><strong>${formatMoney(vaultAmount(vault))}</strong></span>`}${icon('arrow')}`;
    const row = goalSetup
      ? `<button class="vault-account-row emergency-setup-row" data-emergency-setup="${safe(id)}" type="button">${rowContent}</button>`
      : `<a class="vault-account-row" href="/vault/${encodeURIComponent(id)}" data-vault-link="${safe(id)}">${rowContent}</a>`;
    return `<div class="vault-account-entry${goalSetup ? ' needs-emergency-setup' : ''}">${row}</div>`;
  }).join('');
}

function pagePath(page = state.page, tab = state.moreTab, vaultId = state.selectedVaultId) {
  if (page === 'vaultDetail' && vaultId) return `/vault/${encodeURIComponent(vaultId)}`;
  if (page === 'more') return `/my/${encodeURIComponent(tab)}`;
  return `/${page}`;
}

function navigatePage(page) {
  state.selectedVaultId = '';
  const path = pagePath(page);
  if (window.location.pathname !== path || window.location.hash) window.history.pushState(null, '', path);
  return applyLocationRoute();
}

function transactionHoldNotice(item) {
  const memo = item?.memo;
  if (!memo || typeof memo !== 'object' || !memo.expireTimestamp) return '';
  const expireDate = new Date(memo.expireTimestamp);
  if (Number.isNaN(expireDate.getTime())) return '';
  const amount = Math.abs(Number(memo.amountDecimal) || 0);
  return `<div class="activity-hold">${amount ? `<strong>${formatMoney(amount)} pending</strong> · ` : 'Pending · '}Available ${dateLabel(expireDate)}</div>`;
}

function transactionTable(items, limit = 5, { vaultScoped = false } = {}) {
  if (!items.length) return `<div class="empty-state"><strong>No activity to show</strong>Transactions from your Elevault accounts will appear here.</div>`;
  const columns = vaultScoped ? '<th>Details</th><th>Date</th><th>Amount</th>' : '<th>Details</th><th>Date</th><th>Vault</th><th>Amount</th>';
  return `<div class="table-wrap${vaultScoped ? ' vault-activity-table' : ''}"><table class="activity-table"><thead><tr>${columns}</tr></thead><tbody>${items.slice(0, limit).map(item => {
    const amount = Number(transactionAmount(item));
    const relatedVault = state.vaults.find(vault => vaultId(vault) === valueFrom(item, ['slotGuid', 'vaultGuid']));
    const transactionGuid = valueFrom(item, ['transactionGuid', 'id']);
    const transactionType = transactionTypeFor(item);
    const imageUrl = transactionType?.imageUrl;
    const iconMarkup = imageUrl ? `<span class="transaction-icon"><img src="${safe(imageUrl)}" alt="" loading="lazy"></span>` : '';
    const title = transactionGuid
      ? `<button class="activity-title activity-detail-button" type="button" data-transaction-metadata="${safe(transactionGuid)}">${safe(transactionTitle(item))}</button>`
      : `<span class="activity-title">${safe(transactionTitle(item))}</span>`;
    const transactionDate = valueFrom(item, ['transactionDateTime', 'date', 'createdAt', 'postedAt']);
    const formattedDate = vaultScoped ? shortDateLabel(transactionDate) : dateLabel(transactionDate);
    return `<tr><td><div class="activity-details">${iconMarkup}<div class="activity-copy">${title}<div class="activity-date">${safe(valueFrom(item, ['transactionType', 'type', 'status']) || '')}</div>${transactionHoldNotice(item)}</div></div></td><td>${formattedDate}</td>${vaultScoped ? '' : `<td>${safe(relatedVault ? vaultName(relatedVault) : valueFrom(item, ['slotName', 'vaultName']) || '—')}</td>`}<td class="${amount > 0 ? 'amount-positive' : 'amount-negative'}">${amount > 0 ? '+' : ''}${formatMoney(amount)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function activitySparkline(items) {
  if (!items.length || activeVaults().length > 12) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (29 - index));
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return { date, key, amount: 0, count: 0 };
  });
  const byDate = new Map(days.map(day => [day.key, day]));
  items.forEach(item => {
    const date = new Date(valueFrom(item, ['transactionDateTime', 'date', 'createdAt', 'postedAt']));
    if (Number.isNaN(date.getTime())) return;
    const day = byDate.get(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
    if (day) {
      day.amount += Math.abs(Number(transactionAmount(item)) || 0);
      day.count += 1;
    }
  });
  const maximum = Math.max(...days.map(day => day.amount));
  if (!maximum) return '';
  const bars = days.map(day => {
    const height = day.amount ? Math.max(5, day.amount / maximum * 100) : 2;
    const countLabel = `${day.count} transaction${day.count === 1 ? '' : 's'}`;
    const label = `${dateLabel(day.date)}: ${formatMoney(day.amount)}, ${countLabel}`;
    return `<span class="activity-sparkline-bar${day.amount ? ' has-activity' : ''}" style="--bar-height:${height}%" role="img" tabindex="0" aria-label="${safe(label)}"><span class="activity-sparkline-tooltip" aria-hidden="true"><strong>${safe(dateLabel(day.date))}</strong><span>${formatMoney(day.amount)}</span><span>${countLabel}</span></span></span>`;
  }).join('');
  return `<div class="activity-sparkline" role="group" aria-label="Daily transaction activity over the past 30 days"><span>Transaction activity · Past 30 days</span><div>${bars}</div></div>`;
}

function dashboardActivityRows(items, limit = 5) {
  if (!items.length) return `<div class="empty-state"><strong>No activity to show</strong>Transactions from your Elevault accounts will appear here.</div>`;
  const dateValue = item => valueFrom(item, ['transactionDateTime', 'date', 'createdAt', 'postedAt']);
  const recent = [...items].sort((first, second) => new Date(dateValue(second) || 0) - new Date(dateValue(first) || 0)).slice(0, limit);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const groups = new Map();
  recent.forEach(item => {
    const rawDate = dateValue(item);
    const date = rawDate ? new Date(rawDate) : null;
    const validDate = date && !Number.isNaN(date.getTime());
    const day = validDate ? new Date(date) : null;
    if (day) day.setHours(0, 0, 0, 0);
    const label = !validDate ? 'Date unavailable'
      : day.getTime() === today.getTime() ? 'Today'
        : day.getTime() === yesterday.getTime() ? 'Yesterday' : shortDateLabel(date);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  });
  const rows = [...groups].map(([label, group]) => `<section class="overview-activity-group"><h3>${safe(label)}</h3>${group.map(item => {
    const amount = Number(transactionAmount(item));
    const transactionGuid = valueFrom(item, ['transactionGuid', 'id']);
    const title = transactionGuid
      ? `<button class="activity-title activity-detail-button" type="button" data-transaction-metadata="${safe(transactionGuid)}">${safe(transactionTitle(item))}</button>`
      : `<span class="activity-title">${safe(transactionTitle(item))}</span>`;
    const vault = state.vaults.find(candidate => vaultId(candidate) === valueFrom(item, ['slotGuid', 'vaultGuid']));
    const details = [valueFrom(item, ['transactionType', 'type', 'status']), vault ? vaultName(vault) : valueFrom(item, ['slotName', 'vaultName'])].filter(Boolean).join(' · ');
    const transactionType = transactionTypeFor(item);
    const transactionIcon = transactionType?.imageUrl
      ? `<span class="overview-transaction-icon"><img src="${safe(transactionType.imageUrl)}" alt="" loading="lazy"></span>`
      : `<span class="overview-transaction-icon overview-transaction-icon-fallback">${icon('swap')}</span>`;
    return `<div class="overview-activity-row"><div class="overview-activity-copy">${transactionIcon}<div class="overview-activity-description">${title}${details ? `<span>${safe(details)}</span>` : ''}${transactionHoldNotice(item)}</div></div><div class="overview-activity-amount"><strong class="${amount > 0 ? 'amount-positive' : 'amount-negative'}">${amount > 0 ? '+' : ''}${formatMoney(amount)}</strong><span>${shortDateLabel(dateValue(item))}</span></div></div>`;
  }).join('')}</section>`).join('');
  return `<div class="overview-activity-list">${rows}</div>`;
}

function linkedAccountRows(accounts) {
  if (!accounts.length) return `<div class="empty-state"><strong>No linked accounts</strong>Your connected accounts will appear here.</div>`;
  return accounts.map(account => {
    const pending = String(account.status || '').toLowerCase() === 'pending';
    const accountDetails = [valueFrom(account, ['accountType', 'type']), valueFrom(account, ['last4']) ? `•••• ${valueFrom(account, ['last4'])}` : ''].filter(Boolean).join(' · ');
    return `<div class="account-line"><span class="bank-icon">${safe(String(valueFrom(account, ['institutionName', 'bankName', 'accountName', 'name']) || 'BK').slice(0, 2).toUpperCase())}</span><span class="account-copy"><strong>${safe(valueFrom(account, ['accountName', 'institutionName', 'name']) || 'Bank account')}</strong><span>${safe(accountDetails || 'Linked account')}</span></span><span class="account-actions"><span class="account-status">${safe(valueFrom(account, ['status']) || 'Connected')}</span>${pending ? `<button class="text-button" data-verify-account="${safe(account.id)}" type="button">Verify deposits</button>` : ''}</span></div>`;
  }).join('');
}

function renderDashboard({ preserveScroll = state.customizingWidgets } = {}) {
  const scrollTop = preserveScroll ? appRoot.querySelector('.content')?.scrollTop || 0 : 0;
  const widgetIds = state.customizingWidgets ? state.dashboardDraftWidgets : state.dashboardWidgets;
  const widgets = widgetIds.map(renderDashboardWidget).join('');
  const availableWidgets = dashboardWidgetCatalog.filter(([id]) => !widgetIds.includes(id));
  const widgetActions = state.customizingWidgets
    ? `<div class="heading-actions customize-actions"><button class="icon-button" id="cancel-widget-customization" type="button" aria-label="Discard widget changes" title="Discard changes">${icon('close')}</button><button class="icon-button save-widget-layout" id="save-widget-customization" type="button" aria-label="Save widget layout" title="Save layout">${icon('check')}</button></div>`
    : `<div class="heading-actions"><button class="icon-button" id="manage-widgets" type="button" aria-label="Customize overview" title="Customize overview">${icon('settings')}</button></div>`;
  const hiddenWidgets = state.customizingWidgets
    ? `<section class="hidden-widgets"><div class="widget-heading"><div><h2>Add widgets</h2><p class="heading-sub">Choose a hidden widget to add it back.</p></div></div><div class="hidden-widget-list">${availableWidgets.map(([id, label]) => `<div class="hidden-widget-row"><span>${label}</span><button class="icon-button widget-add-button" type="button" data-widget-add="${id}" aria-label="Add ${label}" title="Add ${label}">${icon('plus')}</button></div>`).join('') || '<p class="all-widgets-visible">All widgets are currently visible.</p>'}</div></section>`
    : '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const content = `
    ${pageHeading('', 'Overview', `${greeting}, ${safe(displayName().split(' ')[0])}.`, widgetActions)}
    <div class="dashboard-widgets">${widgets || '<div class="empty-state">Add a widget to personalize your overview.</div>'}</div>
    ${hiddenWidgets}
    ${fdicDisclosure()}`;
  renderShell(content, { animate: !preserveScroll });
  bindPageActions();
  bindDashboardWidgetDragging();
  document.querySelector('#manage-widgets')?.addEventListener('click', () => {
    state.dashboardDraftWidgets = [...state.dashboardWidgets];
    state.customizingWidgets = true;
    renderDashboard();
  });
  document.querySelector('#cancel-widget-customization')?.addEventListener('click', () => {
    state.dashboardDraftWidgets = [];
    state.customizingWidgets = false;
    renderDashboard({ preserveScroll: true });
  });
  document.querySelector('#save-widget-customization')?.addEventListener('click', () => {
    state.dashboardWidgets = [...state.dashboardDraftWidgets];
    saveDashboardWidgets();
    state.dashboardDraftWidgets = [];
    state.customizingWidgets = false;
    renderDashboard({ preserveScroll: true });
  });
  document.querySelectorAll('[data-widget-hide]').forEach(button => button.addEventListener('click', () => {
    state.dashboardDraftWidgets = state.dashboardDraftWidgets.filter(id => id !== button.dataset.widgetHide);
    renderDashboard();
  }));
  document.querySelectorAll('[data-widget-add]').forEach(button => button.addEventListener('click', () => {
    if (!state.dashboardDraftWidgets.includes(button.dataset.widgetAdd)) state.dashboardDraftWidgets.push(button.dataset.widgetAdd);
    renderDashboard();
  }));
  if (preserveScroll) appRoot.querySelector('.content').scrollTop = scrollTop;
}

function dashboardWidgetDragHandle(id) {
  if (!state.customizingWidgets) return '';
  const title = Object.fromEntries(dashboardWidgetCatalog)[id];
  return `<button class="widget-drag-handle" type="button" draggable="true" data-widget-drag="${id}" aria-label="Reorder ${title} widget" aria-keyshortcuts="ArrowUp ArrowDown" title="Drag to reorder or focus and use arrow keys">${icon('grip')}</button>`;
}

function dashboardWidgetHideButton(id) {
  if (!state.customizingWidgets) return '';
  const title = Object.fromEntries(dashboardWidgetCatalog)[id];
  return `<button class="icon-button widget-hide-button" type="button" data-widget-hide="${id}" aria-label="Hide ${title}" title="Hide ${title}">${icon('eye-off')}</button>`;
}

function renderDashboardWidget(id) {
  const title = Object.fromEntries(dashboardWidgetCatalog)[id];
  const widgetTools = action => `<span class="widget-tools">${action || ''}${dashboardWidgetDragHandle(id)}${dashboardWidgetHideButton(id)}</span>`;
  const heading = action => `<div class="widget-heading"><h2>${title}</h2>${widgetTools(action)}</div>`;
  if (id === 'balance') return `<section class="dashboard-widget balance-widget" data-widget="balance"><div class="balance-widget-tools">${state.customizingWidgets ? widgetTools('') : ''}</div><div class="balance-widget-layout"><div><strong class="dashboard-total">${formatMoney(totalBalance())}</strong><p class="dashboard-caption">Available across ${activeVaults().length} vaults</p></div><div class="overview-balance-actions"><button class="button secondary" data-action="transfer" type="button">${icon('swap')} Transfer</button><button class="button" data-action="new-vault" type="button">${icon('plus')} New vault</button></div></div>${activitySparkline(state.transactions)}</section>`;
  if (id === 'vaults') return `<section class="dashboard-widget" data-widget="vaults">${heading(`<button class="text-button" data-page="vaults" type="button">View all ${icon('arrow')}</button>`)}<div class="bank-list">${vaultAccountRows(activeVaults().slice(0, 4)) || '<div class="empty-state"><strong>No active vaults</strong>Create a vault to start saving.</div>'}</div></section>`;
  if (id === 'activity') return `<section class="dashboard-widget" data-widget="activity">${heading(`<button class="text-button" data-page="activity" type="button">View all ${icon('arrow')}</button>`)}${dashboardActivityRows(state.transactions, 5)}</section>`;
  if (id === 'accounts') return `<section class="dashboard-widget" data-widget="accounts">${heading(`<button class="text-button" data-page="accounts" type="button">Manage</button>`)}${linkedAccountRows(state.linkedAccounts.slice(0, 4))}</section>`;
  if (id === 'goals') {
    const goals = activeVaults().filter(vault => Number(vault.slotGoal?.amount) > 0);
    const rows = goals.map(vault => {
      const goal = Number(vault.slotGoal.amount);
      const balance = Number(vaultAmount(vault)) || 0;
      const progress = Math.max(0, Math.min(100, Math.round(balance / goal * 100)));
      return `<div class="goal-row"><div class="goal-row-heading"><span><strong>${safe(vaultName(vault))}</strong><small>${safe(vaultType(vault))} · target ${dateLabel(vault.slotGoal.targetDate)}</small></span><span>${formatMoney(balance)} of ${formatMoney(goal)}</span></div><div class="goal-progress" role="progressbar" aria-label="${safe(vaultName(vault))} goal progress" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div></div>`;
    }).join('');
    return `<section class="dashboard-widget" data-widget="goals">${heading(`<button class="text-button" data-page="vaults" type="button">View vaults</button>`)}${rows || '<div class="empty-state">Vaults with savings goals will appear here.</div>'}</section>`;
  }
  if (id === 'rate') return `<section class="dashboard-widget rate-widget" data-widget="rate">${heading('')}<div class="rate-highlight"><div><span>Annual percentage yield (APY)</span><strong>${formatRate(state.interestRate, 'apy')}</strong></div><div class="rate-standard"><span>Standard deposit rate</span><strong>${formatRate(state.interestRate)}</strong></div></div></section>`;
  if (id === 'shortcuts') return `<section class="dashboard-widget" data-widget="shortcuts">${heading('')}<div class="quick-actions"><button class="button secondary" data-action="transfer" type="button">${icon('swap')} Transfer</button><button class="button secondary" data-action="new-vault" type="button">${icon('plus')} New vault</button><button class="button secondary" data-action="link-account" type="button">${icon('link')} Link account</button></div></section>`;
  return '';
}

function saveDashboardWidgets() {
  try { localStorage.setItem('elevault.dashboard.widgets', JSON.stringify(state.dashboardWidgets)); } catch {}
}

function moveDashboardWidget(widgetId, destinationIndex) {
  if (!state.customizingWidgets) return;
  const sourceIndex = state.dashboardDraftWidgets.indexOf(widgetId);
  if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= state.dashboardDraftWidgets.length || sourceIndex === destinationIndex) return;
  const [widget] = state.dashboardDraftWidgets.splice(sourceIndex, 1);
  state.dashboardDraftWidgets.splice(destinationIndex, 0, widget);
  renderDashboard();
  document.querySelector(`[data-widget-drag="${widgetId}"]`)?.focus();
}

function reorderDashboardWidget(sourceId, targetId, after) {
  const sourceIndex = state.dashboardDraftWidgets.indexOf(sourceId);
  const targetIndex = state.dashboardDraftWidgets.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const insertionIndex = targetIndex + (after ? 1 : 0);
  moveDashboardWidget(sourceId, insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex);
}

function bindDashboardWidgetDragging() {
  if (!state.customizingWidgets) return;
  const dashboard = document.querySelector('.dashboard-widgets');
  if (!dashboard) return;
  let draggedId = '';
  const clearDropTargets = () => dashboard.querySelectorAll('.drop-before, .drop-after').forEach(widget => {
    widget.classList.remove('drop-before', 'drop-after');
  });
  const highlightDropTarget = (widget, clientX, clientY, sourceId) => {
    if (!widget || widget.dataset.widget === sourceId) {
      clearDropTargets();
      return;
    }
    const bounds = widget.getBoundingClientRect();
    const inRow = clientY > bounds.top + bounds.height * .25 && clientY < bounds.bottom - bounds.height * .25;
    const after = inRow ? clientX > bounds.left + bounds.width / 2 : clientY > bounds.top + bounds.height / 2;
    clearDropTargets();
    widget.classList.add(after ? 'drop-after' : 'drop-before');
  };

  dashboard.querySelectorAll('[data-widget-drag]').forEach(handle => {
    handle.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || event.button !== 0) return;
      draggedId = handle.dataset.widgetDrag;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      handle.closest('.dashboard-widget')?.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove', event => {
      if (!draggedId || event.pointerType === 'mouse') return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-widget]');
      highlightDropTarget(target, event.clientX, event.clientY, draggedId);
    });
    handle.addEventListener('pointerup', event => {
      if (!draggedId || event.pointerType === 'mouse') return;
      const sourceId = draggedId;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-widget]');
      const after = target?.classList.contains('drop-after');
      draggedId = '';
      dashboard.querySelectorAll('.is-dragging').forEach(widget => widget.classList.remove('is-dragging'));
      if (target && target.dataset.widget !== sourceId) reorderDashboardWidget(sourceId, target.dataset.widget, after);
      clearDropTargets();
    });
    handle.addEventListener('pointercancel', () => {
      draggedId = '';
      dashboard.querySelectorAll('.is-dragging').forEach(widget => widget.classList.remove('is-dragging'));
      clearDropTargets();
    });
    handle.addEventListener('dragstart', event => {
      draggedId = handle.dataset.widgetDrag;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedId);
      handle.closest('.dashboard-widget')?.classList.add('is-dragging');
    });
    handle.addEventListener('dragend', () => {
      draggedId = '';
      dashboard.querySelectorAll('.is-dragging').forEach(widget => widget.classList.remove('is-dragging'));
      clearDropTargets();
    });
    handle.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const index = state.dashboardWidgets.indexOf(handle.dataset.widgetDrag);
      moveDashboardWidget(handle.dataset.widgetDrag, index + (event.key === 'ArrowUp' ? -1 : 1));
    });
  });

  dashboard.querySelectorAll('[data-widget]').forEach(widget => {
    widget.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const sourceId = event.dataTransfer.getData('text/plain') || draggedId;
      if (!sourceId || sourceId === widget.dataset.widget) return;
      highlightDropTarget(widget, event.clientX, event.clientY, sourceId);
    });
    widget.addEventListener('dragleave', event => {
      if (!widget.contains(event.relatedTarget)) widget.classList.remove('drop-before', 'drop-after');
    });
    widget.addEventListener('drop', event => {
      event.preventDefault();
      const sourceId = event.dataTransfer.getData('text/plain') || draggedId;
      const after = widget.classList.contains('drop-after');
      reorderDashboardWidget(sourceId, widget.dataset.widget, after);
      clearDropTargets();
    });
  });
}

function renderVaults() {
  const vaults = activeVaults();
  const rows = vaultAccountRows(vaults);
  const content = `${pageHeading('', 'Vaults', '', `<button class="button" data-action="new-vault" type="button">${icon('plus')} New vault</button>`)}<section class="bank-list account-list"><div class="bank-list-header"><span>Account</span><span>Available balance</span></div>${rows || '<div class="empty-state"><strong>No active vaults</strong>Create a vault to begin organizing your savings.</div>'}</section>`;
  renderShell(content);
  bindPageActions();
}

function vaultKeyListMarkup(detail, filter, loading) {
  if (loading) return '<div class="empty-state">Loading vault keys…</div>';
  const allKeys = detail?.vaultKeys || [];
  const keys = allKeys.filter(key => filter === 'All' || Boolean(key.active) === (filter === 'Active'));
  if (!allKeys.length) return '<div class="empty-state"><strong>No keys for this vault</strong>Vault keys linked to this account will appear here.</div>';
  if (!keys.length) return '<div class="empty-state">No keys match this filter.</div>';
  return keys.map(key => {
    const number = String(key.legacyNumber || '');
    return `<button class="vault-key-row" type="button" data-vault-key-open="${safe(key.legacySlotNumberGuid)}"><span class="bank-list-account"><span class="bank-list-icon">${icon('key')}</span><span><strong>${safe(key.name || 'Vault key')}</strong><small>${number ? `Account ending in ${safe(number.slice(-4))}` : 'Account number unavailable'}</small></span></span><span class="vault-key-status ${key.active ? 'active' : 'inactive'}">${key.active ? 'Active' : 'Inactive'}</span>${icon('arrow')}</button>`;
  }).join('');
}

function bindVaultKeyButtons(container, detail) {
  container.querySelectorAll('[data-vault-key-open]').forEach(button => button.addEventListener('click', () => {
    const key = detail?.vaultKeys?.find(item => item.legacySlotNumberGuid === button.dataset.vaultKeyOpen);
    if (key) showVaultKeyDetails(key);
  }));
}

function renderVaultDetail() {
  const vault = state.vaults.find(item => vaultId(item) === state.selectedVaultId);
  if (!vault) {
    state.page = 'vaults';
    return renderVaults();
  }
  const detail = state.vaultDetail;
  const slotType = String(vault.slotTypeGuid || '').toUpperCase();
  const canEdit = [slotTypeGuids.saving, slotTypeGuids.expenses].includes(slotType);
  const filters = ['All', 'Active', 'Inactive'].map(filter => `<button class="vault-key-filter ${state.vaultKeyFilter === filter ? 'selected' : ''}" type="button" data-vault-key-filter="${filter}" aria-pressed="${state.vaultKeyFilter === filter}">${filter}</button>`).join('');
  const content = `${pageHeading('', safe(vaultName(vault)), `${safe(vaultName(vault))} · Opened ${dateLabel(vault.createdDate)}`, `<div class="heading-actions">${canEdit ? `<button class="button secondary" data-action="edit-vault" type="button">Edit vault</button>` : ''}${slotType === slotTypeGuids.emergency ? `<button class="button secondary" data-emergency-setup="${safe(vaultId(vault))}" type="button">${vault.slotGoal == null ? 'Finish setup' : 'Edit goal'}</button>` : ''}</div>`)}<section class="vault-balance"><div><span>Available balance</span><strong>${formatMoney(vaultAmount(vault))}</strong></div><button class="button secondary" data-action="transfer" type="button">${icon('swap')} Transfer</button></section>${vault.slotGoal?.amount ? `<section class="vault-goal-summary"><span>Savings goal</span><strong>${formatMoney(vault.slotGoal.amount)}</strong></section>` : ''}<section class="bank-section"><div class="widget-heading"><h2>Recent activity</h2><button class="text-button" data-page="activity" type="button">View all ${icon('arrow')}</button></div>${state.vaultDetailLoading ? '<div class="empty-state">Loading activity…</div>' : transactionTable(detail?.transactions || [], 100, { vaultScoped: true })}</section><section class="bank-section"><div class="widget-heading"><div><h2>Vault access</h2><p class="heading-sub">Accounts connected to this vault</p></div><div class="vault-key-filters" role="group" aria-label="Filter vault access">${filters}</div></div><div class="vault-key-list${state.vaultDetailLoading ? ' is-loading' : ''}" id="vault-key-list">${vaultKeyListMarkup(detail, state.vaultKeyFilter, state.vaultDetailLoading)}</div></section>`;
  renderShell(content);
  bindPageActions();
  document.querySelectorAll('[data-vault-key-filter]').forEach(button => button.addEventListener('click', () => {
    const nextFilter = button.dataset.vaultKeyFilter;
    if (state.vaultKeyFilter === nextFilter) return;
    state.vaultKeyFilter = nextFilter;
    document.querySelectorAll('[data-vault-key-filter]').forEach(filterButton => {
      const selected = filterButton.dataset.vaultKeyFilter === nextFilter;
      filterButton.classList.toggle('selected', selected);
      filterButton.setAttribute('aria-pressed', String(selected));
    });
    const list = document.querySelector('#vault-key-list');
    if (!list || state.vaultDetailLoading) return;
    list.classList.remove('key-list-enter');
    list.innerHTML = vaultKeyListMarkup(state.vaultDetail, nextFilter, false);
    void list.offsetWidth;
    list.classList.add('key-list-enter');
    bindVaultKeyButtons(list, state.vaultDetail);
  }));
  bindVaultKeyButtons(document.querySelector('#vault-key-list'), detail);
}

async function openVaultDetail(vault, addHistory = true) {
  if (emergencySetupNeeded(vault)) {
    window.history.replaceState(null, '', pagePath('dashboard'));
    state.selectedVaultId = '';
    state.page = 'dashboard';
    state.vaultDetail = null;
    render();
    showEmergencySetup(vault);
    return;
  }
  state.selectedVaultId = vaultId(vault);
  state.page = 'vaultDetail';
  state.vaultDetail = null;
  state.vaultDetailLoading = true;
  state.vaultKeyFilter = 'All';
  if (addHistory) window.history.pushState(null, '', pagePath('vaultDetail'));
  render();
  try {
    const detail = await api(`/api/data/vaults/${encodeURIComponent(state.selectedVaultId)}/detail`);
    detail.transactions = visibleTransactions(listFrom(detail.transactions));
    state.vaultDetail = detail;
  } catch (error) {
    showToast(error.message, true);
  } finally {
    state.vaultDetailLoading = false;
    if (state.page === 'vaultDetail') render();
  }
}

function renderActivity() {
  const content = `${pageHeading('Your money, moving', 'Activity', 'A running view of transactions across your vaults.', `<button class="button secondary" id="activity-refresh" type="button">${icon('refresh')} Refresh</button>`)}<section class="table-panel"><div class="panel-heading"><h2>All transactions</h2><span class="heading-sub activity-result-count">${state.transactions.length} results</span></div>${activityResultsMarkup()}</section>`;
  renderShell(content);
  document.querySelector('#activity-refresh').addEventListener('click', loadTransactions);
}

function activityResultsMarkup(animate = false) {
  const results = state.loading ? '<div class="empty-state">Loading transactions…</div>' : transactionTable(state.transactions, 100);
  return `<div class="activity-results${animate ? ' activity-results-enter' : ''}">${results}</div>`;
}

function updateActivityResults(animate = false) {
  const currentResults = document.querySelector('.activity-results');
  if (!currentResults) return false;
  currentResults.outerHTML = activityResultsMarkup(animate);
  const results = document.querySelector('.activity-results');
  bindTransactionMetadata(results);
  const resultCount = document.querySelector('.activity-result-count');
  if (resultCount) resultCount.textContent = `${state.transactions.length} results`;
  return true;
}

function renderAccounts() {
  const content = `${pageHeading('Connected services', 'Linked accounts', 'Manage the bank accounts connected to your Elevault profile.', `<button class="button" data-action="link-account" type="button">${icon('link')} Link account</button>`)}<section class="table-panel"><div class="panel-heading"><h2>Connected accounts</h2><span class="heading-sub">${state.linkedAccounts.length} accounts</span></div>${linkedAccountRows(state.linkedAccounts)}</section><div class="notice" style="margin-top:16px">${icon('link')} Manual bank connections are confirmed with two small deposits. Do not enter the withdrawal amount.</div>`;
  renderShell(content);
  bindPageActions();
}

function renderNotifications() {
  const content = `${pageHeading('Stay in the loop', 'Notifications', 'Account updates and messages from Elevault.')}<section class="table-panel"><div class="panel-heading"><h2>Recent notifications</h2></div>${state.notifications.length ? state.notifications.map(item => `<div class="account-line"><span class="quick-icon">${icon('bell')}</span><span class="account-copy"><strong>${safe(valueFrom(item, ['title', 'subject', 'message']) || 'Account update')}</strong><span>${safe(dateLabel(valueFrom(item, ['createdAt', 'date', 'sentAt'])))}</span></span><span class="account-status">${valueFrom(item, ['read', 'isRead', 'readAt']) ? 'Read' : 'New'}</span></div>`).join('') : `<div class="empty-state"><strong>No notifications</strong>New account messages will appear here.</div>`}</section>`;
  renderShell(content);
}

const moreTabs = [
  ['settings', 'Settings'], ['cards', 'Cards'], ['documents', 'Documents'], ['interest', 'Interest'],
  ['sharing', 'Sharing'], ['messages', 'Messages']
];

function moreRows(value) {
  if (Array.isArray(value)) return value;
  return listFrom(unwrap(value));
}

function loadMoreData({ refresh = false } = {}) {
  if (state.moreLoadPromise) return state.moreLoadPromise;
  if (state.moreLoaded && !refresh) return Promise.resolve();
  state.moreLoading = true;
  state.moreLoaded = false;
  if (refresh) state.moreData = {};
  const requests = {
    profile: '/api/data/profile',
    cards: '/api/data/cards', statements: '/api/data/documents/statements', taxes: '/api/data/documents/taxes',
    lastInterest: '/api/data/interest/last', messages: '/api/data/messages', agreements: '/api/data/agreements', sharing: '/api/data/sharing',
    notificationPreferences: '/api/data/notification-preferences'
  };
  const promise = Promise.all(Object.entries(requests).map(async ([key, path]) => {
    try { state.moreData[key] = await api(path); }
    catch (error) { state.moreData[`${key}Error`] = error.message; }
  })).finally(() => {
    state.moreLoading = false;
    state.moreLoaded = true;
    state.moreLoadPromise = null;
    if (state.page === 'more') render();
  });
  state.moreLoadPromise = promise;
  return promise;
}

function loadMoreWorkspace({ refresh = true } = {}) {
  state.page = 'more';
  const loading = loadMoreData({ refresh });
  render();
  return loading;
}

function resourceRows(items, titleKeys, detailKeys) {
  if (!items.length) return '<div class="empty-state">Nothing to show yet.</div>';
  return items.map(item => `<div class="account-line"><span class="quick-icon">${icon('arrow')}</span><span class="account-copy"><strong>${safe(valueFrom(item, titleKeys) || 'Account record')}</strong><span>${safe(valueFrom(item, detailKeys) || '')}</span></span></div>`).join('');
}

function documentRows(items, kind) {
  if (!items.length) return '<div class="empty-state">No documents available.</div>';
  return items.map((item, index) => `<div class="account-line"><span class="quick-icon">${icon('arrow')}</span><span class="account-copy"><strong>${safe(valueFrom(item, ['statementName', 'year', 'taxYear', 'name', 'title', 'month']) || 'Document')}</strong><span>${safe(valueFrom(item, ['statementDate', 'date', 'period', 'documentType', 'status']) || '')}</span></span><button class="text-button" data-document-open="${kind}:${index}" type="button">Open</button></div>`).join('');
}

function sharedAccessRows(items, slotGuid) {
  if (!items.length) return '<div class="empty-state">No shared access.</div>';
  return items.map(item => {
    const customerId = valueFrom(item, ['customerGuid', 'customerId']);
    return `<div class="account-line"><span class="account-copy"><strong>${safe(valueFrom(item, ['alias', 'name', 'email', 'mobile']) || 'Shared contact')}</strong><span>${safe(valueFrom(item, ['email', 'mobile', 'status', 'permission', 'role']) || '')}</span></span><button class="text-button" data-shared-access-remove="${safe(slotGuid)}:${safe(customerId || '')}" type="button" ${customerId ? '' : 'disabled'}>Remove</button></div>`;
  }).join('');
}

function flattenMessages(value) {
  const source = unwrap(value) || {};
  const folders = source.s61MessageFolderList || source.folders || [];
  return Array.isArray(folders) ? folders.flatMap(folder => folder.s61MessageList || folder.messages || []) : moreRows(value);
}

function formatPhoneNumber(value) {
  const phone = String(value || '').trim();
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}

function formattedMobile(record) {
  const individual = record?.individual || {};
  return individual.mobilePhoneFormatted || record?.mobilePhoneFormatted ||
    formatPhoneNumber(individual.mobilePhone || record?.mobilePhone);
}

function renderMoreContent() {
  const data = state.moreData;
  if (state.moreLoading && !state.moreLoaded) return '<div class="empty-state">Loading account tools…</div>';
  if (state.moreTab === 'cards') {
    const cards = moreRows(data.cards?.cards);
    return `<section class="table-panel"><div class="panel-heading"><h2>Debit cards</h2><button class="button secondary" id="request-card" type="button">Request card</button></div>${cards.length ? cards.map(card => {
      const cardGuid = safe(valueFrom(card, ['cardGuid', 'id']));
      return `<div class="account-line"><span class="quick-icon">${icon('key')}</span><span class="account-copy"><strong>${safe(valueFrom(card, ['cardName', 'name', 'type']) || 'Elevault card')}</strong><span>${safe(valueFrom(card, ['maskedNumber', 'last4', 'status', 'cardStatus']) || 'Card details')}</span></span><span class="account-actions">${String(valueFrom(card, ['active', 'isActive', 'status']) || '').toLowerCase() === 'inactive' ? `<button class="text-button" data-card-activate="${cardGuid}" type="button">Activate</button>` : ''}<button class="text-button" data-card-pin="${cardGuid}" type="button">Set PIN</button><button class="text-button" data-card-delete="${cardGuid}" type="button">Delete</button></span></div>`;
    }).join('') : '<div class="empty-state"><strong>No cards</strong>Card availability is shown by Elevault.</div>'}<p class="form-error">${safe(data.cardsError || '')}</p><p class="heading-sub">${safe(valueFrom(unwrap(data.cards?.approval), ['message', 'status']) || '')}</p></section>`;
  }
  if (state.moreTab === 'documents') {
    const statements = moreRows(data.statements);
    const taxes = moreRows(data.taxes);
    return `<section class="table-panel"><div class="panel-heading"><h2>Statements</h2></div>${documentRows(statements, 'statement')}<p class="form-error">${safe(data.statementsError || '')}</p></section><section class="table-panel more-section"><div class="panel-heading"><h2>Tax documents</h2></div>${documentRows(taxes, 'tax')}<p class="form-error">${safe(data.taxesError || '')}</p></section>`;
  }
  if (state.moreTab === 'interest') {
    const last = unwrap(data.lastInterest);
    return `<section class="table-panel"><div class="panel-heading"><h2>Interest earned</h2></div><div class="vault-detail-summary"><div><span>Most recent</span><strong>${formatMoney(valueFrom(last, ['amount', 'amountDecimal', 'interestAmount']))}</strong></div><div><span>Date</span><strong>${dateLabel(valueFrom(last, ['date', 'transactionDateTime', 'createdDate']))}</strong></div></div><form id="interest-search" class="inline-form"><div class="field"><label for="interest-start">From</label><input id="interest-start" name="startDate" type="date" required></div><div class="field"><label for="interest-end">To</label><input id="interest-end" name="endDate" type="date" required></div><button class="button" type="submit">Search</button></form><div id="interest-results">${resourceRows(moreRows(data.interest), ['transactionType', 'shortSmartLabel', 'description'], ['transactionDateTime', 'date', 'transactionAmountFormatted'])}</div><p class="form-error">${safe(data.lastInterestError || data.interestError || '')}</p></section>`;
  }
  if (state.moreTab === 'sharing') {
    const relationships = moreRows(data.sharing?.relationships);
    const shared = moreRows(data.sharing?.sharedWithMe);
    return `<section class="table-panel"><div class="panel-heading"><h2>Shared with me</h2></div>${shared.length ? shared.map(item => `<div class="account-line"><span class="account-copy"><strong>${safe(valueFrom(item, ['slotName', 'description', 'name', 'ownerAlias']) || 'Shared vault')}</strong><span>${safe(valueFrom(item, ['ownerName', 'ownerEmail', 'status']) || '')}</span></span></div>`).join('') : '<div class="empty-state">No vaults have been shared with you.</div>'}</section><section class="table-panel more-section"><div class="panel-heading"><h2>People</h2><button class="button secondary" id="invite-relationship" type="button">Add person</button></div>${relationships.length ? relationships.map(person => `<div class="account-line"><span class="account-copy"><strong>${safe(valueFrom(person, ['alias', 'name', 'email', 'mobile']) || 'Shared contact')}</strong><span>${safe(valueFrom(person, ['email', 'mobile', 'status']) || '')}</span></span><button class="text-button" data-relationship-remove="${safe(valueFrom(person, ['relationshipGuid', 'id']))}" type="button">Remove</button></div>`).join('') : '<div class="empty-state">No shared contacts.</div>'}<p class="form-error">${safe(data.sharingError || '')}</p></section><section class="table-panel more-section"><div class="panel-heading"><h2>Vault access</h2></div>${activeVaults().map(vault => `<div class="account-line"><span class="account-copy"><strong>${safe(vaultName(vault))}</strong><span>Manage people with access</span></span><button class="text-button" data-vault-shares="${safe(vaultId(vault))}" type="button">View access</button></div>`).join('') || '<div class="empty-state">No vaults available.</div>'}</section>`;
  }
  if (state.moreTab === 'messages') {
    const messages = flattenMessages(data.messages);
    return `<section class="table-panel"><div class="panel-heading"><h2>Inbox</h2><div class="heading-actions"><button class="button secondary" id="messages-read-all" type="button">Mark all read</button><button class="icon-button" id="messages-delete-all" type="button" aria-label="Delete all messages" title="Delete all messages">${icon('close')}</button></div></div>${messages.length ? messages.map(message => `<div class="account-line"><span class="quick-icon">${icon('bell')}</span><span class="account-copy"><strong>${safe(valueFrom(message, ['title', 'subject', 'messageTitle']) || 'Elevault message')}</strong><span>${safe(dateLabel(valueFrom(message, ['enteredDateTime', 'createdDate', 'date'])))} · ${safe(valueFrom(message, ['body', 'message', 'description']) || '')}</span></span>${!valueFrom(message, ['read', 'isRead', 'readAt']) ? `<button class="text-button" data-message-read="${safe(valueFrom(message, ['messageGuid', 'id']))}" type="button">Mark read</button>` : '<span class="account-status">Read</span>'}</div>`).join('') : '<div class="empty-state"><strong>No messages</strong>Your Elevault inbox is clear.</div>'}</section>`;
  }
  const profile = unwrap(data.profile) || {};
  const agreements = moreRows(data.agreements);
  const preferences = unwrap(data.notificationPreferences) || {};
  const emailEnabled = valueFrom(preferences, ['emailNotifications']);
  const pushEnabled = valueFrom(preferences, ['pushNotifications']);
  const profileName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.alias || 'Profile';
  const profilePhone = formattedMobile(profile) || formattedMobile(unwrap(state.customer) || {});
  return `
    <section class="table-panel">
      <div class="panel-heading"><h2>Account</h2></div>
      <div class="profile-summary"><button class="profile-photo-control" id="profile-photo-trigger" type="button" aria-label="Update profile photo">${profile.imageUrl ? `<img src="${safe(profile.imageUrl)}" alt="">` : `<span class="profile-photo-fallback">${safe(initials(profileName))}</span>`}<span class="profile-photo-edit">${icon('edit')}</span></button><input id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="profile-identity"><strong>${safe(profileName)}</strong><span>Elevault account</span></div></div>
      <div class="profile-contact-row"><span>Email</span><strong>${safe(profile.email || 'Not provided')}</strong><button class="text-button" id="change-email" type="button">Edit</button></div>
      <div class="profile-contact-row"><span>Mobile</span><strong>${safe(profilePhone || 'Not provided')}</strong><button class="text-button" id="change-mobile" type="button">Edit</button></div>
      <div class="heading-actions settings-actions"><button class="button secondary" id="change-password" type="button">Change password</button></div>
      <p class="form-error">${safe(data.profileError || '')}</p>
    </section>
    <section class="table-panel more-section">
      <div class="panel-heading"><h2>Appearance</h2></div>
      <label class="toggle-row"><span><strong>Dark mode</strong><small>Use a darker color theme.</small></span><input type="checkbox" data-theme-toggle ${document.documentElement.dataset.theme === 'dark' ? 'checked' : ''}><span class="toggle-control"></span></label>
    </section>
    <section class="table-panel more-section">
      <div class="panel-heading"><h2>Notifications</h2></div>
      <label class="toggle-row"><span><strong>Email notifications</strong><small>Account updates by email</small></span><input type="checkbox" data-notification-channel="email" ${emailEnabled === true ? 'checked' : ''} ${emailEnabled === undefined ? 'disabled' : ''}><span class="toggle-control"></span></label>
      <label class="toggle-row"><span><strong>Push notifications</strong><small>Mobile push alerts</small></span><input type="checkbox" data-notification-channel="push" ${pushEnabled === true ? 'checked' : ''} ${pushEnabled === undefined ? 'disabled' : ''}><span class="toggle-control"></span></label>
      <p class="heading-sub">${emailEnabled === undefined ? 'Notification preferences are not included in this account response.' : ''}</p>
    </section>
    <section class="table-panel more-section">
      <div class="panel-heading"><h2>Agreements</h2></div>
      ${agreements.length ? agreements.map((agreement, index) => `<div class="account-line"><span class="account-copy"><strong>${safe(valueFrom(agreement, ['name', 'title', 'agreementType']) || 'Agreement')}</strong><span>${safe(valueFrom(agreement, ['status', 'acceptedDate', 'version']) || '')}</span></span>${!valueFrom(agreement, ['accepted', 'isAccepted', 'acceptedDate']) ? `<button class="text-button" data-agreement-accept="${index}" type="button">Accept</button>` : ''}</div>`).join('') : '<div class="empty-state">No agreements to review.</div>'}
      <p class="form-error">${safe(data.agreementsError || '')}</p>
    </section>`;
}

function renderMore() {
  const tabs = moreTabs.map(([id, label]) => `<button class="vault-key-filter ${state.moreTab === id ? 'selected' : ''}" type="button" data-more-tab="${id}" aria-pressed="${state.moreTab === id}">${label}</button>`).join('');
  const content = `${pageHeading('Account tools', 'More', 'Additional account services and preferences.')}<div class="more-tabs" role="tablist" aria-label="Account tools">${tabs}</div><div class="more-content">${renderMoreContent()}</div>`;
  renderShell(content);
  enhanceMoreContent();
  document.querySelectorAll('[data-more-tab]').forEach(button => button.addEventListener('click', () => showMoreTab(button.dataset.moreTab)));
  bindMoreActions();
}

function enhanceMoreContent() {
  document.querySelectorAll('[data-agreement-accept]').forEach(button => {
    button.textContent = 'Sign in mobile app';
    button.disabled = true;
    button.removeAttribute('data-agreement-accept');
  });
  document.querySelectorAll('[data-share-accept]').forEach(button => button.remove());
  const readButtons = [...document.querySelectorAll('[data-message-read]')];
  flattenMessages(state.moreData.messages).forEach(message => {
    if (message.read || message.isRead || message.messageTypeName !== 'Share Slot Request') return;
    const messageGuid = String(valueFrom(message, ['messageGuid', 'id']) || '');
    const row = readButtons.find(button => button.dataset.messageRead === messageGuid)?.closest('.account-line');
    if (!row || row.querySelector('.message-share-actions')) return;
    const actions = document.createElement('span');
    actions.className = 'message-share-actions';
    for (const [accept, label] of [[true, 'Accept'], [false, 'Reject']]) {
      const button = document.createElement('button');
      button.className = 'text-button';
      button.type = 'button';
      button.textContent = label;
      button.dataset.shareResponse = String(accept);
      button.dataset.messageGuid = messageGuid;
      actions.append(button);
    }
    row.append(actions);
  });
}

function showMoreTab(tab, { addHistory = true, animate = true } = {}) {
  if (!moreTabs.some(([id]) => id === tab)) return;
  state.moreTab = tab;
  if (addHistory) window.history.pushState(null, '', pagePath('more', tab));
  const panel = document.querySelector('.more-content');
  if (!panel) return renderMore();
  document.querySelectorAll('[data-more-tab]').forEach(button => {
    const selected = button.dataset.moreTab === tab;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  panel.innerHTML = renderMoreContent();
  panel.classList.remove('tab-content-enter');
  if (animate) {
    void panel.offsetWidth;
    panel.classList.add('tab-content-enter');
  }
  enhanceMoreContent();
  bindMoreActions();
}

function showVerifiedContactUpdate(channel) {
  const isEmail = channel === 'email';
  const label = isEmail ? 'email address' : 'mobile number';
  const valueField = isEmail
    ? '<div class="field"><label for="new-email">Email address</label><input id="new-email" name="value" type="email" required maxlength="254" autocomplete="email"></div>'
    : '<div class="field"><label for="new-mobile">Mobile number</label><input id="new-mobile" name="value" type="tel" autocomplete="tel" required maxlength="20"></div>';
  openModal(`Change ${isEmail ? 'email' : 'phone'}`, `Enter the new ${label}. Elevault will send a verification code before it is changed.`, valueField, 'Send code', async formData => {
    const value = String(formData.get('value') || '').trim();
    await api('/api/data/profile/contact-availability', { method: 'POST', body: { channel: isEmail ? 'email' : 'mobile', value } });
    await api(`/api/data/profile/contact-code/${isEmail ? 'email' : 'mobile'}`, { method: 'POST', body: { value } });
    return { value };
  }, async result => {
    const value = result.value;
    openModal('Verify contact', `Enter the code sent to your new ${label}.`, '<div class="field"><label for="contact-code">Verification code</label><input id="contact-code" name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="12"></div>', 'Verify and update', async formData => {
      const verification = await api(`/api/data/profile/contact-code/${isEmail ? 'email' : 'mobile'}`, { method: 'PUT', body: { value, code: String(formData.get('code') || '').trim() } });
      const verified = verification?.verified ?? verification?.valid;
      if (!verified) throw new Error(verification?.validationMessage || 'That verification code was not accepted.');
      const updateBody = isEmail ? { email: value } : { mobile: `+1${value.replace(/\D/g, '')}` };
      return api(`/api/data/profile/${isEmail ? 'email' : 'mobile'}`, { method: 'PUT', body: updateBody });
    }, async () => { await loadMoreWorkspace(); showToast(`${isEmail ? 'Email' : 'Phone'} update verified.`); });
  });
}

function bindMoreActions() {
  document.querySelectorAll('[data-document-open]').forEach(button => button.addEventListener('click', async () => {
    const [kind, indexText] = button.dataset.documentOpen.split(':');
    const documents = moreRows(kind === 'tax' ? state.moreData.taxes : kind === 'agreement' ? state.moreData.agreements : state.moreData.statements);
    let item = documents[Number(indexText)];
    try {
      if (kind === 'tax' && !valueFrom(item, ['url', 'downloadUrl', 'documentUrl', 'base64', 'contentBase64', 'documentBase64'])) {
        const year = valueFrom(item, ['year', 'taxYear']);
        const documentId = valueFrom(item, ['documentGuid', 'documentId', 'id']);
        if (year && documentId) item = await api(`/api/data/documents/taxes/${encodeURIComponent(year)}/${encodeURIComponent(documentId)}`);
      }
      const data = unwrap(item) || {};
      const fileUrl = valueFrom(data, ['url', 'downloadUrl', 'documentUrl', 'documentUri', 'uri']);
      if (typeof fileUrl === 'string' && (fileUrl.startsWith('/') || new URL(fileUrl, window.location.origin).protocol === 'https:')) {
        window.open(new URL(fileUrl, window.location.origin).href, '_blank', 'noopener,noreferrer');
        return;
      }
      const encoded = valueFrom(data, ['base64', 'contentBase64', 'documentBase64']);
      if (typeof encoded === 'string') {
        const raw = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
        const bytes = Uint8Array.from(atob(raw), character => character.charCodeAt(0));
        const blob = new Blob([bytes], { type: valueFrom(data, ['contentType', 'mimeType']) || 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = valueFrom(data, ['fileName', 'filename', 'name']) || `${kind}-document.pdf`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      throw new Error('Elevault did not return a downloadable document for this item.');
    } catch (error) { showToast(error.message, true); }
  }));
  document.querySelector('#request-card')?.addEventListener('click', () => {
    const eligibleVaults = activeVaults().filter(vault => String(vault.slotTypeGuid || '').toLowerCase() === slotTypeGuids.main.toLowerCase());
    if (!eligibleVaults.length) return showToast('No spending vault is available for a card request.', true);
    const vaultOptions = eligibleVaults.map(vault => `<option value="${safe(vaultId(vault))}">${safe(vaultName(vault))}</option>`).join('');
    openModal('Request a card', 'Choose the spending vault and card format.', `<div class="field"><label for="card-vault">Spending vault</label><select id="card-vault" required>${vaultOptions}</select></div><div class="field"><label for="card-physical">Card format</label><select id="card-physical"><option value="false">Virtual card</option><option value="true">Physical card</option></select></div>`, 'Request card', async () => {
      return api('/api/data/cards', { method: 'POST', body: { slotGuid: document.querySelector('#card-vault').value, physicalCard: document.querySelector('#card-physical').value === 'true' } });
    }, async () => { await loadMoreWorkspace(); showToast('Card request submitted.'); });
  });
  document.querySelectorAll('[data-card-activate]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('Activate this card?')) return;
    try {
      await api(`/api/data/cards/${encodeURIComponent(button.dataset.cardActivate)}/activate`, { method: 'PUT', body: {} });
      await loadMoreWorkspace();
      showToast('Card activation submitted.');
    } catch (error) { showToast(error.message, true); }
  }));
  document.querySelectorAll('[data-card-pin]').forEach(button => button.addEventListener('click', () => {
    openModal('Set card PIN', 'Enter a new 4 digit PIN.', '<div class="field"><label for="card-pin-value">New PIN</label><input id="card-pin-value" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="new-password" required></div>', 'Save PIN', async () => api(`/api/data/cards/${encodeURIComponent(button.dataset.cardPin)}/pin`, { method: 'PUT', body: document.querySelector('#card-pin-value').value }));
  }));
  document.querySelectorAll('[data-card-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('Delete this card? This action cannot be undone.')) return;
    button.disabled = true;
    try {
      await api(`/api/data/cards/${encodeURIComponent(button.dataset.cardDelete)}/status`, { method: 'DELETE' });
      await loadMoreWorkspace();
      showToast('Card deleted.');
    } catch (error) {
      showToast(error.message, true);
      button.disabled = false;
    }
  }));
  document.querySelector('#interest-search')?.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const results = document.querySelector('#interest-results');
    results.textContent = 'Loading…';
    try {
      state.moreData.interest = await api(`/api/data/interest?${new URLSearchParams({ startDate: values.get('startDate'), endDate: values.get('endDate'), pageNumber: '1' })}`);
      renderMore();
    } catch (error) { results.textContent = error.message; }
  });
  document.querySelector('#messages-read-all')?.addEventListener('click', async () => {
    try { await api('/api/data/messages/read-all', { method: 'PUT', body: {} }); await loadMoreWorkspace(); }
    catch (error) { showToast(error.message, true); }
  });
  document.querySelector('#messages-delete-all')?.addEventListener('click', async () => {
    if (!window.confirm('Delete every message in your Elevault inbox? This cannot be undone.')) return;
    try { await api('/api/data/messages', { method: 'DELETE' }); await loadMoreWorkspace(); }
    catch (error) { showToast(error.message, true); }
  });
  document.querySelectorAll('[data-message-read]').forEach(button => button.addEventListener('click', async () => {
    const message = flattenMessages(state.moreData.messages).find(item => String(valueFrom(item, ['messageGuid', 'id'])) === button.dataset.messageRead);
    try {
      const entered = message?.enteredDateTime ? new Date(message.enteredDateTime) : null;
      const body = { ...(message || { messageGuid: button.dataset.messageRead }), read: true };
      if (entered && !Number.isNaN(entered.getTime())) body.enteredDateTime = entered.toISOString();
      await api('/api/data/messages/read', { method: 'PUT', body });
      await loadMoreWorkspace();
    }
    catch (error) { showToast(error.message, true); }
  }));
  document.querySelector('#invite-relationship')?.addEventListener('click', () => {
    openModal('Find a person', 'Search by the email address or mobile number associated with their Elevault account.', '<div class="field"><label for="share-search">Email or mobile</label><input id="share-search" name="value" autocomplete="off" required maxlength="254"></div>', 'Search', async formData => {
      const value = String(formData.get('value') || '').trim();
      const email = value.includes('@');
      const query = new URLSearchParams(email ? { email: value } : { mobile: value });
      const matches = moreRows(await api(`/api/data/sharing/relationships/search?${query}`)).filter(person => person.alias && person.portfolioCreated && valueFrom(person, ['customerGuid']));
      return { matches };
    }, async result => {
      if (!result.matches.length) return showToast('No eligible Elevault contact was found.', true);
      const options = result.matches.map((person, index) => `<option value="${index}">${safe(person.alias)}${valueFrom(person, ['email', 'mobile']) ? ` · ${safe(valueFrom(person, ['email', 'mobile']))}` : ''}</option>`).join('');
      openModal('Add contact', 'Confirm the Elevault contact to add.', `<div class="field"><label for="share-match">Contact</label><select id="share-match" name="match" required>${options}</select></div>`, 'Add person', async formData => {
        const person = result.matches[Number(formData.get('match'))];
        return api('/api/data/sharing/relationships', { method: 'POST', body: {
          toIndividualGuid: valueFrom(person, ['customerGuid']),
          toIndividualName: person.alias,
          toIndividualImageUrl: person.imageUrl || ''
        } });
      }, async () => { await loadMoreWorkspace(); showToast('Contact added.'); });
    });
  });
  document.querySelectorAll('[data-relationship-remove]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('Remove this shared contact?')) return;
    try { await api(`/api/data/sharing/relationships/${encodeURIComponent(button.dataset.relationshipRemove)}`, { method: 'DELETE' }); await loadMoreWorkspace(); }
    catch (error) { showToast(error.message, true); }
  }));
  document.querySelectorAll('[data-share-response]').forEach(button => button.addEventListener('click', async () => {
    const message = flattenMessages(state.moreData.messages).find(item => String(valueFrom(item, ['messageGuid', 'id'])) === button.dataset.messageGuid);
    if (!message) return showToast('This vault-share request is no longer available.', true);
    let payload;
    try { payload = JSON.parse(message.s61Payload || '{}'); } catch { return showToast('The share request payload is invalid.', true); }
    const accept = button.dataset.shareResponse === 'true';
    if (!window.confirm(`${accept ? 'Accept' : 'Reject'} this vault-share request?`)) return;
    try {
      await api(`/api/data/sharing/requests/${accept}`, { method: 'PUT', body: payload });
      await loadMoreWorkspace();
    } catch (error) { showToast(error.message, true); }
  }));
  const openVaultShares = async slotGuid => {
    try {
      const shares = await api(`/api/data/vaults/${encodeURIComponent(slotGuid)}/shares`);
      openModal('Vault access', 'People who can access this vault.', sharedAccessRows(moreRows(shares), slotGuid), 'Close', async () => ({}));
      modal.querySelectorAll('[data-shared-access-remove]').forEach(removeButton => removeButton.addEventListener('click', async () => {
        const separator = removeButton.dataset.sharedAccessRemove.lastIndexOf(':');
        const vaultId = removeButton.dataset.sharedAccessRemove.slice(0, separator);
        const customerId = removeButton.dataset.sharedAccessRemove.slice(separator + 1);
        if (!customerId || !window.confirm('Remove this person’s access to the vault?')) return;
        try {
          await api(`/api/data/vaults/${encodeURIComponent(vaultId)}/shares/${encodeURIComponent(customerId)}`, { method: 'DELETE' });
          modal.close();
          await openVaultShares(slotGuid);
        } catch (error) { showToast(error.message, true); }
      }));
    } catch (error) { showToast(error.message, true); }
  };
  document.querySelectorAll('[data-vault-shares]').forEach(button => button.addEventListener('click', () => openVaultShares(button.dataset.vaultShares)));
  document.querySelector('#profile-photo-trigger')?.addEventListener('click', () => document.querySelector('#profile-photo')?.click());
  document.querySelector('#profile-photo')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await fetch('/api/data/profile/image', { method: 'POST', credentials: 'same-origin', body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Image upload failed.');
      await loadMoreWorkspace();
      showToast('Profile photo updated.');
    } catch (error) { showToast(error.message, true); }
  });
  document.querySelector('#change-email')?.addEventListener('click', () => showVerifiedContactUpdate('email'));
  document.querySelector('#change-mobile')?.addEventListener('click', () => showVerifiedContactUpdate('mobile'));
  document.querySelector('#change-password')?.addEventListener('click', showPasswordReset);
  document.querySelector('[data-theme-toggle]')?.addEventListener('change', event => applyTheme(event.currentTarget.checked ? 'dark' : 'light'));
  document.querySelectorAll('[data-notification-channel]').forEach(input => input.addEventListener('change', async () => {
    const previous = !input.checked;
    input.disabled = true;
    try {
      await api(`/api/data/notification-preferences/${input.dataset.notificationChannel}`, { method: 'PUT', body: { enabled: input.checked } });
      showToast('Notification preference updated.');
    } catch (error) { input.checked = previous; showToast(error.message, true); }
    finally { input.disabled = false; }
  }));
}

function showPasswordReset() {
  const email = String(unwrap(state.moreData.profile)?.email || '');
  if (!email) return showToast('No email address is available for password recovery.', true);
  openModal('Verify your email', `We’ll send a password reset code to ${safe(email)}.`, '', 'Send code', async () => api('/api/data/password/reset-code', { method: 'POST', body: { emailAddress: email } }), async () => {
    openModal('Enter reset code', 'Enter the code sent to your email.', '<div class="field"><label for="password-reset-code">Verification code</label><input id="password-reset-code" autocomplete="one-time-code" required></div>', 'Verify code', async () => {
      const code = document.querySelector('#password-reset-code').value.trim();
      await api('/api/data/password/verify-code', { method: 'PUT', body: { emailAddress: email, code } });
      return { code };
    }, async result => {
      openModal('Create new password', 'Choose a new password with at least 8 characters.', '<div class="field"><label for="new-password">New password</label><input id="new-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></div><div class="field"><label for="confirm-password">Confirm password</label><input id="confirm-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></div>', 'Update password', async () => {
        const password = document.querySelector('#new-password').value;
        if (password !== document.querySelector('#confirm-password').value) throw new Error('Passwords do not match.');
        return api('/api/data/password', { method: 'PUT', body: { emailAddress: email, code: result.code, password } });
      }, async () => showToast('Password changed. Sign in again with the new password.'));
    });
  });
}

function render() {
  if (!state.authenticated) return renderLogin();
  if (state.page === 'vaultDetail') return renderVaultDetail();
  if (state.page === 'vaults') return renderVaults();
  if (state.page === 'activity') return renderActivity();
  if (state.page === 'accounts') return renderAccounts();
  if (state.page === 'notifications') return renderNotifications();
  if (state.page === 'more') return renderMore();
  return renderDashboard();
}

function bindPageActions() {
  document.querySelectorAll('[data-page]:not(.nav-item)').forEach(button => button.addEventListener('click', () => {
    navigatePage(button.dataset.page);
  }));
  document.querySelectorAll('[data-action="new-vault"]').forEach(button => button.addEventListener('click', () => showCreateVault()));
  document.querySelectorAll('[data-action="transfer"]').forEach(button => button.addEventListener('click', () => showTransfer()));
  document.querySelectorAll('[data-action="link-account"]').forEach(button => button.addEventListener('click', showLinkAccountOptions));
  document.querySelectorAll('[data-action="edit-vault"]').forEach(button => button.addEventListener('click', () => {
    const vault = state.vaults.find(item => vaultId(item) === state.selectedVaultId);
    if (vault) showEditVault(vault);
  }));
  document.querySelectorAll('[data-emergency-setup]').forEach(button => button.addEventListener('click', () => {
    const selected = emergencyVault();
    if (!selected) return;
    showEmergencySetup(selected);
  }));
  document.querySelectorAll('[data-verify-account]').forEach(button => button.addEventListener('click', () => showDepositVerification(button.dataset.verifyAccount)));
}

async function loadDashboard() {
  state.loading = true;
  try {
    const data = await api('/api/data/dashboard');
    state.customer = data.customer?.data;
    state.vaults = listFrom(data.vaults?.data).filter(vault => vault && vault.deleted !== true);
    state.linkedAccounts = listFrom(data.linkedAccounts?.data);
    state.notifications = listFrom(data.notifications?.data);
    state.interestRate = data.interestRate?.data;
    const [transactions, transactionTypes, slotTypes] = await Promise.allSettled([
      api('/api/data/transactions'),
      api('/api/data/transaction-types'),
      api('/api/data/slot-types')
    ]);
    state.transactions = transactions.status === 'fulfilled' ? visibleTransactions(listFrom(transactions.value)) : [];
    state.transactionTypes = transactionTypes.status === 'fulfilled' ? listFrom(transactionTypes.value) : [];
    state.slotTypes = slotTypes.status === 'fulfilled' ? listFrom(slotTypes.value) : [];
  } finally {
    state.loading = false;
  }
}

function vaultFromLocation() {
  const match = window.location.pathname.match(/^\/vault\/(.+)\/?$/);
  if (!match) return null;
  let selectedId;
  try { selectedId = decodeURIComponent(match[1]); } catch { return null; }
  return state.vaults.find(vault => vaultId(vault) === selectedId) || null;
}

function routeFromLocation() {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';
  const pages = ['dashboard', 'vaults', 'activity', 'accounts', 'notifications', 'more'];
  if (pathname.startsWith('/vault/')) return { page: 'vaultDetail', vault: vaultFromLocation() };
  const moreMatch = pathname.match(/^\/my(?:\/([^/]+))?$/);
  if (moreMatch) {
    let tab = 'settings';
    try { if (moreMatch[1]) tab = decodeURIComponent(moreMatch[1]); } catch {}
    return { page: 'more', tab: moreTabs.some(([id]) => id === tab) ? tab : 'settings' };
  }
  const legacyHash = window.location.hash;
  if (pathname === '/' && legacyHash.startsWith('#vault/')) {
    let id = '';
    try { id = decodeURIComponent(legacyHash.slice('#vault/'.length)); } catch {}
    return { page: 'vaultDetail', vault: state.vaults.find(vault => vaultId(vault) === id) || null };
  }
  if (pathname === '/' && legacyHash.startsWith('#more/')) {
    let tab = '';
    try { tab = decodeURIComponent(legacyHash.slice('#more/'.length)); } catch {}
    return { page: 'more', tab: moreTabs.some(([id]) => id === tab) ? tab : 'settings' };
  }
  if (pathname === '/' && pages.includes(legacyHash.slice(1))) {
    return { page: legacyHash.slice(1), tab: 'settings' };
  }
  const page = pathname.slice(1);
  return { page: pages.includes(page) ? page : 'dashboard', tab: 'settings' };
}

async function applyLocationRoute() {
  if (!state.authenticated) return render();
  const route = routeFromLocation();
  if (route.page === 'vaultDetail' && !route.vault) route.page = 'vaults';
  const canonicalPath = route.page === 'vaultDetail' && route.vault
    ? pagePath('vaultDetail', state.moreTab, vaultId(route.vault))
    : route.page === 'more' ? pagePath('more', route.tab) : pagePath(route.page);
  if (window.location.pathname !== canonicalPath || window.location.hash) window.history.replaceState(null, '', canonicalPath);
  if (route.page === 'vaultDetail' && route.vault) return openVaultDetail(route.vault, false);
  const wasMore = state.page === 'more';
  state.page = route.page;
  state.selectedVaultId = '';
  state.vaultDetail = null;
  if (route.page === 'more') {
    if (wasMore && document.querySelector('.more-content')) showMoreTab(route.tab, { addHistory: false, animate: false });
    else {
      state.moreTab = route.tab;
      await loadMoreWorkspace({ refresh: false });
    }
    return;
  }
  if (route.page === 'activity') return loadTransactions();
  render();
}

window.addEventListener('popstate', applyLocationRoute);

function showEditVault(vault) {
  const goal = vault.slotGoal || {};
  const dueDate = goal.targetDate && !Number.isNaN(new Date(goal.targetDate).getTime())
    ? new Date(goal.targetDate).toISOString().slice(0, 10)
    : '';
  openModal('Edit vault', 'Update the account name or savings target.', `
    <div class="field"><label for="edit-vault-name">Account name</label><input id="edit-vault-name" name="name" maxlength="80" required value="${safe(vaultName(vault))}"></div>
    <div class="field"><label for="edit-vault-goal">Goal amount</label><div class="money-input"><span>$</span><input id="edit-vault-goal" name="goal" type="number" min="0.01" max="10000000" step="0.01" required value="${safe(goal.amount ?? '')}"></div></div>
    <div class="field"><label for="edit-vault-date">Target date</label><input id="edit-vault-date" name="dueDate" type="date" required value="${safe(dueDate)}"></div>`, 'Save changes', async formData => {
      return api(`/api/data/vaults/${encodeURIComponent(vaultId(vault))}`, {
        method: 'PUT',
        body: {
          name: String(formData.get('name') || '').trim(),
          goal: Number(formData.get('goal')),
          dueDate: formData.get('dueDate')
        }
      });
    }, async () => {
      await loadDashboard();
      await openVaultDetail(state.vaults.find(item => vaultId(item) === state.selectedVaultId) || vault, false);
      showToast('Vault details updated.');
    });
}

async function loadTransactions() {
  state.loading = true;
  if (state.page !== 'activity' || !updateActivityResults()) render();
  try {
    state.transactions = visibleTransactions(listFrom(await api('/api/data/transactions')));
  } catch (error) {
    showToast(error.message, true);
  } finally {
    state.loading = false;
    if (state.page === 'activity') {
      if (!updateActivityResults(true)) render();
    }
  }
}

async function refreshData() {
  try {
    await loadDashboard();
    render();
    showToast('Account data refreshed.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  state.authenticated = false;
  state.page = 'dashboard';
  render();
}

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

function openModal(title, copy, fields, submitLabel, onSubmit, onComplete) {
  modal.innerHTML = `<form class="modal-content" id="modal-form"><div class="modal-head"><h2>${title}</h2><button class="icon-button" id="modal-close" type="button" aria-label="Close">${icon('close')}</button></div><p class="modal-copy">${copy}</p>${fields}<p class="form-error" id="modal-error" role="alert"></p><div class="modal-actions"><button class="button secondary" id="modal-cancel" type="button">Cancel</button><button class="button" type="submit">${submitLabel}</button></div></form>`;
  setMoneyPlaceholders(modal);
  modal.showModal();
  modal.querySelector('#modal-close').addEventListener('click', () => modal.close());
  modal.querySelector('#modal-cancel').addEventListener('click', () => modal.close());
  modal.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = modal.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const result = await onSubmit(new FormData(event.currentTarget));
      modal.close();
      await loadDashboard();
      render();
      if (onComplete) await onComplete(result);
      else showToast('Your request was sent to Elevault.');
    } catch (error) {
      modal.querySelector('#modal-error').textContent = error.message;
      submit.disabled = false;
    }
  });
}

function showLinkAccountOptions() {
  modal.innerHTML = `<div class="modal-content"><div class="modal-head"><h2>Link a bank account</h2><button class="icon-button" id="modal-close" type="button" aria-label="Close">${icon('close')}</button></div><p class="modal-copy">Choose how you want to connect your account.</p><button class="setup-choice" data-link-method="plaid" type="button"><span class="quick-icon">${icon('link')}</span><span><strong>Connect with Plaid</strong><small>Recommended. Securely connect, usually in minutes.</small></span><span class="recommended-label">Recommended</span></button><button class="setup-choice" data-link-method="manual" type="button"><span class="quick-icon">${icon('plus')}</span><span><strong>Enter details manually</strong><small>Confirm account ownership with two small deposits.</small></span>${icon('arrow')}</button></div>`;
  modal.showModal();
  modal.querySelector('#modal-close').addEventListener('click', () => modal.close());
  modal.querySelector('[data-link-method="plaid"]').addEventListener('click', () => {
    modal.close();
    connectAccount();
  });
  modal.querySelector('[data-link-method="manual"]').addEventListener('click', () => {
    modal.close();
    showManualAccountForm();
  });
}

function showManualAccountForm() {
  openModal('Link account manually', 'Enter the details for the bank account you want to connect. We’ll verify it with two small deposits.', `
    <div class="field"><label for="manual-account-name">Account nickname</label><input id="manual-account-name" name="bankAccountName" maxlength="80" required autocomplete="off" placeholder="For example, Everyday checking"></div>
    <div class="field"><label for="manual-account-type">Account type</label><select id="manual-account-type" name="bankAccountType" required><option value="Checking">Checking</option><option value="Savings">Savings</option></select></div>
    <div class="field"><label for="manual-routing">Routing number</label><input id="manual-routing" name="bankRoutingTransitNumber" inputmode="numeric" autocomplete="off" pattern="[0-9]{9}" minlength="9" maxlength="9" required></div>
    <div class="field"><label for="manual-account-number">Account number</label><input id="manual-account-number" name="bankAccountNumber" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4,17}" minlength="4" maxlength="17" required></div>
    <div class="field"><label for="manual-account-confirm">Confirm account number</label><input id="manual-account-confirm" name="accountNumberConfirm" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4,17}" minlength="4" maxlength="17" required></div>`, 'Continue', async formData => {
      const accountNumber = formData.get('bankAccountNumber');
      if (accountNumber !== formData.get('accountNumberConfirm')) throw new Error('The account numbers do not match.');
      return api('/api/data/linked-accounts/manual', {
        method: 'POST',
        body: {
          bankAccountName: formData.get('bankAccountName'),
          bankAccountType: formData.get('bankAccountType'),
          bankRoutingTransitNumber: formData.get('bankRoutingTransitNumber'),
          bankAccountNumber: accountNumber
        }
      });
    }, async createdAccount => {
      const pending = state.linkedAccounts.find(account => account.id === createdAccount.id && String(account.status).toLowerCase() === 'pending') ||
        state.linkedAccounts.find(account => String(account.status).toLowerCase() === 'pending');
      if (pending) showDepositVerification(pending.id);
      else showToast('Account submitted. Check linked accounts for its verification status.');
    });
}

function showDepositVerification(accountId) {
  const account = state.linkedAccounts.find(item => item.id === accountId);
  if (!account) return showToast('Pending linked account not found.', true);
  const name = account.accountName || 'Bank account';
  openModal('Confirm deposits', `We sent two small deposits to ${safe(name)}. Enter those two amounts, not the withdrawal amount. You have up to three attempts.`, `
    <div class="field"><label for="credit-amount-1">First deposit</label><div class="money-input"><span>$</span><input id="credit-amount-1" name="creditAmount1" type="number" min="0.01" max="0.99" step="0.01" inputmode="decimal" required></div></div>
    <div class="field"><label for="credit-amount-2">Second deposit</label><div class="money-input"><span>$</span><input id="credit-amount-2" name="creditAmount2" type="number" min="0.01" max="0.99" step="0.01" inputmode="decimal" required></div></div>
    <p class="form-error" id="deposit-error" role="alert"></p>
    <button class="text-button unlink-button" id="unlink-pending-account" type="button">Unlink this account</button>`, 'Verify deposits', async formData => {
      const result = await api(`/api/data/linked-accounts/${encodeURIComponent(accountId)}/verify`, {
        method: 'PUT',
        body: { creditAmount1: Number(formData.get('creditAmount1')), creditAmount2: Number(formData.get('creditAmount2')) }
      });
      if (!result.valid) throw new Error(result.message || 'Those amounts did not match. Check the deposits and try again.');
      return result;
    }, async () => showToast('Bank account verified.'));
  modal.querySelector('#unlink-pending-account')?.addEventListener('click', async () => {
    if (!window.confirm(`Unlink ${name}?`)) return;
    const unlink = modal.querySelector('#unlink-pending-account');
    unlink.disabled = true;
    try {
      await api(`/api/data/linked-accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
      modal.close();
      await refreshData();
    } catch (error) {
      modal.querySelector('#deposit-error').textContent = error.message;
      unlink.disabled = false;
    }
  });
}

function showVaultKeyDetails(key) {
  const active = Boolean(key.active);
  const accountNumber = String(key.legacyNumber || '');
  modal.innerHTML = `<div class="modal-content"><div class="modal-head"><h2>${safe(key.name || 'Vault key')}</h2><button class="icon-button" id="modal-close" type="button" aria-label="Close">${icon('close')}</button></div><p class="modal-copy">Account details for this vault key.</p><dl class="vault-key-details"><div class="vault-key-detail"><dt>Routing number</dt><dd><span class="vault-key-value">082908751</span><button class="icon-button vault-key-copy" type="button" data-vault-key-copy="082908751" data-vault-key-copy-label="routing number" aria-label="Copy routing number" title="Copy routing number">${icon('copy')}</button></dd></div><div class="vault-key-detail"><dt>Account number</dt><dd><span class="vault-key-value">${safe(accountNumber || 'Unavailable')}</span><button class="icon-button vault-key-copy" type="button" data-vault-key-copy="${safe(accountNumber)}" data-vault-key-copy-label="account number" aria-label="Copy account number" title="Copy account number" ${accountNumber ? '' : 'disabled'}>${icon('copy')}</button></dd></div><div><dt>Vault</dt><dd>${safe(key.slotName || 'Vault')}</dd></div><div><dt>Status</dt><dd>${active ? 'Active' : 'Inactive'}</dd></div></dl><p class="form-error" id="vault-key-error" role="alert"></p><div class="modal-actions"><button class="button secondary" id="modal-cancel" type="button">Close</button><button class="button secondary" id="vault-key-toggle" type="button">${active ? 'Deactivate key' : 'Reactivate key'}</button></div></div>`;
  modal.showModal();
  modal.querySelector('#modal-close').addEventListener('click', () => modal.close());
  modal.querySelector('#modal-cancel').addEventListener('click', () => modal.close());
  modal.querySelectorAll('[data-vault-key-copy]').forEach(button => button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.vaultKeyCopy);
      clearTimeout(button.copyFeedbackTimer);
      button.innerHTML = icon('check');
      button.setAttribute('aria-label', `Copied ${button.dataset.vaultKeyCopyLabel}`);
      button.setAttribute('title', `Copied ${button.dataset.vaultKeyCopyLabel}`);
      button.copyFeedbackTimer = setTimeout(() => {
        button.innerHTML = icon('copy');
        button.setAttribute('aria-label', `Copy ${button.dataset.vaultKeyCopyLabel}`);
        button.setAttribute('title', `Copy ${button.dataset.vaultKeyCopyLabel}`);
      }, 2000);
    } catch {}
  }));
  modal.querySelector('#vault-key-toggle').addEventListener('click', () => setVaultKeyActive(key, !active));
}

async function setVaultKeyActive(key, active) {
  if (key.active && !window.confirm(`Deactivate “${key.name || 'Vault key'}”? It will no longer be available to businesses.`)) return;
  const button = modal.querySelector('#vault-key-toggle');
  if (button) button.disabled = true;
  try {
    await api(`/api/data/vault-keys/${encodeURIComponent(key.legacySlotNumberGuid)}/active`, { method: 'PUT', body: { active } });
    modal.close();
    const vault = state.vaults.find(item => vaultId(item) === state.selectedVaultId);
    if (vault) await openVaultDetail(vault, false);
    showToast(active ? 'Vault key reactivated.' : 'Vault key deactivated.');
  } catch (error) {
    const message = modal.querySelector('#vault-key-error');
    if (message) message.textContent = error.message;
    if (button) button.disabled = false;
    else showToast(error.message, true);
  }
}

function ordinal(value) {
  const number = Number(value);
  const remainder = number % 100;
  const suffix = remainder >= 11 && remainder <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[number % 10] || 'th';
  return `${number}${suffix}`;
}

function frequencyItems(frequency) {
  const count = frequency === 'Day' ? 31 : frequency === 'Week' ? 10 : 12;
  return Array.from({ length: count }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('');
}

function onItems(frequency) {
  if (frequency === 'Week') return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(day => `<option value="${day}">${day}</option>`).join('');
  if (frequency === 'Month') return Array.from({ length: 31 }, (_, index) => `<option value="${index + 1}">${ordinal(index + 1)}</option>`).join('');
  return '<option value="">Not used for daily saves</option>';
}

function showCreateVault(vaultType = '') {
  if (!vaultType) {
    modal.innerHTML = `<div class="modal-content"><div class="modal-head"><h2>Create a vault</h2><button class="icon-button" id="modal-close" type="button" aria-label="Close">${icon('close')}</button></div><p class="modal-copy">Choose the kind of vault you want to create.</p><button class="vault-type-choice" data-vault-type="Savings" type="button"><span class="vault-icon">${icon('vault')}</span><span><strong>Savings Vault</strong><small>Save toward a goal over time.</small></span>${icon('arrow')}</button><button class="vault-type-choice" data-vault-type="Expenses" type="button"><span class="vault-icon">${icon('swap')}</span><span><strong>Expenses Vault</strong><small>Set aside money for upcoming expenses.</small></span>${icon('arrow')}</button></div>`;
    modal.showModal();
    modal.querySelector('#modal-close').addEventListener('click', () => modal.close());
    modal.querySelectorAll('[data-vault-type]').forEach(button => button.addEventListener('click', () => showCreateVault(button.dataset.vaultType)));
    return;
  }

  const isSavings = vaultType === 'Savings';
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  modal.innerHTML = `<form class="modal-content" id="vault-form"><div class="modal-head"><h2>Create ${isSavings ? 'Savings' : 'Expenses'} Vault</h2><button class="icon-button" id="modal-close" type="button" aria-label="Close">${icon('close')}</button></div><p class="modal-copy">Choose a goal and when you want to reach it.</p><div class="field"><label for="vault-name">Vault name</label><input id="vault-name" name="name" maxlength="80" required placeholder="${isSavings ? 'For example, Rainy day' : 'For example, Annual bills'}"></div><div class="schedule-grid"><div class="field"><label for="vault-goal">Goal amount</label><div class="money-input"><span>$</span><input id="vault-goal" name="goal" type="number" min="0.01" max="10000000" step="0.01" inputmode="decimal" required></div></div><div class="field"><label for="vault-due-date">Due date</label><input id="vault-due-date" name="dueDate" type="date" min="${today}" value="${today}" required></div></div><label class="toggle-row" for="scheduled-save"><span><strong>Scheduled save</strong><small>Automatically save toward this goal.</small></span><input id="scheduled-save" name="scheduledSave" type="checkbox"><span class="toggle-control" aria-hidden="true"></span></label><div class="schedule-fields" id="schedule-fields" hidden><div class="schedule-grid"><div class="field"><label for="schedule-every">Every</label><select id="schedule-every" name="every">${frequencyItems('Day')}</select></div><div class="field"><label for="schedule-frequency">Frequency</label><select id="schedule-frequency" name="frequency"><option value="Day">Day</option><option value="Week">Week</option><option value="Month">Month</option></select></div><div class="field"><label for="schedule-on">On</label><select id="schedule-on" name="on" disabled>${onItems('Day')}</select></div><div class="field"><label for="periodic-amount">Periodic amount</label><div class="money-input"><span>$</span><input id="periodic-amount" name="periodicAmount" type="number" min="0.01" max="10000000" step="0.01" inputmode="decimal" disabled></div></div></div></div><p class="form-error" id="vault-error" role="alert"></p><div class="modal-actions"><button class="button secondary" id="vault-back" type="button">Back</button><button class="button" type="submit">Create vault</button></div></form>`;
  modal.showModal();
  modal.querySelector('#modal-close').addEventListener('click', () => showCreateVault());
  modal.querySelector('#vault-back').addEventListener('click', () => showCreateVault());
  setMoneyPlaceholders(modal);

  const scheduledToggle = modal.querySelector('#scheduled-save');
  const scheduleFields = modal.querySelector('#schedule-fields');
  const frequencySelect = modal.querySelector('#schedule-frequency');
  const everySelect = modal.querySelector('#schedule-every');
  const onSelect = modal.querySelector('#schedule-on');
  const periodicAmount = modal.querySelector('#periodic-amount');
  const updateFrequencyFields = () => {
    const frequency = frequencySelect.value;
    const previousEvery = Number(everySelect.value) || 1;
    const previousOn = onSelect.value;
    everySelect.innerHTML = frequencyItems(frequency);
    everySelect.value = String(Math.min(previousEvery, frequency === 'Day' ? 31 : frequency === 'Week' ? 10 : 12));
    onSelect.innerHTML = onItems(frequency);
    onSelect.disabled = frequency === 'Day' || !scheduledToggle.checked;
    if (frequency !== 'Day' && [...onSelect.options].some(option => option.value === previousOn)) onSelect.value = previousOn;
    onSelect.required = frequency !== 'Day' && scheduledToggle.checked;
  };
  scheduledToggle.addEventListener('change', () => {
    scheduleFields.hidden = !scheduledToggle.checked;
    periodicAmount.disabled = !scheduledToggle.checked;
    periodicAmount.required = scheduledToggle.checked;
    updateFrequencyFields();
  });
  frequencySelect.addEventListener('change', updateFrequencyFields);
  modal.querySelector('#vault-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = modal.querySelector('button[type="submit"]');
    submit.disabled = true;
    const values = new FormData(event.currentTarget);
    const scheduledSave = scheduledToggle.checked;
    try {
      const result = await api('/api/data/vaults', {
        method: 'POST',
        body: {
          vaultType,
          name: String(values.get('name') || '').trim(),
          goal: Number(values.get('goal')),
          dueDate: values.get('dueDate'),
          scheduledSave,
          schedule: scheduledSave ? {
            every: Number(values.get('every')),
            frequency: values.get('frequency'),
            on: values.get('on'),
            periodicAmount: Number(values.get('periodicAmount'))
          } : null
        }
      });
      modal.close();
      await loadDashboard();
      render();
      if (scheduledSave && !result.scheduledSaveCreated) showToast(`Vault created, but the scheduled save could not be set up: ${result.scheduleWarning || 'Please review it in Elevault.'}`, true);
      else showToast(`${vaultType} vault created.`);
    } catch (error) {
      modal.querySelector('#vault-error').textContent = error.message;
      submit.disabled = false;
    }
  });
}

function showEmergencySetup(vault, mode = '') {
  const closeButton = `<button class="icon-button" id="modal-close" type="button" aria-label="Close">${icon('close')}</button>`;
  if (!mode) {
    modal.innerHTML = `<div class="modal-content"><div class="modal-head"><h2>Emergency fund setup</h2>${closeButton}</div><p class="modal-copy">Choose how you’d like to set your emergency savings goal.</p><button class="setup-choice" id="setup-monthly" type="button"><span class="quick-icon">${icon('vault')}</span><span><strong>Enter monthly expenses</strong><small>Set a goal of three months of expenses.</small></span>${icon('arrow')}</button><button class="setup-choice" id="setup-minimum" type="button"><span class="quick-icon">${icon('plus')}</span><span><strong>Use our minimum</strong><small>Start with the $500 emergency-fund goal.</small></span>${icon('arrow')}</button></div>`;
  } else {
    const monthly = mode === 'monthly';
    modal.innerHTML = `<form class="modal-content" id="emergency-form"><div class="modal-head"><h2>${monthly ? 'Enter monthly expenses' : 'Choose your goal'}</h2>${closeButton}</div><p class="modal-copy">${monthly ? 'Add one month of rent or mortgage, bills, and living expenses. Elevault sets your goal at three months.' : 'Set an emergency-fund target. The mobile app starts with a $500 minimum.'}</p><div class="field"><label for="emergency-amount">${monthly ? 'Monthly expenses' : 'Emergency-fund goal'}</label><input id="emergency-amount" name="amount" type="number" min="0.01" max="10000000" step="0.01" inputmode="decimal" required value="${monthly ? '' : '500'}"></div>${monthly ? '<div class="goal-preview">Three-month goal <strong id="emergency-goal-preview">$0.00</strong></div>' : ''}<p class="form-error" id="emergency-error" role="alert"></p><div class="modal-actions"><button class="button secondary" id="setup-back" type="button">Back</button><button class="button" type="submit">Save goal</button></div></form>`;
  }
  setMoneyPlaceholders(modal);
  if (!modal.open) modal.showModal();
  modal.querySelector('#modal-close').addEventListener('click', () => modal.close());
  modal.querySelector('#setup-monthly')?.addEventListener('click', () => showEmergencySetup(vault, 'monthly'));
  modal.querySelector('#setup-minimum')?.addEventListener('click', () => showEmergencySetup(vault, 'minimum'));
  modal.querySelector('#setup-back')?.addEventListener('click', () => showEmergencySetup(vault));
  const amountInput = modal.querySelector('#emergency-amount');
  amountInput?.addEventListener('input', () => {
    if (mode === 'monthly') modal.querySelector('#emergency-goal-preview').textContent = formatMoney(Number(amountInput.value) * 3);
  });
  modal.querySelector('#emergency-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = modal.querySelector('button[type="submit"]');
    submit.disabled = true;
    const amount = Number(new FormData(event.currentTarget).get('amount'));
    const body = mode === 'monthly' ? { mode, monthlyExpenses: amount } : { mode, amount };
    try {
      await api(`/api/data/vaults/${encodeURIComponent(vaultId(vault))}/emergency-setup`, { method: 'PUT', body });
      modal.close();
      await loadDashboard();
      render();
      showToast('Emergency fund goal saved.');
    } catch (error) {
      modal.querySelector('#emergency-error').textContent = error.message;
      submit.disabled = false;
    }
  });
}

function transferSelect(id, label, options) {
  return `<div class="field"><label for="${id}">${label}</label><select id="${id}" required><option value="" disabled selected>Choose ${label.toLowerCase()}</option>${options}</select></div>`;
}

function showTransfer(mode = '') {
  if (!mode) {
    const transferModes = [
      ['account-to-vault', 'Linked account to vault', 'Move money into a vault', `${icon('link')}${icon('arrow-right')}${icon('vault')}`],
      ['vault-to-account', 'Vault to linked account', 'Move money to your bank', `${icon('vault')}${icon('arrow-right')}${icon('link')}`],
      ['vault-to-vault', 'Vault to vault', 'Move money between vaults', `${icon('vault')}${icon('arrow-right')}${icon('vault')}`]
    ];
    modal.innerHTML = `<div class="modal-content"><div class="modal-head"><h2>Make a transfer</h2><button class="icon-button" id="modal-close" type="button" aria-label="Close">${icon('close')}</button></div><p class="modal-copy">Choose where the money is moving.</p><div class="transfer-mode-grid">${transferModes.map(([value, title, description, artwork]) => `<button class="transfer-mode-card" type="button" data-transfer-mode="${value}"><span class="transfer-mode-art" aria-hidden="true">${artwork}</span><span class="transfer-mode-copy"><strong>${title}</strong><small>${description}</small></span></button>`).join('')}</div></div>`;
    if (!modal.open) modal.showModal();
    modal.querySelector('#modal-close').addEventListener('click', () => modal.close());
    modal.querySelectorAll('[data-transfer-mode]').forEach(button => button.addEventListener('click', () => {
      const selectedMode = button.dataset.transferMode;
      modal.close();
      showTransfer(selectedMode);
    }));
    return;
  }

  const accounts = state.linkedAccounts.filter(account => ['accepted', 'connected'].includes(String(account.status || '').toLowerCase()));
  const accountOptions = accounts.map(account => {
    const details = [account.accountType, account.last4 ? `•••• ${account.last4}` : ''].filter(Boolean).join(' · ');
    const title = [account.accountName || 'Linked account', details].filter(Boolean).join(' · ');
    return account.id ? `<option value="${safe(account.id)}">${safe(title)}</option>` : '';
  }).join('');
  const vaultOptions = regularVaults().map(vault => {
    const id = vaultId(vault);
    return id ? `<option value="${safe(id)}">${safe(vaultName(vault))} · ${safe(vaultType(vault))}</option>` : '';
  }).join('');
  const fieldsFor = mode => {
    if (mode === 'vault-to-vault') return transferSelect('transfer-source', 'From vault', vaultOptions) + transferSelect('transfer-destination', 'To vault', vaultOptions);
    if (mode === 'vault-to-account') return transferSelect('transfer-source', 'From vault', vaultOptions) + transferSelect('transfer-destination', 'To linked account', accountOptions);
    return transferSelect('transfer-source', 'From linked account', accountOptions) + transferSelect('transfer-destination', 'To vault', vaultOptions);
  };
  const modeCopy = {
    'account-to-vault': 'Move money from a linked account into one of your vaults.',
    'vault-to-account': 'Move money from one of your vaults to a linked account.',
    'vault-to-vault': 'Move money between two of your vaults.'
  }[mode];
  openModal('Transfer', modeCopy, `
    <button class="text-button transfer-back" id="transfer-back" type="button">${icon('arrow')} Change transfer type</button>
    <div id="transfer-fields">${fieldsFor(mode)}</div>
    <div class="field"><label for="transfer-amount">Amount</label><div class="money-input"><span>$</span><input id="transfer-amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></div></div>`, 'Continue', async () => {
      const sourceId = modal.querySelector('#transfer-source').value;
      const destinationId = modal.querySelector('#transfer-destination').value;
      const amount = Number(modal.querySelector('#transfer-amount').value);
      if (!sourceId || !destinationId || !Number.isFinite(amount) || amount <= 0) throw new Error('Choose a source and destination and enter a valid amount.');
      if (mode === 'vault-to-vault' && sourceId === destinationId) throw new Error('Choose two different vaults.');
      return api('/api/data/transfers', { method: 'POST', body: { mode, sourceId, destinationId, amount } });
    }, async () => showToast('Transfer submitted.'));
  modal.querySelector('#transfer-back').addEventListener('click', () => {
    modal.close();
    showTransfer();
  });
}

function showVault(vault) {
  const amount = vaultAmount(vault);
  openModal(safe(vaultName(vault)), 'Vault details from your Elevault account.', `
    <div class="notice"><span>${icon('vault')}</span><span>Current balance <strong>${formatMoney(amount)}</strong><br>${safe(valueFrom(vault, ['description', 'memo']) || 'Savings in this vault')}</span></div>`, 'View activity', async () => {
      state.page = 'activity';
      state.transactions = visibleTransactions(listFrom(await api(`/api/data/transactions?slotGuid=${encodeURIComponent(vaultId(vault))}`)));
    });
}

async function loadPlaidSdk() {
  if (window.Plaid) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the secure account-linking service.'));
    document.head.append(script);
  });
}

async function connectAccount() {
  try {
    const response = await api('/api/data/plaid/link-token', { method: 'POST', body: {} });
    const linkToken = valueFrom(unwrap(response), ['link_token', 'linkToken', 'token']);
    if (!linkToken) throw new Error('Elevault did not return a Plaid Link token.');
    await loadPlaidSdk();
    window.Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        try {
          const accountId = metadata?.accounts?.[0]?.id;
          if (!accountId) throw new Error('Plaid did not provide an account identifier.');
          await api('/api/data/plaid/accounts', { method: 'POST', body: { publicToken, accountId } });
          await refreshData();
          showToast('Account connected.');
        } catch (error) {
          showToast(error.message, true);
        }
      },
      onExit: error => { if (error) showToast('Account linking was not completed.', true); }
    }).open();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function start() {
  try {
    const health = await api('/api/health');
    state.configured = health.configured;
    state.authenticated = health.authenticated;
    state.siteVersion = health.version || '';
    if (state.authenticated) {
      await loadDashboard();
      loadMoreData();
      await applyLocationRoute();
      return;
    }
  } catch (error) {
    state.configured = false;
  }
  render();
}

start();