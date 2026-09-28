require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { version } = require('./package.json');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const multer = require('multer');

const app = express();
const port = Number(process.env.PORT || 3000);
const apiBaseUrl = (process.env.ELEVAULT_API_BASE_URL || 'https://api.elevault.digitalfirstsb.io').replace(/\/$/, '');
const apiKey = process.env.ELEVAULT_API_KEY || '65399136-e9cc-40f9-a631-764a42b4086e';
const demoMode = process.env.DEMO_MODE === 'true';
const demoApi = demoMode ? require('./demo-responses') : null;
const brandGuid = '89FD4A1A-6E1E-4533-BCC3-571F80F2A0F4';
const spendingSlotTypeGuid = 'FE446A6F-ECCD-4F56-9088-9F4111353BE9';
const savingsSlotTypeGuid = 'DB5ADD65-4B17-40E5-996F-0D0E0471312C';
const expensesSlotTypeGuid = 'DC446A6F-ECCD-4F56-9088-9F4111353BF6';
const sessionDirectory = path.join(os.homedir(), '.local', 'share', 'elevault-web');
const emergencySlotTypeGuid = 'D059A31A-D58C-44EE-837E-809C9536F352';
const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});

fs.mkdirSync(sessionDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(sessionDirectory, 0o700);
process.umask(0o077);

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const secretPath = path.join(sessionDirectory, 'session-secret');
  try {
    return fs.readFileSync(secretPath, 'utf8').trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const secret = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(secretPath, secret, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return secret;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return fs.readFileSync(secretPath, 'utf8').trim();
  }
}

const sessionSecret = getSessionSecret();
const sessionStore = new FileStore({
  path: path.join(sessionDirectory, 'sessions'),
  ttl: 30 * 24 * 60 * 60,
  retries: 0,
  logFn: () => {}
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(session({
  name: 'elevault.sid',
  secret: sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

class BackendError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function decodeJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

function findTokens(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return null;
  const accessToken = value.access_token || value.accessToken;
  const refreshToken = value.refresh_token || value.refreshToken;
  if (typeof accessToken === 'string') {
    return { accessToken, refreshToken: typeof refreshToken === 'string' ? refreshToken : '' };
  }
  for (const nested of Object.values(value)) {
    const found = findTokens(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function customerGuid(token) {
  const claims = decodeJwt(token);
  return claims.extension_CustomerGuid || claims.extension_customerGuid || claims.customerGuid || claims.sub || '';
}

async function rawBackend(endpoint, options = {}) {
  if (!apiKey) throw new BackendError(503, 'The server is missing ELEVAULT_API_KEY.', 'API_CONFIGURATION_MISSING');
  let response;
  try {
    response = await fetch(`${apiBaseUrl}${endpoint}`, {
      method: options.method || 'GET',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    throw new BackendError(502, error.name === 'TimeoutError' ? 'Elevault service timed out.' : 'Could not reach Elevault services.', 'UPSTREAM_UNAVAILABLE');
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const message = typeof data === 'object' && data
      ? data.message || data.title || data.error_description || 'Elevault rejected the request.'
      : 'Elevault rejected the request.';
    throw new BackendError(response.status, String(message).slice(0, 240), 'UPSTREAM_ERROR');
  }
  if (options.returnResponse) return { status: response.status, data };
  return data;
}

async function backendFetch(req, endpoint, options = {}, allowRefresh = true) {
  if (!apiKey) throw new BackendError(503, 'The server is missing ELEVAULT_API_KEY.', 'API_CONFIGURATION_MISSING');
  const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const rawBody = options.rawBody === true;
  const headers = {
    ...(multipart ? {} : { 'content-type': 'application/json' }),
    'x-api-key': apiKey,
    ...(options.headers || {})
  };
  if (req.session.tokens?.accessToken) headers.authorization = `Bearer ${req.session.tokens.accessToken}`;

  let response;
  try {
    response = await fetch(`${apiBaseUrl}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : multipart || rawBody ? options.body : JSON.stringify(options.body),
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    throw new BackendError(502, error.name === 'TimeoutError' ? 'Elevault service timed out.' : 'Could not reach Elevault services.', 'UPSTREAM_UNAVAILABLE');
  }

  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }

  if (response.status === 401 && allowRefresh && req.session.tokens?.refreshToken) {
    const refreshed = await rawBackend('/accounts/refresh/2fa', {
      method: 'POST',
      body: { refreshToken: req.session.tokens.refreshToken }
    });
    const nextTokens = findTokens(refreshed);
    if (nextTokens?.accessToken) {
      req.session.tokens = nextTokens;
      req.session.customerGuid = customerGuid(nextTokens.accessToken) || req.session.customerGuid;
      return backendFetch(req, endpoint, options, false);
    }
  }

  if (!response.ok) {
    const message = typeof data === 'object' && data
      ? data.message || data.title || data.error_description || 'Elevault rejected the request.'
      : 'Elevault rejected the request.';
    throw new BackendError(response.status, String(message).slice(0, 240), 'UPSTREAM_ERROR');
  }
  return data;
}

function requireCustomer(req, res, next) {
  if (!req.session.tokens?.accessToken || !req.session.customerGuid) {
    return res.status(401).json({ error: 'Sign in to continue.', code: 'AUTH_REQUIRED' });
  }
  next();
}

function validGuid(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value);
}

async function customerIndividual(req) {
  const response = unwrapBackendData(await backendFetch(req, '/customers?calculateSlotBalances=true')) || {};
  const customer = (Array.isArray(response) ? response.find(item => item.customerGuid === req.session.customerGuid) : response.individual) || response;
  const individualGuid = customer.individualId || customer.individualGuid;
  if (!validGuid(individualGuid)) throw new BackendError(409, 'Elevault did not provide the individual identifier required for this action.', 'INDIVIDUAL_ID_MISSING');
  return { ...customer, individualGuid };
}

function ensureSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin && new URL(origin).host !== req.get('host')) {
    return res.status(403).json({ error: 'Cross-origin request denied.' });
  }
  next();
}

function listFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['items', 'data', 'results', 'value', 'slots', 'legacySlotNumberList', 'transactions', 'customerLinkAccountACHList', 'individualAlertList', 'memos']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function mergeSlotMemos(transactions, memos) {
  const merged = transactions.map(transaction => ({ ...transaction }));
  for (const memo of memos) {
    const match = memo?.transactionGuid && merged.find(transaction => String(transaction.transactionGuid || '').toLowerCase() === String(memo.transactionGuid).toLowerCase());
    if (match) {
      match.memo = memo;
      continue;
    }
    const amount = Number(memo?.amountDecimal) || 0;
    merged.push({
      transactionGuid: memo?.transactionGuid || '',
      slotGuid: memo?.slotGuid || '',
      transactionDateTime: memo?.enteredTimestamp || '',
      shortSmartLabel: memo?.note || '',
      longSmartLabel: memo?.note || '',
      transactionAmountDecimal: amount,
      transactionAmount: amount,
      transactionAmountABSFormatted: `$${Math.abs(amount).toFixed(2)}`,
      transactionType: 'Pending',
      includeInBalance: true,
      memo
    });
  }
  return merged.sort((a, b) => new Date(b.transactionDateTime) - new Date(a.transactionDateTime));
}

function unwrapBackendData(value) {
  return value && typeof value === 'object' && value.data && typeof value.data === 'object' ? value.data : value;
}

function activeSlots(value) {
  return listFrom(value).filter(slot => slot && slot.deleted !== true);
}

function customerSummary(value) {
  const customer = value && typeof value === 'object' ? value : {};
  return {
    alias: customer.alias || '',
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    email: customer.email || '',
    mobilePhone: customer.individual?.mobilePhone || customer.mobilePhone || '',
    mobilePhoneFormatted: customer.individual?.mobilePhoneFormatted || customer.mobilePhoneFormatted || '',
    imageUrl: typeof customer.imageUrl === 'string' ? customer.imageUrl : ''
  };
}

function linkedAccountSummary(account) {
  const bankAccountNumber = String(account.bankAccountNumber || '');
  return {
    id: account.id || '',
    customerLinkAccountACHID: account.id || '',
    accountName: account.bankAccountName || account.accountName || account.name || 'Linked account',
    accountType: account.bankAccountType || account.accountType || '',
    institutionName: account.institutionName || account.bankName || '',
    status: account.status || 'Connected',
    last4: bankAccountNumber.slice(-4),
    failedAttempts: Number(account.failedAttemps || account.failedAttempts || 0)
  };
}

function vaultKeySummary(key) {
  return {
    legacySlotNumberGuid: key.legacySlotNumberGuid || '',
    name: key.name || '',
    active: key.active === true || key.active === 1 || key.active === 'true',
    legacyNumber: key.legacyNumber == null ? '' : String(key.legacyNumber),
    routingNumber: key.routingNumber ?? key.bankRoutingTransitNumber ?? key.routingTransitNumber ?? '',
    slotGuid: key.slotGuid || '',
    slotName: key.slotName || ''
  };
}

function linkedAccountSummaries(value) {
  return listFrom(value).map(linkedAccountSummary);
}

function notificationSummaries(value) {
  return listFrom(value).map(item => ({
    id: item.id || item.individualAlertGuid || item.alertGuid || '',
    title: item.title || item.subject || item.message || 'Account update',
    createdAt: item.createdAt || item.createdDate || item.date || item.sentAt || '',
    read: Boolean(item.read || item.isRead || item.readAt)
  }));
}

if (demoApi) app.use('/api', demoApi);

app.get('/api/health', (req, res) => {
  res.json({ configured: Boolean(apiKey), authenticated: Boolean(req.session.tokens?.accessToken), version });
});

app.post('/api/auth/request-code', ensureSameOrigin, async (req, res, next) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }
  try {
    const result = await rawBackend('/accounts/login/2fa', {
      method: 'POST',
      body: { username: username.trim(), password }
    });
    req.session.pendingLogin = { username: username.trim(), password };
    res.json({ result });
  } catch (error) { next(error); }
});

app.post('/api/auth/verify-code', ensureSameOrigin, async (req, res, next) => {
  const pending = req.session.pendingLogin;
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!pending) return res.status(400).json({ error: 'Request a new sign-in code first.' });
  if (!code) return res.status(400).json({ error: 'Enter the verification code.' });
  try {
    const result = await rawBackend('/accounts/login/2fa', {
      method: 'PUT',
      body: { username: pending.username, password: pending.password, code }
    });
    const tokens = findTokens(result);
    if (!tokens?.accessToken) throw new BackendError(502, 'Sign-in succeeded but the token response was not recognized.', 'TOKEN_RESPONSE_INVALID');
    const guid = customerGuid(tokens.accessToken);
    if (!guid) throw new BackendError(502, 'The access token did not include a customer identifier.', 'CUSTOMER_ID_MISSING');
    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.tokens = tokens;
      req.session.customerGuid = guid;
      req.session.save(saveError => {
        if (saveError) return next(saveError);
        res.json({ authenticated: true });
      });
    });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', ensureSameOrigin, (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('elevault.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.json({ authenticated: false });
  });
});

app.get('/api/data/dashboard', requireCustomer, async (req, res, next) => {
  const guid = encodeURIComponent(req.session.customerGuid);
  const results = await Promise.allSettled([
    backendFetch(req, `/customers/${guid}`),
    backendFetch(req, `/customers/${guid}/slots?calculateSlotBalances=true`),
    backendFetch(req, `/customers/${guid}/linkedAccounts`),
    backendFetch(req, `/customers/${guid}/notifications`),
    backendFetch(req, `/brands/${brandGuid}/rates/deposits`)
  ]).catch(next);
  if (!results) return;
  const [customer, vaults, linkedAccounts, notifications, interestRate] = results.map(result =>
    result.status === 'fulfilled' ? { ok: true, data: result.value } : { ok: false, error: result.reason.message }
  );
  if (customer.ok) customer.data = customerSummary(customer.data);
  if (vaults.ok) vaults.data = activeSlots(vaults.data);
  if (linkedAccounts.ok) linkedAccounts.data = linkedAccountSummaries(linkedAccounts.data);
  if (notifications.ok) notifications.data = notificationSummaries(notifications.data);
  res.json({ customer, vaults, linkedAccounts, notifications, interestRate });
});

app.get('/api/data/vaults', requireCustomer, async (req, res, next) => {
  try {
    const guid = encodeURIComponent(req.session.customerGuid);
    res.json(activeSlots(await backendFetch(req, `/customers/${guid}/slots?calculateSlotBalances=true`)));
  } catch (error) { next(error); }
});

app.get('/api/data/vaults/:slotGuid/detail', requireCustomer, async (req, res, next) => {
  const { slotGuid } = req.params;
  if (!validGuid(slotGuid)) return res.status(400).json({ error: 'Invalid vault identifier.' });

  try {
    const customerGuid = encodeURIComponent(req.session.customerGuid);
    const slots = activeSlots(await backendFetch(req, `/customers/${customerGuid}/slots?calculateSlotBalances=true`));
    const vault = slots.find(slot => String(slot.slotGuid || '').toLowerCase() === slotGuid.toLowerCase());
    if (!vault) return res.status(404).json({ error: 'Vault not found.' });

    const [transactions, keyResponse, memos] = await Promise.all([
      backendFetch(req, `/slots/${encodeURIComponent(vault.slotGuid)}/transactions?filter=slotGuid[eq]'${encodeURIComponent(vault.slotGuid)}'[and]includeInBalance[eq]1&orderBy=TransactionDateTime%20DESC`),
      backendFetch(req, `/customers/${customerGuid}/legacySlotNumbers`),
      backendFetch(req, `/slots/${encodeURIComponent(vault.slotGuid)}/memos`).catch(() => [])
    ]);
    const vaultKeys = listFrom(unwrapBackendData(keyResponse))
      .filter(key => String(key.slotGuid || '').toLowerCase() === String(vault.slotGuid).toLowerCase())
      .map(vaultKeySummary);
    res.json({
      vault: {
        slotGuid: vault.slotGuid,
        description: vault.description || '',
        slotTypeGuid: vault.slotTypeGuid || '',
        slotAvailableBalance: vault.slotAvailableBalance ?? vault.availableBalance ?? null,
        slotGoal: vault.slotGoal ?? null,
        createdDate: vault.createdDate || ''
      },
      transactions: mergeSlotMemos(listFrom(unwrapBackendData(transactions)), listFrom(unwrapBackendData(memos))),
      vaultKeys
    });
  } catch (error) { next(error); }
});

app.put('/api/data/vaults/:slotGuid', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { slotGuid } = req.params;
  const { name, goal, dueDate } = req.body || {};
  const goalAmount = Number(goal);
  const targetDate = typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
    ? new Date(`${dueDate}T00:00:00.000Z`)
    : null;
  if (!validGuid(slotGuid) || typeof name !== 'string' || !name.trim() || name.trim().length > 80 ||
      !Number.isFinite(goalAmount) || goalAmount <= 0 || goalAmount > 10000000 ||
      !targetDate || Number.isNaN(targetDate.getTime()) || targetDate.toISOString().slice(0, 10) !== dueDate) {
    return res.status(400).json({ error: 'Enter a vault name, goal, and valid target date.' });
  }

  try {
    const customerGuid = encodeURIComponent(req.session.customerGuid);
    const slots = activeSlots(await backendFetch(req, `/customers/${customerGuid}/slots?calculateSlotBalances=true`));
    const vault = slots.find(slot => String(slot.slotGuid || '').toLowerCase() === slotGuid.toLowerCase());
    if (!vault) return res.status(404).json({ error: 'Vault not found.' });
    if (![savingsSlotTypeGuid, expensesSlotTypeGuid].includes(String(vault.slotTypeGuid || '').toUpperCase())) {
      return res.status(400).json({ error: 'This vault type cannot be edited here.' });
    }

    const updatedVault = {
      ...vault,
      description: name.trim(),
      slotGoal: {
        ...(vault.slotGoal || {}),
        name: '',
        amount: goalAmount,
        targetDate: targetDate.toISOString()
      }
    };
    await backendFetch(req, `/customers/${customerGuid}/slots`, { method: 'PUT', body: updatedVault });
    res.json({ updated: true });
  } catch (error) { next(error); }
});

app.put('/api/data/vault-keys/:keyGuid/active', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { keyGuid } = req.params;
  const { active } = req.body || {};
  if (!validGuid(keyGuid) || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'Choose a valid vault-key status.' });
  }

  const customerGuid = encodeURIComponent(req.session.customerGuid);
  try {
    const response = await backendFetch(req, `/customers/${customerGuid}/legacySlotNumbers`);
    const key = listFrom(unwrapBackendData(response)).find(item =>
      String(item.legacySlotNumberGuid || '').toLowerCase() === keyGuid.toLowerCase()
    );
    if (!key) return res.status(404).json({ error: 'Vault key not found.' });

    await backendFetch(req, `/customers/${customerGuid}/legacySlotNumbers`, {
      method: 'PUT',
      body: { ...key, active, actionAllowed: 'All' }
    });
    res.json({ updated: true, active });
  } catch (error) { next(error); }
});

app.post('/api/data/vaults', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { vaultType, name, goal, dueDate, scheduledSave } = req.body || {};
  const slotTypeGuid = vaultType === 'Savings' ? savingsSlotTypeGuid : vaultType === 'Expenses' ? expensesSlotTypeGuid : '';
  const goalAmount = Number(goal);
  const dueDateValue = new Date(`${dueDate}T00:00:00.000Z`);
  const schedule = req.body?.schedule || {};
  if (!slotTypeGuid || typeof name !== 'string' || !name.trim() || name.trim().length > 80 ||
      !Number.isFinite(goalAmount) || goalAmount <= 0 || goalAmount > 10000000 ||
      typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(dueDateValue.getTime()) ||
      typeof scheduledSave !== 'boolean') {
    return res.status(400).json({ error: 'Enter a vault name, goal, due date, and valid vault type.' });
  }

  let every = 0;
  let periodicAmount = 0;
  let frequencyType = '';
  let on = '';
  if (scheduledSave) {
    every = Number(schedule.every);
    periodicAmount = Number(schedule.periodicAmount);
    frequencyType = schedule.frequency;
    on = typeof schedule.on === 'string' ? schedule.on : '';
    const ranges = { Day: [1, 31], Week: [1, 10], Month: [1, 12] };
    const range = ranges[frequencyType];
    const onValid = frequencyType === 'Day' ||
      (frequencyType === 'Week' && ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(on)) ||
      (frequencyType === 'Month' && Number.isInteger(Number(on)) && Number(on) >= 1 && Number(on) <= 31);
    if (!range || !Number.isInteger(every) || every < range[0] || every > range[1] ||
        !Number.isFinite(periodicAmount) || periodicAmount <= 0 || periodicAmount > 10000000 || !onValid) {
      return res.status(400).json({ error: 'Complete the scheduled-save frequency, On, and amount fields.' });
    }
  }

  try {
    const customerGuid = req.session.customerGuid;
    const encodedCustomerGuid = encodeURIComponent(customerGuid);
    let customer = null;
    let spendingSlot = null;
    let portfolioGuid = '';
    if (scheduledSave) {
      const [customerResponse, slotsResponse] = await Promise.all([
        backendFetch(req, `/customers/${encodedCustomerGuid}`),
        backendFetch(req, `/customers/${encodedCustomerGuid}/slots?calculateSlotBalances=true`)
      ]);
      customer = unwrapBackendData(customerResponse) || {};
      spendingSlot = activeSlots(slotsResponse).find(slot => String(slot.slotTypeGuid || '').toUpperCase() === spendingSlotTypeGuid);
      portfolioGuid = customer.portfolio?.portfolioGuid || '';
      if (!spendingSlot?.slotGuid || !portfolioGuid) {
        return res.status(409).json({ error: 'Could not find your Main Vault to fund this scheduled save.' });
      }
    }

    const createdDate = new Date().toISOString();
    const slotResponse = await backendFetch(req, `/customers/${encodedCustomerGuid}/slots`, {
      method: 'POST',
      body: {
        slotGoal: { name: '', amount: goalAmount, targetDate: dueDateValue.toISOString() },
        description: name.trim(),
        slotTypeGuid,
        slotOwner: true,
        securityLevel: 'All',
        createdDate
      }
    });
    const createdSlot = unwrapBackendData(slotResponse)?.slot || unwrapBackendData(slotResponse);
    const slotGuid = createdSlot?.slotGuid || createdSlot?.id;
    if (!slotGuid) throw new BackendError(502, 'Elevault created the vault but did not return its identifier.', 'VAULT_ID_MISSING');

    let scheduleCreated = false;
    let scheduleWarning = '';
    if (scheduledSave) {
      const frequency = {
        numberOfPeriods: every,
        startDate: createdDate,
        type: ({ Day: 'Daily', Week: 'Weekly', Month: 'Monthly' })[frequencyType]
      };
      if (frequencyType === 'Week') {
        frequency.weekdayInWeek = on;
        frequency.onDayInMonth = false;
      } else if (frequencyType === 'Month') {
        frequency.onDayInMonth = true;
        frequency.dayInMonth = Number(on);
      } else {
        frequency.onDayInMonth = false;
      }
      const instruction = {
        name: `${name.trim()} save instruction`,
        toCustomerGuid: customerGuid,
        toCustomerAlias: customer.alias || '',
        financialInstitutionBrandGuid: brandGuid,
        fromSlotGuid: spendingSlot.slotGuid,
        fromSlotName: spendingSlot.description || 'Main Vault',
        fromPortfolioGuid: portfolioGuid,
        toSlotGuid: slotGuid,
        amount: periodicAmount,
        toSlotName: name.trim(),
        frequency
      };
      try {
        await backendFetch(req, `/customers/${encodedCustomerGuid}/saveinstructions`, {
          method: 'POST', body: instruction
        });
        scheduleCreated = true;
      } catch (error) {
        scheduleWarning = error.message;
      }
    }

    res.status(201).json({ slotGuid, scheduledSaveCreated: scheduleCreated, scheduleWarning });
  } catch (error) { next(error); }
});

app.put('/api/data/vaults/:slotGuid/emergency-setup', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const slotGuid = req.params.slotGuid;
  const { mode, monthlyExpenses, amount } = req.body || {};
  if (!validGuid(slotGuid) || !['monthly', 'minimum'].includes(mode)) {
    return res.status(400).json({ error: 'Choose an emergency-fund setup option.' });
  }
  const inputAmount = Number(mode === 'monthly' ? monthlyExpenses : amount);
  if (!Number.isFinite(inputAmount) || inputAmount <= 0 || inputAmount > 10000000) {
    return res.status(400).json({ error: 'Enter a valid amount greater than zero.' });
  }
  try {
    const customerGuid = encodeURIComponent(req.session.customerGuid);
    const slots = activeSlots(await backendFetch(req, `/customers/${customerGuid}/slots?calculateSlotBalances=true`));
    const emergency = slots.find(slot => String(slot.slotGuid).toLowerCase() === slotGuid.toLowerCase());
    if (!emergency || String(emergency.slotTypeGuid).toUpperCase() !== emergencySlotTypeGuid) {
      return res.status(404).json({ error: 'Emergency vault not found.' });
    }
    const slotGoal = {
      name: '',
      amount: mode === 'monthly' ? inputAmount * 3 : inputAmount
    };
    const updated = await backendFetch(req, `/customers/${customerGuid}/slots/${encodeURIComponent(slotGuid)}`, {
      method: 'PUT',
      body: { ...emergency, slotGoal }
    });
    res.json(updated);
  } catch (error) { next(error); }
});

app.get('/api/data/linked-accounts', requireCustomer, async (req, res, next) => {
  try {
    res.json(linkedAccountSummaries(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/linkedAccounts`)));
  } catch (error) { next(error); }
});

app.post('/api/data/linked-accounts/manual', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { bankAccountName, bankAccountNumber, bankAccountType, bankRoutingTransitNumber } = req.body || {};
  if (typeof bankAccountName !== 'string' || !bankAccountName.trim() || bankAccountName.length > 80 ||
      !['Checking', 'Savings'].includes(bankAccountType) ||
      typeof bankAccountNumber !== 'string' || !/^\d{4,17}$/.test(bankAccountNumber) ||
      typeof bankRoutingTransitNumber !== 'string' || !/^\d{9}$/.test(bankRoutingTransitNumber)) {
    return res.status(400).json({ error: 'Enter a valid account name, account type, account number, and 9-digit routing number.' });
  }
  const customerGuid = encodeURIComponent(req.session.customerGuid);
  try {
    const created = await backendFetch(req, `/customers/${customerGuid}/linkedAccounts`, {
      method: 'POST',
      body: {
        id: null,
        customerGuid: req.session.customerGuid,
        linkAccountACHItemList: null,
        customerLinkAccountACHOriginationItemList: null,
        bankAccountName: bankAccountName.trim(),
        bankAccountNumber,
        bankAccountType,
        bankRoutingTransitNumber,
        status: null,
        lastAttempedDate: null,
        createdDate: null,
        attempsToday: 0,
        failedAttemps: 0,
        failedReasonsList: null,
        error: false,
        errorMessage: ''
      }
    });
    const account = created?.customerLinkAccountACH || created?.data?.customerLinkAccountACH || created?.data || created;
    res.status(201).json(linkedAccountSummary(account));
  } catch (error) { next(error); }
});

app.put('/api/data/linked-accounts/:accountId/verify', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { creditAmount1, creditAmount2 } = req.body || {};
  const firstAmount = Number(creditAmount1);
  const secondAmount = Number(creditAmount2);
  if (!validGuid(req.params.accountId) || !Number.isFinite(firstAmount) || !Number.isFinite(secondAmount) ||
      firstAmount <= 0 || secondAmount <= 0 || firstAmount > 0.99 || secondAmount > 0.99 || firstAmount === secondAmount) {
    return res.status(400).json({ error: 'Enter the two different deposit amounts, each less than $1.' });
  }
  const customerGuid = encodeURIComponent(req.session.customerGuid);
  try {
    const accounts = await backendFetch(req, `/customers/${customerGuid}/linkedAccounts`);
    const pendingAccount = listFrom(accounts).find(account =>
      String(account.id || '').toLowerCase() === req.params.accountId.toLowerCase() &&
      String(account.status || '').toLowerCase() === 'pending'
    );
    if (!pendingAccount) return res.status(404).json({ error: 'Pending linked account not found.' });

    const result = await backendFetch(req, `/customers/${customerGuid}/linkedAccounts`, {
      method: 'PUT',
      body: {
        customerGuid: req.session.customerGuid,
        creditAmount1: firstAmount,
        creditAmount2: secondAmount,
        debitAmount: null
      }
    });
    const attemptsUsed = Number(result?.failedAttemps || result?.failedAttempts || pendingAccount.failedAttemps || 0);
    const attemptsRemaining = Math.max(0, 3 - attemptsUsed);
    const message = result?.errorMessage || result?.failedReasonsList?.[0] ||
      (attemptsRemaining ? `Amounts did not match. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.` : 'You have reached the maximum number of attempts for today. Please try again tomorrow.');
    res.json({ valid: result?.valid === true, attemptsRemaining, message });
  } catch (error) { next(error); }
});

app.delete('/api/data/linked-accounts/:accountId', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  if (!validGuid(req.params.accountId)) return res.status(400).json({ error: 'Invalid linked-account identifier.' });
  const customerGuid = encodeURIComponent(req.session.customerGuid);
  try {
    const accounts = await backendFetch(req, `/customers/${customerGuid}/linkedAccounts`);
    const account = listFrom(accounts).find(item => String(item.id || '').toLowerCase() === req.params.accountId.toLowerCase());
    if (!account) return res.status(404).json({ error: 'Linked account not found.' });
    await backendFetch(req, `/customers/${customerGuid}/linkedaccounts/${encodeURIComponent(req.params.accountId)}`, { method: 'DELETE' });
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

app.post('/api/data/plaid/link-token', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/plaid/token/link`, {
      method: 'POST', body: req.body || {}
    }));
  } catch (error) { next(error); }
});

app.post('/api/data/plaid/accounts', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { publicToken, accountId } = req.body || {};
  if (typeof publicToken !== 'string' || !publicToken || typeof accountId !== 'string' || !accountId) {
    return res.status(400).json({ error: 'Plaid did not return an account to connect.' });
  }
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/plaid/accounts`, {
      method: 'POST', body: { publicToken, accountId }
    }));
  } catch (error) { next(error); }
});

app.get('/api/data/notifications', requireCustomer, async (req, res, next) => {
  try {
    res.json(notificationSummaries(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/notifications`)));
  } catch (error) { next(error); }
});

app.get('/api/data/transactions', requireCustomer, async (req, res, next) => {
  try {
    const slotGuid = req.query.slotGuid;
    if (slotGuid && !validGuid(slotGuid)) return res.status(400).json({ error: 'Invalid vault identifier.' });
    if (slotGuid) {
      const [transactions, memos] = await Promise.all([
        backendFetch(req, `/slots/${encodeURIComponent(slotGuid)}/transactions?filter=slotGuid[eq]'${encodeURIComponent(slotGuid)}'[and]includeInBalance[eq]1&orderBy=TransactionDateTime%20DESC`),
        backendFetch(req, `/slots/${encodeURIComponent(slotGuid)}/memos`).catch(() => [])
      ]);
      return res.json(mergeSlotMemos(listFrom(unwrapBackendData(transactions)), listFrom(unwrapBackendData(memos))));
    }
    const vaultResponse = await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/slots?calculateSlotBalances=true`);
    const vaults = activeSlots(vaultResponse);
    const batches = await Promise.all(vaults.slice(0, 12).map(async vault => {
      const id = vault.slotGuid || vault.guid || vault.id;
      if (!validGuid(id)) return [];
      const [transactions, memos] = await Promise.all([
        backendFetch(req, `/slots/${encodeURIComponent(id)}/transactions?filter=slotGuid[eq]'${encodeURIComponent(id)}'[and]includeInBalance[eq]1&orderBy=TransactionDateTime%20DESC`).then(listFrom),
        backendFetch(req, `/slots/${encodeURIComponent(id)}/memos`).then(listFrom).catch(() => [])
      ]);
      return mergeSlotMemos(transactions, memos);
    }));
    res.json(batches.flat());
  } catch (error) { next(error); }
});

app.get('/api/data/account/balance', requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/balance`));
  } catch (error) { next(error); }
});

app.get('/api/data/account/default-vault', requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/defaultslotguid`));
  } catch (error) { next(error); }
});

app.get('/api/data/account/limit', requireCustomer, async (req, res, next) => {
  const amount = Number(req.query.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
    return res.status(400).json({ error: 'Enter a valid amount to check.' });
  }
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/limit?amount=${encodeURIComponent(amount)}`));
  } catch (error) { next(error); }
});

app.get('/api/data/cards', requireCustomer, async (req, res, next) => {
  const customerGuid = encodeURIComponent(req.session.customerGuid);
  try {
    const [cards, canCreate, approval] = await Promise.all([
      backendFetch(req, `/customers/${customerGuid}/cards`),
      backendFetch(req, `/customers/${customerGuid}/cards/canCreate`).catch(() => null),
      backendFetch(req, `/customers/${customerGuid}/cards/approval`).catch(() => null)
    ]);
    res.json({ cards: listFrom(unwrapBackendData(cards)), canCreate, approval });
  } catch (error) { next(error); }
});

app.post('/api/data/cards', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { slotGuid, physicalCard = false } = req.body || {};
  if (!validGuid(slotGuid) || typeof physicalCard !== 'boolean') {
    return res.status(400).json({ error: 'Choose a valid spending vault.' });
  }
  try {
    const customerGuid = encodeURIComponent(req.session.customerGuid);
    const [slotResponse, customerResponse] = await Promise.all([
      backendFetch(req, `/customers/${customerGuid}/slots?calculateSlotBalances=true`),
      backendFetch(req, '/customers?calculateSlotBalances=true')
    ]);
    const slots = activeSlots(slotResponse);
    const customerData = unwrapBackendData(customerResponse) || {};
    const customer = (Array.isArray(customerData) ? customerData.find(item => item.customerGuid === req.session.customerGuid) : customerData.individual) || customerData;
    const slot = slots.find(item => String(item.slotGuid || '').toLowerCase() === slotGuid.toLowerCase());
    if (!slot) {
      return res.status(404).json({ error: 'Vault not found.' });
    }
    if (String(slot.slotTypeGuid || '').toLowerCase() !== spendingSlotTypeGuid.toLowerCase()) return res.status(400).json({ error: 'Cards can only be requested for your spending vault.' });
    const financialInstitutionGuid = customer.financialInstitutionGuid;
    const financialInstitutionBrandGuid = customer.financialInstitutionBrandGuid;
    if (!validGuid(financialInstitutionGuid) || !validGuid(financialInstitutionBrandGuid)) return res.status(409).json({ error: 'Elevault has not provided the card issuer details for this account.' });
    res.status(201).json(await backendFetch(req, `/customers/${customerGuid}/cards`, {
      method: 'POST',
      body: {
        financialInstitutionGuid,
        financialInstitutionBrandGuid,
        slotGuid,
        physicalCard,
        customerGuid: req.session.customerGuid
      }
    }));
  } catch (error) { next(error); }
});

app.put('/api/data/cards/:cardGuid/activate', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  if (!validGuid(req.params.cardGuid)) return res.status(400).json({ error: 'Invalid card identifier.' });
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/cards/${encodeURIComponent(req.params.cardGuid)}/activate`, { method: 'PUT' }));
  } catch (error) { next(error); }
});

