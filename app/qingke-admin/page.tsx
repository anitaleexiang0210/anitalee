"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { accountServiceReady, adminGenerateCodes, adminListCodes, adminListUsers, adminRevokeCode, currentSession, myAccount, signIn, signOut, type AdminCode, type AdminUser, type GeneratedCode } from "../qingke/auth";
import "../qingke/qingke.css";
import "./qingke-admin.css";

function date(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
}

export default function QingkeAdminPage() {
  const [state, setState] = useState<"loading" | "login" | "ready" | "denied">("loading");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<"codes" | "users">("codes");
  const [codes, setCodes] = useState<AdminCode[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [generated, setGenerated] = useState<GeneratedCode[]>([]);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function loadData() {
    const account = await myAccount();
    if (!account.is_admin) { setState("denied"); return; }
    const [nextCodes, nextUsers] = await Promise.all([adminListCodes(), adminListUsers()]);
    setCodes(nextCodes);
    setUsers(nextUsers);
    setState("ready");
  }

  useEffect(() => {
    (async () => {
      try {
        if (!accountServiceReady() || !(await currentSession())) setState("login");
        else await loadData();
      } catch { setState("login"); }
    })();
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try { await signIn(identifier, password); await loadData(); setPassword(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "登录失败。 "); }
    finally { setBusy(false); }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const fresh = await adminGenerateCodes(count, note.trim());
      setGenerated(fresh);
      setCopyStatus("idle");
      setCodes(await adminListCodes());
      setMessage(`已生成 ${fresh.length} 枚兑换码。完整码只在当前页面显示，请立即复制并妥善保管。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "生成失败。 "); }
    finally { setBusy(false); }
  }

  async function revoke(code: AdminCode) {
    if (!window.confirm(`确定停用尾号 ${code.suffix} 的兑换码吗？已绑定用户将失去使用权限；这项操作会保留记录。`)) return;
    setBusy(true);
    setMessage("");
    try {
      await adminRevokeCode(code.code_id);
      const [nextCodes, nextUsers] = await Promise.all([adminListCodes(), adminListUsers()]);
      setCodes(nextCodes); setUsers(nextUsers);
      setMessage(`尾号 ${code.suffix} 已停用。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "停用失败。 "); }
    finally { setBusy(false); }
  }

  async function copyGenerated() {
    setCopyStatus("idle");
    try {
      await navigator.clipboard.writeText(generated.map((item) => item.full_code).join("\n"));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  const filteredCodes = useMemo(() => codes.filter((item) => `${item.suffix} ${item.identifier ?? ""} ${item.note}`.toLowerCase().includes(query.trim().toLowerCase())), [codes, query]);
  const filteredUsers = useMemo(() => users.filter((item) => `${item.identifier} ${item.code_suffix ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [users, query]);
  const usedCount = codes.filter((item) => item.redeemed_at && !item.revoked_at).length;

  return <div className="qingke-app qingke-admin-app">
    <header className="qingke-header"><a className="qingke-brand" href="/qingke-admin"><img className="qingke-brand-mark" src="/qingke-logo.svg" alt="" /><span><strong>顷刻管理台</strong><small>仅管理员使用</small></span></a>{state === "ready" && <nav><button type="button" onClick={() => void signOut().then(() => setState("login"))}>退出后台</button></nav>}</header>
    {state === "loading" ? <main className="qingke-admin-gate"><p>正在验证管理员身份…</p></main> : state === "login" ? <main className="qingke-admin-gate"><div className="qingke-admin-login"><span className="qingke-kicker">PRIVATE CONSOLE</span><h1>顷刻管理后台</h1><p>使用已获管理员权限的账号登录。后台地址本身不构成权限保护。</p>{!accountServiceReady() ? <div className="qingke-message">账号服务尚未配置，后台暂不可用。</div> : <form onSubmit={(event) => void login(event)} className="qingke-account-form"><label htmlFor="admin-id">手机号或邮箱</label><input id="admin-id" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" /><label htmlFor="admin-password">密码</label><input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /><button type="submit" disabled={busy}>登录管理后台</button></form>}{message && <p className="qingke-message" role="status">{message}</p>}</div></main> : state === "denied" ? <main className="qingke-admin-gate"><div className="qingke-admin-login"><h1>没有管理员权限</h1><p>此账号不是顷刻管理员。请使用管理员账号登录。</p><button className="qingke-admin-plain" onClick={() => void signOut().then(() => setState("login"))}>换一个账号</button></div></main> : <main className="qingke-admin-main">
      <div className="qingke-admin-title"><div><span className="qingke-kicker">管理工作台</span><h1>兑换码与用户</h1><p>生成兑换码、查看绑定关系、停用需要处理的兑换码。</p></div><button type="button" onClick={() => void loadData().catch((error) => setMessage(String(error)))} disabled={busy}>刷新数据 ↻</button></div>
      <div className="qingke-admin-stats"><div><span>兑换码总数</span><strong>{codes.length}</strong></div><div><span>已绑定且有效</span><strong>{usedCount}</strong></div><div><span>未绑定</span><strong>{codes.filter((item) => !item.redeemed_at && !item.revoked_at).length}</strong></div><div><span>用户数</span><strong>{users.length}</strong></div></div>
      <div className="qingke-admin-generate"><div><h2>生成兑换码</h2><p>每枚码只能绑定一个账号。完整码仅在生成后的当前页面显示一次。</p></div><form onSubmit={(event) => void generate(event)}><label>数量 <input type="number" min={1} max={50} value={count} onChange={(event) => setCount(Number(event.target.value))} /></label><label>订单备注 <input value={note} maxLength={120} onChange={(event) => setNote(event.target.value)} placeholder="可填订单号，选填" /></label><button type="submit" disabled={busy}>生成兑换码</button></form></div>
      {generated.length > 0 && <div className="qingke-admin-generated"><div><strong>本次生成的完整兑换码</strong><div className="qingke-admin-copy-controls"><span className={copyStatus === "failed" ? "qingke-admin-copy-error" : ""} role="status">{copyStatus === "copied" ? "已复制到剪贴板 ✓" : copyStatus === "failed" ? "复制失败，请手动选中文本复制" : ""}</span><button type="button" onClick={() => void copyGenerated()}>{copyStatus === "copied" ? "再次复制" : "复制全部"}</button></div></div><textarea readOnly value={generated.map((item) => item.full_code).join("\n")} rows={Math.min(8, generated.length + 1)} /><p>离开或刷新页面后，后台只保留尾号与使用记录，不能再次查看完整码。</p></div>}
      <div className="qingke-admin-list-head"><div className="qingke-admin-tabs"><button type="button" className={tab === "codes" ? "active" : ""} onClick={() => { setTab("codes"); setQuery(""); }}>兑换码 <b>{codes.length}</b></button><button type="button" className={tab === "users" ? "active" : ""} onClick={() => { setTab("users"); setQuery(""); }}>用户 <b>{users.length}</b></button></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "codes" ? "搜索尾号、账号或备注" : "搜索账号或兑换码尾号"} /></div>
      <div className="qingke-admin-table-wrap"><table><thead><tr>{tab === "codes" ? <><th>兑换码</th><th>状态</th><th>绑定账号</th><th>生成时间</th><th>绑定时间</th><th>备注</th><th>操作</th></> : <><th>账号</th><th>类型</th><th>注册时间</th><th>兑换码</th><th>兑换状态</th></>}</tr></thead><tbody>{tab === "codes" ? filteredCodes.map((item) => <tr key={item.code_id}><td>···· {item.suffix}</td><td><span className={`qingke-admin-status ${item.revoked_at ? "revoked" : item.redeemed_at ? "used" : "unused"}`}>{item.revoked_at ? "已停用" : item.redeemed_at ? "已绑定" : "未绑定"}</span></td><td>{item.identifier ?? "—"}</td><td>{date(item.created_at)}</td><td>{date(item.redeemed_at)}</td><td>{item.note || "—"}</td><td>{!item.revoked_at && <button type="button" onClick={() => void revoke(item)} disabled={busy}>停用</button>}</td></tr>) : filteredUsers.map((item) => <tr key={item.user_id}><td>{item.identifier}</td><td>{item.kind === "phone" ? "手机号" : "邮箱"}</td><td>{date(item.created_at)}</td><td>{item.code_suffix ? `···· ${item.code_suffix}` : "—"}</td><td><span className={`qingke-admin-status ${item.active ? "used" : "unused"}`}>{item.active ? "已激活" : "未激活"}</span></td></tr>)}</tbody></table>{(tab === "codes" ? filteredCodes.length : filteredUsers.length) === 0 && <p className="qingke-admin-empty">没有匹配记录。</p>}</div>
      {message && <p className="qingke-message" role="status">{message}</p>}
      <p className="qingke-admin-footnote">账号标识未经过手机或邮箱所有权验证。密码不会显示在后台；退款或误绑时停用旧码，核对订单后再生成新码。</p>
    </main>}
  </div>;
}
