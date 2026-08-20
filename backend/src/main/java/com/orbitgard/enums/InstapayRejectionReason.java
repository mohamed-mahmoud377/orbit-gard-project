package com.orbitgard.enums;

/**
 * Why a receipt was refused. The code is stored; the sentence the user reads
 * lives in the frontend's catalogue, so wording can be improved without a
 * migration.
 *
 * Only the first failure is ever recorded. Unlike a form, where someone
 * fixes five fields at once, here the user uploads a new image — a list of
 * every rule that failed would be noise.
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
    WRONG_RECIPIENT,

    /**
     * Row 8 of the table in TECH-003 §9, which shipped as UNDECIDED.
     *
     * ORB-013 names six reasons and none of them covers a currency that is
     * not EGP, an amount that does not parse, an amount outside the
     * InstaPay limits, or a normalised amount that disagrees with the
     * amount as printed. TECH-003 offers two ways out — a code per case, or
     * all four folded into one. This is the folded version, chosen because
     * every one of these cases produces the same advice to the user ("that
     * amount is not something we can credit; check it and upload again")
     * and four codes would be four sentences saying it.
     *
     * PROVISIONAL until Mohamed agrees it: the frontend has to carry
     * wording for whatever this ends up being called, so the name is not
     * mine to settle alone. If it changes, it changes here and in the
     * frontend catalogue, and nothing else moves — that is the whole point
     * of storing the code rather than the sentence.
     */
    INVALID_AMOUNT
}