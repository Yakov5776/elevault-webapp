const crypto = require('node:crypto');

const customerGuid = 'c91b38ea-8d93-4ae5-9519-5bb0fa283d21';
const mainVaultGuid = '9d96c23b-bbfd-4c71-8e0d-352525013455';
const savingsVaultGuid = '50120fab-095d-40b5-91c0-b9422b1e9d47';
const emergencyVaultGuid = '2f9ba607-ddfd-4443-88bf-74f727f35f65';
const accountGuid = 'dbdf8b6e-6ebc-47ee-a1e9-f986415cff91';
const mainTypeGuid = 'FE446A6F-ECCD-4F56-9088-9F4111353BE9';
const savingsTypeGuid = 'DB5ADD65-4B17-40E5-996F-0D0E0471312C';
const emergencyTypeGuid = 'D059A31A-D58C-44EE-837E-809C9536F352';
const annualInterestRate = 0.045;
const accruedInterestTypeGuid = '4402b8b9-f81d-4d5b-a9a5-fb1cfcd530e8';
const interestPaidTypeGuid = '4402b8b9-9876-5432-1098-fb1cfcd530e8';
const achCreditTypeGuid = '24974641-1369-4ece-b70b-6987f2d3235e';
const achDebitTypeGuid = '6a8217e8-c90a-4e17-81fe-e3b20b6271b9';
const linkedCreditTypeGuid = '6a8217e8-1234-1369-81fe-e3b20b6271b9';
const linkedDebitTypeGuid = '24974641-d019-4ece-b70b-6987f2d3235e';
const cardDebitTypeGuid = 'e0835b60-47fc-435b-a128-6e5e7cadac0f';
const vaultTransferFromTypeGuid = 'b52e210d-5830-4e6a-bff0-595558e87469';
const vaultTransferTypeGuid = '7c34338c-2c6a-40da-98a3-39b4845e9527';
const transactionIconBaseUrl = 'https://sbbds61stprod.blob.core.windows.net/89fd4a1a-6e1e-4533-bcc3-571f80f2a0f4/s61media';
const transactionIcon = guid => `${transactionIconBaseUrl}/${guid}.png`;
const transactionCategories = {
  [accruedInterestTypeGuid]: { transactionTypeGuid: accruedInterestTypeGuid, transactionTypeCode: 'DOPS-BOPS-AINT', domain: 'Deposit Operations', family: 'Batch Operations', subFamily: 'Accrued Interest', name: 'Accrued Interest', description: 'Accrued Interest', imageUrl: transactionIcon(accruedInterestTypeGuid), shortSmartLabel: 'Interest~Accrued', longSmartLabel: 'You~have~accrued~%TransactionAmountFormatted%~in~interest' },
  [interestPaidTypeGuid]: { transactionTypeGuid: interestPaidTypeGuid, transactionTypeCode: 'DOPS-BOPS-PINT', domain: 'Deposit Operations', family: 'Batch Operations', subFamily: 'Paid Interest', name: 'Interest Paid', description: 'Interest Paid', imageUrl: transactionIcon(interestPaidTypeGuid), shortSmartLabel: 'Interest Paid', longSmartLabel: 'You~have~earned~%TransactionAmountFormatted%~in~interest' },
  [achCreditTypeGuid]: { transactionTypeGuid: achCreditTypeGuid, transactionTypeCode: 'RPMT-CACH-WEBC', domain: 'Payments Received', family: 'Customer ACH', subFamily: 'Consumer WEB - Credit', name: 'S61 Credit - ACH Incoming/Received', description: 'ACH deposit', imageUrl: transactionIcon(achCreditTypeGuid), shortSmartLabel: 'Deposit', longSmartLabel: '%TransactionAmountFormatted%~deposited~from~%Name%' },
  [achDebitTypeGuid]: { transactionTypeGuid: achDebitTypeGuid, transactionTypeCode: 'RPMT-CACH-PPDD', domain: 'Payments Received', family: 'Customer ACH', subFamily: 'Consumer PPD - Debit', name: 'S61 Debit - ACH Incoming/Received', description: 'ACH withdrawal', imageUrl: transactionIcon(achDebitTypeGuid), shortSmartLabel: 'Withdrawal', longSmartLabel: '%TransactionAmountABSFormatted%~withdrawn~by~%Name%' },
  [linkedCreditTypeGuid]: { transactionTypeGuid: linkedCreditTypeGuid, transactionTypeCode: 'IPMT-CACH-WEBC', domain: 'Payments Issued', family: 'Customer ACH', subFamily: 'Consumer WEB - Credit', name: 'S61 Credit - ACH Outgoing/Issued', description: 'Linked account deposit', imageUrl: transactionIcon(linkedCreditTypeGuid), shortSmartLabel: 'Deposited from linked account', longSmartLabel: 'You~have~deposited~%TransactionAmountFormatted%~from~Linked~Account~%Name%' },
  [linkedDebitTypeGuid]: { transactionTypeGuid: linkedDebitTypeGuid, transactionTypeCode: 'IPMT-CACH-WEBD', domain: 'Payments Issued', family: 'Customer ACH', subFamily: 'Consumer WEB - Debit', name: 'S61 Debit - ACH Outgoing/Issued', description: 'Linked account withdrawal', imageUrl: transactionIcon(linkedDebitTypeGuid), shortSmartLabel: 'Withdrawn to linked account', longSmartLabel: 'You~have~withdrawn~%TransactionAmountABSFormatted%~to~Linked~Account~%Name%' },
  [cardDebitTypeGuid]: { transactionTypeGuid: cardDebitTypeGuid, transactionTypeCode: 'IPMT-CCRD-WTHD', domain: 'Payments Issued', family: 'Card', subFamily: 'Card Debit', name: 'Card Debit', description: 'Debit card purchase', imageUrl: transactionIcon(cardDebitTypeGuid), shortSmartLabel: 'Card purchase', longSmartLabel: 'Purchase~at~%Name%' },
  [vaultTransferFromTypeGuid]: { transactionTypeGuid: vaultTransferFromTypeGuid, transactionTypeCode: 'CAMT-EUUI-SAVE', domain: 'Cash Management', family: 'End User Initiated', subFamily: 'Save', name: 'User Save From', description: 'Vault transfer', imageUrl: transactionIcon(vaultTransferFromTypeGuid), shortSmartLabel: 'Transfer from vault', longSmartLabel: 'Saved~from~%Name%' },
  [vaultTransferTypeGuid]: { transactionTypeGuid: vaultTransferTypeGuid, transactionTypeCode: 'CAMT-EUUI-SAVE', domain: 'Cash Management', family: 'End User Initiated', subFamily: 'Save', name: 'User Save To', description: 'Vault transfer', imageUrl: transactionIcon(vaultTransferTypeGuid), shortSmartLabel: 'Transfer', longSmartLabel: 'Transfer~to~%Name%' }
};
const transactionTypes = { s61Type: 'TransactionTypes', transactionTypeList: Object.values(transactionCategories) };

