const appRoot = document.querySelector('#app');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
modal.addEventListener('click', event => {
  if (event.target === modal) modal.close();
});
const state = {
  configured: false,
  authenticated: false,
  page: 'dashboard',
  customer: null,
  vaults: [],
  linkedAccounts: [],
  notifications: [],
  transactions: [],
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

const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const listFrom = value => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['items', 'data', 'results', 'value', 'rates', 'depositRates', 'slots', 'transactions', 'linkedAccounts', 'notifications', 'customerLinkAccountACHList', 'individualAlertList']) {
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

function formatRate(response) {
  const source = unwrap(response);
  const records = Array.isArray(source) ? source : listFrom(source);
  const rate = valueFrom(source, ['rateValue']) ?? valueFrom(records[0], ['rateValue']);
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

function transactionTitle(item) {
  return valueFrom(item, ['longSmartLabel', 'shortSmartLabel', 'description', 'merchantName', 'transactionDescription', 'name', 'type']) || 'Transaction';
}

function transactionAmount(item) {
  return valueFrom(item, ['transactionAmountDecimal', 'transactionAmount', 'amount', 'value']) ?? 0;
}

function renderLogin(step = 'credentials', error = '') {
  const configNotice = '';
  appRoot.innerHTML = `
    <section class="auth-page">
      <div class="auth-art">
        <a class="brand" href="#" aria-label="Elevault"><img class="brand-symbol" src="/assets/elevault-mark.png" alt=""><span class="brand-name">elevault</span></a>
        <div class="auth-copy"><p class="eyebrow">A clearer view of your money</p><h1>Your money, in motion.</h1><p>One place for the savings, accounts, and everyday moves that make your next step possible.</p></div>
        <div class="auth-art-foot">Secure access to your Elevault account</div>
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
      </form></div>
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
        render();
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
  ['vaults', 'My vaults', 'vault'],
  ['activity', 'Activity', 'swap'],
  ['accounts', 'Linked accounts', 'link'],
  ['notifications', 'Notifications', 'bell']
];

function renderShell(content) {
  const name = displayName();
  const profileImage = profilePhotoUrl();
  const unread = state.notifications.filter(item => !valueFrom(item, ['read', 'isRead', 'readAt'])).length;
  appRoot.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="#" aria-label="Elevault home"><img class="brand-symbol" src="/assets/elevault-mark.png" alt=""><span class="brand-name">elevault</span></a>
        <p class="brand-caption">Your financial home</p>
        <p class="nav-label">Workspace</p>
        <nav class="nav-list" aria-label="Main navigation">${navItems.map(([key, label, glyph]) => `
          <button class="nav-item ${state.page === key ? 'active' : ''}" data-page="${key}" type="button">${icon(glyph)}<span>${label}</span>${key === 'notifications' && unread ? `<span class="nav-count">${unread}</span>` : ''}</button>`).join('')}</nav>
        <div class="sidebar-bottom">
          <div class="security-note"><strong>Your account, protected</strong><p>Your sign-in stays between this browser and Elevault’s secure services.</p></div>
          <div class="sidebar-user"><span class="avatar">${safe(initials(name))}${profileImage ? `<img class="avatar-image" src="${safe(profileImage)}" alt="" referrerpolicy="no-referrer">` : ''}</span><span class="user-copy"><strong>${safe(name)}</strong><span>${safe(unwrap(state.customer)?.email || 'Elevault member')}</span></span><button class="icon-button" id="logout" type="button" aria-label="Sign out" title="Sign out">${icon('logout')}</button></div>
        </div>
      </aside>
      <section class="main-column">
        <header class="topbar"><button class="icon-button mobile-menu" id="menu-toggle" type="button" aria-label="Open navigation">${icon('menu')}</button><div class="mobile-brand"><img class="brand-symbol" src="/assets/elevault-mark.png" alt="">elevault</div><div class="crumb">Your financial home <span aria-hidden="true">/</span> ${safe(navItems.find(item => item[0] === state.page)?.[1] || 'Overview')}</div><div class="top-actions"><button class="icon-button" id="refresh" type="button" aria-label="Refresh account data" title="Refresh">${icon('refresh')}</button></div></header>
        <div class="content page-enter">${content}</div>
      </section>
    </div>`;
  appRoot.querySelectorAll('.nav-item[data-page]').forEach(button => button.addEventListener('click', () => {
    state.page = button.dataset.page;
    document.querySelector('#sidebar')?.classList.remove('open');
    render();
    if (state.page === 'activity') loadTransactions();
  }));
  document.querySelector('#logout').addEventListener('click', logout);
  document.querySelector('#refresh').addEventListener('click', refreshData);
  document.querySelector('#menu-toggle').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
  appRoot.querySelectorAll('.avatar-image').forEach(image => image.addEventListener('error', () => image.remove(), { once: true }));
}

function pageHeading(eyebrow, title, subtitle, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="heading-sub">${subtitle}</p></div>${action}</div>`;
}

function vaultCard(vault) {
  return `<button class="vault-card" data-vault="${safe(vaultId(vault))}" type="button"><span class="vault-card-top"><span class="vault-icon">${icon('vault')}</span><span class="vault-category">${safe(vaultType(vault))}</span></span><strong>${safe(vaultName(vault))}</strong><span class="vault-value">${formatMoney(vaultAmount(vault))}</span></button>`;
}

function emergencyCard(vault) {
  const goal = vault.slotGoal;
  const configured = goal !== null && goal !== undefined;
  return `<section class="emergency-tile"><span class="vault-icon">${icon('vault')}</span><div class="emergency-copy"><strong>Emergency fund</strong><span>${configured ? `Goal ${formatMoney(goal.amount)}` : 'Setup needed · current balance ' + formatMoney(vaultAmount(vault))}</span></div><button class="button ${configured ? 'secondary' : ''}" data-emergency-setup="${safe(vaultId(vault))}" type="button">${configured ? 'View vault' : 'Set up'}</button></section>`;
}

function transactionTable(items, limit = 5) {
  if (!items.length) return `<div class="empty-state"><strong>No activity to show</strong>Transactions from your Elevault accounts will appear here.</div>`;
  return `<div class="table-wrap"><table class="activity-table"><thead><tr><th>Details</th><th>Date</th><th>Vault</th><th>Amount</th></tr></thead><tbody>${items.slice(0, limit).map(item => {
    const amount = Number(transactionAmount(item));
    const relatedVault = state.vaults.find(vault => vaultId(vault) === valueFrom(item, ['slotGuid', 'vaultGuid']));
    return `<tr><td><span class="activity-title">${safe(transactionTitle(item))}</span><div class="activity-date">${safe(valueFrom(item, ['transactionType', 'type', 'status']) || '')}</div></td><td>${dateLabel(valueFrom(item, ['transactionDateTime', 'date', 'createdAt', 'postedAt']))}</td><td>${safe(relatedVault ? vaultName(relatedVault) : valueFrom(item, ['slotName', 'vaultName']) || '—')}</td><td class="${amount > 0 ? 'amount-positive' : 'amount-negative'}">${amount > 0 ? '+' : ''}${formatMoney(amount)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function linkedAccountRows(accounts) {
  if (!accounts.length) return `<div class="empty-state"><strong>No linked accounts</strong>Your connected accounts will appear here.</div>`;
  return accounts.map(account => {
    const pending = String(account.status || '').toLowerCase() === 'pending';
    const accountDetails = [valueFrom(account, ['accountType', 'type']), valueFrom(account, ['last4']) ? `•••• ${valueFrom(account, ['last4'])}` : ''].filter(Boolean).join(' · ');
    return `<div class="account-line"><span class="bank-icon">${safe(String(valueFrom(account, ['institutionName', 'bankName', 'accountName', 'name']) || 'BK').slice(0, 2).toUpperCase())}</span><span class="account-copy"><strong>${safe(valueFrom(account, ['accountName', 'institutionName', 'name']) || 'Bank account')}</strong><span>${safe(accountDetails || 'Linked account')}</span></span><span class="account-actions"><span class="account-status">${safe(valueFrom(account, ['status']) || 'Connected')}</span>${pending ? `<button class="text-button" data-verify-account="${safe(account.id)}" type="button">Verify deposits</button>` : ''}</span></div>`;
  }).join('');
}

function renderDashboard() {
  const amount = totalBalance();
  const activity = state.transactions;
  const vaults = regularVaults();
  const emergency = emergencyVault();
  const cards = vaults.slice(0, 3).map(vaultCard).join('') || `<div class="empty-state"><span class="vault-icon">${icon('vault')}</span><strong>Your first vault starts here</strong>Create a vault to organize what you’re saving toward.</div>`;
  const content = `
    ${pageHeading('Good to see you', `Welcome, ${safe(displayName().split(' ')[0])}`, 'Here’s what’s happening across your Elevault accounts.', `<div class="heading-actions"><button class="button secondary" data-action="transfer" type="button">${icon('swap')} Transfer</button><button class="button" data-action="new-vault" type="button">${icon('plus')} New vault</button></div>`)}
    <div class="dashboard-grid">
      <section class="balance-card"><div class="balance-head"><span class="balance-label"><i class="status-dot"></i> Available balance</span><span>Across active vaults</span></div><p class="balance-amount">${formatMoney(amount)}</p><p class="balance-caption">Uses each vault’s available balance</p><div class="balance-foot"><span>${vaults.length} ${vaults.length === 1 ? 'vault' : 'vaults'}</span><strong>Updated just now</strong></div></section>
      <section class="quick-card"><div><h2 class="quick-title">At a glance</h2><div class="quick-row"><span class="quick-icon">${icon('vault')}</span><span class="quick-copy"><strong>${vaults.length} ${vaults.length === 1 ? 'vault' : 'vaults'}</strong><span>Deleted slots are hidden</span></span>${icon('arrow')}</div><div class="quick-row"><span class="quick-icon">${icon('link')}</span><span class="quick-copy"><strong>${state.linkedAccounts.length} linked ${state.linkedAccounts.length === 1 ? 'account' : 'accounts'}</strong><span>Connected funding sources</span></span>${icon('arrow')}</div><div class="quick-row"><span class="quick-icon">%</span><span class="quick-copy"><strong>Daily Interest</strong><span>Standard deposit rate</span></span><strong class="rate-value">${formatRate(state.interestRate)}</strong></div></div><button class="text-button" data-page="accounts" type="button">View connected accounts →</button></section>
    </div>
    <div class="section-head"><h2>Your vaults</h2><button class="text-button" data-page="vaults" type="button">All vaults →</button></div>
    <div class="vault-grid">${cards}</div>
    ${emergency ? `<div class="section-head"><h2>Emergency fund</h2></div>${emergencyCard(emergency)}` : ''}
    <div class="lower-grid"><section class="panel"><div class="panel-heading"><h2>Recent activity</h2><button class="text-button" data-page="activity" type="button">See all</button></div>${transactionTable(activity, 4)}</section><section class="panel"><div class="panel-heading"><h2>Linked accounts</h2><button class="text-button" data-page="accounts" type="button">Manage</button></div>${linkedAccountRows(state.linkedAccounts.slice(0, 3))}</section></div>`;
  renderShell(content);
  bindPageActions();
}

function renderVaults() {
  const vaults = regularVaults();
  const emergency = emergencyVault();
  const content = `${pageHeading('Your savings', 'My vaults', 'Keep your money organized around what matters to you.', `<button class="button" data-action="new-vault" type="button">${icon('plus')} New vault</button>`)}<section class="table-panel"><div class="vault-grid">${vaults.length ? vaults.map(vaultCard).join('') : `<div class="empty-state"><span class="vault-icon">${icon('vault')}</span><strong>No active vaults</strong>Create a vault to begin organizing your savings.</div>`}</div></section>${emergency ? `<div class="section-head"><h2>Emergency fund</h2></div>${emergencyCard(emergency)}` : ''}`;
  renderShell(content);
  bindPageActions();
  document.querySelectorAll('[data-vault]').forEach(button => button.addEventListener('click', () => {
    const selected = state.vaults.find(vault => vaultId(vault) === button.dataset.vault);
    if (selected) showVault(selected);
  }));
}

function renderActivity() {
  const content = `${pageHeading('Your money, moving', 'Activity', 'A running view of transactions across your vaults.', `<button class="button secondary" id="activity-refresh" type="button">${icon('refresh')} Refresh</button>`)}<section class="table-panel"><div class="panel-heading"><h2>All transactions</h2><span class="heading-sub">${state.transactions.length} results</span></div>${state.loading ? '<div class="empty-state">Loading transactions…</div>' : transactionTable(state.transactions, 100)}</section>`;
  renderShell(content);
  document.querySelector('#activity-refresh').addEventListener('click', loadTransactions);
}

function renderAccounts() {
  const content = `${pageHeading('Connected services', 'Linked accounts', 'Connect a bank with Plaid or enter its details manually.', `<div class="heading-actions"><button class="button secondary" data-action="link-account" type="button">${icon('link')} Connect with Plaid</button><button class="button" data-action="manual-account" type="button">${icon('plus')} Enter manually</button></div>`)}<section class="table-panel"><div class="panel-heading"><h2>Connected accounts</h2><span class="heading-sub">${state.linkedAccounts.length} accounts</span></div>${linkedAccountRows(state.linkedAccounts)}</section><div class="notice" style="margin-top:16px">${icon('link')} Manual bank connections are confirmed with two small deposits. Do not enter the withdrawal amount.</div>`;
  renderShell(content);
  bindPageActions();
}

function renderNotifications() {
  const content = `${pageHeading('Stay in the loop', 'Notifications', 'Account updates and messages from Elevault.', `<button class="button secondary" id="notifications-refresh" type="button">${icon('refresh')} Refresh</button>`)}<section class="table-panel"><div class="panel-heading"><h2>Recent notifications</h2></div>${state.notifications.length ? state.notifications.map(item => `<div class="account-line"><span class="quick-icon">${icon('bell')}</span><span class="account-copy"><strong>${safe(valueFrom(item, ['title', 'subject', 'message']) || 'Account update')}</strong><span>${safe(dateLabel(valueFrom(item, ['createdAt', 'date', 'sentAt'])))}</span></span><span class="account-status">${valueFrom(item, ['read', 'isRead', 'readAt']) ? 'Read' : 'New'}</span></div>`).join('') : `<div class="empty-state"><strong>No notifications</strong>New account messages will appear here.</div>`}</section>`;
  renderShell(content);
  document.querySelector('#notifications-refresh').addEventListener('click', refreshData);
}

function render() {
  if (!state.authenticated) return renderLogin();
  if (state.page === 'vaults') return renderVaults();
  if (state.page === 'activity') return renderActivity();
  if (state.page === 'accounts') return renderAccounts();
  if (state.page === 'notifications') return renderNotifications();
  return renderDashboard();
}

function bindPageActions() {
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
    state.page = button.dataset.page;
    render();
    if (state.page === 'activity') loadTransactions();
  }));
  document.querySelector('[data-action="new-vault"]')?.addEventListener('click', showCreateVault);
  document.querySelector('[data-action="transfer"]')?.addEventListener('click', showTransfer);
  document.querySelector('[data-action="link-account"]')?.addEventListener('click', connectAccount);
  document.querySelector('[data-action="manual-account"]')?.addEventListener('click', showManualAccountForm);
  document.querySelectorAll('[data-emergency-setup]').forEach(button => button.addEventListener('click', () => {
    const selected = emergencyVault();
    if (!selected) return;
    if (selected.slotGoal !== null && selected.slotGoal !== undefined) showVault(selected);
    else showEmergencySetup(selected);
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
    try { state.transactions = listFrom(await api('/api/data/transactions')); }
    catch { state.transactions = []; }
  } finally {
    state.loading = false;
  }
}

async function loadTransactions() {
  state.loading = true;
  render();
  try {
    state.transactions = listFrom(await api('/api/data/transactions'));
  } catch (error) {
    showToast(error.message, true);
  } finally {
    state.loading = false;
    render();
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

function showTransfer() {
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
  openModal('Transfer', 'Move money between your vaults and linked accounts.', `
    <div class="field"><label for="transfer-mode">Transfer type</label><select id="transfer-mode"><option value="account-to-vault">Linked account to vault</option><option value="vault-to-account">Vault to linked account</option><option value="vault-to-vault">Vault to vault</option></select></div>
    <div id="transfer-fields">${fieldsFor('account-to-vault')}</div>
    <div class="field"><label for="transfer-amount">Amount</label><div class="money-input"><span>$</span><input id="transfer-amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></div></div>`, 'Continue', async () => {
      const mode = modal.querySelector('#transfer-mode').value;
      const sourceId = modal.querySelector('#transfer-source').value;
      const destinationId = modal.querySelector('#transfer-destination').value;
      const amount = Number(modal.querySelector('#transfer-amount').value);
      if (!sourceId || !destinationId || !Number.isFinite(amount) || amount <= 0) throw new Error('Choose a source and destination and enter a valid amount.');
      if (mode === 'vault-to-vault' && sourceId === destinationId) throw new Error('Choose two different vaults.');
      return api('/api/data/transfers', { method: 'POST', body: { mode, sourceId, destinationId, amount } });
    }, async () => showToast('Transfer submitted.'));
  modal.querySelector('#transfer-mode').addEventListener('change', event => {
    modal.querySelector('#transfer-fields').innerHTML = fieldsFor(event.target.value);
  });
}

function showVault(vault) {
  const amount = vaultAmount(vault);
  openModal(safe(vaultName(vault)), 'Vault details from your Elevault account.', `
    <div class="notice"><span>${icon('vault')}</span><span>Current balance <strong>${formatMoney(amount)}</strong><br>${safe(valueFrom(vault, ['description', 'memo']) || 'Savings in this vault')}</span></div>`, 'View activity', async () => {
      state.page = 'activity';
      state.transactions = listFrom(await api(`/api/data/transactions?slotGuid=${encodeURIComponent(vaultId(vault))}`));
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
    if (state.authenticated) await loadDashboard();
  } catch (error) {
    state.configured = false;
  }
  render();
}

start();