package com.orbitgard.wallet;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * The day and month boundaries every spending figure is cut on.
 *
 * Extracted so the parent view, the child view, and anything added later
 * cannot drift apart. ChildSpendingLimitServiceImpl computes the same
 * boundaries inline and is deliberately left alone — it is the enforcement
 * path, and these methods must match it exactly rather than the reverse.
 *
 * Everything is UTC. That is a real product decision, not an oversight:
 * enforcement is UTC, so a display window in local time would show a child
 * headroom the API would then refuse. Note that for a UTC+3 user, "today"
 * rolls over at 03:00 local.
 */
public final class PeriodWindows {

    private PeriodWindows() {
    }

    /** 00:00:00 UTC today. */
    public static OffsetDateTime startOfDayUtc() {
        return OffsetDateTime.now(ZoneOffset.UTC)
                .toLocalDate()
                .atStartOfDay(ZoneOffset.UTC)
                .toOffsetDateTime();
    }

    /** 00:00:00 UTC on the 1st of the current month. */
    public static OffsetDateTime startOfMonthUtc() {
        return OffsetDateTime.now(ZoneOffset.UTC)
                .toLocalDate()
                .withDayOfMonth(1)
                .atStartOfDay(ZoneOffset.UTC)
                .toOffsetDateTime();
    }

    /** Exclusive end of today's window — also when the daily limit resets. */
    public static OffsetDateTime endOfDayUtc() {
        return startOfDayUtc().plusDays(1);
    }

    /** Exclusive end of this month's window — also when the monthly limit resets. */
    public static OffsetDateTime endOfMonthUtc() {
        return startOfMonthUtc().plusMonths(1);
    }
}
