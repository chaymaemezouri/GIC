import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import {
  PAYMENT_MODE_OPTIONS,
  PAYER_RELATION_OPTIONS,
  composePayerName,
  isBankPaymentMode,
  parsePayerName,
} from '../lib/paymentMode';
import { Input, Select } from './ui';

type Values = {
  operationType: string;
  bank?: string;
  operationNo?: string;
  internalRef?: string;
  payerName?: string;
};

export function PaymentModeFields({
  values,
  onChange,
  showInternalRef = true,
}: {
  values: Values;
  onChange: (patch: Partial<Values>) => void;
  showInternalRef?: boolean;
}) {
  const { t } = useI18n();
  const parsed = parsePayerName(values.payerName);
  const [relation, setRelation] = useState(parsed.relation || 'client');
  const bank = isBankPaymentMode(values.operationType);

  function setRelationAndName(nextRelation: string, name: string) {
    setRelation(nextRelation);
    onChange({ payerName: composePayerName(nextRelation, name) });
  }

  return (
    <>
      <Select
        label={t('fields.mode')}
        value={values.operationType}
        onChange={(e) => {
          const operationType = e.target.value;
          onChange({
            operationType,
            ...(isBankPaymentMode(operationType) ? {} : { bank: '', operationNo: '' }),
          });
        }}
      >
        {PAYMENT_MODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
        ))}
      </Select>
      <Select
        label={t('fields.payerRelation')}
        value={relation}
        onChange={(e) => setRelationAndName(e.target.value, parsed.name)}
      >
        {PAYER_RELATION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
        ))}
      </Select>
      {relation === 'famille' && (
        <Input
          label={t('fields.payerFamilyName')}
          value={parsed.name}
          onChange={(e) => setRelationAndName(relation, e.target.value)}
        />
      )}
      {bank && (
        <Input
          label={t('fields.bankRef')}
          value={values.bank || ''}
          onChange={(e) => onChange({ bank: e.target.value })}
        />
      )}
      {bank && (
        <Input
          label={t('fields.operationNo')}
          value={values.operationNo || ''}
          onChange={(e) => onChange({ operationNo: e.target.value })}
        />
      )}
      {showInternalRef && (
        <Input
          label={t('fields.internalRef')}
          value={values.internalRef || ''}
          onChange={(e) => onChange({ internalRef: e.target.value })}
        />
      )}
    </>
  );
}
