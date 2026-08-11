package com.orbitgard.controller;

import com.orbitgard.dto.request.UpdateProfileRequest;
import com.orbitgard.dto.response.ProfileResponse;
import com.orbitgard.service.ProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/profile")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Profile", description = "View and update the authenticated user's profile")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    @Operation(summary = "Get my profile",
            description = "Returns the authenticated user's first name, last name, phone number, and username.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Profile returned",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = ProfileResponse.class))),
            @ApiResponse(responseCode = "401", description = "Not authenticated", content = @Content)
    })
    public ResponseEntity<ProfileResponse> get() {
        return ResponseEntity.ok(profileService.get());
    }

    @PutMapping
    @Operation(summary = "Update my profile",
            description = "Updates first name, last name, and phone number. The username is included for display only and is never changed.")
    @io.swagger.v3.oas.annotations.parameters.RequestBody(
            required = true,
            description = "The complete profile form. username is read-only.",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = UpdateProfileRequest.class))
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Profile updated",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = ProfileResponse.class))),
            @ApiResponse(responseCode = "400", description = "A name or phone number is invalid", content = @Content),
            @ApiResponse(responseCode = "401", description = "Not authenticated", content = @Content)
    })
    public ResponseEntity<ProfileResponse> update(@RequestBody UpdateProfileRequest request) {
        return ResponseEntity.ok(profileService.update(request));
    }
}
