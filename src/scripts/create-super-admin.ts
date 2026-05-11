import bcrypt from "bcrypt";
import { prisma } from "../infrastructure/prisma/prisma";

async function main() {
    // 1. Ensure Main Branch exists
    let mainBranch = await prisma.branch.findFirst({
        where: { name: "Main Branch" },
    });

    if (!mainBranch) {
        mainBranch = await prisma.branch.create({
            data: { name: "Main Branch" },
        });
        console.log("MAIN BRANCH CREATED:", mainBranch.id);
    } else {
        console.log("MAIN BRANCH EXISTS:", mainBranch.id);
    }

    // 2. Ensure Super Admin exists and is linked to Main Branch
    const existingUser = await prisma.user.findUnique({
        where: { username: "superadmin" },
    });

    if (existingUser) {
        if (!existingUser.branchId) {
            await prisma.user.update({
                where: { id: existingUser.id },
                data: { branchId: mainBranch.id },
            });
            console.log("SUPER ADMIN ASSIGNED TO MAIN BRANCH");
        } else {
            console.log("SUPER ADMIN ALREADY EXISTS AND HAS A BRANCH");
        }
        return;
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

    console.log("SUPER ADMIN CREATED AND ASSIGNED TO MAIN BRANCH");
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
