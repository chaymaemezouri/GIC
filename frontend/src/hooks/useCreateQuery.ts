import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Ouvre le formulaire de création si l’URL contient ?create=1 */
export function useCreateQuery(openCreate: () => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    openCreate();
    const qs = new URLSearchParams(searchParams);
    qs.delete('create');
    setSearchParams(qs, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
}
