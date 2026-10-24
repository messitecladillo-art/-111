'use client';
import {useState} from 'react';
import Link from 'next/link';
import EditingStudio from './EditingStudio';
import example from '@/data/quality-example.json';
import {parseEditorContent} from '@/lib/editor-model';
import {downloadBlob} from '@/lib/editor-export';
export default function QualityExample(){
  const [initial]=useState(()=>parseEditorContent(example)),[content,setContent]=useState(initial);
  return <main style={{maxWidth:1560,margin:'0 auto',padding:'28px 36px'}}>
    <header style={{display:'flex',justifyContent:'space-between',gap:24,alignItems:'center',marginBottom:24}}><div><span style={{fontSize:12,color:'#607b8c'}}>UCI BANK MARKETING · 4,521 条公开记录</span><h1 style={{fontSize:28,margin:'8px 0'}}>研究成果与矢量编排样板</h1></div><Link href="/workspace#analysis">进入数据分析</Link></header>
    <EditingStudio localOnly projectBinding={{initialContent:initial,status:'本地样板',onSnapshot:setContent,onSave:()=>downloadBlob(new Blob([JSON.stringify(content)],{type:'application/json'}),'研究成果样板备份.json')}}/>
  </main>;
}
