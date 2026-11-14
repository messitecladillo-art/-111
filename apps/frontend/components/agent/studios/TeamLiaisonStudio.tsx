'use client';

import { useEffect, useState } from 'react';
import { parseCollection, parseTeam } from '@evix/shared';
import { ACCENT } from '@/components/editors/PaperBlocks';
import type { EditorContent } from '@/lib/editor-model';
import {
  generateProceduralStudioSvg,
  MAX_TEAM_MEMBERS,
  svgToDataUrl,
} from '@/lib/agent/studio-tools';
import { assertTrueVector } from '@/lib/svg-safety';
import styles from './Studio.module.css';

export interface TeamMate {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'editor' | 'reviewer' | 'viewer';
  status: 'online' | 'writing' | 'offline';
  specialty: string;
  avatarSvg: string;
  lastSeenLabel: string;
}

export interface TeamMilestone {
  id: string;
  stage: string;
  title: string;
  owner: string;
  dueLabel: string;
  status: 'done' | 'active' | 'todo';
}

const INITIAL_MILESTONES: TeamMilestone[] = [
  { id: 'M1', stage: 'Day 1', title: '选题与文献词云定稿', owner: '队长 / 主编', dueLabel: '已完成', status: 'done' },
  { id: 'M2', stage: 'Day 3', title: '问卷设计与抽样派发', owner: '苏晴（田野组长）', dueLabel: '已完成', status: 'done' },
  { id: 'M3', stage: 'Day 7', title: '三线表与假设检验建模', owner: '林深（建模官）', dueLabel: '进行中', status: 'active' },
  { id: 'M4', stage: 'Day 10', title: '国奖级正文与框架图统稿', owner: '全队协同', dueLabel: '待启动', status: 'todo' },
  { id: 'M5', stage: 'Day 14', title: '问辩稿演练与答辩彩排', owner: '队长 + 汇报手', dueLabel: '待启动', status: 'todo' },
];

const MILESTONE_STATUS_LABELS: Record<TeamMilestone['status'], string> = {
  done: '✓ 已完成',
  active: '● 推进中',
  todo: '○ 待启动',
};

const ROLE_LABELS: Record<TeamMate['role'], string> = {
  owner: '队长 / 主编',
  editor: '建模 / 撰稿',
  reviewer: '数据审校',
  viewer: '答辩观摩',
};

const buildAvatar = (name: string, accentHex: string) =>
  assertTrueVector(generateProceduralStudioSvg({ preset: 'avatar', prompt: name, accentHex }));