app.delete('/api/data/cards/:cardGuid/status', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  if (!validGuid(req.params.cardGuid)) return res.status(400).json({ error: 'Invalid card identifier.' });
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/cards/${encodeURIComponent(req.params.cardGuid)}/status`, { method: 'DELETE' }));
  } catch (error) { next(error); }
});

app.put('/api/data/cards/:cardGuid/pin', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const pin = typeof req.body === 'string' ? req.body : '';
  if (!validGuid(req.params.cardGuid) || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'Enter a 4 digit PIN.' });
  }
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/cards/${encodeURIComponent(req.params.cardGuid)}/pin`, { method: 'PUT', body: pin, rawBody: true }));
  } catch (error) { next(error); }
});

app.get('/api/data/documents/statements', requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/documents/statements`));
  } catch (error) { next(error); }
});

app.get('/api/data/documents/taxes', requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/documents/taxes`));
  } catch (error) { next(error); }
});

app.get('/api/data/documents/taxes/:year', requireCustomer, async (req, res, next) => {
  if (!/^\d{4}$/.test(req.params.year)) return res.status(400).json({ error: 'Invalid tax year.' });
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/documents/taxes/${encodeURIComponent(req.params.year)}`));
  } catch (error) { next(error); }
});

app.get('/api/data/documents/taxes/:year/:documentId', requireCustomer, async (req, res, next) => {
  if (!/^\d{4}$/.test(req.params.year) || !validGuid(req.params.documentId)) return res.status(400).json({ error: 'Invalid tax document.' });
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/documents/taxes/${encodeURIComponent(req.params.year)}/${encodeURIComponent(req.params.documentId)}`));
  } catch (error) { next(error); }
});

