-- Ensure legacy store owners converted from SUPER_ADMIN operate from their store's main branch.
UPDATE "User" AS u
SET "branchId" = b.id
FROM LATERAL (
    SELECT br.id
    FROM "Branch" AS br
    WHERE br."storeId" = u."storeId"
    ORDER BY
        CASE
            WHEN lower(br.name) IN ('asosiy filial', 'main branch') THEN 0
            ELSE 1
        END,
        br."createdAt" ASC,
        br.id ASC
    LIMIT 1
) AS b
WHERE u.role = 'STORE_OWNER'
  AND u."storeId" IS NOT NULL
  AND u."branchId" IS NULL;
