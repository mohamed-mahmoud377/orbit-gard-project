package com.orbitgard.instapay;

/**
 * Answers "has this reference already been credited to a wallet?".
 *
 * It is a parameter rather than a repository injected into ReceiptRules so
 * that the rules stay a pure function of an extraction plus one boolean.
 * Every rule can then be exercised with no database, no Spring context and
 * no mocking framework — which is what makes the three fixture receipts
 * usable as a regression suite that runs in milliseconds.
 *
 * The job supplies the real implementation:
 *
 *     ref -> repository.existsByReferenceNumberAndStatus(ref, COMPLETED)
 *
 * This is a check, not the guarantee. The guarantee is the partial unique
 * index on credited rows — two receipts for the same transfer arriving in
 * the same instant will both pass this and the database will refuse the
 * second. That is intentional: a check that races is fine when the
 * constraint behind it does not.
 */
@FunctionalInterface
public interface CreditedReferenceCheck {

    boolean alreadyCredited(String referenceNumber);
}
