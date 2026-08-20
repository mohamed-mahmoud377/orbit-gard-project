package com.orbitgard.mapper;

import com.orbitgard.dto.response.InstapayRequestResponse;
import com.orbitgard.entity.InstapayTopUpRequest;
import com.orbitgard.wallet.MoneyConverter;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Turns a stored request into what the user sees.
 *
 * The other InstaPay mapper, InstapayReceiptMapper, runs in the opposite
 * direction: it writes what the model read onto the row. This one only
 * reads, and it deliberately shows almost nothing of what is on that row.
 * The sender's bank, their InstaPay handle, the masked recipient name, the
 * token counts, the model, the storage path and the file hash all stay
 * where they are — none of it is the user's business on a status page, and
 * a DTO is the cheapest place to make sure it never leaks.
 */
@Component
public class InstapayRequestMapper {

    public InstapayRequestResponse toResponse(InstapayTopUpRequest request) {
        return new InstapayRequestResponse(
                request.getId(),
                request.getStatus(),
                toMajor(request.getAmountCents()),
                request.getReferenceNumber(),
                request.getRejectionReason(),
                request.getCreatedAt(),
                request.getResolvedAt()
        );
    }

    /**
     * A null amount stays null rather than becoming zero.
     *
     * Nothing is nulled defensively here: a queued row has no amount
     * because nothing has read the picture yet, and the row says so
     * honestly. If a PENDING row ever arrives carrying an amount, that is a
     * bug worth seeing rather than one worth hiding behind a status check
     * in the mapper.
     */
    private static BigDecimal toMajor(Long cents) {
        return cents == null ? null : MoneyConverter.centsToMajor(cents);
    }
}