const customer = {
  customerGuid,
  individualGuid: '7b4ae51a-4021-499e-8715-f9f3ca5fa62a',
  alias: 'Yakov Pie',
  firstName: 'Yakov',
  lastName: 'Pie',
  email: 'yakov.pie@example.com',
  mobilePhone: '5558675309',
  mobilePhoneFormatted: '(555) 867-5309',
  imageUrl: ''
};
const linkedAccountTransactionName = [customer.lastName, customer.firstName].filter(Boolean).join(' ').toUpperCase();

const vaults = [
  { slotGuid: mainVaultGuid, description: 'Main Vault', slotTypeGuid: mainTypeGuid, slotAvailableBalance: 2400, slotBalance: 2400, slotGoal: null, deleted: false, slotOwner: true, sharedSlot: false, createdDate: '2026-01-12T15:00:00.000Z' },
  { slotGuid: savingsVaultGuid, description: 'Summer trip', slotTypeGuid: savingsTypeGuid, slotAvailableBalance: 1260, slotBalance: 1260, slotGoal: { amount: 2500, targetDate: '2027-06-01T00:00:00.000Z' }, deleted: false, slotOwner: true, sharedSlot: false, createdDate: '2026-02-03T15:00:00.000Z' },
  { slotGuid: emergencyVaultGuid, description: 'Emergency fund', slotTypeGuid: emergencyTypeGuid, slotAvailableBalance: 3200, slotBalance: 3200, slotGoal: { amount: 6000, targetDate: '2027-12-31T00:00:00.000Z' }, deleted: false, slotOwner: true, sharedSlot: false, createdDate: '2026-03-18T15:00:00.000Z' }
];

