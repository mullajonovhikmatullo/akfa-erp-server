const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const {
    mkdtemp,
    readdir,
    rm,
} = require("fs/promises");
const sharp = require("sharp");
const { StoreStatus, SubscriptionStatus } = require("@prisma/client");
const { LocalFileStorageService } = require("../dist/core/storage");
const {
    ImageProcessingService,
    validateUploadedImageFile,
} = require("../dist/modules/products/images/services/image-processing.service");
const {
    assertProductImageCapacity,
    createProductImagesService,
} = require("../dist/modules/products/images/services/product-images.service");
const {
    serializeProductResponse,
} = require("../dist/modules/products/presenters/product.presenter");

const STORE_ID = "0f7683fb-7c0a-40b6-a7d1-e3548231b789";
const OTHER_STORE_ID = "cf55c150-424b-4d38-9271-ccff5b719c1a";
const PRODUCT_ID = "1435fe47-8444-4575-806f-a39d18ef05b8";

const user = (storeId = STORE_ID) => ({
    id: "0a745afb-6cf8-4a77-a44e-fbb72306a73d",
    role: "STORE_OWNER",
    storeId,
    branchId: null,
    authVersion: 0,
});

class MemoryStorage {
    constructor() {
        this.files = new Map();
    }

    async save({ storageKey, content }) {
        if (this.files.has(storageKey)) throw new Error("duplicate");
        this.files.set(storageKey, Buffer.from(content));
        return { storageKey, sizeBytes: content.length };
    }

    async delete(storageKey) {
        this.files.delete(storageKey);
    }

    async exists(storageKey) {
        return this.files.has(storageKey);
    }

    async read(storageKey) {
        const value = this.files.get(storageKey);
        if (!value) throw new Error("missing");
        return value;
    }

    getPublicUrl(storageKey) {
        return `http://localhost:3000/uploads/${storageKey}`;
    }
}

function imageRecord(id, options = {}) {
    return {
        id,
        storeId: options.storeId ?? STORE_ID,
        productId: options.productId ?? PRODUCT_ID,
        storageKey: `organizations/${options.storeId ?? STORE_ID}/products/${PRODUCT_ID}/${id}/main.webp`,
        thumbnailStorageKey: `organizations/${options.storeId ?? STORE_ID}/products/${PRODUCT_ID}/${id}/thumbnail.webp`,
        originalFilename: `${id}.png`,
        mimeType: "image/webp",
        fileSize: 100,
        width: 100,
        height: 100,
        isPrimary: options.isPrimary ?? false,
        sortOrder: options.sortOrder ?? 0,
        createdAt: new Date("2026-07-25T12:00:00.000Z"),
        updatedAt: new Date("2026-07-25T12:00:00.000Z"),
    };
}

function matches(record, where = {}) {
    return Object.entries(where).every(([key, value]) => {
        if (value === undefined) return true;
        return record[key] === value;
    });
}

function createRepositoryHarness(initialImages = []) {
    const images = initialImages.map((image) => ({ ...image }));

    const ordered = (records) =>
        [...records].sort(
            (a, b) =>
                a.sortOrder - b.sortOrder ||
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
                a.id.localeCompare(b.id)
        );

    const tx = {
        $queryRaw: async () => [{ id: STORE_ID }],
        store: {
            findUnique: async ({ where }) =>
                where.id === STORE_ID
                    ? {
                        id: STORE_ID,
                        status: StoreStatus.ACTIVE,
                        billingVersion: 0,
                        subscription: {
                            id: "subscription",
                            status: SubscriptionStatus.ACTIVE,
                            trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
                            currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
                        },
                    }
                    : null,
        },
        productImage: {
            findMany: async ({ where }) => ordered(images.filter((image) => matches(image, where))),
            findFirst: async ({ where }) => images.find((image) => matches(image, where)) ?? null,
            create: async ({ data }) => {
                const created = {
                    ...data,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                images.push(created);
                return { ...created };
            },
            deleteMany: async ({ where }) => {
                let count = 0;
                for (let index = images.length - 1; index >= 0; index -= 1) {
                    if (matches(images[index], where)) {
                        images.splice(index, 1);
                        count += 1;
                    }
                }
                return { count };
            },
            updateMany: async ({ where, data }) => {
                let count = 0;
                images.forEach((image) => {
                    if (matches(image, where)) {
                        Object.assign(image, data, { updatedAt: new Date() });
                        count += 1;
                    }
                });
                return { count };
            },
        },
    };

    const repository = {
        findTenantProduct: async (productId, storeId) =>
            productId === PRODUCT_ID && storeId === STORE_ID
                ? { id: PRODUCT_ID, storeId: STORE_ID }
                : null,
        list: async (productId, storeId) =>
            ordered(images.filter((image) => matches(image, { productId, storeId }))),
        findImage: async (imageId, productId, storeId) =>
            images.find((image) =>
                matches(image, { id: imageId, productId, storeId })
            ) ?? null,
        transaction: async (callback) => callback(tx),
        lockTenantProduct: async (_tx, productId, storeId) =>
            productId === PRODUCT_ID && storeId === STORE_ID
                ? { id: PRODUCT_ID }
                : null,
    };

    return { repository, images, tx };
}

async function pngFixture() {
    return sharp({
        create: {
            width: 32,
            height: 20,
            channels: 3,
            background: { r: 40, g: 140, b: 210 },
        },
    })
        .png()
        .toBuffer();
}

test("successful upload processes WebP files and makes the first image primary", async () => {
    const { repository, images } = createRepositoryHarness();
    const storage = new MemoryStorage();
    const service = createProductImagesService({ repository, storage });
    const buffer = await pngFixture();

    const result = await service.upload(
        PRODUCT_ID,
        [{
            buffer,
            originalname: "product.png",
            mimetype: "image/png",
            size: buffer.length,
        }],
        user()
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].isPrimary, true);
    assert.equal(result[0].mimeType, "image/webp");
    assert.equal(images.length, 1);
    assert.equal(storage.files.size, 2);
});

