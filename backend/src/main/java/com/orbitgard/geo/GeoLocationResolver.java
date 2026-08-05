package com.orbitgard.geo;

import java.net.InetAddress;
import java.util.Optional;

public interface GeoLocationResolver {

    Optional<String> resolveLocation(InetAddress ipAddress);
}
