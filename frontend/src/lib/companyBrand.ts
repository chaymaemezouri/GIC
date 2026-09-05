export const ECC_COMPANY = {
  name: 'Expertise & Consulting Company',
  shortName: 'ECC',
  tagline: 'Solutions digitales, IA & data science',
  description:
    'Expertise & Consulting Company conçoit et développe des solutions IT sur mesure : plateformes métier, intelligence artificielle, data science, automatisation et intégration système.',
  gicCredit:
    'Plateforme GIC — développée par Expertise & Consulting Company.',
  loginByline: 'Développement IT · IA · data science · solutions métier',
  website: 'https://expertise-consulting.ma',
  logoSrc: '/ecc-logo.jpeg',
} as const;

export const GIC_DEMO_ACCOUNTS = [
  { label: 'Super administrateur', email: 'admin@gic.ma', password: 'Admin@2026', portal: 'interne' },
  { label: 'Comptable', email: 'comptable@gic.ma', password: 'Comptable@2026', portal: 'interne' },
  { label: 'Commercial', email: 'commercial@gic.ma', password: 'Commercial@2026', portal: 'interne' },
  { label: 'Chef de chantier', email: 'chef@gic.ma', password: 'Chef@2026', portal: 'interne' },
  { label: 'Fournisseur (portail)', email: 'contact@beton-atlas.ma', password: 'Fournisseur@2026', portal: 'fournisseur' },
] as const;
