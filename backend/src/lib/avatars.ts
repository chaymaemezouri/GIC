import fs from 'fs';
import path from 'path';

const COLORS = ['#6d28d9', '#2563eb', '#059669', '#d97706', '#db2777', '#0891b2'];

export function ensureAvatarFiles(uploadDir: string, count: number) {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  for (let i = 1; i <= count; i++) {
    const filePath = path.join(uploadDir, `demo-client-${i}.svg`);
    const color = COLORS[i % COLORS.length];
    const initials = `C${i}`;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" rx="32" fill="${color}"/>
  <text x="100" y="118" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="72" font-weight="600">${initials}</text>
</svg>`;
    fs.writeFileSync(filePath, svg, 'utf8');
  }
}

export function avatarUrl(index: number) {
  return `/uploads/demo-client-${index}.svg`;
}

export function ensureProjectPlanFiles(uploadDir: string, projects: { id: string; name: string }[]) {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  projects.forEach((p, i) => {
    const filePath = path.join(uploadDir, `demo-project-${p.id}.svg`);
    const color = COLORS[i % COLORS.length];
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#f3f4f6"/>
  <rect x="40" y="40" width="560" height="280" rx="8" fill="white" stroke="${color}" stroke-width="3"/>
  <text x="320" y="100" text-anchor="middle" fill="${color}" font-family="system-ui,sans-serif" font-size="22" font-weight="600">Plan masse</text>
  <text x="320" y="140" text-anchor="middle" fill="#374151" font-family="system-ui,sans-serif" font-size="16">${p.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
  <rect x="120" y="180" width="120" height="80" fill="${color}" opacity="0.2" stroke="${color}"/>
  <rect x="280" y="180" width="120" height="80" fill="${color}" opacity="0.15" stroke="${color}"/>
  <rect x="440" y="180" width="80" height="80" fill="${color}" opacity="0.25" stroke="${color}"/>
  <text x="320" y="310" text-anchor="middle" fill="#9ca3af" font-family="system-ui,sans-serif" font-size="12">GIC — Plan démo</text>
</svg>`;
    fs.writeFileSync(filePath, svg, 'utf8');
  });
}

export function projectPlanUrl(projectId: string) {
  return `/uploads/demo-project-${projectId}.svg`;
}
