import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: 'resend' | 'brevo' | 'none';
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const raw = (config.get<string>('EMAIL_PROVIDER') ?? 'none').toLowerCase();
    this.provider = raw === 'resend' ? 'resend' : raw === 'brevo' ? 'brevo' : 'none';
    this.fromAddress = config.get<string>('EMAIL_FROM') ?? 'no-reply@puzzleroll.com';
    if (this.provider === 'none') {
      this.logger.warn('No EMAIL_PROVIDER set — emails logged to console only');
    } else {
      this.logger.log(`Email provider: ${this.provider}`);
    }
  }

  async sendEmail(payload: EmailPayload): Promise<void> {
    if (this.provider === 'resend') return this.sendViaResend(payload);
    if (this.provider === 'brevo') return this.sendViaBrevo(payload);
    this.logger.log(`[EMAIL DEV] To: ${payload.to} | ${payload.subject}\n${payload.text ?? ''}`);
  }

  private async sendViaResend(p: EmailPayload): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.getOrThrow('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.fromAddress, to: [p.to], subject: p.subject, html: p.html, text: p.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }

  private async sendViaBrevo(p: EmailPayload): Promise<void> {
    const match = this.fromAddress.match(/^(.*?)\s*<(.+)>$/) ?? [null, 'Puzzle Roll', this.fromAddress];
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.config.getOrThrow('BREVO_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: match[1], email: match[2] },
        to: [{ email: p.to }],
        subject: p.subject,
        htmlContent: p.html,
        textContent: p.text,
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Reset your Puzzle Roll password',
      text: `Reset your password (expires in 1 hour): ${resetUrl}\n\nIf you didn't request this, ignore this email.`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#6366f1;margin-bottom:8px">Reset your password</h2>
        <p style="color:#374151;margin-bottom:24px">Click below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">Reset password</a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
    });
  }
}