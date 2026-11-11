function filled(value: unknown) {
  return String(value ?? '').trim();
}

/** CIN et téléphone 1 exigés à la création, et à la modification dès que le champ est envoyé. */
export function requiredCinPhoneError(input: {
  cin?: { value: unknown; required: boolean };
  phone1?: { value: unknown; required: boolean };
}): string | null {
  const missingCin = Boolean(input.cin?.required) && !filled(input.cin?.value);
  const missingPhone = Boolean(input.phone1?.required) && !filled(input.phone1?.value);
  if (missingCin && missingPhone) return 'Le CIN et le téléphone 1 sont obligatoires';
  if (missingCin) return 'Le CIN est obligatoire';
  if (missingPhone) return 'Le téléphone 1 est obligatoire';
  return null;
}
