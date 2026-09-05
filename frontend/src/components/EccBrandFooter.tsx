import { ECC_COMPANY } from '../lib/companyBrand';

type Variant = 'login' | 'app' | 'inline';

export default function EccBrandFooter({ variant = 'app' }: { variant?: Variant }) {
  if (variant === 'login') {
    return (
      <footer className="login-ecc-panel">
        <div className="login-ecc-logo-wrap">
          <img src={ECC_COMPANY.logoSrc} alt={ECC_COMPANY.name} className="login-ecc-logo" />
        </div>
        <div className="login-ecc-text">
          <p className="login-ecc-name">{ECC_COMPANY.name}</p>
          <p className="login-ecc-byline">{ECC_COMPANY.loginByline}</p>
        </div>
      </footer>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="ecc-brand-inline">
        <img src={ECC_COMPANY.logoSrc} alt="" className="ecc-brand-logo-sm" aria-hidden />
        <div className="min-w-0">
          <p className="ecc-brand-inline-title">{ECC_COMPANY.name}</p>
          <p className="ecc-brand-inline-text">{ECC_COMPANY.description}</p>
        </div>
      </div>
    );
  }

  return (
    <footer className="ecc-brand-footer ecc-brand-footer-app">
      <p>{ECC_COMPANY.gicCredit}</p>
    </footer>
  );
}