app.get('/api/data/interest/last', requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/interest/last`));
  } catch (error) { next(error); }
});

app.get('/api/data/interest', requireCustomer, async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const pageNumber = Number(req.query.pageNumber || 1);
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 1000) {
    return res.status(400).json({ error: 'Choose a valid date range and page.' });
  }
  try {
    const query = new URLSearchParams({ startDate, endDate, pageNumber: String(pageNumber) });
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/interest?${query}`));
  } catch (error) { next(error); }
});

app.get('/api/data/messages', requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/messages`));
  } catch (error) { next(error); }
});

app.put('/api/data/messages/read', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/messages`, { method: 'PUT', body: req.body || {} }));
  } catch (error) { next(error); }
});

app.put('/api/data/messages/read-all', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/messages/readAll`, { method: 'PUT', body: req.body || {} }));
  } catch (error) { next(error); }
});

app.delete('/api/data/messages', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/messages`, { method: 'DELETE' }));
  } catch (error) { next(error); }
});

app.put('/api/data/notification-preferences/:channel', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  if (!['email', 'push'].includes(req.params.channel) || typeof req.body?.enabled !== 'boolean') {
    return res.status(400).json({ error: 'Choose a valid notification preference.' });
  }
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/notifications/${req.params.channel}`, { method: 'PUT', body: req.body }));
  } catch (error) { next(error); }
});

app.get('/api/data/notification-preferences', requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/notifications`));
  } catch (error) { next(error); }
});

