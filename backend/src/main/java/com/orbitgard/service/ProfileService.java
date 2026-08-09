package com.orbitgard.service;

import com.orbitgard.dto.request.UpdateProfileRequest;
import com.orbitgard.dto.response.ProfileResponse;

public interface ProfileService {

    ProfileResponse get();

    ProfileResponse update(UpdateProfileRequest request);
}
