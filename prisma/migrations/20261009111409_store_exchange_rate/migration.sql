-- Store-level USD rate: Central Bank by default, manual override set with the owner's password.
CREATE TYPE "ExchangeRateMode" AS ENUM ('CBU', 'MANUAL');

ALTER TYPE "AuditAction" ADD VALUE 'EXCHANGE_RATE_CHANGED';

ALTER TABLE "Store"
    ADD COLUMN "usdRateMode" "ExchangeRateMode" NOT NULL DEFAULT 'CBU',
    ADD COLUMN "manualUsdToUzsRate" DECIMAL(18,2),
    ADD COLUMN "usdRateChangedAt" TIMESTAMP(3),
    ADD COLUMN "usdRateChangedById" TEXT;

CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "rateDate" DATE NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CurrencyRate_source_currency_rateDate_key" ON "CurrencyRate"("source", "currency", "rateDate");
