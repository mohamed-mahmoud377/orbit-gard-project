import { TestBed } from '@angular/core/testing';

import { DEMO_CREDENTIALS, DemoStore } from './demo-store.service';

describe('DemoStore', () => {
  let store: DemoStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(DemoStore);
    store.resetDemoData();
  });

  function loginParent(): void {
    const result = store.login(DEMO_CREDENTIALS.parent);
    expect(result.ok).toBe(true);
  }

  it('starts with the Figma parent wallet values in integer piasters', () => {
    loginParent();

    expect(store.wallet()!.availableMinor).toBe(428_050);
    expect(store.wallet()!.heldMinor).toBe(25_000);
    expect(store.wallet()!.totalMinor).toBe(453_050);
  });

  it('preserves total = available + held through payment settlement', () => {
    loginParent();
    const initial = store.wallet()!;
    const product = store.merchantProducts()[0]!;
    const pending = store.startMerchantPayment(product.id);

    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(pending.value.wallet.totalMinor).toBe(initial.totalMinor);
    expect(pending.value.wallet.availableMinor + pending.value.wallet.heldMinor).toBe(
      pending.value.wallet.totalMinor,
    );

    const settled = store.settleMerchantPayment(pending.value.payment.id);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.value.wallet.totalMinor).toBe(initial.totalMinor - product.priceMinor);
    expect(settled.value.wallet.availableMinor + settled.value.wallet.heldMinor).toBe(
      settled.value.wallet.totalMinor,
    );
  });

  it('releases a merchant hold when the payment is rejected', () => {
    loginParent();
    const initial = store.wallet()!;
    const pending = store.startMerchantPayment(store.merchantProducts()[0]!.id);
    if (!pending.ok) throw new Error('Expected payment to start');

    const rejected = store.rejectMerchantPayment(pending.value.payment.id, 'Out of stock');

    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.value.wallet.availableMinor).toBe(initial.availableMinor);
    expect(rejected.value.wallet.heldMinor).toBe(initial.heldMinor);
    expect(rejected.value.wallet.totalMinor).toBe(initial.totalMinor);
    expect(rejected.value.payment.status).toBe('rejected');
    expect(rejected.value.transaction.status).toBe('rejected');
  });

  it('records a failed top-up without changing money', () => {
    loginParent();
    const initial = store.wallet()!;

    const result = store.topUp({ amountMinor: 10_000, simulateFailure: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('SIMULATED_FAILURE');
    expect(store.wallet()).toEqual(initial);
    const failed = store.recentActivity().find((transaction) => transaction.status === 'failed');
    expect(failed?.type).toBe('top-up');
    expect(failed?.amountMinor).toBe(10_000);
  });

  it('moves equal minor units between parent and child wallets', () => {
    loginParent();
    const parentBefore = store.wallet()!.availableMinor;
    const child = store.myChildren()[0]!;
    const childBefore = child.snapshot.availableMinor;

    const result = store.fundChild(child.childId, 12_345);

    expect(result.ok).toBe(true);
    expect(store.wallet()!.availableMinor).toBe(parentBefore - 12_345);
    expect(store.myChildren()[0]!.snapshot.availableMinor).toBe(childBefore + 12_345);
  });

  it('invalidates every active session after a password change', () => {
    loginParent();

    const result = store.changePassword({
      currentPassword: DEMO_CREDENTIALS.parent.password,
      newPassword: 'NewOrbit9',
    });

    expect(result.ok).toBe(true);
    expect(store.currentUser()).toBeNull();
    expect(store.sessions().every((session) => session.revokedAt !== undefined)).toBe(true);
    expect(
      store.login({ username: DEMO_CREDENTIALS.parent.username, password: 'NewOrbit9' }).ok,
    ).toBe(true);
  });
});
