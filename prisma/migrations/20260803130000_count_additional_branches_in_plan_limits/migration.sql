-- Plan cards describe additional branches in addition to the primary branch.
UPDATE "Plan"
SET "maxBranches" = 3
WHERE "code" = 'START';

UPDATE "Plan"
SET "maxBranches" = 6
WHERE "code" = 'BUSINESS';