app.get('/api/data/agreements', requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/agreements`));
  } catch (error) { next(error); }
});

app.get('/api/data/profile', requireCustomer, async (req, res, next) => {
  try {
    res.json(unwrapBackendData(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}`)));
  } catch (error) { next(error); }
});

app.post('/api/data/profile/image', ensureSameOrigin, requireCustomer, profileImageUpload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a PNG, JPEG, or WebP image up to 5 MB.' });
  try {
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'image');
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/images`, { method: 'POST', body: form }));
  } catch (error) { next(error); }
});

app.put('/api/data/profile/email', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (req.session.verifiedContactUpdate?.email !== email.toLowerCase()) return res.status(403).json({ error: 'Verify this email address before updating your profile.' });
  try {
    const individual = await customerIndividual(req);
    const result = await backendFetch(req, `/customers/${encodeURIComponent(individual.individualGuid)}/email`, { method: 'PUT', body: { emailAddress: email } });
    delete req.session.verifiedContactUpdate.email;
    res.json(result);
  } catch (error) { next(error); }
});

app.post('/api/data/profile/contact-availability', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const channel = req.body?.channel;
  const value = typeof req.body?.value === 'string' ? req.body.value.trim() : '';
  if (!['email', 'mobile'].includes(channel) || !value) return res.status(400).json({ error: 'Enter a valid contact value.' });
  if (channel === 'email' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const mobile = value.replace(/[^\d]/g, '');
  if (channel === 'mobile' && !/^\d{10,15}$/.test(mobile)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  try {
    const query = channel === 'email' ? `email=${encodeURIComponent(value)}` : `mobile=${encodeURIComponent(mobile)}`;
    const response = await backendFetch(req, `/brands/${brandGuid}/${channel}/?${query}`, { method: 'HEAD', returnResponse: true });
    if (response.status !== 204) return res.status(409).json({ error: channel === 'email' ? 'That email address is already in use.' : 'That phone number is already in use.' });
    res.json({ available: true });
  } catch (error) { next(error); }
});

app.post('/api/data/profile/contact-code/:channel', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { channel } = req.params;
  const value = typeof req.body?.value === 'string' ? req.body.value.trim() : '';
  if (!['email', 'mobile'].includes(channel) || !value) return res.status(400).json({ error: 'Enter a valid contact value.' });
  if (channel === 'email' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const mobile = value.replace(/[^\d]/g, '');
  if (channel === 'mobile' && !/^\d{10,15}$/.test(mobile)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (req.method === 'PUT' && !code) return res.status(400).json({ error: 'Enter the verification code.' });
  try {
    const emailChannel = channel === 'email';
    const endpoint = `/verifications/${emailChannel ? 'email' : 'sms'}`;
    const body = emailChannel
      ? { emailAddress: value, ...(req.method === 'POST' ? { brandGuid } : {}), ...(code ? { code } : {}) }
      : { to: `+1${mobile}`, ...(code ? { code } : {}) };
    const result = await backendFetch(req, endpoint, { method: req.method, body });
    if (req.method === 'PUT' && (result?.verified === true || result?.valid === true)) {
      req.session.verifiedContactUpdate ||= {};
      req.session.verifiedContactUpdate[channel] = emailChannel ? value.toLowerCase() : mobile;
    }
    res.json(result);
  } catch (error) { next(error); }
});

app.put('/api/data/profile/mobile', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const mobile = typeof req.body?.mobile === 'string' ? req.body.mobile.replace(/[^\d+]/g, '') : '';
  if (!/^\+?\d{10,15}$/.test(mobile)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  if (req.session.verifiedContactUpdate?.mobile !== mobile.replace(/\D/g, '')) return res.status(403).json({ error: 'Verify this phone number before updating your profile.' });
  try {
    const individual = await customerIndividual(req);
    const result = await backendFetch(req, `/customers/${encodeURIComponent(individual.individualGuid)}/mobile?mobile=${encodeURIComponent(mobile)}`, { method: 'PUT' });
    delete req.session.verifiedContactUpdate.mobile;
    res.json(result);
  } catch (error) { next(error); }
});

app.post('/api/data/password/reset-code', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const emailAddress = typeof req.body?.emailAddress === 'string' ? req.body.emailAddress.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    res.json(await backendFetch(req, '/verifications/email', { method: 'POST', body: { emailAddress } }));
  } catch (error) { next(error); }
});

app.put('/api/data/password/verify-code', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const emailAddress = typeof req.body?.emailAddress === 'string' ? req.body.emailAddress.trim() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!emailAddress || !code) return res.status(400).json({ error: 'Enter the email and verification code.' });
  try {
    res.json(await backendFetch(req, '/verifications/email', { method: 'PUT', body: { emailAddress, code } }));
  } catch (error) { next(error); }
});

app.put('/api/data/password', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { emailAddress, code, password } = req.body || {};
  if (typeof emailAddress !== 'string' || typeof code !== 'string' || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Enter your email, verification code, and a password of at least 8 characters.' });
  }
  try {
    res.json(await backendFetch(req, '/accounts/password', { method: 'PUT', body: { emailAddress, code, password } }));
  } catch (error) { next(error); }
});

app.get('/api/data/sharing/relationships/search', requireCustomer, async (req, res, next) => {
  const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';
  const mobile = typeof req.query.mobile === 'string' ? req.query.mobile.replace(/[^\d]/g, '') : '';
  if (Boolean(email) === Boolean(mobile) || (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) || (mobile && !/^\d{10,15}$/.test(mobile))) {
    return res.status(400).json({ error: 'Enter one valid email address or mobile number.' });
  }
  try {
    const path = email
      ? `/customers/snippets/email/?email=${encodeURIComponent(email)}`
      : `/customers/snippets/mobile/?mobile=${encodeURIComponent(mobile)}`;
    res.json(await backendFetch(req, path));
  } catch (error) { next(error); }
});

app.post('/api/data/sharing/relationships', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { toIndividualGuid, toIndividualName, toIndividualImageUrl = '' } = req.body || {};
  if (!validGuid(toIndividualGuid) || typeof toIndividualName !== 'string' || !toIndividualName.trim() || toIndividualName.length > 120 || typeof toIndividualImageUrl !== 'string' || toIndividualImageUrl.length > 2048) {
    return res.status(400).json({ error: 'Choose a valid Elevault contact.' });
  }
  try {
    const individual = await customerIndividual(req);
    const individualGuid = individual.individualGuid;
    res.status(201).json(await backendFetch(req, `/customers/${encodeURIComponent(individualGuid)}/relationships`, {
      method: 'POST', body: {
        toIndividualGuid,
        toIndividualName: toIndividualName.trim(),
        toIndividualImageUrl,
        active: true,
        individualGuid,
        relationshipType: 'Friend',
        toRelationshipType: 'Friend'
      }
    }));
  } catch (error) { next(error); }
});

app.put('/api/data/sharing/requests/:accept', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  if (!['true', 'false'].includes(req.params.accept) || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid vault-share request.' });
  }
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/slotshares/${req.params.accept}`, {
      method: 'PUT', body: req.body, headers: { 'content-type': 'application/json-patch+json' }
    }));
  } catch (error) { next(error); }
});

