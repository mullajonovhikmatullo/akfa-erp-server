-- Keep persisted plan limits aligned with the public pricing cards.
UPDATE "Plan"
SET "maxBranches" = 2
WHERE "code" = 'START';

UPDATE "Plan"
SET "maxBranches" = 5
WHERE "code" = 'BUSINESS';
