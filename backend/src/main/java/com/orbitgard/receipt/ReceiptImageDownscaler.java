package com.orbitgard.receipt;

import com.orbitgard.gemini.GeminiProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;

/**
 * Shrinks a screenshot before it is sent to the model.
 *
 * A phone screenshot is 1170x2532 and nothing is gained by sending all of
 * it — the input is crisp rendered digital text, the easiest possible case.
 * Capping the long edge cuts the image token count substantially, which is
 * where most of the per-call cost sits.
 *
 * JDK only: ImageIO and Graphics2D have been there since forever, and this
 * is a good demonstration that reaching for a library would have been the
 * wrong instinct.
 */
@Component
@Slf4j
public class ReceiptImageDownscaler {

    private static final String JPEG_FORMAT = "jpeg";
    private static final String JPEG_MIME_TYPE = "image/jpeg";

    private final GeminiProperties props;

    public ReceiptImageDownscaler(GeminiProperties props) {
        this.props = props;
    }

    public String mimeType() {
        return JPEG_MIME_TYPE;
    }

    /**
     * @return JPEG bytes, long edge capped
     * @throws IOException if the bytes are not a decodable image. ImageIO
     *         returning null is the real test of that — the leading bytes
     *         only say what a file claims to be.
     */
    public byte[] downscaleToJpeg(byte[] original) throws IOException {
        BufferedImage source = ImageIO.read(new ByteArrayInputStream(original));
        if (source == null) {
            throw new IOException("Bytes are not a decodable image");
        }

        BufferedImage scaled = scale(source);
        byte[] jpeg = encodeJpeg(scaled);

        log.debug("Downscaled receipt image: {}x{} -> {}x{}, {} bytes -> {} bytes",
                source.getWidth(), source.getHeight(),
                scaled.getWidth(), scaled.getHeight(),
                original.length, jpeg.length);

        return jpeg;
    }

    private BufferedImage scale(BufferedImage source) {
        int longEdge = Math.max(source.getWidth(), source.getHeight());
        int cap = props.getMaxImageEdgePx();

        double factor = longEdge <= cap ? 1.0 : (double) cap / longEdge;
        int width = Math.max(1, (int) Math.round(source.getWidth() * factor));
        int height = Math.max(1, (int) Math.round(source.getHeight() * factor));

        // TYPE_INT_RGB even when not resizing: a PNG screenshot may carry an
        // alpha channel, and JPEG has nowhere to put it. Encoding an ARGB
        // image as JPEG produces colour-inverted output on some writers.
        BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);

        Graphics2D graphics = target.createGraphics();
        try {
            // Flatten transparency onto white rather than black, which is
            // what a screenshot's background almost always is.
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);

            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                    RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING,
                    RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                    RenderingHints.VALUE_ANTIALIAS_ON);

            graphics.drawImage(source, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }

        return target;
    }

    private byte[] encodeJpeg(BufferedImage image) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName(JPEG_FORMAT);
        if (!writers.hasNext()) {
            throw new IOException("No JPEG writer available");
        }
        ImageWriter writer = writers.next();

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ImageOutputStream stream = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(stream);

            ImageWriteParam param = writer.getDefaultWriteParam();
            if (param.canWriteCompressed()) {
                param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                param.setCompressionQuality(props.getJpegQuality());
            }

            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }

        return out.toByteArray();
    }
}