app.delete('/api/data/sharing/relationships/:relationshipGuid', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  if (!validGuid(req.params.relationshipGuid)) return res.status(400).json({ error: 'Invalid relationship identifier.' });
  try {
    res.json(await backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/relationships/${encodeURIComponent(req.params.relationshipGuid)}`, { method: 'DELETE' }));
  } catch (error) { next(error); }
});

app.get('/api/data/sharing', requireCustomer, async (req, res, next) => {
  try {
    const [sharedWithMe, relationships] = await Promise.all([
      backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/sharedWithMe`),
      backendFetch(req, `/customers/${encodeURIComponent(req.session.customerGuid)}/relationshipsnippets`).catch(() => [])
    ]);
    res.json({ sharedWithMe, relationships });
  } catch (error) { next(error); }
});

app.get('/api/data/vaults/:slotGuid/shares', requireCustomer, async (req, res, next) => {
  if (!validGuid(req.params.slotGuid)) return res.status(400).json({ error: 'Invalid vault identifier.' });
  try {
    res.json(await backendFetch(req, `/slots/${encodeURIComponent(req.params.slotGuid)}/sharedwith`));
  } catch (error) { next(error); }
});

app.delete('/api/data/vaults/:slotGuid/shares/:shareId', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  if (!validGuid(req.params.slotGuid) || !validGuid(req.params.shareId)) return res.status(400).json({ error: 'Invalid sharing identifier.' });
  try {
    res.json(await backendFetch(req, `/slots/${encodeURIComponent(req.params.slotGuid)}/sharedwith/${encodeURIComponent(req.params.shareId)}`, { method: 'DELETE' }));
  } catch (error) { next(error); }
});

