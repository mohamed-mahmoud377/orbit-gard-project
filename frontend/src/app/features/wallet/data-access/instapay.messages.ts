import { InstapayApiError, InstapayErrorCode, InstapayRejectionReason, InstapayRequestStatus } from './instapay.models';

/**
 * Every sentence the InstaPay flow can show.
 *
 * The backend deliberately stores codes rather than wording — a rejection
 * reason is an enum on a row, and the sentence lives here — so copy can be
 * improved without a database migration. That only holds if the wording stays
 * in this one file.
 */
export const INSTAPAY_MESSAGES = {
  uploadEmptyFile: 'Choose a screenshot of your transfer confirmation first.',
  uploadTooLarge: 'That image is larger than 1 MB. Take a fresh screenshot, or save it as JPG.',
  uploadUnsupportedType: 'Only PNG and JPG images are supported.',
  uploadInvalidImage: 'That file is not a valid image. Upload a PNG or JPG screenshot.',
  uploadDuplicateImage:
    'You have already uploaded this screenshot. Each transfer can only be submitted once.',
  childCannotTopUp: 'Child accounts cannot add money to a wallet.',
  requestNotFound: 'We could not find that InstaPay request.',
  unauthenticated: 'Your session has expired. Sign in again to upload a receipt.',
  networkError: 'We could not reach Orbit. Check your connection and try again.',
  unexpected: 'Something went wrong. Try again in a moment.',

  uploadAccepted: 'Receipt received. We are checking it now — watch its status below.',
  accountUnavailable:
    'We could not load the InstaPay number right now. Refresh the page before sending a transfer.',
  numberCopied: 'Copied',
} as const;

/** Upload / read failures, keyed by the `code` in the problem+json body. */
const UPLOAD_MESSAGE: Record<InstapayErrorCode, string> = {
  EMPTY_FILE: INSTAPAY_MESSAGES.uploadEmptyFile,
  MISSING_REQUEST_PARAMETER: INSTAPAY_MESSAGES.uploadEmptyFile,
  FILE_TOO_LARGE: INSTAPAY_MESSAGES.uploadTooLarge,
  UNSUPPORTED_IMAGE_TYPE: INSTAPAY_MESSAGES.uploadUnsupportedType,
  INVALID_IMAGE: INSTAPAY_MESSAGES.uploadInvalidImage,
  DUPLICATE_RECEIPT_IMAGE: INSTAPAY_MESSAGES.uploadDuplicateImage,
  CHILD_CANNOT_TOP_UP: INSTAPAY_MESSAGES.childCannotTopUp,
  INSTAPAY_REQUEST_NOT_FOUND: INSTAPAY_MESSAGES.requestNotFound,
  UNAUTHENTICATED: INSTAPAY_MESSAGES.unauthenticated,
  INTERNAL_ERROR: INSTAPAY_MESSAGES.unexpected,
  NETWORK_ERROR: INSTAPAY_MESSAGES.networkError,
  UNKNOWN: INSTAPAY_MESSAGES.unexpected,
};

export function bannerMessageFromInstapayError(error: InstapayApiError): string {
  return UPLOAD_MESSAGE[error.code] ?? INSTAPAY_MESSAGES.unexpected;
}

/** The badge label. Identical to the status — see the note on InstapayRequestStatus. */
export function instapayStatusLabel(status: InstapayRequestStatus): string {
  return status;
}

/**
 * What the REFERENCE column reads while there is no reference to show.
 *
 * A PENDING or PROCESSING row genuinely has neither amount nor reference —
 * they are read out of the image, so they do not exist yet.
 */
export const INSTAPAY_STATUS_SUMMARY: Record<
  InstapayRequestStatus,
  { readonly title: string; readonly detail: string }
> = {
  PENDING: {
    title: 'Waiting to be read',
    detail: 'Queued. We have not opened this screenshot yet.',
  },
  PROCESSING: {
    title: 'Reading your receipt',
    detail: 'We are reading the amount and reference right now.',
  },
  COMPLETED: {
    title: 'Credited to your wallet',
    detail: '',
  },
  REJECTED: {
    title: 'No reference found',
    detail: '',
  },
  FAILED: {
    title: 'We could not read it',
    detail: 'Three attempts failed. Upload a clearer screenshot of the whole confirmation.',
  },
};

/**
 * One sentence per rejection reason.
 *
 * WRONG_RECIPIENT takes the account name because the name comes from
 * configuration — hardcoding "Mohamed Mahmoud Said" here would put a stale
 * name in front of the user the first time it changes.
 */
export function instapayRejectionMessage(
  reason: InstapayRejectionReason,
  accountName: string,
): string {
  switch (reason) {
    case 'NOT_A_RECEIPT':
      return 'That image is not a transfer confirmation. Upload the confirmation screen from your bank or InstaPay app.';
    case 'TRANSFER_NOT_SUCCESSFUL':
      return 'The transfer has not completed yet. Upload the confirmation again once your bank shows it as successful.';
    case 'NOTHING_READABLE':
      return 'Nothing could be read from that image. Upload a sharper, uncropped screenshot.';
    case 'REFERENCE_NOT_VISIBLE':
      return 'No reference number is visible. Open More Details and share the full confirmation.';
    case 'DUPLICATE_REFERENCE':
      return 'That transfer has already been credited. Each transfer can only be submitted once.';
    case 'WRONG_RECIPIENT':
      return `The recipient on the receipt is not ${accountName}. Check the InstaPay number and send the transfer again.`;
    case 'INVALID_AMOUNT':
      return 'That amount cannot be credited. It must be in EGP and within the limits shown on the top-up page.';
  }
}

/**
 * The client-side half of the upload rules.
 *
 * The server checks all of this again — and its answer is the one that counts,
 * since it reads the real magic bytes rather than trusting a file extension.
 * This exists only so the common mistakes cost nothing instead of a round trip.
 */
export const INSTAPAY_ACCEPTED_TYPES = ['image/png', 'image/jpeg'] as const;

export function localFileError(file: File, maxImageBytes: number): string | null {
  if (file.size === 0) {
    return INSTAPAY_MESSAGES.uploadEmptyFile;
  }
  if (!(INSTAPAY_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return INSTAPAY_MESSAGES.uploadUnsupportedType;
  }
  if (file.size > maxImageBytes) {
    return INSTAPAY_MESSAGES.uploadTooLarge;
  }
  return null;
}
