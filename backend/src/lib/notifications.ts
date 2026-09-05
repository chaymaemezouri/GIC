import { prisma } from './prisma.js';
import { sendEmailToAdmins } from './email.js';

export async function notifyUser(
  userId: string,
  title: string,
  message: string,
  opts?: { link?: string; type?: string; email?: boolean }
) {
  await prisma.notification.create({
    data: {
      userId,
      title,
      message,
      link: opts?.link,
      type: opts?.type || 'info',
    },
  });
}

export async function notifyAllAdmins(
  title: string,
  message: string,
  opts?: { link?: string; type?: string; email?: boolean }
) {
  const users = await prisma.user.findMany({ where: { isActive: true } });
  await Promise.all(users.map((u) => notifyUser(u.id, title, message, opts)));
  if (opts?.email !== false) {
    await sendEmailToAdmins(title, message).catch(() => {});
  }
}