const linkedAccounts = [{
  id: accountGuid,
  name: 'Sample checking',
  accountName: 'Sample checking',
  financialInstitutionName: 'Apple Bank',
  accountType: 'Checking',
  accountNumber: '•••• 4821',
  status: 'Connected',
  verified: true
}];

let transactionId = 6200000;
function demoTransaction({ daysAgo = 0, minutesAgo = 0, transactionDateTime, slotGuid = mainVaultGuid, amount, typeGuid, name = '', shortSmartLabel, longSmartLabel }) {
  const category = transactionCategories[typeGuid];
  const value = Number(amount);
  const absoluteAmount = Math.abs(value);
  const absoluteFormatted = absoluteAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const displayAmount = `$${absoluteFormatted}`;
  const amountFormatted = value < 0 ? `($${absoluteFormatted})` : displayAmount;
  const occurredAt = transactionDateTime || new Date(Date.now() - daysAgo * 86400000 - minutesAgo * 60000).toISOString();
  const applyLabels = label => label.replaceAll('{amount}', displayAmount).replaceAll('{signedAmount}', amountFormatted).replaceAll('{name}', name);
  return {
    tableName: 'Transactions',
    id: transactionId++,
    transactionGuid: crypto.randomUUID(),
    financialInstitutionGuid: 'bb33c6e1-9a64-42bf-9283-b65d545f6cc3',
    financialInstitutionName: 'Community Bank',
    financialInstitutionBrandGuid: '89fd4a1a-6e1e-4533-bcc3-571f80f2a0f4',
    financialInstitutionBrandName: 'Elevault Demo',
    transactionSequence: 1,
    transactionSetGuid: crypto.randomUUID(),
    customerGuid,
    portfolioGuid: '7a71f74b-3640-4b51-a649-72144fd150fe',
    slotGuid,
    transactionAmountDecimal: value,
    transactionAmount: value,
    transactionAmountFormatted: amountFormatted,
    transactionAmountABS: absoluteAmount,
    transactionAmountABSFormatted: displayAmount,
    transactionTypeGuid: typeGuid,
    transactionType: category.name,
    transactionTypeCode: category.transactionTypeCode,
    transactionTypeDomain: category.domain,
    transactionTypeFamily: category.family,
    transactionTypeSubFamily: category.subFamily,
    transactionDateTime: occurredAt,
    shortSmartLabel: applyLabels(shortSmartLabel),
    longSmartLabel: applyLabels(longSmartLabel),
    forcePay: false,
    reversed: false,
    includeInPriorYear: false,
    includeInBalance: true,
    appGuid: 'cba676cb-bc87-4fe9-bbfe-27d57f1ae2b8',
    createdDate: occurredAt,
    createdBy: '',
    matchingKey: '',
    error: false,
    errorMessage: null,
    referenceData: '',
    customerPayload: '',
    runningBalance: 0,
    note: ''
  };
}

