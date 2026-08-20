package com.orbitgard.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/**
 * Every InstaPay request the user has made, newest first.
 *
 * Unpaged, deliberately. ORB-013 asks for every request the user has ever
 * made on one page, and a real user makes a handful. The repository
 * already has a Pageable variant sitting next to the one this uses, so if
 * that assumption ever stops holding the change is small — but paginating
 * a list nobody has asked to paginate would mean the frontend building a
 * pager for an empty state most users never leave.
 *
 * anyUnresolved exists because of the polling rule: the page refreshes
 * about every two seconds while anything on it is still PENDING or
 * PROCESSING, and stops when nothing is. That is a question about Orbit's
 * own status vocabulary, so the answer belongs on this side rather than in
 * a predicate the frontend has to keep in step with the enum.
 */
@Schema(description = "All of the user's InstaPay top-up requests, newest first.")
public record InstapayRequestListResponse(

        List<InstapayRequestResponse> content,

        @Schema(description = "True while any request is still PENDING or PROCESSING. The client keeps refreshing while this is true and stops when it is false.",
                example = "false")
        boolean anyUnresolved
) {
}
