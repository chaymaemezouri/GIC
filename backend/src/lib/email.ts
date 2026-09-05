import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
  return transporter;
}

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const from = process.env.SMTP_FROM || 'GIC <noreply@gic.ma>';
  const tx = getTransporter();
  if (!tx) {
    console.log(`[Email simulé] → ${to} | ${subject}`);
    return { simulated: true };
  }
  await tx.sendMail({ from, to, subject, text, html: html || `<p>${text.replace(/\n/g, '<br>')}</p>` });
  return { simulated: false };
}

export async function sendEmailToAdmins(subject: string, text: string) {
  const { prisma } = await import('./prisma.js');
  const users = await prisma.user.findMany({ where: { isActive: true, email: { not: '' } } });
  await Promise.all(users.map((u) => sendEmail(u.email, subject, text).catch(() => {})));
}
