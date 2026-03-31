/*
  Warnings:

  - You are about to drop the column `emotionalBrainPrompt` on the `StoreConfig` table. All the data in the column will be lost.
  - You are about to drop the column `salespersonInstructionPrompt` on the `StoreConfig` table. All the data in the column will be lost.
  - You are about to drop the column `semanticMemoryPrompt` on the `StoreConfig` table. All the data in the column will be lost.
  - You are about to drop the column `textSystemPrompt` on the `StoreConfig` table. All the data in the column will be lost.
  - You are about to drop the column `visualSystemPrompt` on the `StoreConfig` table. All the data in the column will be lost.
  - You are about to drop the column `lastUsed` on the `ai_agents` table. All the data in the column will be lost.
  - You are about to drop the column `personalityPrompt` on the `ai_agents` table. All the data in the column will be lost.
  - You are about to drop the column `preDefinedMessage` on the `ai_agents` table. All the data in the column will be lost.
  - You are about to drop the column `temperature` on the `ai_agents` table. All the data in the column will be lost.
  - You are about to drop the column `totalConversations` on the `ai_agents` table. All the data in the column will be lost.
  - You are about to drop the column `totalMessages` on the `ai_agents` table. All the data in the column will be lost.
  - You are about to drop the `delivery_zones` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "MetaIntegration" ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "wabaId" TEXT;

-- AlterTable
ALTER TABLE "StoreConfig" DROP COLUMN "emotionalBrainPrompt",
DROP COLUMN "salespersonInstructionPrompt",
DROP COLUMN "semanticMemoryPrompt",
DROP COLUMN "textSystemPrompt",
DROP COLUMN "visualSystemPrompt";

-- AlterTable
ALTER TABLE "ai_agents" DROP COLUMN "lastUsed",
DROP COLUMN "personalityPrompt",
DROP COLUMN "preDefinedMessage",
DROP COLUMN "temperature",
DROP COLUMN "totalConversations",
DROP COLUMN "totalMessages";

-- DropTable
DROP TABLE "delivery_zones";

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followUpCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cart_customerId_key" ON "Cart"("customerId");

-- CreateIndex
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
