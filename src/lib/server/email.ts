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
 *  - smtp: envio real (SMTP_URL; apenas em servidores Node.js). O corpo NÃO é armazenado.
 *  - resend: envio real pela API HTTP do Resend (funciona no Cloudflare Workers). O corpo NÃO é armazenado.
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
  const from = process.env.EMAIL_FROM ?? "KeyLingo <no-reply@example.com>";
  try {
    if (transport === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Resend respondeu HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } else {
      // Import dinâmico: o nodemailer depende de sockets do Node e não é usado no Cloudflare.
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport(process.env.SMTP_URL);
      await transporter.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text });
    }
    await query(`insert into email_outbox (to_email, subject, transport, status) values ($1,$2,$3,'sent')`, [msg.to, msg.subject, transport]);
    return { delivered: true, transport };
  } catch (err) {
    await query(`insert into email_outbox (to_email, subject, transport, status, error) values ($1,$2,$3,'failed',$4)`, [
      msg.to,
      msg.subject,
      transport,
      (err as Error).message.slice(0, 500),
    ]);
    await logEvent("error", "email", "Falha ao enviar e-mail", { error: (err as Error).message });
    return { delivered: false, transport };
  }
}
