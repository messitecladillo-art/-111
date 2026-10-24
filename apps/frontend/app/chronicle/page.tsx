import type { Metadata } from 'next';
import ChroniclePage from '@/components/landing/ChroniclePage';

export const metadata: Metadata = {
  title: '寻证之旅｜证见 EVI-X',
  description: '从甲骨、文献与考据，到现代研究。沿七阶段交互时间线，观察证据如何连接问题与行动。',
};

export default function Chronicle() {
  return <ChroniclePage />;
}
