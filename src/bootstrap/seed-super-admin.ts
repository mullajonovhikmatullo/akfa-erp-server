import bcrypt from "bcrypt";
import { prisma } from "../infrastructure/prisma/prisma";

const PLAN_SEEDS = [
    { code: "START" as const, name: "Start", monthlyPriceUzs: 199000, maxBranches: 1, maxUsers: 3, maxProducts: 1000 },
    { code: "BUSINESS" as const, name: "Business", monthlyPriceUzs: 399000, maxBranches: 5, maxUsers: 20, maxProducts: 10000 },
    { code: "NETWORK" as const, name: "Network", monthlyPriceUzs: 0, maxBranches: null, maxUsers: null, maxProducts: null },
];

async function seedPlans(): Promise<void> {
    await Promise.all(
        PLAN_SEEDS.map((plan) =>
            prisma.plan.upsert({
                where: { code: plan.code },
                create: plan,
                update: {
                    name: plan.name,
                    monthlyPriceUzs: plan.monthlyPriceUzs,
                    maxBranches: plan.maxBranches,
                    maxUsers: plan.maxUsers,
                    maxProducts: plan.maxProducts,
                    isActive: true,
                },
            })
        )
    );
}

export async function seedSuperAdmin(): Promise<void> {
    await seedPlans();

    const existingPlatformOwner = await prisma.user.findFirst({
        where: { role: "PLATFORM_OWNER" },
        select: { id: true, username: true },
    });

    if (existingPlatformOwner) {
        console.log("Platform owner already exists");
        return;
    }

    const username = process.env.PLATFORM_OWNER_USERNAME ?? "platform_owner";
    const password = process.env.PLATFORM_OWNER_PASSWORD ?? "123456";
    const fullName = process.env.PLATFORM_OWNER_FULL_NAME ?? "Platform Owner";
    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.create({
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
