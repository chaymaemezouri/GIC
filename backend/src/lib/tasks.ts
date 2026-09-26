/** Lots & phases standards BTP — créés automatiquement à la création d'une tranche. */

export type StandardLot = {
  /** Nom du lot (tâche WorkProgress) */
  name: string;
  /** Étapes / sous-tâches du lot */
  phases: string[];
};

export const STANDARD_TRANCHE_LOTS: StandardLot[] = [
  {
    name: 'Terrassement',
    phases: [
      'Implantation du bâtiment',
      'Décapage de la terre végétale',
      'Fouilles pour fondations',
      'Évacuation ou stockage des déblais',
      'Mise à niveau du terrain',
      'Compactage du fond de fouille',
    ],
  },
  {
    name: 'Fondations',
    phases: [
      'Béton de propreté',
      'Ferraillage des semelles / radier',
      'Coffrage si nécessaire',
      'Coulage du béton des fondations',
      'Réalisation des longrines',
      'Étanchéité des parties enterrées',
      'Remblaiement autour des fondations',
    ],
  },
  {
    name: 'Infrastructure / sous-sol',
    phases: [
      'Voiles périphériques',
      'Poteaux et murs porteurs',
      'Dallage',
      'Étanchéité',
      'Drainage',
      'Remblaiement',
    ],
  },
  {
    name: 'Élévation de la structure',
    phases: [
      'Poteaux',
      'Poutres',
      'Dalles',
      'Escaliers',
      'Voiles de contreventement',
      'Décoffrage et contrôle',
    ],
  },
  {
    name: 'Maçonnerie',
    phases: [
      'Murs extérieurs',
      'Cloisons intérieures',
      'Réservations pour portes, fenêtres et réseaux',
      'Appuis et linteaux',
    ],
  },
  {
    name: 'Toiture / terrasse',
    phases: [
      'Dalle de toiture',
      'Forme de pente',
      'Étanchéité',
      'Isolation thermique si prévue',
      'Protection de l\'étanchéité',
      'Évacuation des eaux pluviales',
    ],
  },
  {
    name: 'Lots techniques',
    phases: [
      'Électricité',
      'Plomberie',
      'Évacuation sanitaire',
      'Climatisation / ventilation',
      'Réseaux TV / Internet',
      'Détection incendie selon le projet',
      'Pré-équipement éventuel ascenseur',
    ],
  },
  {
    name: 'Enduits et façades',
    phases: [
      'Enduit intérieur',
      'Enduit extérieur',
      'Isolation extérieure si prévue',
      'Traitement des façades',
      'Revêtement / finition de façade',
    ],
  },
  {
    name: 'Chapes et revêtements',
    phases: [
      'Chapes',
      'Carrelage',
      'Faïence',
      'Parquet ou autres revêtements',
      'Plinthes',
    ],
  },
  {
    name: 'Menuiseries',
    phases: [
      'Portes',
      'Fenêtres',
      'Aluminium / PVC / bois',
      'Vitrages',
      'Garde-corps',
      'Portes techniques',
    ],
  },
  {
    name: 'Faux plafonds et peinture',
    phases: [
      'Faux plafonds',
      'Préparation des surfaces',
      'Sous-couche',
      'Peinture',
      'Finitions',
    ],
  },
  {
    name: 'Équipements et finitions',
    phases: [
      'Appareillages électriques',
      'Sanitaires',
      'Robinetterie',
      'Éclairage',
      'Cuisine si prévue',
      'Ascenseur',
      'Équipements techniques',
    ],
  },
  {
    name: 'Aménagements extérieurs',
    phases: [
      'Voirie',
      'Trottoirs',
      'Parking',
      'Éclairage extérieur',
      'Réseaux extérieurs',
      'Espaces verts',
      'Clôture / portail',
    ],
  },
  {
    name: 'Contrôles et réception',
    phases: [
      'Contrôle de la structure',
      'Tests électriques',
      'Tests plomberie',
      'Tests d\'étanchéité',
      'Vérification des équipements',
      'Nettoyage final',
      'Levée des réserves',
      'Réception du bâtiment',
    ],
  },
];

/** Noms de lots (compat sélecteur / API historique). */
export const TASKS_REFERENCE = STANDARD_TRANCHE_LOTS.map((lot) => lot.name);

export const VALIDATION_LABEL = 'Validation';

/** Répartit les phases de travail entre 0 et 100 (exclus), pour laisser 100 = Validation. */
export function distributeWorkPercents(workCount: number): number[] {
  if (workCount <= 0) return [];
  const denom = workCount + 1;
  const result: number[] = [];
  for (let i = 1; i <= workCount; i++) {
    result.push(Math.max(1, Math.min(99, Math.round((i / denom) * 100))));
  }
  for (let i = 1; i < result.length; i++) {
    if (result[i] <= result[i - 1]) result[i] = Math.min(99, result[i - 1] + 1);
  }
  if (result[result.length - 1] >= 100) result[result.length - 1] = 99;
  return result;
}

/** @deprecated Préférer distributeWorkPercents + Validation. */
export function distributePhasePercents(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [100];
  return [...distributeWorkPercents(count - 1), 100];
}

export type BuiltPhase = {
  percent: number;
  label: string;
};

export function buildPhasesFromLabels(labels: string[]): BuiltPhase[] {
  const cleaned = labels
    .map((l) => String(l || '').trim())
    .filter(Boolean)
    .filter((l) => l.toLowerCase() !== 'validation');
  if (!cleaned.length) {
    return [{ percent: 100, label: VALIDATION_LABEL }];
  }
  const percents = distributeWorkPercents(cleaned.length);
  return [
    ...cleaned.map((label, i) => ({ percent: percents[i], label })),
    { percent: 100, label: VALIDATION_LABEL },
  ];
}

export function buildStandardLotPhases(lot: StandardLot): BuiltPhase[] {
  return buildPhasesFromLabels(lot.phases);
}
