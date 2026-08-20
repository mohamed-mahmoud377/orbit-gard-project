package com.orbitgard.service.Impl;

import com.orbitgard.instapay.InstapayProperties;
import com.orbitgard.service.InstapayStorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.UUID;

@Service
@Slf4j
public class InstapayStorageServiceImpl implements InstapayStorageService {

    private static final DateTimeFormatter DATE_PATH_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM");

    private final InstapayProperties properties;

    public InstapayStorageServiceImpl(InstapayProperties properties) {
        this.properties = properties;
    }

    @Override
    public String computeSha256(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(bytes);
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available", e);
        }
    }

    @Override
    public String detectImageExtension(byte[] bytes) {
        if (bytes == null || bytes.length < 4) {
            return null;
        }

        // JPEG magic bytes: FF D8 FF
        if ((bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF) {
            return "jpg";
        }

        // PNG magic bytes: 89 50 4E 47
        if ((bytes[0] & 0xFF) == 0x89 && (bytes[1] & 0xFF) == 0x50
                && (bytes[2] & 0xFF) == 0x4E && (bytes[3] & 0xFF) == 0x47) {
            return "png";
        }

        return null;
    }

    @Override
    public boolean isDecodableImage(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            return false;
        }
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
            return image != null && image.getWidth() > 0 && image.getHeight() > 0;
        } catch (Exception e) {
            log.warn("Image decodability check failed: {}", e.getMessage());
            return false;
        }
    }

    @Override
    public String storeFile(byte[] bytes, String extension) throws IOException {
        String subDir = YearMonth.now().format(DATE_PATH_FORMATTER);
        String fileName = UUID.randomUUID() + "." + extension.toLowerCase();
        String relativePath = subDir + "/" + fileName;

        Path baseDir = Paths.get(properties.getUploadsDir()).toAbsolutePath().normalize();
        Path targetPath = baseDir.resolve(relativePath).normalize();

        if (!targetPath.startsWith(baseDir)) {
            throw new SecurityException("Path traversal attempt detected");
        }

        Files.createDirectories(targetPath.getParent());
        Files.write(targetPath, bytes);

        log.info("Stored receipt image to relative path: {}", relativePath);
        return relativePath;
    }

    @Override
    public byte[] readFile(String relativeStoragePath) throws IOException {
        Path baseDir = Paths.get(properties.getUploadsDir()).toAbsolutePath().normalize();
        Path targetPath = baseDir.resolve(relativeStoragePath).normalize();

        if (!targetPath.startsWith(baseDir)) {
            throw new SecurityException("Path traversal attempt detected");
        }

        if (!Files.exists(targetPath)) {
            throw new IOException("Stored file does not exist at path: " + relativeStoragePath);
        }

        return Files.readAllBytes(targetPath);
    }
}
