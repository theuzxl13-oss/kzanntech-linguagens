import nodemailer from "nodemailer";
import { config } from "./config";
import { query } from "./db";
import { logEvent } from "./events";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Envia e-mail pelo transporte configurado.
 *  - smtp: envio real (SMTP_URL). O corpo NÃO é armazenado.
 *  - log: apenas desenvolvimento — o conteúdo é impresso no console e guardado em email_outbox.
 *  - disabled: nada é enviado; a interface informa que o recurso está indisponível.
 */
export async function sendEmail(msg: EmailMessage): Promise<{ delivered: boolean; transport: string }> {
  const transport = config.emailTransport;
  if (transport === "disabled") {
    await query(`insert into email_outbox (to_email, subject, transport, status) values ($1,$2,'disabled','skipped')`, [msg.to, msg.subject]);
    return { delivered: false, transport };
  }
  if (transport === "log") {
    console.info(`\n[email:log] Para: ${msg.to}\nAssunto: ${msg.subject}\n${msg.text}\n`);
    await query(`insert into email_outbox (to_email, subject, body_text, transport, status) values ($1,$2,$3,'log','logged')`, [
      msg.to,
      msg.subject,
      msg.text,
    ]);
    return { delivered: true, transport };
  }
  try {
    const transporter = nodemailer.createTransport(process.env.SMTP_URL);
    await transporter.sendMail({ from: process.env.EMAIL_FROM ?? "KeyLingo <no-reply@example.com>", to: msg.to, subject: msg.subject, text: msg.text });
    await query(`insert into email_outbox (to_email, subject, transport, status) values ($1,$2,'smtp','sent')`, [msg.to, msg.subject]);
    return { delivered: true, transport };
  } catch (err) {
    await query(`insert into email_outbox (to_email, subject, transport, status, error) values ($1,$2,'smtp','failed',$3)`, [
      msg.to,
      msg.subject,
      (err as Error).message.slice(0, 500),
    ]);
    await logEvent("error", "email", "Falha ao enviar e-mail", { error: (err as Error).message });
    return { delivered: false, transport };
  }
}
