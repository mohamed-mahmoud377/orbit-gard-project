package com.orbitgard.repository;

import com.orbitgard.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Uniqueness checks and lookups for ORB-001 (sign up) and
 * ORB-002 (activation). Uniqueness is checked against already-normalised
 * values (lowercase username, canonical +20 phone) - normalisation happens
 * in the validation layer before these methods are ever called, so this
 * repository never re-normalises anything itself.
 */
public interface UserRepository extends JpaRepository<User, UUID> {

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    boolean existsByPhoneNumber(String phoneNumber);

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    Optional<User> findByUsernameOrEmail(String username, String email);

    boolean existsByPhoneNumberAndIdNot(String phoneNumber, UUID id);

    long countByParent_Id(UUID parentId);

    /** Children of one parent, oldest first — backs the Family tab card list. */
    List<User> findByParent_IdOrderByCreatedAtAsc(UUID parentId);

    /**
     * One child, scoped to its parent. Ownership is part of the query rather
     * than a check after loading: a parent asking for someone else's child
     * gets an empty Optional, which the caller turns into a 404. That leaks
     * nothing about whether the id exists at all.
     */
    Optional<User> findByIdAndParent_Id(UUID id, UUID parentId);
}