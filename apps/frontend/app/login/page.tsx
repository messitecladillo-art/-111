import type { Metadata } from 'next';
import HostedFrame from '@/components/hosted/HostedFrame';
import LoginClient from './LoginClient';

export const metadata: Metadata = {
  title: '账号登录｜证见 EVI-X',
  description: '使用受邀邮箱验证码登录证见 EVI-X 账号，延续项目版本、团队协作与实证调查研究进度。',
};

export default function LoginPage() {
  return (
    <HostedFrame variant="auth" title="证见 EVI-X · 邮箱登录" subtitle="连接你的证见 EVI-X 账号，继续真实的研究工作。">
      <LoginClient />
    </HostedFrame>
  );
}
