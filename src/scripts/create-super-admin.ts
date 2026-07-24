import { seedSuperAdmin } from "../bootstrap/seed-super-admin";
import { prisma } from "../infrastructure/prisma/prisma";

seedSuperAdmin()
    .catch((error) => {
        console.error("Failed to seed platform owner:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
