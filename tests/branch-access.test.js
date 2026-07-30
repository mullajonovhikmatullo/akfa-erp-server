const test = require("node:test");
const assert = require("node:assert/strict");

const {
    resolveBranchId,
    requireAssignedBranchId,
} = require("../dist/core/utils/branch-access");

const storeUser = (overrides = {}) => ({
    id: "6db3a1ad-74b5-48bd-a3e9-3cf301db9c4f",
    role: "STORE_OWNER",
    storeId: "93a45f56-1eee-41bd-91f4-953366a8db22",
    branchId: "5e58aa9e-cbc7-4bfd-ab79-d534052c1977",
    authVersion: 0,
    ...overrides,
});

test("store owner without requested branch uses their assigned branch", () => {
    assert.equal(resolveBranchId(undefined, storeUser()), storeUser().branchId);
});

test("store owner can still explicitly target another branch", () => {
    const requestedBranchId = "3d759cec-a13a-4137-ab3b-a0bb07691268";
    assert.equal(resolveBranchId(requestedBranchId, storeUser()), requestedBranchId);
});

test("branch-scoped user ignores requested branch and stays in assigned branch", () => {
    const user = storeUser({ role: "ADMIN" });
    const requestedBranchId = "3d759cec-a13a-4137-ab3b-a0bb07691268";

    assert.equal(resolveBranchId(requestedBranchId, user), user.branchId);
});

test("store user without assigned branch is rejected when no branch is requested", () => {
    assert.throws(
        () => resolveBranchId(undefined, storeUser({ branchId: null })),
        (error) =>
            error.statusCode === 403 &&
            error.message === "Your account is not assigned to any branch"
    );
});

test("requireAssignedBranchId rejects users without a branch", () => {
    assert.throws(
        () => requireAssignedBranchId(storeUser({ branchId: null })),
        (error) => error.statusCode === 403
    );
});
