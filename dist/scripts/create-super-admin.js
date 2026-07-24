"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const seed_super_admin_1 = require("../bootstrap/seed-super-admin");
const prisma_1 = require("../infrastructure/prisma/prisma");
(0, seed_super_admin_1.seedSuperAdmin)()
    .catch((error) => {
    console.error("Failed to seed platform owner:", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});