const transactions = [
  demoTransaction({ minutesAgo: 2, amount: -42.18, typeGuid: achDebitTypeGuid, name: 'CITY WATER SERVICES', shortSmartLabel: '{amount} withdrawn by {name}', longSmartLabel: '{amount} withdrawn by {name}' }),
  demoTransaction({ minutesAgo: 4, amount: 0.24, typeGuid: achCreditTypeGuid, name: 'NORTHSTAR FINANCIAL', shortSmartLabel: '{amount} deposited from {name}', longSmartLabel: '{amount} deposited from {name}' }),
  demoTransaction({ minutesAgo: 6, amount: 0.19, typeGuid: achCreditTypeGuid, name: 'COMMUNITY PAYMENTS', shortSmartLabel: '{amount} deposited from {name}', longSmartLabel: '{amount} deposited from {name}' }),
  demoTransaction({ minutesAgo: 95, amount: -36.42, typeGuid: cardDebitTypeGuid, name: 'WILLOW MARKET', shortSmartLabel: 'Purchase at {name}', longSmartLabel: 'You spent {amount} at {name}' }),
  demoTransaction({ daysAgo: 1, minutesAgo: 240, amount: 2180, typeGuid: linkedCreditTypeGuid, name: linkedAccountTransactionName, shortSmartLabel: 'Deposited from Linked Account {name}', longSmartLabel: 'You have deposited {amount} from Linked Account {name}' }),
  demoTransaction({ daysAgo: 2, minutesAgo: 310, amount: -84.63, typeGuid: linkedDebitTypeGuid, name: linkedAccountTransactionName, shortSmartLabel: 'Withdrawn to Linked Account {name}', longSmartLabel: 'You have withdrawn {amount} to Linked Account {name}' }),
  demoTransaction({ daysAgo: 3, minutesAgo: 430, amount: -68.17, typeGuid: achDebitTypeGuid, name: 'EVERGREEN ELECTRIC', shortSmartLabel: '{amount} withdrawn by {name}', longSmartLabel: '{amount} withdrawn by {name}' }),
  demoTransaction({ daysAgo: 4, minutesAgo: 180, amount: -53.28, typeGuid: cardDebitTypeGuid, name: 'HARBOR STREET CAFE', shortSmartLabel: 'Purchase at {name}', longSmartLabel: 'You spent {amount} at {name}' }),
  demoTransaction({ daysAgo: 6, minutesAgo: 300, amount: -150, typeGuid: vaultTransferFromTypeGuid, name: 'Summer trip', shortSmartLabel: 'Saved {amount} to {name}', longSmartLabel: 'You saved {amount} to {name}' }),
  demoTransaction({ daysAgo: 6, minutesAgo: 300, amount: 150, typeGuid: vaultTransferTypeGuid, slotGuid: savingsVaultGuid, name: 'Summer trip', shortSmartLabel: 'Saved {amount} to {name}', longSmartLabel: 'You saved {amount} to {name}' }),
  demoTransaction({ daysAgo: 8, minutesAgo: 120, amount: 2475, typeGuid: linkedCreditTypeGuid, name: linkedAccountTransactionName, shortSmartLabel: 'Deposited from Linked Account {name}', longSmartLabel: 'You have deposited {amount} from Linked Account {name}' }),
  demoTransaction({ daysAgo: 9, minutesAgo: 270, amount: -129.74, typeGuid: linkedDebitTypeGuid, name: linkedAccountTransactionName, shortSmartLabel: 'Withdrawn to Linked Account {name}', longSmartLabel: 'You have withdrawn {amount} to Linked Account {name}' }),
  demoTransaction({ daysAgo: 11, minutesAgo: 360, amount: -24.91, typeGuid: cardDebitTypeGuid, name: 'NORTH LOOP PHARMACY', shortSmartLabel: 'Purchase at {name}', longSmartLabel: 'You spent {amount} at {name}' }),
  demoTransaction({ daysAgo: 14, minutesAgo: 210, amount: 1960, typeGuid: linkedCreditTypeGuid, name: linkedAccountTransactionName, shortSmartLabel: 'Deposited from Linked Account {name}', longSmartLabel: 'You have deposited {amount} from Linked Account {name}' })
];

