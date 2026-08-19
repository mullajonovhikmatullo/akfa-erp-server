const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const {
    ProfilePhotoService,
} = require("../dist/modules/auth/services/profile-photo.service");
const { AuthService } = require("../dist/modules/auth/services/auth.service");
const { prisma } = require("../dist/infrastructure/prisma/prisma");

async function pngDataUrl(width = 640, height = 480) {
    const content = await sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 35, g: 125, b: 210 },
        },
    }).png().toBuffer();

    return `data:image/png;base64,${content.toString("base64")}`;
}

function decodeDataUrl(value) {
    return Buffer.from(value.split(",")[1], "base64");
}

test("profile photo creates clear WebP and square thumbnail data URLs", async () => {
    const result = await ProfilePhotoService.process(await pngDataUrl());

    assert.match(result.base64Photo, /^data:image\/webp;base64,/);
    assert.match(result.thumbnailPhoto, /^data:image\/webp;base64,/);

    const mainMetadata = await sharp(decodeDataUrl(result.base64Photo)).metadata();
    const thumbnailMetadata = await sharp(decodeDataUrl(result.thumbnailPhoto)).metadata();

    assert.equal(mainMetadata.format, "webp");
    assert.equal(mainMetadata.width, 640);
    assert.equal(mainMetadata.height, 480);
    assert.equal(thumbnailMetadata.format, "webp");
    assert.equal(thumbnailMetadata.width, 96);
    assert.equal(thumbnailMetadata.height, 96);
});

test("profile photo downsizes large images without stretching", async () => {
    const result = await ProfilePhotoService.process(await pngDataUrl(1800, 900));
    const metadata = await sharp(decodeDataUrl(result.base64Photo)).metadata();

    assert.equal(metadata.width, 1400);
    assert.equal(metadata.height, 700);
});

test("profile photo rejects unsupported data URLs", async () => {
    await assert.rejects(
        () => ProfilePhotoService.process("data:image/svg+xml;base64,PHN2Zy8+"),
        (error) => error.statusCode === 422
    );
});

test("deleting a profile photo clears both database columns atomically", async (t) => {
    let updateArguments;
    const originalTransaction = prisma.$transaction;
    t.after(() => {
        prisma.$transaction = originalTransaction;
    });

    prisma.$transaction = async (callback) => callback({
        user: {
            findUnique: async () => ({
                id: "user-1",
                storeId: null,
                isActive: true,
            }),
            update: async (arguments_) => {
                updateArguments = arguments_;
                return {
                    id: "user-1",
                    fullName: "Test User",
                    username: "test-user",
                    role: "STORE_OWNER",
                    branchId: null,
                    storeId: null,
                    isActive: true,
                    mustChangePassword: false,
                    authVersion: 0,
                    base64Photo: null,
                    thumbnailPhoto: null,
                    store: null,
                };
            },
        },
    });

    const result = await AuthService.deleteProfilePhoto("user-1");

    assert.deepEqual(updateArguments.data, {
        base64Photo: null,
        thumbnailPhoto: null,
    });
    assert.equal(result.base64Photo, null);
    assert.equal(result.thumbnailPhoto, null);
});

test("replacing a profile photo overwrites both database columns together", async (t) => {
    let updateArguments;
    const originalTransaction = prisma.$transaction;
    t.after(() => {
        prisma.$transaction = originalTransaction;
    });

    prisma.$transaction = async (callback) => callback({
        user: {
            findUnique: async () => ({
                id: "user-1",
                storeId: null,
                isActive: true,
            }),
            update: async (arguments_) => {
                updateArguments = arguments_;
                return {
                    id: "user-1",
                    fullName: "Test User",
                    username: "test-user",
                    role: "STORE_OWNER",
                    branchId: null,
                    storeId: null,
                    isActive: true,
                    mustChangePassword: false,
                    authVersion: 0,
                    ...arguments_.data,
                    store: null,
                };
            },
        },
    });

    const result = await AuthService.updateProfilePhoto("user-1", {
        base64Photo: await pngDataUrl(120, 80),
    });

    assert.match(updateArguments.data.base64Photo, /^data:image\/webp;base64,/);
    assert.match(updateArguments.data.thumbnailPhoto, /^data:image\/webp;base64,/);
    assert.equal(result.base64Photo, updateArguments.data.base64Photo);
    assert.equal(result.thumbnailPhoto, updateArguments.data.thumbnailPhoto);
});
