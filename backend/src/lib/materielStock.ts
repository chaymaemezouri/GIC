export type StockMove = {
  movementType: string;
  quantity: number;
  chantierId?: string | null;
  tranche?: string | null;
  fromChantierId?: string | null;
  fromTranche?: string | null;
};

export type SiteQty = { chantierId: string; tranche: string | null; quantity: number };

export type StockSnapshot =
  | { ok: true; owned: number; depot: number; repair: number; sites: SiteQty[] }
  | { ok: false; message: string };

function siteKey(chantierId: string, tranche?: string | null) {
  return `${chantierId}::${tranche || ''}`;
}

/** Rejoue le stock à partir du dépôt d'ouverture. La quantité totale ne change qu'aux entrées et sorties. */
export function stockSnapshot(opening: number, moves: StockMove[]): StockSnapshot {
  let owned = opening;
  let depot = opening;
  let repair = 0;
  const sites = new Map<string, SiteQty>();

  const bump = (chantierId: string | null | undefined, tranche: string | null | undefined, delta: number) => {
    if (!chantierId) return null;
    const key = siteKey(chantierId, tranche);
    const row = sites.get(key) || { chantierId, tranche: tranche || null, quantity: 0 };
    row.quantity += delta;
    sites.set(key, row);
    return row.quantity;
  };

  for (const move of moves) {
    const q = Number(move.quantity);
    if (!Number.isFinite(q) || q <= 0) return { ok: false, message: 'Quantité invalide' };
    if (move.movementType === 'entree') {
      owned += q;
      if (move.chantierId) bump(move.chantierId, move.tranche, q);
      else depot += q;
    } else if (move.movementType === 'sortie') {
      if (move.chantierId) {
        const left = bump(move.chantierId, move.tranche, -q);
        if (left != null && left < -0.001) return { ok: false, message: 'Quantité insuffisante sur le chantier' };
      } else {
        depot -= q;
        if (depot < -0.001) return { ok: false, message: 'Stock dépôt insuffisant' };
      }
      owned -= q;
    } else if (move.movementType === 'affectation') {
      if (!move.chantierId) return { ok: false, message: 'Chantier requis pour l’affectation' };
      depot -= q;
      if (depot < -0.001) return { ok: false, message: 'Stock dépôt insuffisant' };
      bump(move.chantierId, move.tranche, q);
    } else if (move.movementType === 'transfert') {
      if (!move.fromChantierId || !move.chantierId) return { ok: false, message: 'Chantier source et destination requis' };
      const left = bump(move.fromChantierId, move.fromTranche, -q);
      if (left != null && left < -0.001) return { ok: false, message: 'Quantité insuffisante sur le chantier source' };
      bump(move.chantierId, move.tranche, q);
    } else if (move.movementType === 'maintenance') {
      if (move.fromChantierId) {
        const left = bump(move.fromChantierId, move.fromTranche, -q);
        if (left != null && left < -0.001) return { ok: false, message: 'Quantité insuffisante pour la réparation' };
      } else {
        depot -= q;
        if (depot < -0.001) return { ok: false, message: 'Stock dépôt insuffisant' };
      }
      repair += q;
    } else if (move.movementType === 'retour') {
      repair -= q;
      if (repair < -0.001) return { ok: false, message: 'Aucune quantité en réparation' };
      if (move.chantierId) bump(move.chantierId, move.tranche, q);
      else depot += q;
    } else {
      return { ok: false, message: 'Type de mouvement invalide' };
    }
  }

  return {
    ok: true,
    owned,
    depot,
    repair,
    sites: [...sites.values()].filter((row) => row.quantity > 0.001),
  };
}

export function ownedDelta(moves: Array<{ movementType: string; quantity: number }>) {
  return moves.reduce((sum, move) => {
    if (move.movementType === 'entree') return sum + move.quantity;
    if (move.movementType === 'sortie') return sum - move.quantity;
    return sum;
  }, 0);
}