test("unsupported MIME type is rejected", () => {
    assert.throws(
        () => validateUploadedImageFile({ mimetype: "image/gif", size: 100 }),
        (error) => error.statusCode === 422
    );
});

test("files larger than 5 MB are rejected", () => {
    assert.throws(
        () =>
            validateUploadedImageFile({
                mimetype: "image/png",
                size: 5 * 1024 * 1024 + 1,
            }),
        (error) => error.statusCode === 413
    );
});

test("corrupted image content is rejected by real decoding", async () => {
    await assert.rejects(
        () =>
            ImageProcessingService.process({
                buffer: Buffer.from("not an image"),
                originalname: "broken.jpg",
                mimetype: "image/jpeg",
                size: 12,
            }),
        (error) => error.statusCode === 422
    );
});

test("more than five product images are rejected", () => {
    assert.throws(
        () => assertProductImageCapacity(4, 2, 5),
        (error) => error.statusCode === 422
    );
});

test("a product from another organization is not visible to upload", async () => {
    const { repository } = createRepositoryHarness();
    const service = createProductImagesService({
        repository,
        storage: new MemoryStorage(),
    });

    await assert.rejects(
        () =>
            service.upload(
                PRODUCT_ID,
                [{
                    buffer: Buffer.from("x"),
                    originalname: "x.png",
                    mimetype: "image/png",
                    size: 1,
                }],
                user(OTHER_STORE_ID)
            ),
        (error) => error.statusCode === 404
    );
});

test("an image from another organization cannot be deleted", async () => {
    const foreign = imageRecord("foreign-image", { storeId: OTHER_STORE_ID });
    const { repository } = createRepositoryHarness([foreign]);
    const service = createProductImagesService({
        repository,
        storage: new MemoryStorage(),
    });

    await assert.rejects(
        () => service.delete(PRODUCT_ID, foreign.id, user()),
        (error) => error.statusCode === 404
    );
});

test("authenticated image reads scope the route store, product and image together", async () => {
    const image = imageRecord("readable", { isPrimary: true });
    const storage = new MemoryStorage();
    storage.files.set(image.thumbnailStorageKey, Buffer.from("thumbnail"));
    const { repository } = createRepositoryHarness([image]);
    const service = createProductImagesService({ repository, storage });

    const result = await service.readFile(
        STORE_ID,
        PRODUCT_ID,
        image.id,
        "thumbnail.webp",
        user()
    );
    assert.equal(result.content.toString(), "thumbnail");

    await assert.rejects(
        () =>
            service.readFile(
                OTHER_STORE_ID,
                PRODUCT_ID,
                image.id,
                "thumbnail.webp",
                user()
            ),
        (error) => error.statusCode === 404
    );
});

test("setting primary clears the previous primary image", async () => {
    const first = imageRecord("first", { isPrimary: true, sortOrder: 0 });
    const second = imageRecord("second", { sortOrder: 1 });
    const { repository } = createRepositoryHarness([first, second]);
    const service = createProductImagesService({
        repository,
        storage: new MemoryStorage(),
    });

    const result = await service.setPrimary(PRODUCT_ID, second.id, user());
    assert.equal(result.find((image) => image.id === first.id).isPrimary, false);
    assert.equal(result.find((image) => image.id === second.id).isPrimary, true);
});

test("replacing an image preserves primary state and order and removes old files", async () => {
    const current = imageRecord("current", { isPrimary: true, sortOrder: 3 });
    const storage = new MemoryStorage();
    storage.files.set(current.storageKey, Buffer.from("old-main"));
    storage.files.set(current.thumbnailStorageKey, Buffer.from("old-thumb"));
    const { repository } = createRepositoryHarness([current]);
    const processor = {
        process: async () => ({
            main: Buffer.from("new-main"),
            thumbnail: Buffer.from("new-thumb"),
            originalFilename: "replacement.png",
            mimeType: "image/webp",
            fileSize: 8,
            width: 20,
            height: 20,
        }),
    };
    const service = createProductImagesService({
        repository,
        storage,
        processor,
    });

    const result = await service.replace(
        PRODUCT_ID,
        current.id,
        [{
            buffer: Buffer.from("input"),
            originalname: "replacement.png",
            mimetype: "image/png",
            size: 5,
        }],
        user()
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].isPrimary, true);
    assert.equal(result[0].sortOrder, 3);
    assert.notEqual(result[0].id, current.id);
    assert.equal(storage.files.has(current.storageKey), false);
    assert.equal(storage.files.has(current.thumbnailStorageKey), false);
    assert.equal(storage.files.size, 2);
});

