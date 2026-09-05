import type { Purchase, Supplier } from '@prisma/client';
import type { Request } from 'express';
import { findLegacyPurchaseMovement, findMovementBySource, MOVEMENT_TAGS, syncPurchaseMovement } from './cashSync.js';

export const PURCHASE_MOVEMENT_TAG = MOVEMENT_TAGS.ACHAT;

type PurchaseWithSupplier = Purchase & { supplier?: Supplier | null };

export async function findPurchaseCashMovement(purchaseId: string) {
  const bySource = await findMovementBySource('achat', purchaseId);
  if (bySource) return bySource;
  return findLegacyPurchaseMovement(purchaseId);
}

export async function createPurchaseCashMovement(
  purchase: PurchaseWithSupplier,
  req?: Request,
) {
  return syncPurchaseMovement(purchase, req);
}
