package com.orbitgard.instapay;

import com.orbitgard.dto.response.InstapayUploadResponse;
import com.orbitgard.entity.InstapayTopUpRequest;
import com.orbitgard.entity.User;
import com.orbitgard.enums.AccountType;
import com.orbitgard.enums.InstapayRequestStatus;
import com.orbitgard.exceptions.ApiException;
import com.orbitgard.exceptions.ErrorCode;
import com.orbitgard.mapper.InstapayRequestMapper;
import com.orbitgard.repository.InstapayTopUpRequestRepository;
import com.orbitgard.repository.UserRepository;
import com.orbitgard.security.JwtPrincipal;
import com.orbitgard.service.AuthenticatedUserService;
import com.orbitgard.service.Impl.InstapayStorageServiceImpl;
import com.orbitgard.service.Impl.InstapayTopUpServiceImpl;
import com.orbitgard.service.InstapayStorageService;
import com.orbitgard.service.InstapayTopUpService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class InstapayTopUpUploadTest {

    @TempDir
    Path tempUploadsDir;

    private UserRepository userRepository;
    private InstapayTopUpRequestRepository requestRepository;
    private AuthenticatedUserService authenticatedUserService;
    private InstapayProperties properties;
    private InstapayStorageService storageService;
    private InstapayTopUpService topUpService;

    private UUID parentUserId;
    private UUID childUserId;
    private User parentUser;
    private User childUser;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        requestRepository = mock(InstapayTopUpRequestRepository.class);
        authenticatedUserService = mock(AuthenticatedUserService.class);

        properties = new InstapayProperties();
        properties.setUploadsDir(tempUploadsDir.toString());
        properties.setMaxImageBytes(1048576); // 1 MB

        storageService = new InstapayStorageServiceImpl(properties);
        topUpService = new InstapayTopUpServiceImpl(
                userRepository,
                requestRepository,
                storageService,
                properties,
                authenticatedUserService,
                new InstapayRequestMapper()
        );

        parentUserId = UUID.randomUUID();
        parentUser = User.builder()
                .id(parentUserId)
                .email("parent@example.com")
                .accountType(AccountType.USER)
                .build();

        childUserId = UUID.randomUUID();
        childUser = User.builder()
                .id(childUserId)
                .email("child@example.com")
                .accountType(AccountType.CHILD)
                .build();

        when(authenticatedUserService.currentPrincipal())
                .thenReturn(new JwtPrincipal(parentUserId, "parent_user", AccountType.USER, UUID.randomUUID()));
        when(userRepository.findById(parentUserId)).thenReturn(Optional.of(parentUser));
        when(userRepository.findById(childUserId)).thenReturn(Optional.of(childUser));
    }

    private byte[] createTestImageBytes(String format) throws IOException {
        BufferedImage img = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 100, 100);
        g.setColor(Color.BLACK);
        g.drawString("InstaPay", 10, 50);
        g.dispose();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, format, baos);
        return baos.toByteArray();
    }

    @Test
    @DisplayName("Valid JPEG receipt upload succeeds, stores file, and returns PENDING response")
    void validJpegUploadSucceeds() throws IOException {
        byte[] jpegBytes = createTestImageBytes("jpg");
        MockMultipartFile file = new MockMultipartFile("file", "receipt.jpg", "image/jpeg", jpegBytes);

        when(requestRepository.existsByFileSha256(anyString())).thenReturn(false);
        when(requestRepository.saveAndFlush(any(InstapayTopUpRequest.class))).thenAnswer(invocation -> {
            InstapayTopUpRequest req = invocation.getArgument(0);
            req.setId(UUID.randomUUID());
            return req;
        });

        InstapayUploadResponse response = topUpService.uploadReceipt(file);

        assertThat(response).isNotNull();
        assertThat(response.id()).isNotNull();
        assertThat(response.status()).isEqualTo(InstapayRequestStatus.PENDING);
        assertThat(response.message()).contains("queued for processing");

        verify(requestRepository, times(1)).save(any(InstapayTopUpRequest.class));
    }

    @Test
    @DisplayName("Valid PNG receipt upload succeeds")
    void validPngUploadSucceeds() throws IOException {
        byte[] pngBytes = createTestImageBytes("png");
        MockMultipartFile file = new MockMultipartFile("file", "receipt.png", "image/png", pngBytes);

        when(requestRepository.existsByFileSha256(anyString())).thenReturn(false);
        when(requestRepository.saveAndFlush(any(InstapayTopUpRequest.class))).thenAnswer(invocation -> {
            InstapayTopUpRequest req = invocation.getArgument(0);
            req.setId(UUID.randomUUID());
            return req;
        });

        InstapayUploadResponse response = topUpService.uploadReceipt(file);

        assertThat(response).isNotNull();
        assertThat(response.status()).isEqualTo(InstapayRequestStatus.PENDING);
    }

    @Test
    @DisplayName("File exceeding 1 MB is rejected with FILE_TOO_LARGE")
    void fileExceedingOneMegabyteRejected() {
        byte[] largeBytes = new byte[1048576 + 1]; // 1 MB + 1 byte
        MockMultipartFile file = new MockMultipartFile("file", "huge.jpg", "image/jpeg", largeBytes);

        assertThatThrownBy(() -> topUpService.uploadReceipt(file))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getErrorCode()).isEqualTo(ErrorCode.FILE_TOO_LARGE));

        verify(requestRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("Spoofed file (renamed executable or text file) is rejected with UNSUPPORTED_IMAGE_TYPE")
    void spoofedFileRejected() {
        byte[] fakeExeBytes = "MZ... This is not a real image".getBytes();
        MockMultipartFile file = new MockMultipartFile("file", "receipt.png", "image/png", fakeExeBytes);

        assertThatThrownBy(() -> topUpService.uploadReceipt(file))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getErrorCode()).isEqualTo(ErrorCode.UNSUPPORTED_IMAGE_TYPE));

        verify(requestRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("Duplicate receipt image upload is rejected with DUPLICATE_RECEIPT_IMAGE")
    void duplicateUploadRejected() throws IOException {
        byte[] jpegBytes = createTestImageBytes("jpg");
        MockMultipartFile file = new MockMultipartFile("file", "receipt.jpg", "image/jpeg", jpegBytes);

        when(requestRepository.existsByFileSha256(anyString())).thenReturn(true);

        assertThatThrownBy(() -> topUpService.uploadReceipt(file))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getErrorCode()).isEqualTo(ErrorCode.DUPLICATE_RECEIPT_IMAGE));

        verify(requestRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("A duplicate that slips past the hash check is caught by the unique index")
    void duplicateUploadLosingTheRaceIsAlsoRejected() throws IOException {
        // The existsByFileSha256 check races: two identical uploads can both
        // pass it and both try to insert. The index is the guarantee — this
        // is only about the loser being told the same thing as everyone
        // else, rather than being handed a 500.
        byte[] jpegBytes = createTestImageBytes("jpg");
        MockMultipartFile file = new MockMultipartFile("file", "receipt.jpg", "image/jpeg", jpegBytes);

        when(requestRepository.existsByFileSha256(anyString())).thenReturn(false);
        when(requestRepository.saveAndFlush(any(InstapayTopUpRequest.class)))
                .thenThrow(new DataIntegrityViolationException("uq_instapay_topup_request_file_sha256"));

        assertThatThrownBy(() -> topUpService.uploadReceipt(file))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.DUPLICATE_RECEIPT_IMAGE));
    }

    @Test
    @DisplayName("Child account attempting upload is rejected with CHILD_CANNOT_TOP_UP")
    void childAccountRejected() throws IOException {
        when(authenticatedUserService.currentPrincipal())
                .thenReturn(new JwtPrincipal(childUserId, "child_user", AccountType.CHILD, UUID.randomUUID()));

        byte[] jpegBytes = createTestImageBytes("jpg");
        MockMultipartFile file = new MockMultipartFile("file", "receipt.jpg", "image/jpeg", jpegBytes);

        assertThatThrownBy(() -> topUpService.uploadReceipt(file))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getErrorCode()).isEqualTo(ErrorCode.CHILD_CANNOT_TOP_UP));

        verify(requestRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("Empty file upload is rejected with EMPTY_FILE")
    void emptyFileRejected() {
        MockMultipartFile emptyFile = new MockMultipartFile("file", "empty.jpg", "image/jpeg", new byte[0]);

        assertThatThrownBy(() -> topUpService.uploadReceipt(emptyFile))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getErrorCode()).isEqualTo(ErrorCode.EMPTY_FILE));

        verify(requestRepository, never()).saveAndFlush(any());
    }
}
