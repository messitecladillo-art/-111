import { NavIcon } from '@/components/workbench/shell-kit';
import styles from './Overview.module.css';

/** The research path through the workbench; real fieldwork sits outside the tool and is never simulated away. */
const STEPS = [
  { href: '#diagnose', icon: 'spark', title: '诊断选题', text: '梳理决策主体、目标人群与证据缺口。' },
  { href: '#design', icon: 'book', title: '问卷设计', text: '题项、变量、跳转与计划分析逐一对齐。' },
  { href: '#silicon', icon: 'persona', title: '硅基样本预测试', text: '让 AI 扮演设定人群先答一遍，找出表述与跳转问题。', badge: '新' },
  { href: null, icon: 'route', title: '真人调研', text: '在工具之外完成发放与回收；模拟回答不能替代这一步。' },
  { href: '#analysis', icon: 'grid', title: '数据分析', text: '检查数据质量，按研究问题组合分析模块。' },
  { href: '#editor', icon: 'book', title: '报告与 PPT', text: '把证据链写进报告与幻灯片。' },
  { href: '#defense', icon: 'route', title: '路演与答辩', text: '按主题演练追问，定位每条证据。' },
] as const;

export default function ResearchPipeline() {
  return <section className={styles.pipeline} aria-labelledby="ov-pipeline-title">
    <div className={styles.pipelineHead}>
      <span className={styles.eyebrow}>研究流水线</span>
      <h2 id="ov-pipeline-title">从问题到答辩，每一步都留下证据</h2>
      <p>先用硅基样本检查题目，再开展真人调研。</p>
    </div>
    <ol className={styles.steps}>
      {STEPS.map((s, i) => {
        const body = <><span className={styles.stepNo}>{String(i + 1).padStart(2, '0')}</span><span className={styles.stepIcon}><NavIcon kind={s.icon}/></span><strong>{s.title}{'badge' in s && <em>{s.badge}</em>}</strong><small>{s.text}</small></>;
        return <li key={s.title} data-offline={s.href === null || undefined}>{s.href ? <a href={s.href}>{body}</a> : <div>{body}</div>}</li>;
      })}
    </ol>
  </section>;
}