const dailyInterestTransactions = [];
const paidInterestTransactions = [];
const dailyInterestRate = Math.pow(1 + annualInterestRate, 1 / 365) - 1;
const interestVault = vaults.find(vault => vault.slotGuid === mainVaultGuid);
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const todayKey = today.toISOString().slice(0, 10);
function applyCashFlow(transaction) {
  const vault = vaults.find(item => item.slotGuid === transaction.slotGuid);
  if (!vault) return;
  vault.slotAvailableBalance = Math.round((vault.slotAvailableBalance + transaction.transactionAmountDecimal) * 100) / 100;
  vault.slotBalance = vault.slotAvailableBalance;
}

for (let daysAgo = 30; daysAgo >= 1; daysAgo -= 1) {
  const transactionDate = new Date(today);
  transactionDate.setUTCDate(transactionDate.getUTCDate() - daysAgo);
  transactionDate.setUTCHours(23, 59, 59, 999);
  const dateKey = transactionDate.toISOString().slice(0, 10);
  for (const transaction of transactions) {
    if (transaction.transactionDateTime.slice(0, 10) === dateKey) applyCashFlow(transaction);
  }
  const balance = vaults.filter(vault => !vault.deleted).reduce((total, vault) => total + vault.slotAvailableBalance, 0);
  const amount = Math.round(balance * dailyInterestRate * 100) / 100;
  if (amount <= 0) continue;
  interestVault.slotAvailableBalance = Math.round((interestVault.slotAvailableBalance + amount) * 100) / 100;
  interestVault.slotBalance = interestVault.slotAvailableBalance;
  const accrualDate = transactionDate.toISOString();
  const accrued = demoTransaction({
    transactionDateTime: transactionDate.toISOString(),
    amount,
    typeGuid: accruedInterestTypeGuid,
    shortSmartLabel: 'Interest Accrued',
    longSmartLabel: 'You have accrued {amount} in interest'
  });
  const accrualReversal = demoTransaction({
    transactionDateTime: accrualDate,
    amount: -amount,
    typeGuid: accruedInterestTypeGuid,
    shortSmartLabel: 'Interest Accrued',
    longSmartLabel: 'You have accrued {signedAmount} in interest'
  });
  const paid = demoTransaction({
    transactionDateTime: accrualDate,
    amount,
    typeGuid: interestPaidTypeGuid,
    shortSmartLabel: 'Interest Paid',
    longSmartLabel: 'You have earned {amount} in interest'
  });
  dailyInterestTransactions.push(accrued, accrualReversal);
  paidInterestTransactions.push(paid);
}
for (const transaction of transactions) {
  if (transaction.transactionDateTime.slice(0, 10) === todayKey) applyCashFlow(transaction);
}
transactions.push(...paidInterestTransactions, ...dailyInterestTransactions);

const slotTypes = {
  s61Type: 'SlotTypes',
  slotTypeList: [
    { slotTypeGuid: mainTypeGuid, name: 'Spending', description: 'Main Vault', monetary: true },
    { slotTypeGuid: savingsTypeGuid, name: 'Saving', description: 'Savings Vault', monetary: true },
    { slotTypeGuid: emergencyTypeGuid, name: 'Emergency', description: 'Emergency Fund', monetary: true }
  ]
};

const profile = {
  ...customer,
  address: { addressLine1: '100 Sample Street', city: 'Springfield', state: 'IL', postalArea: '62701', country: 'USA' },
  governmentIDType: 'Driver License',
  birthDate: '1990-04-12T00:00:00.000Z'
};

const cards = [{
  id: 'bf29588d-5240-4d6a-9678-119063082dc9',
  cardGuid: 'bf29588d-5240-4d6a-9678-119063082dc9',
  cardName: 'Virtual debit card',
  maskedNumber: '•••• 1042',
  slotGuid: mainVaultGuid,
  active: true,
  status: 'Active',
  physicalCard: false
}];