export default function TeamLiaisonStudio({
  content,
  teamId,
  signedIn,
  currentUserEmail,
  csrfToken,
  onSaveArtifact,
}: {
  content: EditorContent;
  teamId?: string | null;
  signedIn: boolean;
  currentUserEmail?: string;
  csrfToken?: string;
  onSaveArtifact?: (title: string, svg: string) => void;
}) {
  const accentHex = `#${(ACCENT[content.accent] || '0F766E').replace('#', '')}`;
  const [mates, setMates] = useState<TeamMate[]>(() => [
    {
      id: 'mate-1',
      name: currentUserEmail?.split('@')[0] || '我（队长）',
      email: currentUserEmail || 'leader@evix-team.local',
      role: 'owner',
      status: 'online',
      specialty: '选题定调与统筹',
      avatarSvg: buildAvatar(currentUserEmail?.split('@')[0] || '队长', accentHex),
      lastSeenLabel: '当前在线',
    },
    {
      id: 'mate-2',
      name: '林深（建模官）',
      email: 'linshen@evix-team.local',
      role: 'editor',
      status: 'writing',
      specialty: '回归/IPA 实证分析',
      avatarSvg: buildAvatar('林深', '#1D4ED8'),
      lastSeenLabel: '正在撰写第3章',
    },
    {
      id: 'mate-3',
      name: '苏晴（田野组长）',
      email: 'suqing@evix-team.local',
      role: 'reviewer',
      status: 'online',
      specialty: '抽样配额与质控审校',
      avatarSvg: buildAvatar('苏晴', '#881337'),
      lastSeenLabel: '20 秒前活跃',
    },
  ]);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'reviewer' | 'viewer'>('editor');
  const [inviteSpecialty, setInviteSpecialty] = useState('访谈整理 / PPT 美化');
  const [pingNote, setPingNote] = useState('请核对绪论词云与第2节技术路线图！');
  const [autoTeamId, setAutoTeamId] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<TeamMilestone[]>(INITIAL_MILESTONES);
  const [status, setStatus] = useState(`队伍席位 ${3}/${MAX_TEAM_MEMBERS} 人在线协同。`);
  const activeTeamId = teamId || autoTeamId;

  const cycleMilestone = (milestoneId: string) => {
    const order: TeamMilestone['status'][] = ['todo', 'active', 'done'];
    setMilestones(prev =>
      prev.map(ms => {
        if (ms.id !== milestoneId) return ms;
        const nextStatus = order[(order.indexOf(ms.status) + 1) % order.length];
        setStatus(`里程碑 ${ms.id}「${ms.title}」已更新为：${MILESTONE_STATUS_LABELS[nextStatus]}。`);
        return {
          ...ms,
          status: nextStatus,
          dueLabel: nextStatus === 'done' ? '已完成' : nextStatus === 'active' ? '进行中' : '待启动',
        };
      }),
    );
  };

  useEffect(() => {
    if (!signedIn || teamId) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/teams', { credentials: 'include' });
        if (!res.ok || !active) return;
        const json = (await res.json()) as unknown;
        const teams = parseCollection(json, 'teams', parseTeam);
        const preferred = teams.find(t => t.role === 'owner') ?? teams[0];
        if (preferred && active) setAutoTeamId(preferred.id);
      } catch {
        // Keep local rehearsal squad when backend teams endpoint is unavailable.
      }
    })();
    return () => { active = false; };
  }, [signedIn, teamId]);

  useEffect(() => {
    if (!signedIn || !activeTeamId) return;
    let active = true;
    const syncPresence = async () => {
      try {
        const res = await fetch(`/api/teams/${encodeURIComponent(activeTeamId)}/presence`, { credentials: 'include' });
        if (!res.ok || !active) return;
        const data = (await res.json()) as {
          members?: Array<{ userId: string; email: string; role: TeamMate['role']; status: TeamMate['status']; note?: string }>;
        };
        if (!data.members?.length || !active) return;
        setMates(
          data.members.slice(0, MAX_TEAM_MEMBERS).map((m, i) => ({
            id: m.userId,
            name: m.email.split('@')[0] || `成员${i + 1}`,
            email: m.email,
            role: m.role,
            status: m.status,
            specialty: m.note || ROLE_LABELS[m.role],
            avatarSvg: buildAvatar(m.email.split('@')[0] || `成员${i + 1}`, accentHex),
            lastSeenLabel: m.status === 'online' ? '云端心跳在线' : m.status === 'writing' ? '正在编修' : '暂离',
          })),
        );
      } catch {
        // Keep local sandbox squad gracefully when backend route is offline.
      }
    };
    void syncPresence();
    const timer = window.setInterval(syncPresence, 20000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [signedIn, activeTeamId, accentHex]);

  const addMember = async () => {
    if (mates.length >= MAX_TEAM_MEMBERS) {
      setStatus(`已达 ${MAX_TEAM_MEMBERS} 人队伍上限，无法继续添加成员。`);
      return;
    }
    const cleanEmail = inviteEmail.trim() || `member${mates.length + 1}@evix-team.local`;
    const cleanName = inviteName.trim() || cleanEmail.split('@')[0] || `队员${mates.length + 1}`;

    if (signedIn && activeTeamId && csrfToken && inviteEmail.includes('@')) {
      try {
        const res = await fetch(`/api/teams/${encodeURIComponent(activeTeamId)}/members`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ email: cleanEmail, role: inviteRole }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { detail?: string; error?: { message?: string } };
          setStatus(err.error?.message || err.detail || `邀请失败（HTTP ${res.status}）`);
          return;
        }
      } catch {
        setStatus('网络连接异常，未能向团队服务器提交成员邀请。');
        return;
      }
    }

    const avatarSvg = buildAvatar(cleanName, accentHex);
    const next: TeamMate = {
      id: `mate-${Date.now().toString(36)}`,
      name: cleanName,
      email: cleanEmail,
      role: inviteRole,
      status: 'online',
      specialty: inviteSpecialty.trim() || ROLE_LABELS[inviteRole],
      avatarSvg,
      lastSeenLabel: '刚刚入队在线',
    };
    setMates(prev => [...prev, next]);
    onSaveArtifact?.(`队员头像-${cleanName}`, avatarSvg);
    setInviteName('');
    setInviteEmail('');
    setStatus(`成员「${cleanName}」已加入联络室（${mates.length + 1}/${MAX_TEAM_MEMBERS}）。`);
  };

  const cycleStatus = async (id: string) => {
    const order: TeamMate['status'][] = ['online', 'writing', 'offline'];
    let updatedStatus: TeamMate['status'] = 'online';
    setMates(prev =>
      prev.map(m => {
        if (m.id !== id) return m;
        updatedStatus = order[(order.indexOf(m.status) + 1) % order.length];
        return {
          ...m,
          status: updatedStatus,
          lastSeenLabel: updatedStatus === 'online' ? '在线待命' : updatedStatus === 'writing' ? '正在改稿中' : '离线休息',
        };
      }),
    );
    if (signedIn && activeTeamId && csrfToken) {
      void fetch(`/api/teams/${encodeURIComponent(activeTeamId)}/presence`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ status: updatedStatus, note: pingNote.slice(0, 60) }),
      }).catch(() => {});
    }
  };

  const regenerateAvatar = (id: string) => {
    const colors = ['#0F766E', '#1D4ED8', '#881337', '#B45309', '#4338CA'];
    setMates(prev =>
      prev.map(m => {
        if (m.id !== id) return m;
        const pick = colors[Math.floor(Math.random() * colors.length)];
        const avatarSvg = buildAvatar(`${m.name}-${Date.now().toString(36).slice(-2)}`, pick);
        onSaveArtifact?.(`专属头像-${m.name}`, avatarSvg);
        return { ...m, avatarSvg };
      }),
    );
    setStatus('已调用生图工坊生成全新队伍专属矢量头像并同步资产库！');
  };

  const removeMember = async (id: string) => {
    if (signedIn && activeTeamId && csrfToken && !id.startsWith('mate-')) {
      try {
        const res = await fetch(`/api/teams/${encodeURIComponent(activeTeamId)}/members/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'x-csrf-token': csrfToken },
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { detail?: string; error?: { message?: string } };
          setStatus(err.error?.message || err.detail || `移除成员失败（HTTP ${res.status}）`);
          return;
        }
      } catch {
        setStatus('网络连接异常，未能从团队服务器移除成员。');
        return;
      }
    }
    setMates(prev => prev.filter(m => m.id !== id || m.role === 'owner'));
    setStatus('已调整团队联络室成员席位。');
  };

  return (
    <div className={styles.studio}>
      <div className={styles.studioHeader}>
        <h4>6人小队分工协同</h4>
        <span className={styles.monoTag}>{mates.length}/{MAX_TEAM_MEMBERS} 席在线</span>
      </div>

      <div className={styles.panel}>
        <div className={styles.row}>
          <input
            className={styles.input}
            style={{ flex: 1 }}
            value={pingNote}
            onChange={e => setPingNote(e.target.value)}
            placeholder="发送团队实时看板公告…"
          />
          <button
            type="button"
            className={styles.btn}
            onClick={() => setStatus(`已向全队 ${mates.filter(m => m.status !== 'offline').length} 名在线成员广播：「${pingNote}」`)}
          >
            📣 全队广播
          </button>
        </div>

        <ul className={styles.list}>
          {mates.map(m => (
            <li key={m.id} className={styles.itemCard}>
              <div className={styles.row} style={{ flexWrap: 'nowrap' }}>
                <span className={styles.avatarBox}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={svgToDataUrl(m.avatarSvg)} alt={m.name} width={38} height={38} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.heroHead}>
                    <strong style={{ fontSize: 12 }}>
                      <span className={m.status === 'online' ? styles.dotOnline : m.status === 'writing' ? styles.dotWriting : styles.dotOffline} />{' '}
                      {m.name}
                    </strong>
                    <span className={styles.badge}>{ROLE_LABELS[m.role]}</span>
                  </div>
                  <p className={styles.muted}>{m.specialty} · {m.lastSeenLabel}</p>
                </div>
              </div>
              <div className={styles.row}>
                <button type="button" className={styles.btn} onClick={() => void cycleStatus(m.id)}>
                  切换状态
                </button>
                <button type="button" className={styles.btn} onClick={() => regenerateAvatar(m.id)}>
                  🎨 换 IP 头像
                </button>
                {m.role !== 'owner' && (
                  <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => void removeMember(m.id)}>
                    移出
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.panel}>
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12 }}>赛事五阶里程碑排期看板</strong>
          <span className={styles.badge}>
            {milestones.filter(ms => ms.status === 'done').length}/{milestones.length} 完成
          </span>
        </div>
        <ul className={styles.list}>
          {milestones.map(ms => (
            <li key={ms.id} className={styles.itemCard}>
              <div className={styles.heroHead}>
                <strong style={{ fontSize: 12 }}>
                  {ms.id} · {ms.title}
                </strong>
                <button
                  type="button"
                  className={`${styles.btn} ${ms.status === 'active' ? styles.btnPrimary : ''}`}
                  onClick={() => cycleMilestone(ms.id)}
                >
                  {MILESTONE_STATUS_LABELS[ms.status]}
                </button>
              </div>
              <p className={styles.muted}>
                {ms.stage} · 责任人：{ms.owner} · 当前：{ms.dueLabel}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.panel}>
        <div className={styles.heroHead}>
          <strong style={{ fontSize: 12 }}>招募新队友（剩余 {Math.max(0, MAX_TEAM_MEMBERS - mates.length)} 席）</strong>
        </div>
        <div className={styles.row}>
          <input className={styles.input} style={{ flex: 1 }} value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="队友昵称（如：阿哲）" />
          <select className={styles.select} style={{ width: 108 }} value={inviteRole} onChange={e => setInviteRole(e.target.value as 'editor' | 'reviewer' | 'viewer')}>
            <option value="editor">建模/撰稿</option>
            <option value="reviewer">数据审校</option>
            <option value="viewer">答辩观摩</option>
          </select>
        </div>
        <div className={styles.row}>
          <input className={styles.input} style={{ flex: 1 }} value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="队员账号邮箱（登录后联动云端校验）" />
          <input className={styles.input} style={{ flex: 1 }} value={inviteSpecialty} onChange={e => setInviteSpecialty(e.target.value)} placeholder="分工职责" />
        </div>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={mates.length >= MAX_TEAM_MEMBERS}
          onClick={() => void addMember()}
        >
          {mates.length >= MAX_TEAM_MEMBERS ? `已满 ${MAX_TEAM_MEMBERS} 人上限` : '+ 邀请加入联络室'}
        </button>
      </div>

      <div className={styles.statusBar}>{status}</div>
    </div>
  );
}
