import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '证见 EVI-X｜实证调查与统计建模工作台',
    short_name: '证见 EVI-X',
    description:
      '面向大学生市场调查与学术实证研究的一体化抽样设计、问卷核验、统计建模与报告成稿工作台。',
    lang: 'zh-CN',
    start_url: '/',
    display: 'standalone',
    background_color: 'rgb(250, 248, 244)',
    theme_color: 'rgb(15, 118, 110)',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
