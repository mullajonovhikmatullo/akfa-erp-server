import swaggerJsdoc from "swagger-jsdoc";

const apiEnvelope = (schema: Record<string, unknown>) => ({
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
        enum: ["START", "BUSINESS", "NETWORK"],
    },
    PlatformUser: {
        type: "object",
        required: ["id", "name", "username", "role", "rawRole", "storeId", "branchId"],
        properties: {
            id: { type: "string" },
            name: { type: "string" },
            username: { type: "string" },
            role: { type: "string" },
            rawRole: { type: "string" },
            storeId: { type: "string", nullable: true },
            branchId: { type: "string", nullable: true },
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
        required: ["id", "code", "name", "monthlyPriceUzs"],
        properties: {
            id: { type: "string" },
            code: { type: "string" },
            name: { type: "string" },
            monthlyPriceUzs: { type: "number" },
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
            "trialEndsAt",
            "activatedAt",
            "suspendedAt",
            "createdAt",
            "updatedAt",
            "plan",
            "subscription",
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
            trialEndsAt: { type: "string", format: "date-time", nullable: true },
            activatedAt: { type: "string", format: "date-time", nullable: true },
            suspendedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            plan: { allOf: [{ $ref: "#/components/schemas/PlatformStorePlan" }], nullable: true },
            subscription: { allOf: [{ $ref: "#/components/schemas/PlatformStoreSubscription" }], nullable: true },
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
        required: ["status"],
        properties: {
            status: { $ref: "#/components/schemas/StoreStatus" },
            note: { type: "string" },
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
            "note",
            "createdAt",
            "store",
            "approvedBy",
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
            note: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            store: { $ref: "#/components/schemas/PlatformPaymentStore" },
            approvedBy: { allOf: [{ $ref: "#/components/schemas/PlatformPaymentApprover" }], nullable: true },
        },
    },
    CreatePaymentPayload: {
        type: "object",
        required: ["storeId", "amount"],
        properties: {
            storeId: { type: "string" },
            amount: { type: "number" },
            currency: { $ref: "#/components/schemas/PaymentCurrency" },
            paidAt: { type: "string", format: "date-time" },
            periodStart: { type: "string", format: "date-time" },
            periodEnd: { type: "string", format: "date-time" },
            note: { type: "string" },
        },
    },
    RejectPaymentPayload: {
        type: "object",
        properties: {
            note: { type: "string" },
        },
    },
    RegisterStorePayload: {
        type: "object",
        required: ["storeName", "ownerName", "phone", "username", "password"],
        properties: {
            storeName: { type: "string" },
            ownerName: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            username: { type: "string" },
            password: { type: "string" },
            planCode: { $ref: "#/components/schemas/PlanCode" },
        },
    },
    RegisteredStore: {
        type: "object",
        required: ["id", "name", "slug", "status", "trialEndsAt"],
        properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            status: { $ref: "#/components/schemas/StoreStatus" },
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
        required: ["accessToken", "user", "store", "branch", "subscription"],
        properties: {
            accessToken: { type: "string" },
            user: { $ref: "#/components/schemas/PlatformUser" },
            store: { $ref: "#/components/schemas/RegisteredStore" },
            branch: { $ref: "#/components/schemas/RegisteredBranch" },
            subscription: { $ref: "#/components/schemas/RegisteredSubscription" },
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
};

export const swaggerSpec = swaggerJsdoc({
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

            description:
                "Multi-branch retail management system API",
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
