import { useCallback, useEffect, useState } from 'react';
import { Mail, MessageSquare, Send, StickyNote } from 'lucide-react';
import { api } from '../lib/api';
import { Btn, Card } from './ui';
import { useI18n } from '../i18n/I18nContext';

type Message = {
  id: string;
  channel: string;
  direction: string;
  subject?: string | null;
  body: string;
  recipient?: string | null;
  userName?: string | null;
  createdAt: string;
};

type Channel = 'note' | 'email' | 'sms' | 'whatsapp';

type Props = {
  entityType: 'Client' | 'Agent' | 'Supplier' | 'User' | 'Mandant' | 'Project' | 'Workforce';
  entityId: string;
  defaultEmail?: string;
  defaultPhone?: string;
};

export default function ConversationsPanel({ entityType, entityId, defaultEmail, defaultPhone }: Props) {
  const { t, lang } = useI18n();
  const canEmail = !!defaultEmail;
  const canPhone = !!defaultPhone;
  const [items, setItems] = useState<Message[]>([]);
  const [channel, setChannel] = useState<Channel>(canEmail ? 'email' : canPhone ? 'sms' : 'note');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: Message[] }>(`/messaging/${entityType}/${entityId}`);
      setItems(res.items || []);
    } catch {
      setItems([]);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (channel === 'email' && !canEmail) setChannel(canPhone ? 'sms' : 'note');
    if ((channel === 'sms' || channel === 'whatsapp') && !canPhone) setChannel(canEmail ? 'email' : 'note');
  }, [canEmail, canPhone, channel]);

  async function send() {
    if (!message.trim()) return;
    setBusy(true);
    setFeedback('');
    try {
      await api(`/messaging/${entityType}/${entityId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          channel,
          subject:
            channel === 'email'
              ? subject || t('msg.defaultEmailSubject')
              : channel === 'note'
                ? subject || t('msg.defaultNoteSubject')
                : undefined,
          message,
          recipient: channel === 'email' ? { email: defaultEmail } : channel === 'sms' || channel === 'whatsapp' ? { phone: defaultPhone } : undefined,
        }),
      });
      setMessage('');
      setSubject('');
      setFeedback(channel === 'note' ? t('msg.noteSaved') : t('msg.messageSent'));
      load();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : t('msg.sendError'));
    } finally {
      setBusy(false);
    }
  }

  function channelIcon(c: string) {
    if (c === 'email') return <Mail size={11} />;
    if (c === 'note') return <StickyNote size={11} />;
    return <MessageSquare size={11} />;
  }

  function channelLabel(c: string) {
    if (c === 'note') return t('msg.internalNote');
    if (c === 'email') return t('fields.email');
    if (c === 'sms') return 'SMS';
    if (c === 'whatsapp') return 'WhatsApp';
    return c;
  }

  const locale = lang === 'ar' ? 'ar-MA' : 'fr-MA';

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{t('detail.exchangesHistory')}</h3>
        <span className="text-[10px] text-gic-muted">{t('common.entriesCount', { count: items.length })}</span>
      </div>

      <div className="space-y-2 max-h-56 overflow-y-auto mb-4">
        {items.length === 0 && (
          <p className="text-[12px] text-gic-muted text-center py-4">{t('msg.emptyExchanges')}</p>
        )}
        {items.map((m) => (
          <div key={m.id} className="rounded-lg border border-gic-border/50 px-3 py-2 text-[11px]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-medium flex items-center gap-1">
                {channelIcon(m.channel)}
                {channelLabel(m.channel)}
              </span>
              <span className="text-gic-muted">{new Date(m.createdAt).toLocaleString(locale)}</span>
            </div>
            {m.subject && m.channel !== 'note' && <p className="font-medium text-gic-ink">{m.subject}</p>}
            <p className="text-gic-muted whitespace-pre-wrap mt-0.5">{m.body}</p>
            {m.recipient && <p className="text-[10px] text-gic-muted mt-1">→ {m.recipient}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <button
          type="button"
          onClick={() => setChannel('note')}
          className={`rounded-lg px-2 py-1.5 text-[11px] font-medium border ${
            channel === 'note' ? 'border-gic-violet bg-gic-violet-soft text-gic-violet' : 'border-gic-border text-gic-muted'
          }`}
        >
          {t('msg.internalNote')}
        </button>
        <button
          type="button"
          disabled={!canEmail}
          onClick={() => setChannel('email')}
          className={`rounded-lg px-2 py-1.5 text-[11px] font-medium border ${
            channel === 'email' ? 'border-gic-violet bg-gic-violet-soft text-gic-violet' : 'border-gic-border text-gic-muted'
          } ${!canEmail ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {t('fields.email')}
        </button>
        <button
          type="button"
          disabled={!canPhone}
          onClick={() => setChannel('sms')}
          className={`rounded-lg px-2 py-1.5 text-[11px] font-medium border ${
            channel === 'sms' ? 'border-gic-violet bg-gic-violet-soft text-gic-violet' : 'border-gic-border text-gic-muted'
          } ${!canPhone ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          SMS
        </button>
        <button
          type="button"
          disabled={!canPhone}
          onClick={() => setChannel('whatsapp')}
          className={`rounded-lg px-2 py-1.5 text-[11px] font-medium border ${
            channel === 'whatsapp' ? 'border-gic-violet bg-gic-violet-soft text-gic-violet' : 'border-gic-border text-gic-muted'
          } ${!canPhone ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          WhatsApp
        </button>
      </div>

      {!canEmail && !canPhone && (
        <p className="text-[11px] text-gic-muted mb-2">
          {t('msg.noClientContact')}
        </p>
      )}

      {(channel === 'email' || channel === 'note') && (
        <input
          className="w-full mb-2 rounded-lg border border-gic-border px-3 py-1.5 text-[12px]"
          placeholder={channel === 'note' ? t('msg.noteTitleOptional') : t('fields.subject')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      )}
      <textarea
        className="w-full rounded-lg border border-gic-border px-3 py-2 text-[12px] min-h-[72px]"
        placeholder={channel === 'note' ? t('msg.noteBodyPlaceholder') : t('msg.yourMessage')}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex items-center justify-between mt-2">
        {feedback && <span className="text-[11px] text-gic-muted">{feedback}</span>}
        <Btn icon={Send} onClick={send} disabled={busy} className="ml-auto">
          {channel === 'note' ? t('common.save') : t('actions.send')}
        </Btn>
      </div>
    </Card>
  );
}