const messages = {
  s61Type: 'S61Messages',
  customerGuid,
  s61MessageFolderList: [{
    s61MessageList: [{
      messageGuid: 'df731742-269a-4a8f-acf0-8c75022f71e2',
      subject: 'Welcome to your demo account',
      body: 'This sample inbox is local to demo mode.',
      enteredDateTime: '2026-09-01T12:00:00.000Z',
      read: false,
      messageTypeName: 'Alert'
    }]
  }]
};

const notifications = [{ id: '3b7180f4-cbac-4827-9496-294e27a00a8d', title: 'Your account is ready', createdAt: '2026-09-01T12:00:00.000Z', read: false }];
const interestTransaction = paidInterestTransactions.at(-1);
const notificationPreferences = { emailNotifications: true, pushNotifications: false, individualAlertList: [] };
const vaultKeys = [];

function copy(value) {
  return structuredClone(value);
}

function dashboard() {
  return {
    customer: { ok: true, data: copy(customer) },
    vaults: { ok: true, data: copy(vaults.filter(vault => !vault.deleted)) },
    linkedAccounts: { ok: true, data: copy(linkedAccounts) },
    notifications: { ok: true, data: copy(notifications) },
    interestRate: { ok: true, data: { rateValue: annualInterestRate } }
  };
}