app.get('/api/data/transactions/:transactionGuid/metadata', requireCustomer, async (req, res, next) => {
  if (!validGuid(req.params.transactionGuid)) return res.status(400).json({ error: 'Invalid transaction identifier.' });
  try {
    res.json(await backendFetch(req, `/transactions/${encodeURIComponent(req.params.transactionGuid)}/metadata`));
  } catch (error) { next(error); }
});

app.get('/api/data/transaction-types', requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/brands/${brandGuid}/transactiontypes`));
  } catch (error) { next(error); }
});

app.get('/api/data/slot-types', requireCustomer, async (req, res, next) => {
  try {
    res.json(await backendFetch(req, `/brands/${brandGuid}/slottypes`));
  } catch (error) { next(error); }
});

app.get('/api/data/transaction-hold', requireCustomer, async (req, res, next) => {
  const { slotGuid, linkAccountId } = req.query;
  const amount = Number(req.query.amount);
  if (!validGuid(slotGuid) || !validGuid(linkAccountId) || !Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
    return res.status(400).json({ error: 'Choose a valid destination, linked account, and amount.' });
  }
  try {
    const query = new URLSearchParams({ customerGuid: req.session.customerGuid, slotGuid, transactionAmount: String(amount), linkAccountId });
    res.json(await backendFetch(req, `/transactions/hold?${query}`));
  } catch (error) { next(error); }
});

app.post('/api/data/transfers', ensureSameOrigin, requireCustomer, async (req, res, next) => {
  const { mode, sourceId, destinationId, amount } = req.body || {};
  const transferAmount = Number(amount);
  if (!['account-to-vault', 'vault-to-account', 'vault-to-vault'].includes(mode) ||
      !validGuid(sourceId) || !validGuid(destinationId) ||
      !Number.isFinite(transferAmount) || transferAmount <= 0 || transferAmount > 10000000 ||
      (mode === 'vault-to-vault' && sourceId.toLowerCase() === destinationId.toLowerCase())) {
    return res.status(400).json({ error: 'Choose valid transfer sources and destinations and enter a positive amount.' });
  }
  const customerGuid = req.session.customerGuid;
  const encodedCustomerGuid = encodeURIComponent(customerGuid);
  try {
    const [customerResponse, slotsResponse, accountsResponse] = await Promise.all([
      backendFetch(req, `/customers/${encodedCustomerGuid}`),
      backendFetch(req, `/customers/${encodedCustomerGuid}/slots?calculateSlotBalances=true`),
      backendFetch(req, `/customers/${encodedCustomerGuid}/linkedAccounts`)
    ]);
    const customer = unwrapBackendData(customerResponse) || {};
    const slots = activeSlots(slotsResponse);
    const accounts = listFrom(accountsResponse);
    const findSlot = id => slots.find(slot => String(slot.slotGuid || '').toLowerCase() === id.toLowerCase());
    const findAccount = id => accounts.find(account =>
      String(account.id || '').toLowerCase() === id.toLowerCase() &&
      ['accepted', 'connected'].includes(String(account.status || '').toLowerCase())
    );

    if (mode === 'account-to-vault' || mode === 'vault-to-account') {
      const fromAccount = mode === 'account-to-vault';
      const account = findAccount(fromAccount ? sourceId : destinationId);
      const slot = findSlot(fromAccount ? destinationId : sourceId);
      if (!account || !slot) return res.status(404).json({ error: 'The selected linked account or vault is no longer available.' });
      const signedAmount = fromAccount ? transferAmount : -transferAmount;
      const result = await backendFetch(req, `/customers/${encodedCustomerGuid}/linkedaccounts/transfer`, {
        method: 'POST',
        body: {
          customerLinkAccountACHID: account.id,
          slotGuid: slot.slotGuid,
          amount: signedAmount,
          transactionGuid: '',
          id: '',
          error: false,
          errorMessage: ''
        }
      });
      return res.json(result);
    }

    const source = findSlot(sourceId);
    const destination = findSlot(destinationId);
    if (!source || !destination) return res.status(404).json({ error: 'The selected vault is no longer available.' });
    const alias = customer.alias || [customer.firstName, customer.lastName].filter(Boolean).join(' ');
    const note = 'N/A';
    const result = await backendFetch(req, `/customers/${encodedCustomerGuid}/transfers`, {
      method: 'POST',
      body: {
        fromAlias: alias,
        fromCustomerGuid: customerGuid,
        fromCustomerAlias: alias,
        transferAmount,
        transferNote: note,
        fromSlotGuid: source.slotGuid,
        fromSlotDescription: source.description,
        type: 'Save',
        transferToSlotList: [{
          transferNote: note,
          transferToSlotNote: note,
          transferToAmount: transferAmount,
          transferToCustomerGuid: customerGuid,
          transferToAlias: alias,
          transferToSlotGuid: destination.slotGuid,
          transferToSlotDescription: destination.description
        }]
      }
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

app.get(/^\/(?:dashboard|vaults|activity|accounts|notifications|my(?:\/[^/]+)?|vault\/[^/]+)\/?$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error instanceof BackendError ? error.status : 500;
  if (status >= 500 && !(error instanceof BackendError)) console.error(error);
  res.status(status).json({ error: error.message || 'Unexpected server error.', code: error.code || 'SERVER_ERROR' });
});

app.listen(port, () => {
  console.log(`Elevault web is listening on http://localhost:${port}`);
});