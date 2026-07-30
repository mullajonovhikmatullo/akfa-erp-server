"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedPlatformOwner = seedPlatformOwner;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../infrastructure/prisma/prisma");
const PLAN_SEEDS = [
    { code: "START", name: "Start", monthlyPriceUzs: 199000, maxBranches: 1, maxUsers: 3, maxProducts: 1000, isPublic: true },
    { code: "BUSINESS", name: "Business", monthlyPriceUzs: 399000, maxBranches: 5, maxUsers: 20, maxProducts: 10000, isPublic: true },
    { code: "NETWORK", name: "Network", monthlyPriceUzs: 0, maxBranches: null, maxUsers: null, maxProducts: null, isPublic: false },
];
async function seedPlans() {
    await Promise.all(PLAN_SEEDS.map((plan) => prisma_1.prisma.plan.upsert({
        where: { code: plan.code },
        create: plan,
        update: {},
    })));
}
async function seedPlatformOwner() {
    await seedPlans();
    const existingPlatformOwner = await prisma_1.prisma.user.findFirst({
        where: { role: "PLATFORM_OWNER" },
        select: { id: true, username: true },
    });
    if (existingPlatformOwner) {
        console.log("Platform owner already exists");
        return;
    }
    const username = process.env.PLATFORM_OWNER_USERNAME?.trim();
    const password = process.env.PLATFORM_OWNER_PASSWORD;
    const fullName = process.env.PLATFORM_OWNER_FULL_NAME ?? "Platform Owner";
    const minimumPasswordLength = process.env.NODE_ENV === "production" ? 16 : 10;
    if (!username || !password) {
        throw new Error("No platform owner exists. Set PLATFORM_OWNER_USERNAME and PLATFORM_OWNER_PASSWORD before startup.");
    }
    if (password.length < minimumPasswordLength) {
        throw new Error(`PLATFORM_OWNER_PASSWORD must be at least ${minimumPasswordLength} characters`);
    }
    const hashedPassword = await bcrypt_1.default.hash(password, 12);
    await prisma_1.prisma.user.create({
        data: {
            fullName,
            username,
            password: hashedPassword,
            role: "PLATFORM_OWNER",
            storeId: null,
            branchId: null,
        },
    });
    console.log("Platform owner created successfully");
}
