import bcrypt from "bcrypt";
import { prisma } from "../infrastructure/prisma/prisma";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌱  Seed starting…\n");

  // ── 1. Branches ──────────────────────────────────────────────────────────

  const branchData = [
    { name: "Main Branch",             address: "Toshkent sh., Mustaqillik ko'ch. 1",  phone: "+998712001001" },
    { name: "Chilonzor filiali",        address: "Toshkent sh., Bunyodkor ko'ch. 14",   phone: "+998712001002" },
    { name: "Yunusobod filiali",        address: "Toshkent sh., Amir Temur shoh. 108",  phone: "+998712001003" },
    { name: "Shayxontohur filiali",     address: "Toshkent sh., Navoiy ko'ch. 55",      phone: "+998712001004" },
    { name: "Mirzo Ulug'bek filiali",   address: "Toshkent sh., Bog'ishamol ko'ch. 7",  phone: "+998712001005" },
  ];

  const branches = await Promise.all(
    branchData.map(async (b) => {
      const existing = await prisma.branch.findFirst({ where: { name: b.name } });
      if (existing) return existing;
      return prisma.branch.create({ data: b });
    })
  );

  const [mainBranch, chilonzor, yunusobod, shayxontohur, mirzoUlugbek] = branches as [
    typeof branches[0], typeof branches[0], typeof branches[0],
    typeof branches[0], typeof branches[0]
  ];

  console.log(`✅  Branches: ${branches.length}`);

  // ── 2. Super admin (ensure linked to Main Branch) ────────────────────────

  let superAdmin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!superAdmin) {
    superAdmin = await prisma.user.create({
      data: {
        fullName: "Super Admin",
        username: "superadmin",
        password: await bcrypt.hash("123456", 10),
        role: "SUPER_ADMIN",
        branchId: mainBranch.id,
      },
    });
  } else if (!superAdmin.branchId) {
    superAdmin = await prisma.user.update({
      where: { id: superAdmin.id },
      data: { branchId: mainBranch.id },
    });
  }

  console.log(`✅  Super admin: ${superAdmin.username}`);

  // ── 3. Branch admins (15) ─────────────────────────────────────────────────

  const adminDefs = [
    { fullName: "Dilnoza Yusupova",    username: "dilnoza",    branchId: mainBranch.id },
    { fullName: "Bobur Xasanov",       username: "bobur",      branchId: chilonzor.id },
    { fullName: "Mohira Rahimova",     username: "mohira",     branchId: yunusobod.id },
    { fullName: "Sarvar Toshmatov",    username: "sarvar",     branchId: shayxontohur.id },
    { fullName: "Nilufar Abdullayeva", username: "nilufar",    branchId: mirzoUlugbek.id },
    { fullName: "Jasur Qodirov",       username: "jasur",      branchId: chilonzor.id },
    { fullName: "Zulfiya Norova",      username: "zulfiya",    branchId: yunusobod.id },
    { fullName: "Otabek Mirzayev",     username: "otabek",     branchId: shayxontohur.id },
    { fullName: "Kamola Xoliqova",     username: "kamola",     branchId: mirzoUlugbek.id },
    { fullName: "Sherzod Umarov",      username: "sherzod",    branchId: mainBranch.id },
    { fullName: "Feruza Karimova",     username: "feruza",     branchId: chilonzor.id },
    { fullName: "Ulugbek Nazarov",     username: "ulugbek",    branchId: yunusobod.id },
    { fullName: "Barno Ergasheva",     username: "barno",      branchId: shayxontohur.id },
    { fullName: "Mansur Holiqov",      username: "mansur",     branchId: mirzoUlugbek.id },
    { fullName: "Gavhar Sultonova",    username: "gavhar",     branchId: mainBranch.id },
  ];

  const hashedPw = await bcrypt.hash("123456", 10);
  const admins = await Promise.all(
    adminDefs.map((a) =>
      prisma.user.upsert({
        where: { username: a.username },
        update: {},
        create: { ...a, password: hashedPw, role: "ADMIN" },
      })
    )
  );

  console.log(`✅  Branch admins: ${admins.length}`);

  // ── 4. Product categories (15) ────────────────────────────────────────────

  const categoryDefs = [
    { name: "Shisha mahsulotlar",      description: "Float, tinted va laminatlangan shishalar" },
    { name: "Metal profiller",         description: "Alyuminiy va po'lat konstruksiyalar" },
    { name: "Dekor elementlar",        description: "Fasad va ichki bezak panellari" },
    { name: "Polimer plitalar",        description: "PVC va akrilik plastik mahsulotlar" },
    { name: "Yog'och materiallar",     description: "Parket, laminat, MDF va DSP plitalar" },
    { name: "Santexnika",              description: "Quvurlar, kran va aloqa jihozlari" },
    { name: "Elektr jihozlar",         description: "Kabel, rozеtka va asbob-uskunalar" },
    { name: "Bo'yoq va laklar",        description: "Emulsiya, akrilik va yog' bo'yoqlar" },
    { name: "Qurilish materiallari",   description: "Sement, g'isht va qum-shag'al" },
    { name: "Eshik va derazalar",      description: "PVC, alyuminiy va yog'och eshik-derazalar" },
    { name: "Pol qoplamalari",         description: "Kafel, granit va epoksi qoplamalar" },
    { name: "Shiftlar",                description: "Gipsokarton, Armstrong va geriladigan shiftlar" },
    { name: "Izolyatsiya",             description: "Issiqlik va ovoz izolyatsiya materiallari" },
    { name: "Yopqich materiallar",     description: "Shifer, metall va bitumli tomlar" },
    { name: "Yelim va sealantlar",     description: "Qurilish silikon, akril va poliuretan yelimlari" },
  ];

  const categories = await Promise.all(
    categoryDefs.map((c) =>
      prisma.productCategory.upsert({
        where: { name: c.name },
        update: {},
        create: c,
      })
    )
  );

  console.log(`✅  Product categories: ${categories.length}`);

  // ── 5. Products (15) ──────────────────────────────────────────────────────

  const productDefs = [
    { name: "Float shisha 4mm",      sku: "SH-FLT-4",  unit: "SQUARE_METER", catI: 0,  retail: 85_000,   wholesale: 72_000  },
    { name: "Float shisha 6mm",      sku: "SH-FLT-6",  unit: "SQUARE_METER", catI: 0,  retail: 135_000,  wholesale: 115_000 },
    { name: "Tinted shisha 5mm",     sku: "SH-TNT-5",  unit: "SQUARE_METER", catI: 0,  retail: 160_000,  wholesale: 140_000 },
    { name: "Alyuminiy profil 6m",   sku: "MT-ALU-6M", unit: "METER",        catI: 1,  retail: 48_000,   wholesale: 40_000  },
    { name: "Po'lat burchak 40×40",  sku: "MT-STL-40", unit: "METER",        catI: 1,  retail: 32_000,   wholesale: 26_000  },
    { name: "Dekor panel fasad",     sku: "DC-PNL-F",  unit: "SQUARE_METER", catI: 2,  retail: 220_000,  wholesale: 190_000 },
    { name: "Laminat Classic 8mm",   sku: "WD-LAM-8",  unit: "SQUARE_METER", catI: 4,  retail: 95_000,   wholesale: 80_000  },
    { name: "MDF plita 18mm",        sku: "WD-MDF-18", unit: "PIECE",        catI: 4,  retail: 185_000,  wholesale: 158_000 },
    { name: "Akrilik bo'yoq 1L",     sku: "PT-ACR-1L", unit: "LITER",        catI: 7,  retail: 52_000,   wholesale: 44_000  },
    { name: "Silikon oq 280ml",      sku: "GL-SIL-W",  unit: "PIECE",        catI: 14, retail: 28_000,   wholesale: 22_000  },
    { name: "Sement M400 50kg",      sku: "CM-M400",   unit: "KG",           catI: 8,  retail: 1_800,    wholesale: 1_500   },
    { name: "Pol kafel 40×40",       sku: "FL-KAF-40", unit: "SQUARE_METER", catI: 10, retail: 145_000,  wholesale: 125_000 },
    { name: "Penoplex 50mm",         sku: "IS-PNX-50", unit: "SQUARE_METER", catI: 12, retail: 78_000,   wholesale: 66_000  },
    { name: "PVC kirish eshigi",     sku: "DR-PVC-E",  unit: "SET",          catI: 9,  retail: 3_200_000, wholesale: 2_800_000 },
    { name: "Gipsokarton 12mm",      sku: "CL-GKL-12", unit: "PIECE",        catI: 11, retail: 62_000,   wholesale: 52_000  },
  ] as const;

  const products = await Promise.all(
    productDefs.map((p) => {
      const category = categories[p.catI]!;
      return prisma.product.upsert({
        where: { sku: p.sku },
        update: {},
        create: {
          name: p.name,
          sku: p.sku,
          unit: p.unit as never,
          categoryId: category.id,
          retailPriceUzs: p.retail,
          wholesalePriceUzs: p.wholesale,
          retailPriceUsd: +(p.retail / 12650).toFixed(4),
          wholesalePriceUsd: +(p.wholesale / 12650).toFixed(4),
          lowStockThreshold: 10,
        },
      });
    })
  );

  console.log(`✅  Products: ${products.length}`);

  // ── 6. Customers (15) ─────────────────────────────────────────────────────

  const customerDefs = [
    { fullName: "Alisher Karimov",     phone: "+998901234567", address: "Toshkent, Chilonzor", branchId: mainBranch.id },
    { fullName: "Malika Yusupova",     phone: "+998907654321", address: "Toshkent, Yunusobod",  branchId: chilonzor.id  },
    { fullName: "Bahodir Toshmatov",   phone: "+998931111222", address: "Toshkent, Shayxontohur", branchId: yunusobod.id },
    { fullName: "Nargiza Rahimova",    phone: "+998932223334", address: "Toshkent, Olmazor",   branchId: shayxontohur.id },
    { fullName: "Sanjar Nazarov",      phone: "+998903334445", address: "Toshkent, Mirzo Ulug'bek", branchId: mirzoUlugbek.id },
    { fullName: "Gulnora Ergasheva",   phone: "+998934445556", address: "Andijon sh.",          branchId: mainBranch.id },
    { fullName: "Firdavs Xoliqov",    phone: "+998935556667", address: "Namangan sh.",         branchId: chilonzor.id  },
    { fullName: "Dildora Sultonova",   phone: "+998936667778", address: "Samarqand sh.",        branchId: yunusobod.id  },
    { fullName: "Jahongir Mirzayev",   phone: "+998937778889", address: "Farg'ona sh.",         branchId: shayxontohur.id },
    { fullName: "Ziyoda Abdullayeva",  phone: "+998938889990", address: "Buxoro sh.",           branchId: mirzoUlugbek.id },
    { fullName: "Rahim Qodirov",       phone: "+998939990001", address: "Qo'qon sh.",           branchId: mainBranch.id },
    { fullName: "Sarvinoz Norova",     phone: "+998901001112", address: "Urganch sh.",          branchId: chilonzor.id  },
    { fullName: "Bekzod Umarov",       phone: "+998902112223", address: "Qarshi sh.",           branchId: yunusobod.id  },
    { fullName: "Muazzam Holiqova",    phone: "+998903223334", address: "Termiz sh.",           branchId: shayxontohur.id },
    { fullName: "Islom Xasanov",       phone: "+998904334445", address: "Jizzax sh.",           branchId: mirzoUlugbek.id },
  ];

  const customers: { id: string }[] = [];
  for (const c of customerDefs) {
    const existing = await prisma.customer.findFirst({
      where: { phone: c.phone },
    });
    if (!existing) {
      const created = await prisma.customer.create({ data: c });
      customers.push(created);
    } else {
      customers.push(existing);
    }
  }

  console.log(`✅  Customers: ${customers.length}`);

  // ── 7. Stock batches + Inventory (15) ─────────────────────────────────────

  // Use superAdmin as createdBy for all batches
  const existingBatches = await prisma.stockBatch.count();
  if (existingBatches < 10) {
    const allBranches = [mainBranch, chilonzor, yunusobod, shayxontohur, mirzoUlugbek];

    for (let i = 0; i < 15; i++) {
      const product = products[i % products.length]!;
      const branch = allBranches[i % allBranches.length]!;
      const qty = rand(50, 300);
      const costUzs = Math.round(Number(product.wholesalePriceUzs) * 0.7);

      await prisma.$transaction(async (tx) => {
        await tx.stockBatch.create({
          data: {
            branchId: branch.id,
            productId: product.id,
            initialQty: qty,
            remainingQty: qty,
            costPriceUzs: costUzs,
            costPriceUsd: +(costUzs / 12650).toFixed(4),
            supplierNote: i % 3 === 0 ? `Etkazuvchi: AKFA Logistics` : null,
            receivedAt: daysAgo(rand(1, 90)),
            createdById: superAdmin!.id,
          },
        });

        await tx.inventory.upsert({
          where: { branchId_productId: { branchId: branch.id, productId: product.id } },
          update: { quantity: { increment: qty } },
          create: { branchId: branch.id, productId: product.id, quantity: qty },
        });

        await tx.stockMovement.create({
          data: {
            branchId: branch.id,
            productId: product.id,
            type: "STOCK_IN",
            quantity: qty,
            balanceAfter: qty,
            note: "Boshlang'ich kirim (seed)",
            createdById: superAdmin!.id,
          },
        });
      });
    }
  }

  console.log(`✅  Stock batches: 15`);

  // ── 8. Expense categories ─────────────────────────────────────────────────

  const expCatDefs = [
    { name: "Ijara",            description: "Bino va yer ijarasi" },
    { name: "Maosh va bonus",   description: "Xodimlar ish haqi va mukofotlari" },
    { name: "Kommunal xarajat", description: "Elektr, gaz, suv to'lovlari" },
    { name: "Transport",        description: "Yoqilg'i, ta'mirlash va lizing" },
    { name: "Marketing",        description: "Reklama va brend xarajatlari" },
  ];

  const expCats = await Promise.all(
    expCatDefs.map((c) =>
      prisma.expenseCategory.upsert({
        where: { name: c.name },
        update: {},
        create: c,
      })
    )
  );

  console.log(`✅  Expense categories: ${expCats.length}`);

  // ── 9. Expenses (15) ──────────────────────────────────────────────────────

  const existingExpenses = await prisma.expense.count();
  if (existingExpenses < 10) {
    const expenseAmounts = [
      4_500_000, 12_000_000, 1_800_000, 3_200_000, 950_000,
      8_000_000, 2_100_000, 5_500_000, 1_200_000, 6_700_000,
      3_800_000, 2_600_000, 900_000,   4_100_000, 7_300_000,
    ];
    const expenseDescs = [
      "Mart oylik ijara to'lovi", "Xodimlar aprèl oyi maoshi", "Elektr energiya hisobi",
      "Dostavka avtomashinasi yoqilg'isi", "Instagram va Google reklama",
      "May oyi xodimlar maoshi", "Suv va gaz to'lovi", "Iyun ijara to'lovi",
      "Telefon va internet to'lovi", "Xodimlar bonus to'lovi",
      "Yangi mashina ta'mirlash", "Flyerlar chop etish", "Konditsioner ta'mirlash",
      "Yanvar ijara to'lovi", "Fevral maoshi",
    ];
    const allBranches = [mainBranch, chilonzor, yunusobod, shayxontohur, mirzoUlugbek];
    const allAdmins   = [superAdmin!, ...admins];

    for (let i = 0; i < 15; i++) {
      await prisma.expense.create({
        data: {
          branchId:    allBranches[i % allBranches.length]!.id,
          categoryId:  expCats[i % expCats.length]!.id,
          amount:      expenseAmounts[i]!,
          description: expenseDescs[i],
          expenseDate: daysAgo(rand(1, 120)),
          createdById: allAdmins[i % allAdmins.length]!.id,
        },
      });
    }
  }

  console.log(`✅  Expenses: 15`);

  // ── 10. Sales + items + payments (15) ─────────────────────────────────────

  const existingSales = await prisma.sale.count();
  if (existingSales < 10) {
    const allBranches   = [mainBranch, chilonzor, yunusobod, shayxontohur, mirzoUlugbek];
    const allAdmins     = [superAdmin!, ...admins];
    const saleTypes     = ["RETAIL", "WHOLESALE"] as const;
    const payMethods    = ["CASH_UZS", "CARD", "TRANSFER", "CREDIT"] as const;

    for (let i = 0; i < 15; i++) {
      const branch   = allBranches[i % allBranches.length]!;
      const seller   = allAdmins[i % allAdmins.length]!;
      const customer = customers[i % customers.length]!;
      const saleType = saleTypes[i % 2]!;

      // 2–3 items per sale
      const itemCount = rand(2, 3);
      const saleItems: { productId: string; quantity: number; unitPrice: number; totalPrice: number }[] = [];

      for (let j = 0; j < itemCount; j++) {
        const product = products[(i + j) % products.length]!;
        const qty     = rand(1, 10);
        const price   = saleType === "RETAIL"
          ? Number(product.retailPriceUzs)
          : Number(product.wholesalePriceUzs);
        saleItems.push({
          productId:  product.id,
          quantity:   qty,
          unitPrice:  price,
          totalPrice: price * qty,
        });
      }

      const totalAmount = saleItems.reduce((s, it) => s + it.totalPrice, 0);
      // 70% chance fully paid, 30% chance partial (credit)
      const isPaid       = i % 3 !== 2;
      const paidAmount   = isPaid ? totalAmount : Math.round(totalAmount * rand(30, 70) / 100);
      const debtAmount   = totalAmount - paidAmount;
      const payMethod    = debtAmount > 0 ? "CREDIT" : payMethods[i % 3]!;

      await prisma.$transaction(async (tx) => {
        const sale = await tx.sale.create({
          data: {
            branchId:      branch.id,
            customerId:    customer.id,
            soldById:      seller.id,
            saleType,
            totalAmountUzs: totalAmount,
            paidAmountUzs:  paidAmount,
            debtAmountUzs:  debtAmount,
            createdAt:     daysAgo(rand(0, 60)),
            items: {
              create: saleItems.map((it) => ({
                productId:  it.productId,
                quantity:   it.quantity,
                unitPrice:  it.unitPrice,
                totalPrice: it.totalPrice,
              })),
            },
          },
        });

        // Payment record
        if (paidAmount > 0) {
          await tx.salePayment.create({
            data: {
              saleId:        sale.id,
              amountUzs:     paidAmount,
              paymentMethod: payMethod as never,
              receivedById:  seller.id,
            },
          });
        }

        // Update customer balance (positive = debt)
        if (debtAmount > 0) {
          await tx.customer.update({
            where: { id: customer.id },
            data: { balance: { increment: debtAmount } },
          });
        }

        // Stock movements (STOCK_OUT) for each item
        for (const it of saleItems) {
          const inv = await tx.inventory.findUnique({
            where: { branchId_productId: { branchId: branch.id, productId: it.productId } },
          });
          const current = Number(inv?.quantity ?? 0);
          const after   = Math.max(0, current - it.quantity);

          await tx.inventory.upsert({
            where: { branchId_productId: { branchId: branch.id, productId: it.productId } },
            update: { quantity: after },
            create: { branchId: branch.id, productId: it.productId, quantity: after },
          });

          await tx.stockMovement.create({
            data: {
              branchId:    branch.id,
              productId:   it.productId,
              type:        "STOCK_OUT",
              quantity:    it.quantity,
              balanceAfter: after,
              note:        `Sotuv #${sale.id.slice(0, 8)}`,
              createdById: seller.id,
            },
          });
        }
      });
    }
  }

  console.log(`✅  Sales: 15`);

  // ── 11. Transfers (15) ────────────────────────────────────────────────────

  const existingTransfers = await prisma.transfer.count();
  if (existingTransfers < 10) {
    const branchPairs = [
      [mainBranch,    chilonzor       ],
      [chilonzor,     yunusobod       ],
      [yunusobod,     shayxontohur    ],
      [shayxontohur,  mirzoUlugbek    ],
      [mirzoUlugbek,  mainBranch      ],
      [mainBranch,    yunusobod       ],
      [chilonzor,     mirzoUlugbek    ],
      [yunusobod,     mainBranch      ],
      [shayxontohur,  chilonzor       ],
      [mirzoUlugbek,  shayxontohur    ],
      [mainBranch,    shayxontohur    ],
      [chilonzor,     shayxontohur    ],
      [yunusobod,     mirzoUlugbek    ],
      [mirzoUlugbek,  yunusobod       ],
      [shayxontohur,  mainBranch      ],
    ] as [typeof mainBranch, typeof mainBranch][];

    const statuses: ("PENDING" | "COMPLETED" | "CANCELLED")[] = [
      "COMPLETED","COMPLETED","COMPLETED","COMPLETED","COMPLETED",
      "COMPLETED","COMPLETED","PENDING",  "PENDING",  "PENDING",
      "PENDING",  "PENDING",  "CANCELLED","CANCELLED","PENDING",
    ];

    const allAdmins = [superAdmin!, ...admins];

    for (let i = 0; i < 15; i++) {
      const [from, to] = branchPairs[i]!;
      const status     = statuses[i]!;
      const initiator  = allAdmins[i % allAdmins.length]!;

      // 1–2 products per transfer
      const itemCount = rand(1, 2);
      const tItems: { productId: string; qty: number; unitCost: number }[] = [];
      for (let j = 0; j < itemCount; j++) {
        const product = products[(i + j + 5) % products.length]!;
        tItems.push({
          productId: product.id,
          qty:       rand(5, 50),
          unitCost:  Math.round(Number(product.wholesalePriceUzs) * 0.7),
        });
      }

      await prisma.$transaction(async (tx) => {
        const transfer = await tx.transfer.create({
          data: {
            fromBranchId:  from.id,
            toBranchId:    to.id,
            status,
            note:          `Transfer ${i + 1}`,
            initiatedById: initiator.id,
            completedById: status === "COMPLETED" ? superAdmin!.id : null,
            completedAt:   status === "COMPLETED" ? daysAgo(rand(0, 30)) : null,
            createdAt:     daysAgo(rand(0, 60)),
            items: {
              create: tItems.map((it) => ({
                productId:   it.productId,
                quantity:    it.qty,
                unitCostUzs: it.unitCost,
                totalCostUzs: it.unitCost * it.qty,
              })),
            },
          },
        });

        // For COMPLETED transfers, update inventory on both branches
        if (status === "COMPLETED") {
          for (const it of tItems) {
            // TRANSFER_OUT from source
            const fromInv = await tx.inventory.findUnique({
              where: { branchId_productId: { branchId: from.id, productId: it.productId } },
            });
            const fromQty = Math.max(0, Number(fromInv?.quantity ?? 0) - it.qty);
            await tx.inventory.upsert({
              where: { branchId_productId: { branchId: from.id, productId: it.productId } },
              update: { quantity: fromQty },
              create: { branchId: from.id, productId: it.productId, quantity: fromQty },
            });
            await tx.stockMovement.create({
              data: {
                branchId:    from.id,
                productId:   it.productId,
                type:        "TRANSFER_OUT",
                quantity:    it.qty,
                balanceAfter: fromQty,
                note:        `Transfer #${transfer.id.slice(0, 8)}`,
                createdById: initiator.id,
              },
            });

            // TRANSFER_IN to destination
            const toInv = await tx.inventory.findUnique({
              where: { branchId_productId: { branchId: to.id, productId: it.productId } },
            });
            const toQty = Number(toInv?.quantity ?? 0) + it.qty;
            await tx.inventory.upsert({
              where: { branchId_productId: { branchId: to.id, productId: it.productId } },
              update: { quantity: toQty },
              create: { branchId: to.id, productId: it.productId, quantity: toQty },
            });
            await tx.stockMovement.create({
              data: {
                branchId:    to.id,
                productId:   it.productId,
                type:        "TRANSFER_IN",
                quantity:    it.qty,
                balanceAfter: toQty,
                note:        `Transfer #${transfer.id.slice(0, 8)}`,
                createdById: initiator.id,
              },
            });
          }
        }
      });
    }
  }

  console.log(`✅  Transfers: 15`);

  // ── Summary ───────────────────────────────────────────────────────────────

  const counts = await Promise.all([
    prisma.branch.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.productCategory.count(),
    prisma.product.count(),
    prisma.customer.count(),
    prisma.stockBatch.count(),
    prisma.expenseCategory.count(),
    prisma.expense.count(),
    prisma.sale.count(),
    prisma.transfer.count(),
  ]);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Branches           : ${counts[0]}
  Branch admins      : ${counts[1]}
  Product categories : ${counts[2]}
  Products           : ${counts[3]}
  Customers          : ${counts[4]}
  Stock batches      : ${counts[5]}
  Expense categories : ${counts[6]}
  Expenses           : ${counts[7]}
  Sales              : ${counts[8]}
  Transfers          : ${counts[9]}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉  Seed complete!
`);
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
