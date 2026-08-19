package com.orbitgard.enums;

/**
 * Why a receipt was refused. The code is stored; the sentence the user reads
 * lives in the frontend's catalogue, so wording can be improved without a
 * migration.
 *
 * Only the first failure is ever recorded. Unlike a form, where someone
 * fixes five fields at once, here the user uploads a new image — a list of
 * every rule that failed would be noise.
 *
 * Note there is deliberately no code here for a wrong currency, an
 * unparseable amount, or an amount outside the InstaPay limits. ORB-013
 * names six reasons and none of them covers those three. That is an open
 * decision, not an oversight — agree the code with Mohamed before adding
 * it, because the frontend has to carry wording for whatever is chosen.
 */
public enum InstapayRejectionReason {

    /** Not a transfer confirmation at all. */
    NOT_A_RECEIPT,

    /** Shows as declined or still pending rather than successful. */
    TRANSFER_NOT_SUCCESSFUL,

    /** Nothing at all could be read from the image. */
    NOTHING_READABLE,

    /** Legible, but no reference number is in the picture. */
    REFERENCE_NOT_VISIBLE,

    /** That reference has already been credited to a wallet. */
    DUPLICATE_REFERENCE,

    /** The recipient name or phone number is missing, or is not Orbit's. */
    WRONG_RECIPIENT
}
