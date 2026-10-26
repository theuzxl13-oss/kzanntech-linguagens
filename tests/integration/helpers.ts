import { randomUUID } from "node:crypto";
import { signup } from "../../src/lib/server/accounts";
import { query, queryOne } from "../../src/lib/server/db";
import { getUserById } from "../../src/lib/server/session-store";

export async function makeUser(opts: { consent?: boolean; nickname?: string } = {}) {
  const tag = randomUUID().slice(0, 8);
  const nickname = opts.nickname ?? `user_${tag}`;
  const res = await signup({ email: `${tag}@example.com`, password: "senha12345", nickname, acceptTerms: true }, { ip: `ip-${tag}` });
  if (opts.consent) await query(`update profiles set voice_consent_at = now() where user_id = $1`, [res.userId]);
  const user = (await getUserById(res.userId))!;
  return { ...user, token: res.token };
}

/** Resposta correta (principal) para o item na posição idx da sessão. */
export async function correctAnswerFor(sessionId: string, idx: number) {
  const row = await queryOne<{ answer: string }>(
    `select a.answer from session_items si
       join accepted_answers a on a.item_id = si.item_id and a.is_primary
        and a.direction = case when si.format = 'translate' then 'to_pt' else 'to_target' end
      where si.session_id = $1 and si.idx = $2`,
    [sessionId, idx],
  );
  return row!.answer;
}

export async function itemText(sessionId: string, idx: number) {
  return (await queryOne<{ text: string }>(
    `select ci.text from session_items si join content_items ci on ci.id = si.item_id where si.session_id = $1 and si.idx = $2`,
    [sessionId, idx],
  ))!.text;
}

export async function sessionSize(sessionId: string) {
  return (await queryOne<{ n: number }>(`select count(*)::int as n from session_items where session_id = $1`, [sessionId]))!.n;
}
