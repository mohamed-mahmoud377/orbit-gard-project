export type MinorUnits = number;

export type UserRole = 'parent' | 'child';
export type UserStatus = 'pending-verification' | 'active' | 'locked';

export interface User {
  readonly id: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly fullName: string;
  readonly username: string;
  readonly email?: string;
  readonly phone?: string;
  readonly avatarUrl?: string;
  readonly parentId?: string;
  readonly createdAt: string;
}

export interface Device {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly location: string;
  readonly trusted: boolean;
}

export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly device: Device;
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly current: boolean;
  readonly revokedAt?: string;
}

export interface WalletSnapshot {
  readonly currency: 'EGP';
  readonly availableMinor: MinorUnits;
  readonly heldMinor: MinorUnits;
  readonly totalMinor: MinorUnits;
  readonly updatedAt: string;
}

export type TransactionType =
  | 'top-up'
  | 'transfer-in'
  | 'transfer-out'
  | 'child-funding'
  | 'merchant-payment';

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'rejected';

export interface Transaction {
  readonly id: string;
  readonly walletOwnerId: string;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly amountMinor: MinorUnits;
  readonly currency: 'EGP';
  readonly title: string;
  readonly subtitle: string;
  readonly occurredAt: string;
  /** Backend UUID — used when the public id is the TXN reference string. */
  readonly backendId?: string;
  readonly balanceBeforeMinor?: MinorUnits;
  readonly balanceAfterMinor?: MinorUnits;
  readonly resolvedAt?: string;
  readonly counterpartyUserId?: string;
  readonly merchantId?: string;
  readonly paymentId?: string;
  readonly failureReason?: string;
}

export interface ChildLimits {
  readonly dailySpendMinor: MinorUnits;
  readonly monthlySpendMinor: MinorUnits;
  readonly singlePurchaseMinor: MinorUnits;
}

export interface ChildWallet {
  readonly id: string;
  readonly parentId: string;
  readonly childId: string;
  readonly nickname: string;
  readonly snapshot: WalletSnapshot;
  readonly limits: ChildLimits;
  readonly createdAt: string;
}

export interface MerchantProduct {
  readonly id: string;
  readonly merchantId: string;
  readonly merchantName: string;
  readonly name: string;
  readonly description: string;
  readonly priceMinor: MinorUnits;
  readonly currency: 'EGP';
  readonly imageUrl?: string;
}

export type PaymentStatus = 'pending' | 'settled' | 'rejected';

export interface Payment {
  readonly id: string;
  readonly userId: string;
  readonly merchantId: string;
  readonly productId: string;
  readonly amountMinor: MinorUnits;
  readonly currency: 'EGP';
  readonly status: PaymentStatus;
  readonly createdAt: string;
  readonly settledAt?: string;
  readonly rejectedAt?: string;
  readonly rejectionReason?: string;
}

export type LoginErrorCode = 'INVALID_CREDENTIALS' | 'UNVERIFIED_USER' | 'LOCKED_USER';
export type SignUpErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_USERNAME'
  | 'INVALID_EMAIL'
  | 'WEAK_PASSWORD'
  | 'DUPLICATE_USERNAME'
  | 'DUPLICATE_EMAIL';
export type VerifyErrorCode = 'USER_NOT_FOUND' | 'INVALID_CODE' | 'ALREADY_VERIFIED';
export type MoneyErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'INVALID_AMOUNT'
  | 'INSUFFICIENT_FUNDS'
  | 'SIMULATED_FAILURE';
export type ChildErrorCode =
  | 'CHILD_NOT_FOUND'
  | 'DUPLICATE_USERNAME'
  | 'INVALID_LIMITS'
  | MoneyErrorCode;
export type PaymentErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'PRODUCT_NOT_FOUND'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_NOT_PENDING'
  | MoneyErrorCode;
export type SessionErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'SESSION_NOT_FOUND'
  | 'CURRENT_PASSWORD_INVALID'
  | 'WEAK_PASSWORD';
export type RecipientErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'RECIPIENT_NOT_FOUND'
  | 'SELF_TRANSFER';

export type ActionResult<T, E extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E; readonly message: string };

export interface LoginInput {
  readonly username: string;
  readonly password: string;
  readonly device?: Partial<Device>;
}

export interface LoginSuccess {
  readonly user: User;
  readonly session: Session;
}

export interface SignUpInput {
  readonly fullName: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
}

export interface SignUpSuccess {
  readonly user: User;
  /** Deterministic in the demo so screens can complete the verification flow. */
  readonly demoVerificationCode: string;
}

export interface TopUpInput {
  readonly amountMinor: MinorUnits;
  readonly sourceLabel?: string;
  readonly simulateFailure?: boolean;
}

export interface TopUpOutcome {
  readonly transaction: Transaction;
  readonly wallet: WalletSnapshot;
}

export interface TransferInput {
  readonly recipientUserId: string;
  readonly amountMinor: MinorUnits;
  readonly note?: string;
}

export interface TransferOutcome {
  readonly debit: Transaction;
  readonly credit: Transaction;
  readonly wallet: WalletSnapshot;
}

export interface AddChildInput {
  readonly fullName: string;
  readonly username: string;
  readonly password: string;
  readonly nickname?: string;
  readonly initialFundingMinor?: MinorUnits;
  readonly limits?: ChildLimits;
}

export interface AddChildOutcome {
  readonly child: User;
  readonly wallet: ChildWallet;
}

export interface MerchantPaymentOutcome {
  readonly payment: Payment;
  readonly transaction: Transaction;
  readonly wallet: WalletSnapshot;
}

export interface ChangePasswordInput {
  readonly currentPassword: string;
  readonly newPassword: string;
}

