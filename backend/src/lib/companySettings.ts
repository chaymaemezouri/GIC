import { prisma } from './prisma.js';

const DEFAULT_BANK_INTRO =
  'Madame, Monsieur,\n\nNous vous prions de bien vouloir procéder au virement des salaires au profit des bénéficiaires dont la liste figure ci-après, selon les coordonnées bancaires (CIN et RIB) indiquées pour chacun.\n\nNous vous remercions de l\'attention que vous porterez à la présente demande.\n\nCordialement,';

export async function getOrCreateCompanySettings() {
  let row = await prisma.companySettings.findUnique({ where: { id: 'default' } });
  if (!row) {
    row = await prisma.companySettings.create({
      data: {
        id: 'default',
        companyName: 'GIC — Expertise & Consulting',
        printPrimaryColor: '#007aff',
        printShowLogo: true,
        receiptTitle: 'Reçu de paiement',
        bankLetterTitle: 'Demande de virement de salaires',
        bankLetterIntro: DEFAULT_BANK_INTRO,
      },
    });
  }
  return row;
}

export type CompanyPrintSettings = Awaited<ReturnType<typeof getOrCreateCompanySettings>>;
