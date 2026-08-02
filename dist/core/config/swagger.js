"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerSpec = void 0;
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const apiEnvelope = (schema) => ({
    type: "object",
    required: ["success", "data"],
    properties: {
        success: { type: "boolean" },
        message: { type: "string" },
        data: schema,
    },
});
const frontendSchemas = {
    StoreStatus: {
        type: "string",
        enum: ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"],
    },
    PaymentStatus: {
        type: "string",
        enum: ["PENDING", "APPROVED", "REJECTED"],
    },
    PaymentCurrency: {
        type: "string",
        enum: ["UZS", "USD"],
    },
    PlanCode: {
        type: "string",
        pattern: "^[A-Z][A-Z0-9_]{1,29}$",
    },
    PublicPlanCode: {
        type: "string",
        pattern: "^[A-Z][A-Z0-9_]{1,29}$",
    },
    PlatformUser: {
        type: "object",
        required: ["id", "name", "username", "role", "rawRole", "storeId", "branchId", "mustChangePassword"],
        properties: {
            id: { type: "string" },
            name: { type: "string" },
            username: { type: "string" },
            role: { type: "string" },
            rawRole: { type: "string" },
            storeId: { type: "string", nullable: true },
            branchId: { type: "string", nullable: true },
            mustChangePassword: { type: "boolean" },
        },
    },
    PlatformLoginPayload: {
        type: "object",
        required: ["username", "password"],
        properties: {
            username: { type: "string" },
            password: { type: "string" },
        },
    },
    PlatformLoginResponse: {
        type: "object",
        required: ["accessToken", "user"],
        properties: {
            accessToken: { type: "string" },
            user: { $ref: "#/components/schemas/PlatformUser" },
        },
    },
    PlatformDashboardResponse: {
        type: "object",
        required: ["storesByStatus", "activeStores", "overdueStores", "pendingPayments", "renewalsDueSoon"],
        properties: {
            storesByStatus: {
                type: "object",
                additionalProperties: { type: "number" },
            },
            activeStores: { type: "number" },
            overdueStores: { type: "number" },
            pendingPayments: { type: "number" },
            renewalsDueSoon: { type: "number" },
        },
    },
    PlatformStorePlan: {
        type: "object",
        required: [
            "id",
            "code",
            "name",
            "monthlyPriceUzs",
            "maxBranches",
            "maxUsers",
            "maxProducts",
        ],
        properties: {
            id: { type: "string" },
            code: { type: "string" },
            name: { type: "string" },
            monthlyPriceUzs: { type: "number" },
            maxBranches: { type: "number", nullable: true },
            maxUsers: { type: "number", nullable: true },
            maxProducts: { type: "number", nullable: true },
        },
    },
    ManagedPlan: {
        type: "object",
        required: [
            "id", "code", "name", "monthlyPriceUzs", "maxBranches", "maxUsers",
            "maxProducts", "isPublic", "isActive", "version", "createdAt", "updatedAt", "_count",
        ],
        properties: {
            id: { type: "string" },
            code: { type: "string" },
            name: { type: "string" },
            monthlyPriceUzs: { type: "number" },
            maxBranches: { type: "number", nullable: true },
            maxUsers: { type: "number", nullable: true },
            maxProducts: { type: "number", nullable: true },
            isPublic: { type: "boolean" },
            isActive: { type: "boolean" },
            version: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            _count: {
                type: "object",
                required: ["stores", "subscriptions"],
                properties: {
                    stores: { type: "number" },
                    subscriptions: { type: "number" },
                },
            },
        },
    },
    PlanMutationPayload: {
        type: "object",
        required: [
            "code", "name", "monthlyPriceUzs", "maxBranches", "maxUsers",
            "maxProducts", "isPublic", "isActive",
        ],
        properties: {
            code: { type: "string" },
            name: { type: "string" },
            monthlyPriceUzs: { type: "number" },
            maxBranches: { type: "number", nullable: true },
            maxUsers: { type: "number", nullable: true },
            maxProducts: { type: "number", nullable: true },
            isPublic: { type: "boolean" },
            isActive: { type: "boolean" },
        },
    },
    UpdatePlanPayload: {
        allOf: [
            { $ref: "#/components/schemas/PlanMutationPayload" },
            {
                type: "object",
                required: ["expectedVersion"],
                properties: { expectedVersion: { type: "number" } },
            },
        ],
    },
    DeletePlanPayload: {
        type: "object",
        required: ["expectedVersion", "currentPassword"],
        properties: {
            expectedVersion: { type: "number" },
            currentPassword: { type: "string", format: "password" },
        },
    },
    DeletePlanResult: {
        type: "object",
        required: ["deleted", "archived", "plan"],
        properties: {
            deleted: { type: "boolean" },
            archived: { type: "boolean" },
            plan: { allOf: [{ $ref: "#/components/schemas/ManagedPlan" }], nullable: true },
        },
    },
    PlatformStoreSubscription: {
        type: "object",
        required: [
            "id",
            "status",
            "trialEndsAt",
            "currentPeriodStart",
            "currentPeriodEnd",
            "nextPaymentDueAt",
            "lastPaymentAt",
        ],
        properties: {
            id: { type: "string" },
            status: { type: "string" },
            trialEndsAt: { type: "string", format: "date-time", nullable: true },
            currentPeriodStart: { type: "string", format: "date-time", nullable: true },
            currentPeriodEnd: { type: "string", format: "date-time", nullable: true },
            nextPaymentDueAt: { type: "string", format: "date-time", nullable: true },
            lastPaymentAt: { type: "string", format: "date-time", nullable: true },
        },
    },
    PlatformStoreCounts: {
        type: "object",
        required: ["branches", "users", "products"],
        properties: {
            branches: { type: "number" },
            users: { type: "number" },
            products: { type: "number" },
        },
    },
    PlatformStoreOwnerAccount: {
        type: "object",
        required: ["id", "username", "fullName", "isActive", "mustChangePassword"],
        properties: {
            id: { type: "string" },
            username: { type: "string" },
            fullName: { type: "string" },
            isActive: { type: "boolean" },
            mustChangePassword: { type: "boolean" },
        },
    },
    PlatformStore: {
        type: "object",
        required: [
            "id",
            "name",
            "slug",
            "ownerName",
            "phone",
            "email",
            "status",
            "billingVersion",
            "trialEndsAt",
            "activatedAt",
            "suspendedAt",
            "createdAt",
            "updatedAt",
            "plan",
            "subscription",
            "ownerAccount",
            "allowedStatusTransitions",
            "_count",
        ],
        properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            ownerName: { type: "string", nullable: true },
            phone: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            status: { $ref: "#/components/schemas/StoreStatus" },
            billingVersion: { type: "number" },
            trialEndsAt: { type: "string", format: "date-time", nullable: true },
            activatedAt: { type: "string", format: "date-time", nullable: true },
            suspendedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            plan: { allOf: [{ $ref: "#/components/schemas/PlatformStorePlan" }], nullable: true },
            subscription: { allOf: [{ $ref: "#/components/schemas/PlatformStoreSubscription" }], nullable: true },
            ownerAccount: {
                allOf: [{ $ref: "#/components/schemas/PlatformStoreOwnerAccount" }],
                nullable: true,
            },
            allowedStatusTransitions: {
                type: "array",
                items: { $ref: "#/components/schemas/StoreStatus" },
            },
            _count: { $ref: "#/components/schemas/PlatformStoreCounts" },
        },
    },
    PlatformStoresResponse: {
        type: "object",
        required: ["items", "total", "page", "pageSize"],
        properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/PlatformStore" } },
            total: { type: "number" },
            page: { type: "number" },
            pageSize: { type: "number" },
        },
    },
    ListStoresParams: {
        type: "object",
        properties: {
            status: { $ref: "#/components/schemas/StoreStatus" },
            search: { type: "string" },
            page: { type: "number" },
            pageSize: { type: "number" },
        },
    },
    UpdateStoreStatusPayload: {
        type: "object",
        required: ["status", "expectedVersion"],
        properties: {
            status: { $ref: "#/components/schemas/StoreStatus" },
            expectedVersion: { type: "number" },
            note: { type: "string" },
            confirmation: { type: "string" },
            currentPassword: { type: "string", format: "password" },
        },
    },
    PlatformPaymentStore: {
        type: "object",
        required: ["id", "name", "slug", "status"],
        properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            status: { $ref: "#/components/schemas/StoreStatus" },
        },
    },
    PlatformPaymentApprover: {
        type: "object",
        required: ["id", "fullName", "username"],
        properties: {
            id: { type: "string" },
            fullName: { type: "string" },
            username: { type: "string" },
        },
    },
    PaymentBranch: {
        type: "object",
        required: ["id", "name"],
        properties: {
            id: { type: "string" },
            name: { type: "string" },
        },
    },
    PaymentReceiptMedia: {
        type: "object",
        required: ["id", "fileName", "mimeType", "sizeBytes"],
        properties: {
            id: { type: "string" },
            fileName: { type: "string" },
            mimeType: { type: "string" },
            sizeBytes: { type: "number" },
        },
    },
    PlatformPayment: {
        type: "object",
        required: [
            "id",
            "amount",
            "currency",
            "status",
            "periodStart",
            "periodEnd",
            "paidAt",
            "approvedAt",
            "rejectedAt",
            "rejectionReason",
            "note",
            "createdAt",
            "store",
            "approvedBy",
            "branch",
            "submittedBy",
            "receiptMedia",
        ],
        properties: {
            id: { type: "string" },
            amount: { type: "number" },
            currency: { $ref: "#/components/schemas/PaymentCurrency" },
            status: { $ref: "#/components/schemas/PaymentStatus" },
            periodStart: { type: "string", format: "date-time", nullable: true },
            periodEnd: { type: "string", format: "date-time", nullable: true },
            paidAt: { type: "string", format: "date-time", nullable: true },
            approvedAt: { type: "string", format: "date-time", nullable: true },
            rejectedAt: { type: "string", format: "date-time", nullable: true },
            rejectionReason: { type: "string", nullable: true },
            note: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            store: { $ref: "#/components/schemas/PlatformPaymentStore" },
            approvedBy: { allOf: [{ $ref: "#/components/schemas/PlatformPaymentApprover" }], nullable: true },
            branch: { allOf: [{ $ref: "#/components/schemas/PaymentBranch" }], nullable: true },
            submittedBy: { allOf: [{ $ref: "#/components/schemas/PlatformPaymentApprover" }], nullable: true },
            receiptMedia: { allOf: [{ $ref: "#/components/schemas/PaymentReceiptMedia" }], nullable: true },
        },
    },
    TenantPayment: {
        type: "object",
        required: [
            "id", "amount", "currency", "status", "periodStart", "periodEnd",
            "paidAt", "approvedAt", "rejectedAt", "rejectionReason", "note",
            "createdAt", "branch", "receiptMedia",
        ],
        properties: {
            id: { type: "string" },
            amount: { type: "number" },
            currency: { $ref: "#/components/schemas/PaymentCurrency" },
            status: { $ref: "#/components/schemas/PaymentStatus" },
            periodStart: { type: "string", format: "date-time", nullable: true },
            periodEnd: { type: "string", format: "date-time", nullable: true },
            paidAt: { type: "string", format: "date-time", nullable: true },
            approvedAt: { type: "string", format: "date-time", nullable: true },
            rejectedAt: { type: "string", format: "date-time", nullable: true },
            rejectionReason: { type: "string", nullable: true },
            note: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            branch: { allOf: [{ $ref: "#/components/schemas/PaymentBranch" }], nullable: true },
            receiptMedia: { allOf: [{ $ref: "#/components/schemas/PaymentReceiptMedia" }], nullable: true },
        },
    },
    TenantBillingSummary: {
        type: "object",
        required: ["id", "name", "status", "trialEndsAt", "plan", "subscription", "branches"],
        properties: {
            id: { type: "string" },
            name: { type: "string" },
            status: { $ref: "#/components/schemas/StoreStatus" },
            trialEndsAt: { type: "string", format: "date-time" },
            plan: {
                type: "object",
                nullable: true,
                properties: {
                    code: { $ref: "#/components/schemas/PlanCode" },
                    name: { type: "string" },
                    monthlyPriceUzs: { type: "number" },
                },
            },
            subscription: {
                type: "object",
                nullable: true,
                properties: {
                    status: { type: "string" },
                    trialEndsAt: { type: "string", format: "date-time" },
                    currentPeriodStart: { type: "string", format: "date-time", nullable: true },
                    currentPeriodEnd: { type: "string", format: "date-time", nullable: true },
                    nextPaymentDueAt: { type: "string", format: "date-time", nullable: true },
                },
            },
            branches: {
                type: "array",
                items: { $ref: "#/components/schemas/PaymentBranch" },
            },
        },
    },
    SubmitTenantPaymentPayload: {
        type: "object",
        required: ["receipt"],
        properties: {
            paidAt: { type: "string", format: "date-time" },
            note: { type: "string" },
            receipt: {
                type: "object",
                required: ["fileName", "mimeType", "base64"],
                properties: {
                    fileName: { type: "string" },
                    mimeType: { type: "string" },
                    base64: { type: "string" },
                },
            },
        },
    },
    CreatePaymentPayload: {
        type: "object",
        required: ["storeId", "amount"],
        properties: {
            storeId: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string", enum: ["UZS"], default: "UZS" },
            paidAt: { type: "string", format: "date-time" },
            note: { type: "string" },
        },
    },
    RejectPaymentPayload: {
        type: "object",
        required: ["note"],
        properties: {
            note: { type: "string" },
        },
    },
    RegisterStorePayload: {
        type: "object",
        required: ["storeName", "ownerName", "phone", "username", "password", "confirmPassword"],
        properties: {
            storeName: { type: "string" },
            ownerName: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            username: { type: "string" },
            password: { type: "string" },
            confirmPassword: { type: "string" },
            planCode: { $ref: "#/components/schemas/PublicPlanCode" },
        },
    },
    RegisteredStore: {
        type: "object",
        required: ["id", "name", "slug", "status", "billingVersion", "trialEndsAt"],
        properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            status: { $ref: "#/components/schemas/StoreStatus" },
            billingVersion: { type: "number" },
            trialEndsAt: { type: "string", format: "date-time" },
        },
    },
    RegisteredBranch: {
        type: "object",
        required: ["id", "name"],
        properties: {
            id: { type: "string" },
            name: { type: "string" },
        },
    },
    RegisteredSubscription: {
        type: "object",
        required: ["id", "status", "trialEndsAt", "nextPaymentDueAt"],
        properties: {
            id: { type: "string" },
            status: { type: "string" },
            trialEndsAt: { type: "string", format: "date-time" },
            nextPaymentDueAt: { type: "string", format: "date-time" },
        },
    },
    RegisterStoreResult: {
        type: "object",
        required: ["handoffCode", "handoffExpiresAt", "user", "store", "branch", "subscription"],
        properties: {
            handoffCode: { type: "string" },
            handoffExpiresAt: { type: "string", format: "date-time" },
            user: { $ref: "#/components/schemas/PlatformUser" },
            store: { $ref: "#/components/schemas/RegisteredStore" },
            branch: { $ref: "#/components/schemas/RegisteredBranch" },
            subscription: { $ref: "#/components/schemas/RegisteredSubscription" },
        },
    },
    PublicPlan: {
        type: "object",
        required: ["code", "name", "monthlyPriceUzs", "maxBranches", "maxUsers", "maxProducts"],
        properties: {
            code: { $ref: "#/components/schemas/PublicPlanCode" },
            name: { type: "string" },
            monthlyPriceUzs: { type: "number" },
            maxBranches: { type: "number", nullable: true },
            maxUsers: { type: "number", nullable: true },
            maxProducts: { type: "number", nullable: true },
        },
    },
    ExchangeHandoffPayload: {
        type: "object",
        required: ["handoffCode"],
        properties: {
            handoffCode: { type: "string" },
        },
    },
    CompleteAccountSetupPayload: {
        type: "object",
        required: ["setupCode", "newPassword", "confirmPassword"],
        properties: {
            setupCode: { type: "string" },
            newPassword: { type: "string" },
            confirmPassword: { type: "string" },
        },
    },
    ProvisionStorePayload: {
        type: "object",
        required: ["storeName", "ownerName", "phone", "username", "planCode"],
        properties: {
            storeName: { type: "string" },
            ownerName: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            username: { type: "string" },
            planCode: { $ref: "#/components/schemas/PlanCode" },
            trialDays: { type: "number" },
        },
    },
    ProvisionStoreResult: {
        type: "object",
        required: ["store", "owner", "setupCode", "setupExpiresAt"],
        properties: {
            store: { $ref: "#/components/schemas/PlatformStore" },
            owner: { $ref: "#/components/schemas/PlatformUser" },
            setupCode: { type: "string" },
            setupExpiresAt: { type: "string", format: "date-time" },
        },
    },
    OwnerSetupResult: {
        type: "object",
        required: ["owner", "setupCode", "setupExpiresAt"],
        properties: {
            owner: {
                type: "object",
                required: ["id", "username"],
                properties: {
                    id: { type: "string" },
                    username: { type: "string" },
                },
            },
            setupCode: { type: "string" },
            setupExpiresAt: { type: "string", format: "date-time" },
        },
    },
    RegenerateOwnerSetupPayload: {
        type: "object",
        required: ["currentPassword"],
        properties: {
            currentPassword: { type: "string", format: "password" },
        },
    },
};
const frontendPaths = {
    "/auth/login": {
        post: {
            tags: ["Auth"],
            summary: "Login and receive an access token",
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/PlatformLoginPayload" },
                    },
                },
            },
            responses: {
                200: {
                    description: "Authenticated",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformLoginResponse" }),
                        },
                    },
                },
            },
        },
    },
    "/auth/handoff/exchange": {
        post: {
            tags: ["Auth"],
            summary: "Exchange a single-use cross-origin handoff code",
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ExchangeHandoffPayload" },
                    },
                },
            },
            responses: {
                200: {
                    description: "Authenticated",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformLoginResponse" }),
                        },
                    },
                },
            },
        },
    },
    "/auth/setup/complete": {
        post: {
            tags: ["Auth"],
            summary: "Complete a platform-provisioned owner account setup",
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/CompleteAccountSetupPayload" },
                    },
                },
            },
            responses: {
                200: {
                    description: "Account setup completed",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformLoginResponse" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/auth/login": {
        post: {
            tags: ["Platform Auth"],
            summary: "Authenticate a platform owner",
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/PlatformLoginPayload" },
                    },
                },
            },
            responses: {
                200: {
                    description: "Authenticated",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformLoginResponse" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/auth/me": {
        get: {
            tags: ["Platform Auth"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    description: "Current platform owner",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformUser" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/dashboard": {
        get: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    description: "Platform dashboard metrics",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformDashboardResponse" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/stores": {
        get: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    description: "Paginated store list",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformStoresResponse" }),
                        },
                    },
                },
            },
        },
        post: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ProvisionStorePayload" },
                    },
                },
            },
            responses: {
                201: {
                    description: "Tenant and one-time owner setup created",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/ProvisionStoreResult" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/stores/{id}": {
        get: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    description: "Store detail",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformStore" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/plans": {
        get: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    description: "Active platform plans",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({
                                type: "array",
                                items: { $ref: "#/components/schemas/PlatformStorePlan" },
                            }),
                        },
                    },
                },
            },
        },
        post: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/PlanMutationPayload" },
                    },
                },
            },
            responses: {
                201: {
                    description: "Plan created",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/ManagedPlan" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/plans/manage": {
        get: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    description: "All managed plans",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({
                                type: "array",
                                items: { $ref: "#/components/schemas/ManagedPlan" },
                            }),
                        },
                    },
                },
            },
        },
    },
    "/platform/plans/{id}": {
        patch: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/UpdatePlanPayload" },
                    },
                },
            },
            responses: {
                200: {
                    description: "Plan updated",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/ManagedPlan" }),
                        },
                    },
                },
            },
        },
        delete: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/DeletePlanPayload" },
                    },
                },
            },
            responses: {
                200: {
                    description: "Unused plan deleted or in-use plan archived",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/DeletePlanResult" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/stores/{id}/status": {
        patch: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/UpdateStoreStatusPayload" },
                    },
                },
            },
            responses: {
                200: {
                    description: "Store status updated",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformStore" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/stores/{id}/owner/setup-link": {
        post: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            parameters: [
                {
                    in: "path",
                    name: "id",
                    required: true,
                    schema: { type: "string" },
                },
            ],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            $ref: "#/components/schemas/RegenerateOwnerSetupPayload",
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "Previous setup links invalidated and a new single-use link created",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/OwnerSetupResult" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/payments": {
        get: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    description: "Payment list",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ type: "array", items: { $ref: "#/components/schemas/PlatformPayment" } }),
                        },
                    },
                },
            },
        },
        post: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/CreatePaymentPayload" },
                    },
                },
            },
            responses: {
                201: {
                    description: "Payment created",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformPayment" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/payments/{id}/approve": {
        patch: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    description: "Payment approved",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformPayment" }),
                        },
                    },
                },
            },
        },
    },
    "/platform/payments/{id}/reject": {
        patch: {
            tags: ["Platform"],
            security: [{ bearerAuth: [] }],
            requestBody: {
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/RejectPaymentPayload" },
                    },
                },
            },
            responses: {
                200: {
                    description: "Payment rejected",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/PlatformPayment" }),
                        },
                    },
                },
            },
        },
    },
    "/billing": {
        get: {
            tags: ["Billing"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    description: "Current tenant billing summary",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/TenantBillingSummary" }),
                        },
                    },
                },
            },
        },
    },
    "/billing/payments": {
        get: {
            tags: ["Billing"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    description: "Current tenant payment history",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({
                                type: "array",
                                items: { $ref: "#/components/schemas/TenantPayment" },
                            }),
                        },
                    },
                },
            },
        },
        post: {
            tags: ["Billing"],
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/SubmitTenantPaymentPayload" },
                    },
                },
            },
            responses: {
                201: {
                    description: "Payment submitted for platform approval",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/TenantPayment" }),
                        },
                    },
                },
            },
        },
    },
    "/media/{id}": {
        get: {
            tags: ["Media"],
            security: [{ bearerAuth: [] }],
            responses: {
                200: { description: "Private media content" },
            },
        },
    },
    "/public/stores/register": {
        post: {
            tags: ["Onboarding"],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/RegisterStorePayload" },
                    },
                },
            },
            responses: {
                201: {
                    description: "Store registered",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({ $ref: "#/components/schemas/RegisterStoreResult" }),
                        },
                    },
                },
            },
        },
    },
    "/public/plans": {
        get: {
            tags: ["Onboarding"],
            responses: {
                200: {
                    description: "Publicly available plans",
                    content: {
                        "application/json": {
                            schema: apiEnvelope({
                                type: "array",
                                items: { $ref: "#/components/schemas/PublicPlan" },
                            }),
                        },
                    },
                },
            },
        },
    },
};
exports.swaggerSpec = (0, swagger_jsdoc_1.default)({
    definition: {
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
            schemas: frontendSchemas,
        },
        openapi: "3.0.0",
        info: {
            title: "Store Management API",
            version: "1.0.0",
            description: "Multi-branch retail management system API",
        },
        servers: [
            {
                url: "http://localhost:3000",
            },
        ],
        paths: frontendPaths,
    },
    apis: ["./src/modules/**/*.ts"],
});
