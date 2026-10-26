/** Leitura centralizada de variáveis de ambiente do servidor (nunca expostas ao navegador). */
export const config = {
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get authSecret() {
    const s = process.env.AUTH_SECRET;
    if (!s || s.length < 32) {
      if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET ausente ou curto demais (mín. 32 caracteres).");
      return "dev-insecure-secret-change-me-dev-insecure-secret";
    }
    return s;
  },
  get emailTransport(): "smtp" | "resend" | "log" | "disabled" {
    const t = process.env.EMAIL_TRANSPORT;
    if (t === "resend") return process.env.RESEND_API_KEY ? "resend" : "disabled";
    if (t === "smtp" || t === "log" || t === "disabled") return t;
    return process.env.NODE_ENV === "production" ? "disabled" : "log";
  },
  get speechProvider(): "azure" | "mock" | "none" {
    const p = process.env.SPEECH_PROVIDER;
    if (p === "azure" && process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return "azure";
    // O provedor simulado existe apenas para testes automatizados e nunca é usado fora deles.
    if (p === "mock" && process.env.NODE_ENV === "test") return "mock";
    return "none";
  },
  get voiceAllowClientRanked() {
    return process.env.VOICE_ALLOW_CLIENT_RANKED === "true";
  },
};
