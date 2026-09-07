-- Ensure legacy store owners converted from SUPER_ADMIN operate from their store's main branch.
WITH owner_main_branches AS (
    SELECT
        u.id AS "userId",
        (
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
        ) AS "branchId"
    FROM "User" AS u
    WHERE u.role = 'STORE_OWNER'
      AND u."storeId" IS NOT NULL
      AND u."branchId" IS NULL
)
UPDATE "User" AS u
SET "branchId" = owner_main_branches."branchId"
FROM owner_main_branches
WHERE u.id = owner_main_branches."userId"
  AND owner_main_branches."branchId" IS NOT NULL;
