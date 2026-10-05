// 仅账号和授权数据经过在线服务；DOCX 只在浏览器中处理。
const endpoint = process.env.NEXT_PUBLIC_QINGKE_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const publishableKey = process.env.NEXT_PUBLIC_QINGKE_SUPABASE_PUBLISHABLE_KEY ?? "";
const storageKey = "qingke-auth-session-v1";
let refreshInFlight: Promise<Session> | null = null;

type AuthUser = { id: string; email?: string | null; phone?: string | null };
type Session = { access_token: string; refresh_token: string; expires_at: number; user: AuthUser };
type AuthResponse = { access_token?: string; refresh_token?: string; expires_in?: number; expires_at?: number; user?: AuthUser; msg?: string; error_description?: string; message?: string };

export type AccountInfo = { identifier: string; kind: "email" | "phone"; redeemed_at: string | null; code_suffix: string | null; active: boolean; is_admin: boolean };
export type AdminCode = { code_id: string; suffix: string; created_at: string; redeemed_at: string | null; revoked_at: string | null; identifier: string | null; note: string };
export type AdminUser = { user_id: string; identifier: string; kind: string; created_at: string; code_suffix: string | null; redeemed_at: string | null; active: boolean };
export type GeneratedCode = { code_id: string; full_code: string; created_at: string };

export function accountServiceReady() { return !!endpoint && !!publishableKey; }

function requireConfig() {
  if (!accountServiceReady()) throw new Error("账号服务尚未配置。正式开放前需要连接认证数据库。 ");
}

function normalizeIdentifier(input: string): { kind: "email" | "phone"; value: string } {
  const value = input.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { kind: "email", value: value.toLowerCase() };
  if (/^1[3-9]\d{9}$/.test(value)) return { kind: "phone", value: `+86${value}` };
  if (/^\+\d{8,15}$/.test(value)) return { kind: "phone", value };
  throw new Error("请输入有效邮箱，或 11 位中国大陆手机号。 ");
}

function authEmail(identifier: { kind: "email" | "phone"; value: string }): string {
  // 手机号只是未验证的登录名；映射到本产品专用内部邮箱，不依赖短信服务。
  return identifier.kind === "phone"
    ? `p${identifier.value.slice(1)}@id.qingke.anitalee.cn`
    : identifier.value;
}

function saveSession(response: AuthResponse): Session {
  if (!response.access_token || !response.refresh_token || !response.user?.id) {
    throw new Error("当前账号服务要求邮箱确认，请管理员关闭注册确认后再试。 ");
  }
  const session: Session = {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    expires_at: response.expires_at ?? Math.floor(Date.now() / 1000) + (response.expires_in ?? 3600),
    user: response.user,
  };
  localStorage.setItem(storageKey, JSON.stringify(session));
  return session;
}

function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed?.access_token && parsed?.refresh_token && parsed?.user?.id ? parsed : null;
  } catch { return null; }
}

function errorMessage(data: Record<string, unknown>, status: number): string {
  const raw = String(data.msg ?? data.error_description ?? data.message ?? data.error ?? "");
  if (/invalid login credentials/i.test(raw)) return "账号或密码错误。 ";
  if (/user already registered/i.test(raw)) return "此账号已注册，请直接登录。 ";
  if (/password/i.test(raw) && /short|length|weak/i.test(raw)) return "密码至少 8 位，并避免使用过于简单的组合。 ";
  if (/email/i.test(raw) && /disabled|not allowed/i.test(raw)) return "邮箱账号尚未启用，请联系管理员检查认证配置。 ";
  return raw || `账号服务暂不可用（${status}）。`;
}

async function request(path: string, body: unknown, token?: string, method = "POST") {
  requireConfig();
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: { apikey: publishableKey, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(data, response.status));
  return data;
}

async function refresh(session: Session): Promise<Session> {
  if (!refreshInFlight) {
    refreshInFlight = request("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token })
      .then((response) => saveSession(response as AuthResponse))
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function currentSession(): Promise<Session | null> {
  if (!accountServiceReady()) return null;
  const session = storedSession();
  if (!session) return null;
  if (session.expires_at < Math.floor(Date.now() / 1000) + 60) return refresh(session);
  return session;
}

export async function registerAccount(identifier: string, password: string): Promise<Session> {
  if (password.length < 8) throw new Error("密码至少 8 位。 ");
  const account = normalizeIdentifier(identifier);
  const response = await request("/auth/v1/signup", { email: authEmail(account), password });
  return saveSession(response as AuthResponse);
}

export async function signIn(identifier: string, password: string): Promise<Session> {
  const account = normalizeIdentifier(identifier);
  const response = await request("/auth/v1/token?grant_type=password", { email: authEmail(account), password });
  return saveSession(response as AuthResponse);
}

export async function signOut(): Promise<void> {
  const session = storedSession();
  localStorage.removeItem(storageKey);
  if (session) await request("/auth/v1/logout", {}, session.access_token).catch(() => undefined);
}

export async function changePassword(identifier: string, oldPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new Error("新密码至少 8 位。 ");
  await signIn(identifier, oldPassword);
  const session = await currentSession();
  if (!session) throw new Error("请重新登录后再修改密码。 ");
  await request("/auth/v1/user", { password: newPassword }, session.access_token, "PUT");
}

async function rpc<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const session = await currentSession();
  if (!session) throw new Error("请先登录账号。 ");
  try {
    return await request(`/rest/v1/rpc/${name}`, params, session.access_token) as T;
  } catch (error) {
    if (error instanceof Error && /JWT expired|token expired|401/i.test(error.message)) {
      const renewed = await refresh(session);
      return await request(`/rest/v1/rpc/${name}`, params, renewed.access_token) as T;
    }
    throw error;
  }
}

export function myAccount() { return rpc<AccountInfo>("qingke_my_account"); }
export function bindCode(code: string) { return rpc<{ status: string }>("qingke_bind_code", { p_code: code }); }
export function adminListCodes() { return rpc<AdminCode[]>("qingke_admin_list_codes"); }
export function adminListUsers() { return rpc<AdminUser[]>("qingke_admin_list_users"); }
export function adminGenerateCodes(count: number, note: string) { return rpc<GeneratedCode[]>("qingke_admin_generate_codes", { p_count: count, p_note: note }); }
export function adminRevokeCode(codeId: string) { return rpc<{ status: string }>("qingke_admin_revoke_code", { p_code_id: codeId }); }
