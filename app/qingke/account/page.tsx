"use client";

import { FormEvent, useEffect, useState } from "react";
import { accountServiceReady, bindCode, changePassword, currentSession, myAccount, registerAccount, signIn, signOut, type AccountInfo } from "../auth";
import "../qingke.css";

export default function QingkeAccountPage() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [view, setView] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [supportOpen, setSupportOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try { if (await currentSession()) setAccount(await myAccount()); }
      catch { setAccount(null); }
      finally { setLoading(false); }
    })();
  }, []);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (view === "register") await registerAccount(identifier, password);
      else await signIn(identifier, password);
      setAccount(await myAccount());
      setPassword("");
      setMessage(view === "register" ? "注册成功。现在可以绑定收到的兑换码。" : "已登录，可以继续使用顷刻。 ");
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。 "); }
    finally { setBusy(false); }
  }

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await bindCode(code);
      setAccount(await myAccount());
      setCode("");
      setMessage("兑换码已绑定到当前账号。以后换电脑，用同一账号和密码登录即可。 ");
    } catch (error) { setMessage(error instanceof Error ? error.message : "绑定失败，请核对兑换码。 "); }
    finally { setBusy(false); }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    setBusy(true);
    setMessage("");
    try {
      await changePassword(account.identifier, oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setMessage("密码已更新，请妥善保存。 ");
    } catch (error) { setMessage(error instanceof Error ? error.message : "修改密码失败。 "); }
    finally { setBusy(false); }
  }

  async function leave() {
    setBusy(true);
    await signOut();
    setAccount(null);
    setBusy(false);
    setMessage("已退出登录。 ");
  }

  return <div className="qingke-app qingke-account-page">
    <header className="qingke-header"><a className="qingke-brand" href="/qingke"><img className="qingke-brand-mark" src="/qingke-logo-qk.png" alt="" /><span><strong>顷刻</strong><small>投标排版工具</small></span></a><nav><a href="/qingke">返回排版工作台</a><button type="button" onClick={() => setSupportOpen(true)}>联系客服</button></nav></header>
    <main className="qingke-account-layout">
      <div className="qingke-account-intro"><span className="qingke-kicker">你的顷刻账号</span><h1>一枚兑换码，<br /><em>绑定你的账号。</em></h1><p>首次注册时填写手机号或邮箱并设置密码，再绑定卖家发给你的兑换码。换浏览器或电脑后，用同一账号登录即可恢复使用。</p><div className="qingke-account-points"><span>① 不需要手机验证码</span><span>② 标书文件只在浏览器本地处理</span><span>③ 密码不会显示给客服或管理员</span></div></div>
      <div className="qingke-account-card">
        {loading ? <p className="qingke-account-loading">正在读取账号状态…</p> : !accountServiceReady() ? <><h2>账号服务尚未接入</h2><p>产品仍在开发配置中。请稍后再注册或登录。</p></> : account ? <>
          <div className="qingke-account-card-head"><span>账号中心</span><button type="button" onClick={() => void leave()} disabled={busy}>退出登录</button></div>
          <h2>{account.active ? "已激活，可以使用" : "账号已登录，等待激活"}</h2>
          <div className="qingke-account-data"><div><span>登录账号</span><strong>{account.identifier}</strong></div><div><span>兑换状态</span><strong>{account.active ? `已绑定 · 尾号 ${account.code_suffix}` : "未绑定兑换码"}</strong></div></div>
          {account.active ? <a className="qingke-account-action" href="/qingke#workflow">进入排版工作台 →</a> : <form onSubmit={(event) => void redeem(event)} className="qingke-account-form"><label htmlFor="qingke-code">输入收到的兑换码</label><input id="qingke-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="QK-XXXXXXXX-XXXXXXXX-XXXXXXXX" autoComplete="off" required /><button type="submit" disabled={busy}>绑定兑换码</button></form>}
          <details className="qingke-password-details"><summary>修改密码</summary><form onSubmit={(event) => void updatePassword(event)} className="qingke-account-form"><label htmlFor="qingke-old-password">当前密码</label><input id="qingke-old-password" type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} required /><label htmlFor="qingke-new-password">新密码（至少 8 位）</label><input id="qingke-new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /><button type="submit" disabled={busy}>保存新密码</button></form></details>
        </> : <>
          <div className="qingke-account-tabs"><button type="button" className={view === "login" ? "active" : ""} onClick={() => setView("login")}>登录</button><button type="button" className={view === "register" ? "active" : ""} onClick={() => setView("register")}>首次注册</button></div>
          <h2>{view === "login" ? "欢迎回来" : "创建顷刻账号"}</h2><p>{view === "login" ? "使用注册时填写的手机号或邮箱登录。" : "手机号或邮箱仅作为登录标识，本期不发送验证码。"}</p>
          <form onSubmit={(event) => void authenticate(event)} className="qingke-account-form"><label htmlFor="qingke-identifier">手机号或邮箱</label><input id="qingke-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" placeholder="手机号 / 邮箱" required /><label htmlFor="qingke-password">密码</label><input id="qingke-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={view === "register" ? "new-password" : "current-password"} minLength={view === "register" ? 8 : undefined} required /><button type="submit" disabled={busy}>{busy ? "请稍候…" : view === "login" ? "登录账号" : "注册并继续"}</button></form>
          <div className="qingke-account-help"><span>忘记账号或密码？</span><button type="button" onClick={() => setSupportOpen(true)}>联系客服人工处理</button></div>
        </>}
        {message && <p className="qingke-message" role="status">{message}</p>}
      </div>
    </main>
    <footer className="qingke-footer"><span>顷刻投标排版工具</span><p>请保存账号和密码；账号标识未经手机或邮箱验证</p><button type="button" onClick={() => setSupportOpen(true)}>联系客服 ↗</button></footer>
    {supportOpen && <div className="qingke-modal-backdrop" onClick={() => setSupportOpen(false)}><div className="qingke-modal" role="dialog" aria-modal="true" aria-label="联系客服" onClick={(event) => event.stopPropagation()}><button type="button" className="qingke-modal-close" onClick={() => setSupportOpen(false)} aria-label="关闭">×</button><span className="qingke-kicker">需要帮助？</span><h3>联系顷刻客服</h3><p>账号或兑换码问题，请提供原购买记录。不要发送未脱敏的标书。</p><img src="/qingke-contact.png" alt="顷刻客服微信二维码" /><small>微信扫码添加客服</small></div></div>}
  </div>;
}
