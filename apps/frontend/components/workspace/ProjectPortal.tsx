'use client';

import Link from 'next/link';
import LifecycleWarRoom from '@/components/LifecycleWarRoom';
import { useHostedSession } from '@/components/hosted/HostedSession';
import styles from './ProjectPortal.module.css';

/**
 * 项目门户: where the hosted side of the workbench is reached. Projects and model services live in the account; the
 * lifecycle tool, kept below, compares the portal's registration with the local agent's real progress.
 */
export default function ProjectPortal() {
  const { session, loading, error } = useHostedSession();
  const signedIn = !!session?.authenticated, email = session?.user?.email ?? '';
  // Only a session that answered "signed out" sends to the login page; while it is unknown, the projects page decides.
  const signedOut = !loading && !error && session?.authenticated === false;
  const account = signedIn ? email : loading ? '正在核对登录…' : signedOut ? '未登录' : '账号服务暂未就绪';
  return <section className="section" aria-labelledby="portal-title">
    <div className="section-heading">
      <div><span className="eyebrow">项目门户</span><h2 id="portal-title">项目、模型服务与生命周期</h2></div>
      <p>托管项目在账号里保存问卷版本与模型提案；生命周期工具对照门户登记与本地 Agent 的真实进度。</p>
    </div>
    <div className={styles.cards}>
      <article className={styles.card}>
        <span>托管项目</span>
        <h3>我的项目</h3>
        <p>创建团队项目、邀请成员，生成、编辑并保存问卷版本。</p>
        <Link className="primary-button" href={signedOut ? '/login' : '/projects'}>{signedOut ? '登录后使用' : '打开我的项目'}</Link>
      </article>
      <article className={styles.card}>
        <span>模型</span>
        <h3>模型服务</h3>
        <p>接入你自己的模型服务，用来起草问卷；API Key 只交给服务端保存。</p>
        <Link className="ghost-button" href="/services">管理模型服务</Link>
      </article>
      <article className={styles.card} aria-busy={loading}>
        <span>账号</span>
        <h3 title={email || undefined}>{account}</h3>
        <p>{signedIn ? '项目、问卷版本与模型服务都保存在这个账号里。' : signedOut ? '通过受邀邮箱登录后，项目、问卷版本与个人服务会保存在账号里。' : loading ? '正在读取登录状态。' : '暂时无法确认登录状态；可以在侧栏或页首重新连接。'}</p>
        {signedOut && <Link className="ghost-button" href="/login">使用邮箱登录</Link>}
      </article>
    </div>
    <details id="lifecycle" className={styles.lifecycle}>
      <summary><b>本地生命周期工具</b><small>九项质量门禁、缺失材料与下一步，与门户登记分开呈现</small></summary>
      <LifecycleWarRoom portalProject={null} />
    </details>
  </section>;
}
