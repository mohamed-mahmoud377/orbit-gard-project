import { Injectable, computed, signal } from '@angular/core';

import {
  ActionResult,
  AddChildInput,
  AddChildOutcome,
  ChangePasswordInput,
  ChildErrorCode,
  ChildLimits,
  ChildWallet,
  Device,
  LoginErrorCode,
  LoginInput,
  LoginSuccess,
  MerchantPaymentOutcome,
  MerchantProduct,
  MinorUnits,
  MoneyErrorCode,
  Payment,
  PaymentErrorCode,
  RecipientErrorCode,
  Session,
  SessionErrorCode,
  SignUpErrorCode,
  SignUpInput,
  SignUpSuccess,
  TopUpInput,
  TopUpOutcome,
  Transaction,
  TransferInput,
  TransferOutcome,
  User,
  VerifyErrorCode,
  WalletSnapshot,
} from '../shared/models/orbit.models';

/** Credentials intentionally exported for login-screen hints and automated demos. */
export const DEMO_CREDENTIALS = {
  parent: { username: 'mohamed', password: 'Orbit@123' },
  child: { username: 'youssef', password: 'Youssef@123' },
  verificationCode: '123456',
} as const;

const STORAGE_KEY = 'orbit.demo-store.v2';
const SCHEMA_VERSION = 2;
const EPOCH_MS = Date.parse('2026-07-25T16:00:00.000Z');

interface DemoCredential {
  readonly userId: string;
  readonly password: string;
  readonly verificationCode?: string;
}

interface DemoState {
  readonly version: typeof SCHEMA_VERSION;
  readonly users: readonly User[];
  readonly credentials: readonly DemoCredential[];
  readonly wallets: Readonly<Record<string, WalletSnapshot>>;
  readonly childWallets: readonly ChildWallet[];
  readonly transactions: readonly Transaction[];
  readonly sessions: readonly Session[];
  readonly products: readonly MerchantProduct[];
  readonly payments: readonly Payment[];
  readonly currentSessionId: string | null;
  readonly sequence: number;
}

const DEFAULT_LIMITS: ChildLimits = {
  dailySpendMinor: 15_000,
  monthlySpendMinor: 100_000,
  singlePurchaseMinor: 10_000,
};

function wallet(
  availableMinor: MinorUnits,
  heldMinor: MinorUnits,
  updatedAt = '2026-07-20T09:00:00.000Z',
): WalletSnapshot {
  return {
    currency: 'EGP',
    availableMinor,
    heldMinor,
    totalMinor: availableMinor + heldMinor,
    updatedAt,
  };
}

