# Firestore Security Specification

## 1. Data Invariants

1. **Account Ownership & Role Lock**: A user can only create `/users/{userId}` where `userId == request.auth.uid`, `data.uid == request.auth.uid`, and `data.role == 'farmer'`. Users cannot self-assign `'admin'` or modify `role` or `createdAt` on update.
2. **PII Isolation & Master Gate**: `/users/{userId}/private/{profileId}` (only `profileId == 'profile'`) requires the parent `/users/{userId}` document to exist, `userId == request.auth.uid`, and `data.userId == request.auth.uid`. Only the owner or a verified admin may `get` it; `list` is denied.
3. **Recently Viewed Integrity**: `/users/{userId}/recentlyViewed/{schemeSlug}` requires parent `/users/{userId}` to exist, `isValidId(schemeSlug)`, `data.slug == schemeSlug`, and `data.userId == request.auth.uid`. Only the owner may read or write.
4. **Contact Inquiries**: `/contactMessages/{messageId}` requires a verified signed-in user, `data.senderUid == request.auth.uid`, and initial `data.status == 'new'`. Once `status == 'reviewed'`, non-admins cannot modify the inquiry. Reading/listing is restricted to `senderUid == request.auth.uid` or verified admins.
5. **Temporal Integrity & Strict Keys**: Every `createdAt` on create and `updatedAt`/`viewedAt` on create/update must equal `request.time`. No unvalidated/shadow keys are permitted (`keys().hasOnly(...)` + `affectedKeys().hasOnly(...)`).
6. **Admin Protection**: `/admins/{adminUid}` is strictly restricted to verified admins (`isAdmin()`).

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)

1. **Unauthenticated Profile Read**: `GET /users/user123/private/profile` with `auth == null`.
2. **Cross-User PII Read**: `GET /users/victim123/private/profile` authenticated as `attacker456`.
3. **Self-Privilege Escalation on Create**: `CREATE /users/attacker456` with `{ uid: "attacker456", email: "a@b.com", fullName: "Attacker", role: "admin", createdAt: request.time, updatedAt: request.time }`.
4. **Shadow Field Injection ("Ghost Field")**: `UPDATE /users/user123/private/profile` including extra field `{ isVerified: true }`.
5. **Unverified Email Spoof**: Request with `auth.token.email == "mukeshghanchi500@gmail.com"` and `auth.token.email_verified == false`.
6. **ID Poisoning**: `CREATE /users/user123/recentlyViewed/bad$slug!with*chars` or >128 char ID.
7. **Orphaned Subcollection Write**: `CREATE /users/newUser/private/profile` when parent `/users/newUser` does not exist.
8. **Timestamp Forgery**: `CREATE /contactMessages/msg1` with client-supplied past timestamp `createdAt: "2020-01-01T00:00:00Z"`.
9. **Immutable Field Mutation**: `UPDATE /users/user123` changing `createdAt` or `uid`.
10. **Blanket Query Scraping**: `LIST /contactMessages` by non-admin without `where("senderUid", "==", request.auth.uid)`.
11. **Terminal State Mutation**: `UPDATE /contactMessages/msg1` by sender after admin marked `status: "reviewed"`.
12. **Value Poisoning / Oversized Payload**: `CREATE /contactMessages/msg1` with 5,000-character `message` string or non-integer `age` in `/users/user123/private/profile`.
