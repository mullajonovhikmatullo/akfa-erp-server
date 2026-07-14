"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedSuperAdmin = seedSuperAdmin;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../infrastructure/prisma/prisma");
async function seedSuperAdmin() {
    // Check if any SUPER_ADMIN already exists (by role, not just username)
    const existingSuperAdmin = await prisma_1.prisma.user.findFirst({
        where: { role: "SUPER_ADMIN" },
        select: { id: true, username: true },
    });
    if (existingSuperAdmin) {
        console.log("Super admin already exists");
        return;
    }
    // Ensure Main Branch exists
    let mainBranch = await prisma_1.prisma.branch.findFirst({
        where: { name: "Main Branch" },
    });
    if (!mainBranch) {
        mainBranch = await prisma_1.prisma.branch.create({
            data: { name: "Main Branch" },
        });
    }
    const hashedPassword = await bcrypt_1.default.hash("123456", 10);
    await prisma_1.prisma.user.create({
        data: {
            fullName: "Super Admin",
            username: "superadmin",
            password: hashedPassword,
            role: "SUPER_ADMIN",
            branchId: mainBranch.id,
        },
    });
    console.log("Super admin created successfully");
}
