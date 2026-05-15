import bcrypt from "bcrypt";
import { prisma } from "../infrastructure/prisma/prisma";

export async function seedSuperAdmin(): Promise<void> {
    // Check if any SUPER_ADMIN already exists (by role, not just username)
    const existingSuperAdmin = await prisma.user.findFirst({
        where: { role: "SUPER_ADMIN" },
        select: { id: true, username: true },
    });

    if (existingSuperAdmin) {
        console.log("Super admin already exists");
        return;
    }

    // Ensure Main Branch exists
    let mainBranch = await prisma.branch.findFirst({
        where: { name: "Main Branch" },
    });

    if (!mainBranch) {
        mainBranch = await prisma.branch.create({
            data: { name: "Main Branch" },
        });
    }

    const hashedPassword = await bcrypt.hash("123456", 10);

    await prisma.user.create({
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
