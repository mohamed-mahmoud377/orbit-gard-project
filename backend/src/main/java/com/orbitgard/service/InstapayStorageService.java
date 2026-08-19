package com.orbitgard.service;

import java.io.IOException;

public interface InstapayStorageService {

    String computeSha256(byte[] bytes);

    String detectImageExtension(byte[] bytes);

    boolean isDecodableImage(byte[] bytes);

    String storeFile(byte[] bytes, String extension) throws IOException;

    byte[] readFile(String relativeStoragePath) throws IOException;
}
