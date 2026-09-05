/** SMS / WhatsApp — Twilio si configuré, sinon simulation en dev. */

async function twilioSend(to: string, from: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !from) return null;

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[Twilio]', err);
    throw new Error('Échec envoi Twilio');
  }
  return { sent: true as const };
}

export async function sendSms(to: string, message: string) {
  const from = process.env.TWILIO_SMS_FROM;
  if (from) {
    try {
      return (await twilioSend(to, from, message)) || { sent: true };
    } catch {
      return { sent: false, error: 'Twilio SMS failed' };
    }
  }
  if (process.env.SMS_API_URL) {
    console.log(`[SMS API] → ${to}: ${message.slice(0, 80)}…`);
    return { sent: true };
  }
  console.log(`[SMS simulé] → ${to} | ${message}`);
  return { simulated: true };
}

export async function sendWhatsApp(to: string, message: string) {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const normalizedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  if (from) {
    try {
      return (await twilioSend(normalizedTo, from, message)) || { sent: true };
    } catch {
      return { sent: false, error: 'Twilio WhatsApp failed' };
    }
  }
  if (process.env.WHATSAPP_API_URL) {
    console.log(`[WhatsApp API] → ${to}: ${message.slice(0, 80)}…`);
    return { sent: true };
  }
  console.log(`[WhatsApp simulé] → ${to} | ${message}`);
  return { simulated: true };
}
