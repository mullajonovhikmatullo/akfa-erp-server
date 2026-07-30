"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const seed_platform_owner_1 = require("../bootstrap/seed-platform-owner");
const prisma_1 = require("../infrastructure/prisma/prisma");
(0, seed_platform_owner_1.seedPlatformOwner)()
    .catch((error) => {
    console.error("Failed to seed platform owner:", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});
