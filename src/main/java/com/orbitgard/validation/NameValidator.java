package com.orbitgard.validation;

import java.util.regex.Pattern;

/**
 * Validates a first or last name: up to 30 characters, English letters,
 * spaces, hyphens and apostrophes only — accepting names like Al-Sayed
 * and O'Brien, rejecting digits or other symbols.
 *
 * The pattern matches chk_users_first_name / chk_users_last_name in
 * the users table migration exactly, on purpose — the app layer and
 * the database must agree on what a valid name is, or a name that
 * passes here can still fail as a raw constraint violation at insert.
 *
 * Only VALID/INVALID is returned. The API contract's error table
 * defines a single code, NAME_INVALID, for both "too long" and
 * "contains digits or symbols" — there is no separate code for length.
 * Even though the story's message table lists two different display
 * messages for those two situations, fieldErrors only carries
 * { field, code }, and the contract gives both situations the same
 * code — so a caller cannot distinguish them on the wire today. This
 * validator matches the contract as written rather than inventing a
 * second code that doesn't exist there.
 */
public final class NameValidator {

    private static final int MAX_LENGTH = 30;

    // One or more letters, optionally followed by groups of exactly one
    // separator (space, hyphen or apostrophe) plus more letters. Rejects
    // leading/trailing separators and consecutive separators.
    private static final Pattern NAME_PATTERN = Pattern.compile("^[A-Za-z]+([ '\\-][A-Za-z]+)*$");

    private NameValidator() {
    }

    public enum Status {
        VALID,
        INVALID
    }

    public record Result(Status status) {

        public static Result valid() {
            return new Result(Status.VALID);
        }

        public static Result invalid() {
            return new Result(Status.INVALID);
        }

        public boolean isValid() {
            return status == Status.VALID;
        }
    }

    /**
     * Expects a trimmed value — trim before calling, or leading/trailing
     * whitespace will correctly fail the format check (the pattern has
     * no room for it) rather than being silently stripped here.
     */
    public static Result validate(String name) {
        if (name == null) {
            return Result.invalid();
        }
        if (name.length() > MAX_LENGTH) {
            return Result.invalid();
        }
        if (!NAME_PATTERN.matcher(name).matches()) {
            return Result.invalid();
        }
        return Result.valid();
    }
}