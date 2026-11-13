import type { DocumentReference, UpdateData, DocumentData } from 'firebase-admin/firestore';

export function outreachDeliveryId(kind: 'outreach' | 'reply', sequence: number): string {
  return kind + '-' + sequence;
}

/** An unresolved claim is held for reconciliation. A provider can accept before a timeout. */
export async function claimOutreachDelivery(lead: DocumentReference, id: string, now: number, stillApproved?: (current: DocumentData) => boolean) {
  const delivery = lead.collection('deliveries').doc(id);
  const claimed = await lead.firestore.runTransaction(async transaction => {
    const existing = await transaction.get(delivery);
    if (existing.exists) return false;
    const current = (await transaction.get(lead)).data();
    if (!current || (stillApproved && !stillApproved(current))) return false;
    transaction.create(delivery, { status: 'claimed', claimedAt: now });
    return true;
  });
  if (!claimed) return null;

  return {
    async complete(update: UpdateData<DocumentData>) {
      const batch = lead.firestore.batch();
      batch.update(lead, update);
      batch.update(delivery, { status: 'sent', sentAt: Date.now() });
      await batch.commit();
    },
  };
}
