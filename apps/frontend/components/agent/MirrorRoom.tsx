import styles from './MirrorRoom.module.css';

const ASCII = `+--------------------------------+
|  E V I - X   /   M I R R O R   |
|  [Q]---[D]---[I]---[A]         |
|  > await research intent_      |
+--------------------------------+`;

export default function MirrorRoom({ compact = false }: { compact?: boolean }) {
  const frames = compact ? 4 : 7;
  return <div className={styles.room} data-compact={compact || undefined} aria-hidden="true">
    <span className={styles.grid}/>
    {Array.from({ length: frames }, (_, index) => <span key={index} className={styles.frame} style={{
      width: `${44 + index * 8}%`,
      opacity: 0.62 - index * 0.07,
      transform: `translate(-50%, -50%) translateZ(${index * -42}px) rotateX(57deg) rotateZ(45deg)`,
      animationDelay: `${index * -0.9}s`,
    }}/>)}
    <span className={styles.axis}>Q → D → I → A</span>
    <span className={styles.cornerA}>+</span><span className={styles.cornerB}>+</span>
    <span className={styles.cornerC}>+</span><span className={styles.cornerD}>+</span>
    <div className={styles.core}><pre className={styles.ascii}>{ASCII}</pre></div>
    <span className={styles.scan}/>
    <span className={styles.label}>PENROSE MIRROR ROOM / 00</span>
  </div>;
}
