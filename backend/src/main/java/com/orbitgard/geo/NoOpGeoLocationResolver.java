package com.orbitgard.geo;

import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.util.Optional;

@Component
public class NoOpGeoLocationResolver implements GeoLocationResolver {

    @Override
    public Optional<String> resolveLocation(InetAddress ipAddress) {
        return Optional.empty();
    }
}