test("deleting a primary image removes its files", async () => {
    const first = imageRecord("first", { isPrimary: true, sortOrder: 0 });
    const second = imageRecord("second", { sortOrder: 1 });
    const storage = new MemoryStorage();
    storage.files.set(first.storageKey, Buffer.from("main"));
    storage.files.set(first.thumbnailStorageKey, Buffer.from("thumb"));
    const { repository } = createRepositoryHarness([first, second]);
    const service = createProductImagesService({ repository, storage });

    await service.delete(PRODUCT_ID, first.id, user());
    assert.equal(storage.files.has(first.storageKey), false);
    assert.equal(storage.files.has(first.thumbnailStorageKey), false);
});

test("deleting primary automatically selects the lowest sort order", async () => {
    const primary = imageRecord("primary", { isPrimary: true, sortOrder: 0 });
    const later = imageRecord("later", { sortOrder: 9 });
    const next = imageRecord("next", { sortOrder: 3 });
    const { repository } = createRepositoryHarness([primary, later, next]);
    const service = createProductImagesService({
        repository,
        storage: new MemoryStorage(),
    });

    const result = await service.delete(PRODUCT_ID, primary.id, user());
    assert.equal(result.find((image) => image.id === next.id).isPrimary, true);
    assert.equal(result.find((image) => image.id === later.id).isPrimary, false);
});

test("image reorder persists the exact requested order", async () => {
    const first = imageRecord("first", { isPrimary: true, sortOrder: 0 });
    const second = imageRecord("second", { sortOrder: 1 });
    const third = imageRecord("third", { sortOrder: 2 });
    const { repository } = createRepositoryHarness([first, second, third]);
    const service = createProductImagesService({
        repository,
        storage: new MemoryStorage(),
    });

    const result = await service.reorder(
        PRODUCT_ID,
        { imageIds: [third.id, first.id, second.id] },
        user()
    );
    assert.deepEqual(result.map((image) => image.id), [
        third.id,
        first.id,
        second.id,
    ]);
});

test("saved files are cleaned after a database failure", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "product-images-"));
    const storage = new LocalFileStorageService(
        root,
        "http://localhost:3000/uploads"
    );
    const { repository } = createRepositoryHarness();
    repository.transaction = async () => {
        throw new Error("database failed");
    };
    const processor = {
        process: async () => ({
            main: Buffer.from("main"),
            thumbnail: Buffer.from("thumb"),
            originalFilename: "fixture.png",
            mimeType: "image/webp",
            fileSize: 4,
            width: 1,
            height: 1,
        }),
    };
    const service = createProductImagesService({
        repository,
        storage,
        processor,
    });

    await assert.rejects(() =>
        service.upload(
            PRODUCT_ID,
            [{
                buffer: Buffer.from("input"),
                originalname: "fixture.png",
                mimetype: "image/png",
                size: 5,
            }],
            user()
        )
    );
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    assert.equal(entries.filter((entry) => entry.isFile()).length, 0);
    await rm(root, { recursive: true, force: true });
});

test("product response exposes the correct primary image", () => {
    const storage = new MemoryStorage();
    const secondary = imageRecord("secondary", { sortOrder: 0 });
    const primary = imageRecord("primary", { isPrimary: true, sortOrder: 1 });
    const response = serializeProductResponse(
        {
            id: PRODUCT_ID,
            name: "Product",
            images: [secondary, primary],
            _count: { images: 2 },
        },
        true,
        storage
    );

    assert.equal(response.imageCount, 2);
    assert.equal(response.primaryImageUrl, storage.getPublicUrl(primary.storageKey));
    assert.equal(response.images.length, 2);
});

test("product without images returns null primary URLs", () => {
    const response = serializeProductResponse(
        {
            id: PRODUCT_ID,
            name: "Product",
            images: [],
            _count: { images: 0 },
        },
        true,
        new MemoryStorage()
    );

    assert.equal(response.primaryImageUrl, null);
    assert.equal(response.primaryThumbnailUrl, null);
    assert.equal(response.imageCount, 0);
    assert.deepEqual(response.images, []);
});

test("local storage rejects path traversal keys", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "product-storage-"));
    const storage = new LocalFileStorageService(
        root,
        "http://localhost:3000/uploads"
    );
    await assert.rejects(
        () => storage.save({ storageKey: "../escape.webp", content: Buffer.from("x") }),
        (error) => error.statusCode === 400
    );
    await rm(root, { recursive: true, force: true });
});
