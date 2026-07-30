import { seedPlatformOwner } from "../bootstrap/seed-platform-owner";
import { prisma } from "../infrastructure/prisma/prisma";

seedPlatformOwner()
    .catch((error) => {
        console.error("Failed to seed platform owner:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
