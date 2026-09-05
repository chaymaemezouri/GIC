const TOKEN_KEY = 'gic_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new Error('Serveur GIC injoignable — lancez le backend : cd backend && npm run dev');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Erreur serveur (${res.status})`);
  }
  return data as T;
}

export type PaginatedClients<T = Record<string, unknown>> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type PaginatedResponse<T = Record<string, unknown>> = PaginatedClients<T>;

/** Liste clients — compatible avec l'API paginée */
export async function fetchClientList<T = Record<string, unknown>>(
  params: { limit?: number; page?: number; sort?: string; q?: string; type?: string } = {}
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit ?? 500));
  qs.set('page', String(params.page ?? 1));
  if (params.sort) qs.set('sort', params.sort);
  if (params.q) qs.set('q', params.q);
  if (params.type) qs.set('type', params.type);
  const res = await api<PaginatedClients<T>>(`/clients?${qs}`);
  return res.items;
}

/** Liste projets — compatible avec l'API paginée */
export async function fetchProjectList<T = Record<string, unknown>>(
  params: { limit?: number; page?: number; sort?: string; q?: string; status?: string; locationId?: string; ownershipType?: string } = {}
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit ?? 500));
  qs.set('page', String(params.page ?? 1));
  if (params.sort) qs.set('sort', params.sort);
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.locationId) qs.set('locationId', params.locationId);
  if (params.ownershipType) qs.set('ownershipType', params.ownershipType);
  const res = await api<PaginatedResponse<T>>(`/immobilier/projects?${qs}`);
  return res.items;
}

/** Liste mandants — compatible avec l'API paginée */
export async function fetchMandantList<T = Record<string, unknown>>(
  params: { limit?: number; page?: number; sort?: string; q?: string; identityType?: string } = {}
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit ?? 500));
  qs.set('page', String(params.page ?? 1));
  if (params.sort) qs.set('sort', params.sort);
  if (params.q) qs.set('q', params.q);
  if (params.identityType) qs.set('identityType', params.identityType);
  const res = await api<PaginatedResponse<T>>(`/mandants?${qs}`);
  return res.items;
}

/** Liste agents — compatible avec l'API paginée */
export async function fetchAgentList<T = Record<string, unknown>>(
  params: { limit?: number; page?: number; sort?: string; q?: string; linked?: string; active?: string } = {}
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit ?? 500));
  qs.set('page', String(params.page ?? 1));
  if (params.sort) qs.set('sort', params.sort);
  if (params.q) qs.set('q', params.q);
  if (params.linked) qs.set('linked', params.linked);
  if (params.active) qs.set('active', params.active);
  const res = await api<PaginatedResponse<T>>(`/agents?${qs}`);
  return res.items;
}

/** Liste biens — compatible avec l'API paginée */
export async function fetchPropertyList<T = Record<string, unknown>>(
  params: { limit?: number; page?: number; sort?: string; q?: string; status?: string; projectId?: string } = {}
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit ?? 500));
  qs.set('page', String(params.page ?? 1));
  if (params.sort) qs.set('sort', params.sort);
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.projectId) qs.set('projectId', params.projectId);
  const res = await api<PaginatedResponse<T>>(`/immobilier/properties?${qs}`);
  return res.items;
}

/** Liste ventes — compatible avec l'API paginée */
export async function fetchSaleList<T = Record<string, unknown>>(
  params: { limit?: number; page?: number; sort?: string; q?: string; status?: string; clientId?: string } = {}
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit ?? 500));
  qs.set('page', String(params.page ?? 1));
  if (params.sort) qs.set('sort', params.sort);
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.clientId) qs.set('clientId', params.clientId);
  const res = await api<PaginatedResponse<T>>(`/transactions/sales?${qs}`);
  return res.items;
}

