package com.orbitgard.instapay;

import com.orbitgard.controller.InstapayTopUpController;
import com.orbitgard.dto.response.InstapayUploadResponse;
import com.orbitgard.enums.InstapayRequestStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.service.InstapayTopUpService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class InstapayTopUpControllerTest {

    private MockMvc mockMvc;
    private InstapayTopUpService instapayTopUpService;

    @BeforeEach
    void setUp() {
        instapayTopUpService = mock(InstapayTopUpService.class);
        InstapayTopUpController controller = new InstapayTopUpController(instapayTopUpService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    @DisplayName("POST /wallet/topup/instapay returns HTTP 202 Accepted on valid upload")
    void uploadReceipt_ReturnsAccepted() throws Exception {
        UUID requestId = UUID.randomUUID();
        InstapayUploadResponse response = InstapayUploadResponse.builder()
                .id(requestId)
                .status(InstapayRequestStatus.PENDING)
                .createdAt(OffsetDateTime.now())
                .message("Receipt received and queued for processing")
                .build();

        when(instapayTopUpService.uploadReceipt(any())).thenReturn(response);

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "receipt.jpg",
                MediaType.IMAGE_JPEG_VALUE,
                new byte[]{1, 2, 3}
        );

        mockMvc.perform(multipart("/wallet/topup/instapay").file(file))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.id").value(requestId.toString()))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.message").value("Receipt received and queued for processing"));
    }
}
