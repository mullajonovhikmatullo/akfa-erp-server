# Product Images (Local MVP)

Product images use local application-server storage. Neon PostgreSQL stores only
metadata and relative storage keys; image bytes are never stored in the database.

## Configuration

```env
UPLOAD_ROOT=./uploads
PUBLIC_UPLOAD_BASE_URL=http://localhost:3000/uploads
PRODUCT_IMAGE_MAX_SIZE_MB=5
PRODUCT_IMAGE_MAX_COUNT=5
```

The configured limits are capped at 5 MB and 5 images per product. The upload
directory is created on the first successful upload and is excluded from Git.
For a custom absolute directory, create it first and grant the application user
read/write permission without execute permission on uploaded files.

## Processing

- Accepted input: JPEG, PNG and WebP.
- Sharp decodes the real image content, applies EXIF orientation and removes
  unnecessary metadata.
- Main images are WebP, at most 1200 x 1200, quality 80.
- Thumbnails are 240 x 240 WebP, quality 78.
- SVG, GIF, corrupted images and files over the configured limit are rejected.

Storage keys have this format:

```text
organizations/{storeId}/products/{productId}/{imageId}/main.webp
organizations/{storeId}/products/{productId}/{imageId}/thumbnail.webp
```

The original filename is metadata only and is never used as a filesystem path.

## Tenant Isolation

This project models an organization as `Store`. The authenticated user is
reloaded from PostgreSQL by the auth middleware, and its trusted `storeId` scopes
every product and image query. The server does not accept a tenant ID in image
mutation payloads.

Image URLs point to an authenticated `/uploads/organizations/...` route. The
route verifies the URL store, product and image IDs against the authenticated
user before reading a storage key. The physical upload root is never exposed as
an Express static directory.

## Development

```bash
npm install
npm run deploy
mkdir -p uploads
npm run dev
```

`mkdir` is optional because the storage service creates the directory lazily.
Local uploads are not durable across application-server replacement. Move the
`FileStorageService` implementation to object storage before horizontally
scaling or deploying to an ephemeral filesystem.