/** Liste locations — compatible avec l'API paginée */
export async function fetchRentalList<T = Record<string, unknown>>(
  params: { limit?: number; page?: number; sort?: string; q?: string; status?: string; clientId?: string } = {}
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit ?? 500));
  qs.set('page', String(params.page ?? 1));
  if (params.sort) qs.set('sort', params.sort);
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.clientId) qs.set('clientId', params.clientId);
  const res = await api<PaginatedResponse<T>>(`/transactions/rentals?${qs}`);
  return res.items;
}

/** Liste fournisseurs — compatible avec l'API paginée */
export async function fetchSupplierList<T = Record<string, unknown>>(
  params: { limit?: number; page?: number; sort?: string; q?: string; active?: string } = {}
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit ?? 500));
  qs.set('page', String(params.page ?? 1));
  if (params.sort) qs.set('sort', params.sort);
  if (params.q) qs.set('q', params.q);
  if (params.active) qs.set('active', params.active);
  const res = await api<PaginatedResponse<T>>(`/achats/suppliers?${qs}`);
  return res.items;
}

/** Liste chantiers — compatible avec l'API paginée */
export async function fetchChantierList<T = Record<string, unknown>>(
  params: { limit?: number; page?: number; sort?: string; q?: string; status?: string } = {}
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(params.limit ?? 500));
  qs.set('page', String(params.page ?? 1));
  if (params.sort) qs.set('sort', params.sort);
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  const res = await api<PaginatedResponse<T>>(`/chantiers?${qs}`);
  return res.items;
}

/** Liste ouvriers — compatible dropdowns (actifs) */
export async function fetchWorkforceList<T = Record<string, unknown>>(
  opts?: { category?: string; excludeCategory?: string },
) {
  const qs = new URLSearchParams();
  if (opts?.category) qs.set('category', opts.category);
  if (opts?.excludeCategory) qs.set('excludeCategory', opts.excludeCategory);
  const q = qs.toString();
  return api<T[]>(`/chantiers/workforce/list${q ? `?${q}` : ''}`);
}

/** Liste engins — compatible dropdowns */
export async function fetchEnginList<T = Record<string, unknown>>() {
  return api<T[]>('/engins/list');
}

/** Options d'une liste configurable (référentiel) */
export async function fetchDropdownOptions<T extends { value: string; label?: string } = { value: string; label: string }>(
  category: string
) {
  return api<T[]>(`/dropdowns/${category}`);
}

export function formatMad(n: number | null | undefined) {
  const v = Number(n || 0);
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: 0,
  }).format(v);
}

export function formatDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-MA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(d));
}

export function downloadCsv(path: string, filename: string) {
  const token = getToken();
  fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
}

export function downloadExcel(path: string, filename: string) {
  downloadCsv(path, filename);
}

export function downloadPdf(path: string, filename: string) {
  downloadCsv(path, filename);
}

export function openPrintUrl(path: string) {
  const token = getToken();
  fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then((r) => r.text())
    .then((html) => {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    });
}

export async function uploadDocument(
  file: File,
  fields: Record<string, string>
) {
  const form = new FormData();
  form.append('file', file);
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  const token = getToken();
  const res = await fetch('/api/documents/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Erreur upload');
  return data;
}

export async function uploadForm(path: string, form: FormData, method: 'POST' | 'PUT' = 'POST') {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Erreur serveur');
  return data;
}

const SUPPLIER_TOKEN_KEY = 'gic_supplier_token';

export function getSupplierToken() {
  return localStorage.getItem(SUPPLIER_TOKEN_KEY);
}

export function setSupplierToken(token: string) {
  localStorage.setItem(SUPPLIER_TOKEN_KEY, token);
}

export function clearSupplierToken() {
  localStorage.removeItem(SUPPLIER_TOKEN_KEY);
}

export async function supplierUploadForm(path: string, form: FormData) {
  const token = getSupplierToken();
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Erreur serveur');
  return data;
}

export async function supplierApi<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getSupplierToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Erreur serveur');
  return data as T;
}