function sendDemo(req, res) {
  const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const method = req.method;
  const route = parts.slice(1).join('/');
  const body = req.body || {};
  const findVault = id => vaults.find(vault => vault.slotGuid.toLowerCase() === String(id).toLowerCase());
  const send = value => res.json(copy(value));

  if (route === 'health' && method === 'GET') return send({ configured: true, authenticated: req.session.demoAuthenticated !== false, demoMode: true, version: require('./package.json').version });
  if (route === 'auth/request-code' && method === 'POST') {
    req.session.demoPendingLogin = true;
    return send({ result: { demo: true } });
  }
  if (route === 'auth/verify-code' && method === 'POST') {
    if (!req.session.demoPendingLogin || !String(body.code || '').trim()) return res.status(400).json({ error: 'Request a demo sign-in code and enter any verification code.' });
    req.session.demoAuthenticated = true;
    delete req.session.demoPendingLogin;
    return send({ authenticated: true });
  }
  if (route === 'auth/logout' && method === 'POST') {
    req.session.demoAuthenticated = false;
    return send({ authenticated: false });
  }

  if (route === 'data/dashboard' && method === 'GET') return send(dashboard());
  if (route === 'data/vaults' && method === 'GET') return send(vaults.filter(vault => !vault.deleted));
  if (parts[1] === 'data' && parts[2] === 'vaults' && parts.length === 5 && parts[4] === 'detail' && method === 'GET') {
    const vault = findVault(parts[3]);
    if (!vault) return res.status(404).json({ error: 'Vault not found.' });
    return send({ vault, transactions: transactions.filter(item => item.slotGuid === vault.slotGuid), vaultKeys: vaultKeys.filter(key => key.slotGuid === vault.slotGuid) });
  }
  if (parts[1] === 'data' && parts[2] === 'vaults' && parts.length === 4 && method === 'PUT') {
    const vault = findVault(parts[3]);
    if (!vault) return res.status(404).json({ error: 'Vault not found.' });
    vault.description = String(body.name || vault.description);
    vault.slotGoal = { amount: Number(body.goal) || 0, targetDate: body.dueDate ? `${body.dueDate}T00:00:00.000Z` : '' };
    return send({ updated: true });
  }
  if (route === 'data/vaults' && method === 'POST') {
    const vault = { slotGuid: crypto.randomUUID(), description: String(body.name || 'New vault'), slotTypeGuid: body.slotTypeGuid || savingsTypeGuid, slotAvailableBalance: 0, slotBalance: 0, slotGoal: body.goal ? { amount: Number(body.goal), targetDate: body.dueDate || '' } : null, deleted: false, slotOwner: true, sharedSlot: false, createdDate: new Date().toISOString() };
    vaults.push(vault);
    return res.status(201).json(copy(vault));
  }
  if (route === 'data/transactions' && method === 'GET') {
    const slotGuid = new URL(req.originalUrl, 'http://localhost').searchParams.get('slotGuid');
    return send(transactions.filter(item => !slotGuid || item.slotGuid.toLowerCase() === slotGuid.toLowerCase()).sort((left, right) => right.transactionDateTime.localeCompare(left.transactionDateTime)));
  }
  if (route === 'data/transaction-types' && method === 'GET') return send(transactionTypes);
  if (route === 'data/slot-types' && method === 'GET') return send(slotTypes);
  if (parts[1] === 'data' && parts[2] === 'transactions' && parts[4] === 'metadata' && method === 'GET') return send({ metadata: [], transactionGuid: parts[3] });
  if (route === 'data/linked-accounts' && method === 'GET') return send(linkedAccounts);
  if (route === 'data/linked-accounts/manual' && method === 'POST') {
    const account = { id: crypto.randomUUID(), name: body.name || 'Sample linked account', accountName: body.name || 'Sample linked account', accountNumber: '•••• 2211', accountType: 'Checking', status: 'Pending', verified: false };
    linkedAccounts.push(account);
    return res.status(201).json(copy(account));
  }
  if (parts[1] === 'data' && parts[2] === 'linked-accounts' && parts.length === 5 && parts[4] === 'verify' && method === 'PUT') return send({ verified: true, status: 'Connected' });
  if (parts[1] === 'data' && parts[2] === 'linked-accounts' && parts.length === 4 && method === 'DELETE') {
    const index = linkedAccounts.findIndex(account => account.id === parts[3]);
    if (index >= 0) linkedAccounts.splice(index, 1);
    return send({ deleted: true });
  }
  if (route === 'data/notifications' && method === 'GET') return send(notifications);
  if (route === 'data/notification-preferences' && method === 'GET') return send(notificationPreferences);
  if (parts[1] === 'data' && parts[2] === 'notification-preferences' && parts.length === 4 && method === 'PUT') {
    const key = parts[3] === 'email' ? 'emailNotifications' : 'pushNotifications';
    notificationPreferences[key] = body.enabled === true;
    return send({ updated: true, [key]: notificationPreferences[key] });
  }

  if (route === 'data/profile' && method === 'GET') return send(profile);
  if (route === 'data/profile/image' && method === 'POST') return send({ imageUrl: '' });
  if (route.startsWith('data/profile/') && ['POST', 'PUT'].includes(method)) return send({ verified: true, updated: true, available: true });
  if (route.startsWith('data/password/') || route === 'data/password') return send({ verified: true, updated: true });
  if (route === 'data/cards' && method === 'GET') return send({ cards, canCreate: true, approval: { status: 'Eligible' } });
  if (route === 'data/cards' && method === 'POST') {
    const card = { id: crypto.randomUUID(), cardGuid: crypto.randomUUID(), cardName: 'Demo debit card', maskedNumber: '•••• 7788', slotGuid: body.slotGuid, active: false, status: 'Inactive', physicalCard: body.physicalCard === true };
    cards.push(card);
    return res.status(201).json(copy(card));
  }
  if (parts[1] === 'data' && parts[2] === 'cards' && parts.length >= 4) {
    const card = cards.find(item => item.id === parts[3] || item.cardGuid === parts[3]);
    if (method === 'PUT' && parts[4] === 'activate' && card) Object.assign(card, { active: true, status: 'Active' });
    if (method === 'DELETE' && parts[4] === 'status') {
      const index = cards.indexOf(card);
      if (index >= 0) cards.splice(index, 1);
    }
    return send({ updated: true, active: card?.active === true });
  }
  if (route === 'data/documents/statements' && method === 'GET') return send([{ statementName: 'August 2026 statement', statementDate: 'Aug 31, 2026' }]);
  if (route === 'data/documents/taxes' && method === 'GET') return send([{ year: '2025', documentType: '1099-INT' }]);
  if (parts[1] === 'data' && parts[2] === 'documents' && parts[3] === 'taxes') return send({ year: parts[4], documentType: '1099-INT', status: 'Available' });
  if (route === 'data/interest/last' && method === 'GET') return send(interestTransaction);
  if (route === 'data/interest' && method === 'GET') {
    const params = new URL(req.originalUrl, 'http://localhost').searchParams;
    const startDate = params.get('startDate') || '';
    const endDate = params.get('endDate') || '';
    return send(paidInterestTransactions.filter(item => {
      const date = item.transactionDateTime.slice(0, 10);
      return (!startDate || date >= startDate) && (!endDate || date <= endDate);
    }).sort((left, right) => right.transactionDateTime.localeCompare(left.transactionDateTime)));
  }
  if (route === 'data/messages' && method === 'GET') return send(messages);
  if (route === 'data/messages/read-all' && method === 'PUT') {
    for (const folder of messages.s61MessageFolderList) for (const message of folder.s61MessageList) message.read = true;
    return send({ updated: true });
  }
  if (route === 'data/messages/read' && method === 'PUT') return send({ updated: true });
  if (route === 'data/messages' && method === 'DELETE') {
    messages.s61MessageFolderList.forEach(folder => { folder.s61MessageList = []; });
    return send({ deleted: true });
  }
  if (route === 'data/agreements' && method === 'GET') return send([{ name: 'Electronic communications', status: 'Accepted', version: 1 }]);
  if (route === 'data/sharing' && method === 'GET') return send({ sharedWithMe: [], relationships: [] });
  if (route.startsWith('data/sharing/') && ['GET', 'POST', 'PUT', 'DELETE'].includes(method)) return send(method === 'GET' ? [] : { updated: true });
  if (parts[1] === 'data' && parts[2] === 'vaults' && parts[4] === 'shares') return send(method === 'GET' ? [] : { deleted: true });
  if (route === 'data/account/balance' && method === 'GET') return send({ balance: vaults.reduce((sum, vault) => sum + Number(vault.slotAvailableBalance || 0), 0) });
  if (route === 'data/account/default-vault' && method === 'GET') return send({ slotGuid: mainVaultGuid });
  if (route === 'data/account/limit' && method === 'GET') return send({ allowed: true, available: 5000 });
  if (route === 'data/transaction-hold' && method === 'GET') return send({ allowed: true, available: true });
  if (route === 'data/plaid/link-token' && method === 'POST') return send({ link_token: 'demo-link-token' });
  if (route === 'data/plaid/accounts' && method === 'POST') return send({ linked: true });
  if (route === 'data/transfers' && method === 'POST') {
    const amount = Number(body.amount) || 0;
    const source = findVault(body.sourceId);
    const destination = findVault(body.destinationId);
    if (source) source.slotAvailableBalance -= amount;
    if (destination) destination.slotAvailableBalance += amount;
    if (source) source.slotBalance = source.slotAvailableBalance;
    if (destination) destination.slotBalance = destination.slotAvailableBalance;
    transactions.unshift({ transactionGuid: crypto.randomUUID(), slotGuid: destination?.slotGuid || mainVaultGuid, transactionDateTime: new Date().toISOString(), shortSmartLabel: 'Demo transfer', longSmartLabel: 'Sample account transfer', transactionAmountDecimal: amount, transactionAmount: amount, transactionAmountFormatted: `$${amount.toFixed(2)}`, transactionType: 'Transfer', includeInBalance: true });
    return send({ completed: true, demo: true });
  }
  if (parts[1] === 'data' && parts[2] === 'vault-keys' && method === 'PUT') return send({ updated: true, active: body.active === true });
  if (parts[1] === 'data' && parts[2] === 'vaults' && parts[4] === 'emergency-setup' && method === 'PUT') {
    const vault = findVault(parts[3]);
    if (vault) vault.slotGoal = { amount: Number(body.goal) || 0, targetDate: body.dueDate || '' };
    return send({ updated: true });
  }

  return res.status(501).json({ error: 'This action is not available in demo mode.', code: 'DEMO_ACTION_UNAVAILABLE' });
}

module.exports = function demoApi(req, res, next) {
  return sendDemo(req, res);
};