function createFixtures(): DemoState {
  const parent: User = {
    id: 'usr_parent_mohamed',
    role: 'parent',
    status: 'active',
    fullName: 'Mohamed Mahmoud',
    username: 'mohamed',
    email: 'mohamed@orbit.demo',
    phone: '+20 100 555 0101',
    createdAt: '2026-01-10T08:30:00.000Z',
  };
  const child: User = {
    id: 'usr_child_youssef',
    role: 'child',
    status: 'active',
    fullName: 'Youssef Mahmoud',
    username: 'youssef',
    parentId: parent.id,
    createdAt: '2026-02-02T10:00:00.000Z',
  };
  const nour: User = {
    id: 'usr_child_nour',
    role: 'child',
    status: 'active',
    fullName: 'Nour Mahmoud',
    username: 'nour',
    parentId: parent.id,
    createdAt: '2026-03-12T10:00:00.000Z',
  };
  const sara: User = {
    id: 'usr_sara',
    role: 'parent',
    status: 'active',
    fullName: 'Sara Ibrahim',
    username: 'sara',
    email: 'sara@orbit.demo',
    createdAt: '2026-04-10T08:30:00.000Z',
  };
  const parentWallet = wallet(428_050, 25_000);
  const childSnapshot = wallet(24_500, 5_000);
  const nourSnapshot = wallet(8_000, 0);

  return {
    version: SCHEMA_VERSION,
    users: [parent, child, nour, sara],
    credentials: [
      { userId: parent.id, password: DEMO_CREDENTIALS.parent.password },
      { userId: child.id, password: DEMO_CREDENTIALS.child.password },
      { userId: nour.id, password: 'Nour@123' },
      { userId: sara.id, password: 'Sara@123' },
    ],
    wallets: {
      [parent.id]: parentWallet,
      [child.id]: childSnapshot,
      [nour.id]: nourSnapshot,
      [sara.id]: wallet(100_000, 0),
    },
    childWallets: [
      {
        id: 'cwallet_youssef',
        parentId: parent.id,
        childId: child.id,
        nickname: 'Youssef',
        snapshot: childSnapshot,
        limits: DEFAULT_LIMITS,
        createdAt: '2026-02-02T10:00:00.000Z',
      },
      {
        id: 'cwallet_nour',
        parentId: parent.id,
        childId: nour.id,
        nickname: 'Nour',
        snapshot: nourSnapshot,
        limits: {
          dailySpendMinor: 10_000,
          monthlySpendMinor: 60_000,
          singlePurchaseMinor: 5_000,
        },
        createdAt: '2026-03-12T10:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'txn_nile_books',
        walletOwnerId: parent.id,
        type: 'merchant-payment',
        status: 'pending',
        amountMinor: 15_000,
        currency: 'EGP',
        title: 'Nile Books',
        subtitle: 'Order #4821 · via /pay',
        occurredAt: '2026-07-25T16:45:00.000Z',
        merchantId: 'merchant_nile_books',
      },
      {
        id: 'txn_cairo_coffee',
        walletOwnerId: parent.id,
        type: 'merchant-payment',
        status: 'pending',
        amountMinor: 10_000,
        currency: 'EGP',
        title: 'Cairo Coffee',
        subtitle: 'Order #4822 · via /pay',
        occurredAt: '2026-07-25T14:20:00.000Z',
        merchantId: 'merchant_cairo_coffee',
      },
      {
        id: 'txn_gadget_world',
        walletOwnerId: parent.id,
        type: 'merchant-payment',
        status: 'rejected',
        amountMinor: 12_000_000,
        currency: 'EGP',
        title: 'Gadget World',
        subtitle: 'Rejected · exceeds maximum',
        occurredAt: '2026-07-25T12:20:00.000Z',
        failureReason: 'Exceeds maximum',
      },
      {
        id: 'txn_wallet_topup',
        walletOwnerId: parent.id,
        type: 'top-up',
        status: 'completed',
        amountMinor: 100_000,
        currency: 'EGP',
        title: 'Wallet top-up',
        subtitle: 'Paymob · Visa •••• 4242',
        occurredAt: '2026-07-24T09:15:00.000Z',
      },
      {
        id: 'txn_youssef_transfer',
        walletOwnerId: parent.id,
        type: 'child-funding',
        status: 'completed',
        amountMinor: 30_000,
        currency: 'EGP',
        title: 'Youssef',
        subtitle: 'Allocation to child wallet',
        occurredAt: '2026-07-24T08:20:00.000Z',
        counterpartyUserId: child.id,
      },
      {
        id: 'txn_sara',
        walletOwnerId: parent.id,
        type: 'transfer-out',
        status: 'completed',
        amountMinor: 20_000,
        currency: 'EGP',
        title: '@sara',
        subtitle: 'Transfer sent',
        occurredAt: '2026-07-23T13:40:00.000Z',
        counterpartyUserId: sara.id,
      },
      {
        id: 'txn_welcome',
        walletOwnerId: parent.id,
        type: 'top-up',
        status: 'completed',
        amountMinor: 50_000,
        currency: 'EGP',
        title: 'Welcome bonus',
        subtitle: 'Promotional credit',
        occurredAt: '2026-07-23T07:40:00.000Z',
      },
    ],
    sessions: [
      {
        id: 'session_iphone',
        userId: parent.id,
        device: {
          id: 'device_iphone',
          name: 'iPhone 15 Pro',
          platform: 'iOS · Safari',
          location: 'Cairo, Egypt',
          trusted: true,
        },
        createdAt: '2026-07-18T08:00:00.000Z',
        lastActiveAt: '2026-07-25T15:20:00.000Z',
        current: false,
      },
      {
        id: 'session_macbook',
        userId: parent.id,
        device: {
          id: 'device_macbook',
          name: 'MacBook Pro',
          platform: 'macOS · Chrome',
          location: 'Cairo, Egypt',
          trusted: true,
        },
        createdAt: '2026-07-11T09:00:00.000Z',
        lastActiveAt: '2026-07-25T12:10:00.000Z',
        current: false,
      },
      {
        id: 'session_windows',
        userId: parent.id,
        device: {
          id: 'device_windows',
          name: 'Windows PC',
          platform: 'Windows · Edge',
          location: 'Alexandria, Egypt',
          trusted: false,
        },
        createdAt: '2026-07-01T10:00:00.000Z',
        lastActiveAt: '2026-07-24T20:10:00.000Z',
        current: false,
      },
    ],
    products: [
      {
        id: 'product_nile_books_bundle',
        merchantId: 'merchant_nile_books',
        merchantName: 'Nile Books',
        name: 'The Yacoubian Building',
        description: 'A modern Egyptian classic by Alaa Al Aswany.',
        priceMinor: 15_000,
        currency: 'EGP',
      },
    ],
    payments: [],
    currentSessionId: null,
    sequence: 100,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isWalletSnapshot(value: unknown): value is WalletSnapshot {
  if (!isRecord(value)) return false;
  const available = value['availableMinor'];
  const held = value['heldMinor'];
  const total = value['totalMinor'];
  return (
    value['currency'] === 'EGP' &&
    isSafeNonNegativeInteger(available) &&
    isSafeNonNegativeInteger(held) &&
    isSafeNonNegativeInteger(total) &&
    typeof value['updatedAt'] === 'string' &&
    total === available + held
  );
}

function isDemoState(value: unknown): value is DemoState {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<DemoState>;
  return (
    candidate.version === SCHEMA_VERSION &&
    Array.isArray(candidate.users) &&
    candidate.users.every(
      (user) =>
        isRecord(user) &&
        typeof user['id'] === 'string' &&
        typeof user['username'] === 'string' &&
        typeof user['fullName'] === 'string' &&
        (user['role'] === 'parent' || user['role'] === 'child') &&
        (user['status'] === 'pending-verification' ||
          user['status'] === 'active' ||
          user['status'] === 'locked') &&
        typeof user['createdAt'] === 'string',
    ) &&
    Array.isArray(candidate.credentials) &&
    candidate.credentials.every(
      (credential) =>
        isRecord(credential) &&
        typeof credential['userId'] === 'string' &&
        typeof credential['password'] === 'string',
    ) &&
    isRecord(candidate.wallets) &&
    Object.values(candidate.wallets).every(isWalletSnapshot) &&
    Array.isArray(candidate.childWallets) &&
    candidate.childWallets.every(
      (childWallet) =>
        isRecord(childWallet) &&
        typeof childWallet['id'] === 'string' &&
        typeof childWallet['parentId'] === 'string' &&
        typeof childWallet['childId'] === 'string' &&
        typeof childWallet['nickname'] === 'string' &&
        typeof childWallet['createdAt'] === 'string' &&
        isWalletSnapshot(childWallet['snapshot']) &&
        isRecord(childWallet['limits']) &&
        isSafeNonNegativeInteger(childWallet['limits']['dailySpendMinor']) &&
        isSafeNonNegativeInteger(childWallet['limits']['monthlySpendMinor']) &&
        isSafeNonNegativeInteger(childWallet['limits']['singlePurchaseMinor']),
    ) &&
    Array.isArray(candidate.transactions) &&
    candidate.transactions.every(
      (transaction) =>
        isRecord(transaction) &&
        typeof transaction['id'] === 'string' &&
        typeof transaction['walletOwnerId'] === 'string' &&
        typeof transaction['type'] === 'string' &&
        typeof transaction['status'] === 'string' &&
        isSafeNonNegativeInteger(transaction['amountMinor']) &&
        transaction['currency'] === 'EGP' &&
        typeof transaction['title'] === 'string' &&
        typeof transaction['subtitle'] === 'string' &&
        typeof transaction['occurredAt'] === 'string',
    ) &&
    Array.isArray(candidate.sessions) &&
    candidate.sessions.every(
      (session) =>
        isRecord(session) &&
        typeof session['id'] === 'string' &&
        typeof session['userId'] === 'string' &&
        typeof session['createdAt'] === 'string' &&
        typeof session['lastActiveAt'] === 'string' &&
        typeof session['current'] === 'boolean' &&
        isRecord(session['device']) &&
        typeof session['device']['id'] === 'string' &&
        typeof session['device']['name'] === 'string',
    ) &&
    Array.isArray(candidate.products) &&
    candidate.products.every(
      (product) =>
        isRecord(product) &&
        typeof product['id'] === 'string' &&
        typeof product['merchantId'] === 'string' &&
        typeof product['merchantName'] === 'string' &&
        typeof product['name'] === 'string' &&
        typeof product['description'] === 'string' &&
        isSafeNonNegativeInteger(product['priceMinor']) &&
        product['currency'] === 'EGP',
    ) &&
    Array.isArray(candidate.payments) &&
    candidate.payments.every(
      (payment) =>
        isRecord(payment) &&
        typeof payment['id'] === 'string' &&
        typeof payment['userId'] === 'string' &&
        typeof payment['merchantId'] === 'string' &&
        typeof payment['productId'] === 'string' &&
        isSafeNonNegativeInteger(payment['amountMinor']) &&
        payment['currency'] === 'EGP' &&
        typeof payment['status'] === 'string' &&
        typeof payment['createdAt'] === 'string',
    ) &&
    (candidate.currentSessionId === null ||
      typeof candidate.currentSessionId === 'string') &&
    isSafeNonNegativeInteger(candidate.sequence)
  );
}

@Injectable({ providedIn: 'root' })
export class DemoStore {
  private readonly state = signal<DemoState>(this.loadState());

  readonly users = computed(() => this.state().users);
  readonly sessions = computed(() => this.state().sessions);
  readonly transactions = computed(() => this.state().transactions);
  readonly childWallets = computed(() => this.state().childWallets);
  readonly merchantProducts = computed(() => this.state().products);
  readonly payments = computed(() => this.state().payments);
  readonly currentSession = computed(
    () =>
      this.state().sessions.find(
        (session) =>
          session.id === this.state().currentSessionId && session.revokedAt === undefined,
      ) ?? null,
  );
  readonly currentUser = computed(() => {
    const session = this.currentSession();
    return session
      ? (this.state().users.find((user) => user.id === session.userId) ?? null)
      : null;
  });
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly wallet = computed(() => {
    const user = this.currentUser();
    return user ? (this.state().wallets[user.id] ?? null) : null;
  });
  readonly recentActivity = computed(() => {
    const user = this.currentUser();
    return user
      ? this.state()
          .transactions.filter((transaction) => transaction.walletOwnerId === user.id)
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      : [];
  });
  readonly myChildren = computed(() => {
    const user = this.currentUser();
    return user?.role === 'parent'
      ? this.state().childWallets.filter((childWallet) => childWallet.parentId === user.id)
      : [];
  });
  readonly activeSessions = computed(() => {
    const user = this.currentUser();
    return user
      ? this.state().sessions.filter(
          (session) => session.userId === user.id && session.revokedAt === undefined,
        )
      : [];
  });

  login(
    input: LoginInput,
  ): ActionResult<LoginSuccess, LoginErrorCode> {
    const normalizedUsername = input.username.trim().replace(/^@/, '').toLowerCase();
    const state = this.state();
    const user = state.users.find((candidate) => candidate.username === normalizedUsername);
    const credential = user
      ? state.credentials.find((candidate) => candidate.userId === user.id)
      : undefined;

    if (!user || !credential || credential.password !== input.password) {
      return this.failure('INVALID_CREDENTIALS', 'The username or password is incorrect.');
    }
    if (user.status === 'pending-verification') {
      return this.failure('UNVERIFIED_USER', 'Verify this account before signing in.');
    }
    if (user.status === 'locked') {
      return this.failure('LOCKED_USER', 'This account is locked.');
    }

    const sequence = state.sequence + 1;
    const now = this.timestamp(sequence);
    const session: Session = {
      id: `session_${sequence}`,
      userId: user.id,
      device: this.makeDevice(input.device, sequence),
      createdAt: now,
      lastActiveAt: now,
      current: true,
    };
    const sessions = state.sessions.map((existing) =>
      existing.userId === user.id && existing.current
        ? { ...existing, current: false }
        : existing,
    );
    this.commit({
      ...state,
      sessions: [...sessions, session],
      currentSessionId: session.id,
      sequence,
    });
    return { ok: true, value: { user, session } };
  }

  logout(): void {
    const state = this.state();
    const sessionId = state.currentSessionId;
    if (!sessionId) return;
    const now = this.timestamp(state.sequence + 1);
    this.commit({
      ...state,
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, current: false, revokedAt: now }
          : session,
      ),
      currentSessionId: null,
      sequence: state.sequence + 1,
    });
  }

  signUp(
    input: SignUpInput,
  ): ActionResult<SignUpSuccess, SignUpErrorCode> {
    const state = this.state();
    const fullName = input.fullName.trim();
    const username = input.username.trim().replace(/^@/, '').toLowerCase();
    const email = input.email.trim().toLowerCase();
    if (fullName.length < 3) {
      return this.failure('INVALID_NAME', 'Enter a full name of at least 3 characters.');
    }
    if (!/^[a-z][a-z0-9_]{2,19}$/.test(username)) {
      return this.failure(
        'INVALID_USERNAME',
        'Username must be 3–20 letters, numbers, or underscores.',
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return this.failure('INVALID_EMAIL', 'Enter a valid email address.');
    }
    if (!this.isStrongPassword(input.password)) {
      return this.failure(
        'WEAK_PASSWORD',
        'Password must be at least 8 characters and include upper, lower, and numeric characters.',
      );
    }
    if (state.users.some((user) => user.username === username)) {
      return this.failure('DUPLICATE_USERNAME', 'That username is already in use.');
    }
    if (state.users.some((user) => user.email?.toLowerCase() === email)) {
      return this.failure('DUPLICATE_EMAIL', 'That email is already in use.');
    }

    const sequence = state.sequence + 1;
    const user: User = {
      id: `usr_${username}_${sequence}`,
      role: 'parent',
      status: 'pending-verification',
      fullName,
      username,
      email,
      createdAt: this.timestamp(sequence),
    };
    this.commit({
      ...state,
      users: [...state.users, user],
      credentials: [
        ...state.credentials,
        {
          userId: user.id,
          password: input.password,
          verificationCode: DEMO_CREDENTIALS.verificationCode,
        },
      ],
      wallets: { ...state.wallets, [user.id]: wallet(0, 0, user.createdAt) },
      sequence,
    });
    return {
      ok: true,
      value: { user, demoVerificationCode: DEMO_CREDENTIALS.verificationCode },
    };
  }

  verify(
    userId: string,
    code: string,
  ): ActionResult<User, VerifyErrorCode> {
    const state = this.state();
    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) return this.failure('USER_NOT_FOUND', 'The account was not found.');
    if (user.status === 'active') {
      return this.failure('ALREADY_VERIFIED', 'This account is already verified.');
    }
    const credential = state.credentials.find((candidate) => candidate.userId === userId);
    if (!credential?.verificationCode || credential.verificationCode !== code.trim()) {
      return this.failure('INVALID_CODE', 'The verification code is incorrect.');
    }
    const verified: User = { ...user, status: 'active' };
    this.commit({
      ...state,
      users: state.users.map((candidate) => (candidate.id === userId ? verified : candidate)),
      credentials: state.credentials.map((candidate) =>
        candidate.userId === userId
          ? { userId: candidate.userId, password: candidate.password }
          : candidate,
      ),
    });
    return { ok: true, value: verified };
  }

  topUp(
    input: TopUpInput,
  ): ActionResult<TopUpOutcome, MoneyErrorCode> {
    const context = this.authenticatedContext();
    if (!context) return this.failure('NOT_AUTHENTICATED', 'Sign in to top up a wallet.');
    if (!this.isPositiveMoney(input.amountMinor)) {
      return this.failure('INVALID_AMOUNT', 'Amount must be a positive whole number of piasters.');
    }

    const { state, user } = context;
    const sequence = state.sequence + 1;
    const now = this.timestamp(sequence);
    const currentWallet = state.wallets[user.id]!;
    const transaction: Transaction = {
      id: `txn_topup_${sequence}`,
      walletOwnerId: user.id,
      type: 'top-up',
      status: input.simulateFailure ? 'failed' : 'completed',
      amountMinor: input.amountMinor,
      currency: 'EGP',
      title: 'Wallet top up',
      subtitle: input.sourceLabel?.trim() || 'Demo bank card',
      occurredAt: now,
      ...(input.simulateFailure ? { failureReason: 'Simulated provider failure' } : {}),
    };
    const nextWallet = input.simulateFailure
      ? currentWallet
      : wallet(
          currentWallet.availableMinor + input.amountMinor,
          currentWallet.heldMinor,
          now,
        );
    this.commit({
      ...state,
      wallets: { ...state.wallets, [user.id]: nextWallet },
      transactions: [transaction, ...state.transactions],
      sequence,
    });
    if (input.simulateFailure) {
      return this.failure('SIMULATED_FAILURE', 'The demo top-up provider declined the request.');
    }
    return { ok: true, value: { transaction, wallet: nextWallet } };
  }

  lookupRecipient(
    username: string,
  ): ActionResult<User, RecipientErrorCode> {
    const current = this.currentUser();
    if (!current) {
      return this.failure('NOT_AUTHENTICATED', 'Sign in to find a recipient.');
    }
    const normalized = username.trim().replace(/^@/, '').toLowerCase();
    const recipient = this.state().users.find(
      (user) => user.username === normalized && user.status === 'active',
    );
    if (!recipient) {
      return this.failure('RECIPIENT_NOT_FOUND', 'No active Orbit user has that username.');
    }
    if (recipient.id === current.id) {
      return this.failure('SELF_TRANSFER', 'You cannot transfer to your own wallet.');
    }
    return { ok: true, value: recipient };
  }

  transfer(
    input: TransferInput,
  ): ActionResult<TransferOutcome, MoneyErrorCode | RecipientErrorCode> {
    const context = this.authenticatedContext();
    if (!context) return this.failure('NOT_AUTHENTICATED', 'Sign in to make a transfer.');
    if (!this.isPositiveMoney(input.amountMinor)) {
      return this.failure('INVALID_AMOUNT', 'Amount must be a positive whole number of piasters.');
    }
    const { state, user } = context;
    const recipient = state.users.find(
      (candidate) => candidate.id === input.recipientUserId && candidate.status === 'active',
    );
    if (!recipient) {
      return this.failure('RECIPIENT_NOT_FOUND', 'The recipient was not found.');
    }
    if (recipient.id === user.id) {
      return this.failure('SELF_TRANSFER', 'You cannot transfer to your own wallet.');
    }
    const senderWallet = state.wallets[user.id]!;
    if (senderWallet.availableMinor < input.amountMinor) {
      return this.failure('INSUFFICIENT_FUNDS', 'The available balance is too low.');
    }

    const sequence = state.sequence + 1;
    const now = this.timestamp(sequence);
    const recipientWallet = state.wallets[recipient.id] ?? wallet(0, 0, now);
    const nextSenderWallet = wallet(
      senderWallet.availableMinor - input.amountMinor,
      senderWallet.heldMinor,
      now,
    );
    const nextRecipientWallet = wallet(
      recipientWallet.availableMinor + input.amountMinor,
      recipientWallet.heldMinor,
      now,
    );
    const subtitle = input.note?.trim() || 'Orbit transfer';
    const debit: Transaction = {
      id: `txn_transfer_out_${sequence}`,
      walletOwnerId: user.id,
      type: 'transfer-out',
      status: 'completed',
      amountMinor: input.amountMinor,
      currency: 'EGP',
      title: recipient.fullName,
      subtitle,
      occurredAt: now,
      counterpartyUserId: recipient.id,
    };
    const credit: Transaction = {
      ...debit,
      id: `txn_transfer_in_${sequence}`,
      walletOwnerId: recipient.id,
      type: 'transfer-in',
      title: user.fullName,
      counterpartyUserId: user.id,
    };
    this.commit({
      ...state,
      wallets: {
        ...state.wallets,
        [user.id]: nextSenderWallet,
        [recipient.id]: nextRecipientWallet,
      },
      childWallets: state.childWallets.map((childWallet) =>
        childWallet.childId === recipient.id
          ? { ...childWallet, snapshot: nextRecipientWallet }
          : childWallet,
      ),
      transactions: [debit, credit, ...state.transactions],
      sequence,
    });
    return { ok: true, value: { debit, credit, wallet: nextSenderWallet } };
  }

  addChild(
    input: AddChildInput,
  ): ActionResult<AddChildOutcome, ChildErrorCode> {
    const context = this.authenticatedContext();
    if (!context || context.user.role !== 'parent') {
      return this.failure('NOT_AUTHENTICATED', 'Sign in as a parent to add a child.');
    }
    const username = input.username.trim().replace(/^@/, '').toLowerCase();
    const fullName = input.fullName.trim();
    const initialFundingMinor = input.initialFundingMinor ?? 0;
    const limits = input.limits ?? DEFAULT_LIMITS;
    if (
      fullName.length < 2 ||
      !/^[a-z][a-z0-9_]{2,19}$/.test(username) ||
      !this.isStrongPassword(input.password)
    ) {
      return this.failure('INVALID_LIMITS', 'Enter valid child account details.');
    }
    if (context.state.users.some((user) => user.username === username)) {
      return this.failure('DUPLICATE_USERNAME', 'That username is already in use.');
    }
    if (!this.areValidLimits(limits)) {
      return this.failure('INVALID_LIMITS', 'Limits must be non-negative whole piaster amounts.');
    }
    if (!Number.isInteger(initialFundingMinor) || initialFundingMinor < 0) {
      return this.failure('INVALID_AMOUNT', 'Initial funding cannot be negative.');
    }
    const parentWallet = context.state.wallets[context.user.id]!;
    if (parentWallet.availableMinor < initialFundingMinor) {
      return this.failure('INSUFFICIENT_FUNDS', 'The available balance is too low.');
    }

    const sequence = context.state.sequence + 1;
    const now = this.timestamp(sequence);
    const child: User = {
      id: `usr_child_${username}_${sequence}`,
      role: 'child',
      status: 'active',
      fullName,
      username,
      parentId: context.user.id,
      createdAt: now,
    };
    const childSnapshot = wallet(initialFundingMinor, 0, now);
    const childWallet: ChildWallet = {
      id: `cwallet_${sequence}`,
      parentId: context.user.id,
      childId: child.id,
      nickname: input.nickname?.trim() || fullName.split(' ')[0] || fullName,
      snapshot: childSnapshot,
      limits,
      createdAt: now,
    };
    const nextParentWallet = wallet(
      parentWallet.availableMinor - initialFundingMinor,
      parentWallet.heldMinor,
      now,
    );
    const fundingTransaction = initialFundingMinor
      ? this.childFundingTransaction(sequence, context.user, child, initialFundingMinor, now)
      : null;
    this.commit({
      ...context.state,
      users: [...context.state.users, child],
      credentials: [
        ...context.state.credentials,
        { userId: child.id, password: input.password },
      ],
      wallets: {
        ...context.state.wallets,
        [context.user.id]: nextParentWallet,
        [child.id]: childSnapshot,
      },
      childWallets: [...context.state.childWallets, childWallet],
      transactions: fundingTransaction
        ? [fundingTransaction, ...context.state.transactions]
        : context.state.transactions,
      sequence,
    });
    return { ok: true, value: { child, wallet: childWallet } };
  }

  fundChild(
    childId: string,
    amountMinor: MinorUnits,
  ): ActionResult<TransferOutcome, ChildErrorCode> {
    const context = this.authenticatedContext();
    if (!context || context.user.role !== 'parent') {
      return this.failure('NOT_AUTHENTICATED', 'Sign in as a parent to fund a child.');
    }
    if (!this.isPositiveMoney(amountMinor)) {
      return this.failure('INVALID_AMOUNT', 'Amount must be a positive whole number of piasters.');
    }
    const childWallet = context.state.childWallets.find(
      (candidate) =>
        candidate.childId === childId && candidate.parentId === context.user.id,
    );
    const child = context.state.users.find((candidate) => candidate.id === childId);
    if (!childWallet || !child) {
      return this.failure('CHILD_NOT_FOUND', 'That child wallet was not found.');
    }
    const parentWallet = context.state.wallets[context.user.id]!;
    if (parentWallet.availableMinor < amountMinor) {
      return this.failure('INSUFFICIENT_FUNDS', 'The available balance is too low.');
    }

    const sequence = context.state.sequence + 1;
    const now = this.timestamp(sequence);
    const nextParentWallet = wallet(
      parentWallet.availableMinor - amountMinor,
      parentWallet.heldMinor,
      now,
    );
    const nextChildWallet = wallet(
      childWallet.snapshot.availableMinor + amountMinor,
      childWallet.snapshot.heldMinor,
      now,
    );
    const debit = this.childFundingTransaction(
      sequence,
      context.user,
      child,
      amountMinor,
      now,
    );
    const credit: Transaction = {
      ...debit,
      id: `txn_child_credit_${sequence}`,
      walletOwnerId: child.id,
      type: 'transfer-in',
      title: context.user.fullName,
      counterpartyUserId: context.user.id,
    };
    this.commit({
      ...context.state,
      wallets: {
        ...context.state.wallets,
        [context.user.id]: nextParentWallet,
        [child.id]: nextChildWallet,
      },
      childWallets: context.state.childWallets.map((candidate) =>
        candidate.childId === childId
          ? { ...candidate, snapshot: nextChildWallet }
          : candidate,
      ),
      transactions: [debit, credit, ...context.state.transactions],
      sequence,
    });
    return { ok: true, value: { debit, credit, wallet: nextParentWallet } };
  }

  updateChildLimits(
    childId: string,
    limits: ChildLimits,
  ): ActionResult<ChildWallet, ChildErrorCode> {
    const context = this.authenticatedContext();
    if (!context || context.user.role !== 'parent') {
      return this.failure('NOT_AUTHENTICATED', 'Sign in as a parent to update limits.');
    }
    if (!this.areValidLimits(limits)) {
      return this.failure('INVALID_LIMITS', 'Limits must be non-negative whole piaster amounts.');
    }
    const current = context.state.childWallets.find(
      (childWallet) =>
        childWallet.childId === childId && childWallet.parentId === context.user.id,
    );
    if (!current) return this.failure('CHILD_NOT_FOUND', 'That child wallet was not found.');
    const updated: ChildWallet = { ...current, limits };
    this.commit({
      ...context.state,
      childWallets: context.state.childWallets.map((childWallet) =>
        childWallet.id === updated.id ? updated : childWallet,
      ),
    });
    return { ok: true, value: updated };
  }

  startMerchantPayment(
    productId: string,
  ): ActionResult<MerchantPaymentOutcome, PaymentErrorCode> {
    const context = this.authenticatedContext();
    if (!context) return this.failure('NOT_AUTHENTICATED', 'Sign in to make a payment.');
    const product = context.state.products.find((candidate) => candidate.id === productId);
    if (!product) return this.failure('PRODUCT_NOT_FOUND', 'The product was not found.');
    const currentWallet = context.state.wallets[context.user.id]!;
    if (currentWallet.availableMinor < product.priceMinor) {
      return this.failure('INSUFFICIENT_FUNDS', 'The available balance is too low.');
    }

    const sequence = context.state.sequence + 1;
    const now = this.timestamp(sequence);
    const payment: Payment = {
      id: `payment_${sequence}`,
      userId: context.user.id,
      merchantId: product.merchantId,
      productId: product.id,
      amountMinor: product.priceMinor,
      currency: 'EGP',
      status: 'pending',
      createdAt: now,
    };
    const transaction: Transaction = {
      id: `txn_payment_${sequence}`,
      walletOwnerId: context.user.id,
      type: 'merchant-payment',
      status: 'pending',
      amountMinor: product.priceMinor,
      currency: 'EGP',
      title: product.merchantName,
      subtitle: product.name,
      occurredAt: now,
      merchantId: product.merchantId,
      paymentId: payment.id,
    };
    const nextWallet = wallet(
      currentWallet.availableMinor - product.priceMinor,
      currentWallet.heldMinor + product.priceMinor,
      now,
    );
    this.commit({
      ...context.state,
      wallets: { ...context.state.wallets, [context.user.id]: nextWallet },
      payments: [payment, ...context.state.payments],
      transactions: [transaction, ...context.state.transactions],
      sequence,
    });
    return { ok: true, value: { payment, transaction, wallet: nextWallet } };
  }

  settleMerchantPayment(
    paymentId: string,
  ): ActionResult<MerchantPaymentOutcome, PaymentErrorCode> {
    return this.resolveMerchantPayment(paymentId, true);
  }

  rejectMerchantPayment(
    paymentId: string,
    reason = 'Merchant rejected the payment',
  ): ActionResult<MerchantPaymentOutcome, PaymentErrorCode> {
    return this.resolveMerchantPayment(paymentId, false, reason);
  }

  revokeSession(
    sessionId: string,
  ): ActionResult<Session, SessionErrorCode> {
    const context = this.authenticatedContext();
    if (!context) return this.failure('NOT_AUTHENTICATED', 'Sign in to manage sessions.');
    const target = context.state.sessions.find(
      (session) => session.id === sessionId && session.userId === context.user.id,
    );
    if (!target) return this.failure('SESSION_NOT_FOUND', 'That session was not found.');
    const sequence = context.state.sequence + 1;
    const revoked: Session = {
      ...target,
      current: false,
      revokedAt: this.timestamp(sequence),
    };
    this.commit({
      ...context.state,
      sessions: context.state.sessions.map((session) =>
        session.id === sessionId ? revoked : session,
      ),
      currentSessionId:
        context.state.currentSessionId === sessionId
          ? null
          : context.state.currentSessionId,
      sequence,
    });
    return { ok: true, value: revoked };
  }

  changePassword(
    input: ChangePasswordInput,
  ): ActionResult<void, SessionErrorCode> {
    const context = this.authenticatedContext();
    if (!context) return this.failure('NOT_AUTHENTICATED', 'Sign in to change your password.');
    const credential = context.state.credentials.find(
      (candidate) => candidate.userId === context.user.id,
    );
    if (credential?.password !== input.currentPassword) {
      return this.failure('CURRENT_PASSWORD_INVALID', 'The current password is incorrect.');
    }
    if (!this.isStrongPassword(input.newPassword)) {
      return this.failure('WEAK_PASSWORD', 'The new password does not meet the requirements.');
    }
    const sequence = context.state.sequence + 1;
    const revokedAt = this.timestamp(sequence);
    this.commit({
      ...context.state,
      credentials: context.state.credentials.map((candidate) =>
        candidate.userId === context.user.id
          ? { ...candidate, password: input.newPassword }
          : candidate,
      ),
      sessions: context.state.sessions.map((session) =>
        session.userId === context.user.id && session.revokedAt === undefined
          ? { ...session, current: false, revokedAt }
          : session,
      ),
      currentSessionId: null,
      sequence,
    });
    return { ok: true, value: undefined };
  }

  resetDemoData(): void {
    const fresh = createFixtures();
    this.state.set(fresh);
    this.writeState(fresh);
  }

  private resolveMerchantPayment(
    paymentId: string,
    settle: boolean,
    reason?: string,
  ): ActionResult<MerchantPaymentOutcome, PaymentErrorCode> {
    const context = this.authenticatedContext();
    if (!context) return this.failure('NOT_AUTHENTICATED', 'Sign in to resolve a payment.');
    const payment = context.state.payments.find(
      (candidate) => candidate.id === paymentId && candidate.userId === context.user.id,
    );
    if (!payment) return this.failure('PAYMENT_NOT_FOUND', 'The payment was not found.');
    if (payment.status !== 'pending') {
      return this.failure('PAYMENT_NOT_PENDING', 'Only pending payments can be resolved.');
    }
    const currentWallet = context.state.wallets[context.user.id]!;
    if (currentWallet.heldMinor < payment.amountMinor) {
      return this.failure('INVALID_AMOUNT', 'The wallet hold is inconsistent.');
    }
    const transaction = context.state.transactions.find(
      (candidate) => candidate.paymentId === paymentId,
    );
    if (!transaction) return this.failure('PAYMENT_NOT_FOUND', 'Payment activity was not found.');

    const sequence = context.state.sequence + 1;
    const now = this.timestamp(sequence);
    const nextPayment: Payment = settle
      ? { ...payment, status: 'settled', settledAt: now }
      : {
          ...payment,
          status: 'rejected',
          rejectedAt: now,
          rejectionReason: reason || 'Payment rejected',
        };
    const nextTransaction: Transaction = settle
      ? { ...transaction, status: 'completed' }
      : {
          ...transaction,
          status: 'rejected',
          failureReason: reason || 'Payment rejected',
        };
    const nextWallet = settle
      ? wallet(currentWallet.availableMinor, currentWallet.heldMinor - payment.amountMinor, now)
      : wallet(
          currentWallet.availableMinor + payment.amountMinor,
          currentWallet.heldMinor - payment.amountMinor,
          now,
        );
    this.commit({
      ...context.state,
      wallets: { ...context.state.wallets, [context.user.id]: nextWallet },
      payments: context.state.payments.map((candidate) =>
        candidate.id === paymentId ? nextPayment : candidate,
      ),
      transactions: context.state.transactions.map((candidate) =>
        candidate.id === transaction.id ? nextTransaction : candidate,
      ),
      sequence,
    });
    return {
      ok: true,
      value: { payment: nextPayment, transaction: nextTransaction, wallet: nextWallet },
    };
  }

  private authenticatedContext(): { state: DemoState; user: User } | null {
    const state = this.state();
    const session = state.sessions.find(
      (candidate) =>
        candidate.id === state.currentSessionId && candidate.revokedAt === undefined,
    );
    const user = session
      ? state.users.find((candidate) => candidate.id === session.userId)
      : undefined;
    return user ? { state, user } : null;
  }

  private childFundingTransaction(
    sequence: number,
    parent: User,
    child: User,
    amountMinor: MinorUnits,
    occurredAt: string,
  ): Transaction {
    return {
      id: `txn_child_funding_${sequence}`,
      walletOwnerId: parent.id,
      type: 'child-funding',
      status: 'completed',
      amountMinor,
      currency: 'EGP',
      title: child.fullName,
      subtitle: 'Child wallet funding',
      occurredAt,
      counterpartyUserId: child.id,
    };
  }

  private makeDevice(input: Partial<Device> | undefined, sequence: number): Device {
    return {
      id: input?.id ?? `device_${sequence}`,
      name: input?.name ?? 'Demo Browser',
      platform: input?.platform ?? 'Web',
      location: input?.location ?? 'Cairo, Egypt',
      trusted: input?.trusted ?? true,
    };
  }

  private areValidLimits(limits: ChildLimits): boolean {
    return (
      this.isNonNegativeMoney(limits.dailySpendMinor) &&
      this.isNonNegativeMoney(limits.monthlySpendMinor) &&
      this.isNonNegativeMoney(limits.singlePurchaseMinor) &&
      limits.singlePurchaseMinor <= limits.dailySpendMinor &&
      limits.dailySpendMinor <= limits.monthlySpendMinor
    );
  }

  private isPositiveMoney(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0;
  }

  private isNonNegativeMoney(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0;
  }

  private isStrongPassword(value: string): boolean {
    return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
  }

  private timestamp(sequence: number): string {
    return new Date(EPOCH_MS + sequence * 60_000).toISOString();
  }

  private failure<E extends string>(error: E, message: string): ActionResult<never, E> {
    return { ok: false, error, message };
  }

  private commit(next: DemoState): void {
    const synchronized: DemoState = {
      ...next,
      childWallets: next.childWallets.map((childWallet) => ({
        ...childWallet,
        snapshot: next.wallets[childWallet.childId] ?? childWallet.snapshot,
      })),
    };
    this.assertWalletInvariants(synchronized);
    this.state.set(synchronized);
    this.writeState(synchronized);
  }

  private assertWalletInvariants(state: DemoState): void {
    for (const snapshot of Object.values(state.wallets)) {
      if (
        !this.isNonNegativeMoney(snapshot.availableMinor) ||
        !this.isNonNegativeMoney(snapshot.heldMinor) ||
        snapshot.totalMinor !== snapshot.availableMinor + snapshot.heldMinor
      ) {
        throw new Error('Demo wallet invariant violated.');
      }
    }
  }

  private loadState(): DemoState {
    if (typeof window === 'undefined') return createFixtures();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return createFixtures();
      const parsed: unknown = JSON.parse(raw);
      if (!isDemoState(parsed)) return createFixtures();
      this.assertWalletInvariants(parsed);
      return parsed;
    } catch {
      return createFixtures();
    }
  }

  private writeState(state: DemoState): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable in private mode or blocked browser contexts.
    }
  }
}

