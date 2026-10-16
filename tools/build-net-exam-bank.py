#!/usr/bin/env python3
"""Build a source-keyed historical practice bank from excluded local text receipts.
No model calls, no Office, no answer guessing, no official current-edition parameters.
"""
import argparse, collections, copy, hashlib, json, re, unicodedata, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
PARSER_VERSION = 'historical-bank/v1'
KEY_RE = re.compile(r'(?:正确答案|参考答案|参考答|答案)\s*[】\]:：]?\s*([A-H](?:[A-H,，、\s]*[A-H])?|正确|错误|对|错|√|×|true|false)', re.I)
OPT_RE = re.compile(r'^\s*[○□●◯口]*\s*(?:\(([A-H])\)|([A-H])[.、:：)．]\s*|([A-H])\s+)(.+)$')
NUMBER_RE = re.compile(r'^(\d{1,4})\s*(?:-\s*题目\s*[:：]|[、.．:：)]\s*)(.+)$')
OLD_NUMBER_RE = re.compile(r'^(\d{1,4})([\u4e00-\u9fff(].+)$')
BAD_ASSET = re.compile(r'下[图表]|如[图表]|如下.{0,12}[图表]|[图表]所示|茎叶图|散点图如下|直方图如下|\x01')
TYPES = {'单选':'single','多选':'multiple','判断':'boolean'}
# Independently located historical-source defects are excluded, never repaired by guessing.
REVIEWED_EXCLUSIONS = {
    'exam-7e63d28446b62697169e':'suspected-answer-error',
    'exam-8c860b78d9edc70fb590':'suspected-answer-error',
    'exam-dbb135551ba2f25ec409':'suspected-answer-error',
    'exam-cfa62ce18021fc630a4e':'missing-answer-unit',

    'exam-42e9ab5dd33c51dfa152':'unrepresented-mathematical-condition', # absent test name in original ZIP cell
    'exam-594716425334f0ab29d8':'truncated-question-stem', # missing initial wage values
    'exam-8d694bf1ee405bf5ccd3':'ambiguous-source-key', # standard error lacks estimation context
    'exam-ae714dc14aa700ba09b4':'ambiguous-confidence-interpretation', # no clear repeated-coverage interpretation

    'exam-313f33a153088271b796':'suspected-answer-error', # alpha key contains sample-derived p value
    'exam-3f979b7ab77a482a52dc':'suspected-answer-error', # proportion variance key omits n
    'exam-47236eafd3b05fef4501':'suspected-answer-error', # Wilks lambda direction
    'exam-43f147ee2cac8473dab6':'suspected-answer-error', # confidence bounds inconsistent with stated SE
    'exam-8ad5f86699a8d49590af':'suspected-answer-error', # sample-mean SD key omits supported option
    'exam-970d5942e17f2f5ef831':'suspected-answer-error', # confidence/precision direction
    'exam-ea7c503c7332627cac65':'suspected-answer-error', # correlation range
    'exam-fb0d4617cca6ee6fb5fd':'suspected-answer-error', # comparability of SD
    'exam-41272649a9e5b6c76694':'fragmented-or-merged-question',
    'exam-727727e9ba10642d7926':'fragmented-or-merged-question',
    'exam-83d41164efd229b11396':'fragmented-or-merged-question',
    'exam-8506225c94c7fc4d02d4':'unrepresented-mathematical-condition',
    'exam-d068a8b2b129b12c6995':'unrepresented-mathematical-condition',
    'exam-90685e19faafde3de6dd':'unrepresented-mathematical-condition',
    'exam-c057a3c8d8f78f78c9d7':'unrepresented-mathematical-condition',
    'exam-c1d8293f2555ac221340':'unrepresented-mathematical-condition',
    'exam-ee070d894cb7113fcc5e':'unrepresented-mathematical-condition',
    'exam-db36e20847433531fd64':'unrepresented-mathematical-condition',
    'exam-0c6f1061d6f0e82af3cb':'ambiguous-variance-ratio-assumptions',
    'exam-3812a5603f96287448fa':'ambiguous-variance-ratio-assumptions',
}


# Reviewed original paragraph/cell anchors survive stem normalization and question-ID changes.
SOURCE_EXCLUSIONS = {
    ('material-001', '3a32a86e85dc836d12d47a82cc2a924f07a4e49bbdaac2752ed99f98e35e0d69', 'word/document.xml#paragraph-524'): 'suspected-answer-error',
    ('material-002', 'a1af5ade225b89e7031dab915d93ca5843445299a8e9491ab3f6ef0e990ac6dc', 'word/document.xml#paragraph-450'): 'suspected-answer-error',
    ('material-004', '2ef36b094030b83ad084c1d6206359f54e9616abd3261a0c8e296093ae5c0ee6', 'word/document.xml#paragraph-447'): 'suspected-answer-error',
    ('material-005', 'fed2fe2cd00c4769003e8fdae910bd850db72232c0e682c2a9a0e59883747c13', 'word/document.xml#paragraph-47'): 'ambiguous-variance-ratio-assumptions',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-11832'): 'fragmented-or-merged-question',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-12361'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-15004'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-15257'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-2710'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-2724'): 'suspected-answer-error',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-2801'): 'suspected-answer-error',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-2965'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-3707'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-3721'): 'suspected-answer-error',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-4173'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-4431'): 'suspected-answer-error',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-4481'): 'suspected-answer-error',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-4497'): 'suspected-answer-error',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-4818'): 'missing-answer-unit',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-5754'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-5780'): 'ambiguous-variance-ratio-assumptions',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-5795'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-5843'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-8312'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-8315'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-8336'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-8410'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-8627'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-8651'): 'ambiguous-variance-ratio-assumptions',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-8666'): 'unrepresented-mathematical-condition',
    ('material-007', 'e4dda83c552b2fa16bfd56cab6f2bf77de5e8d264524a8c90f98c534534bcb51', 'word/document.xml#paragraph-8715'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-141'): 'ambiguous-variance-ratio-assumptions',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-1442'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-156'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-192'): 'suspected-answer-error',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-2601'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-2604'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-2625'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-2697'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-2825'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-2933'): 'ambiguous-variance-ratio-assumptions',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-2948'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-2984'): 'suspected-answer-error',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-33'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-6113'): 'fragmented-or-merged-question',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-6545'): 'unrepresented-mathematical-condition',
    ('material-008', '87ebb81e0795cd1718995d3313a75c844e8b17fca6c33e90d4da215cfb4e000e', 'word/document.xml#paragraph-6620'): 'suspected-answer-error',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-1044'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-1058'): 'suspected-answer-error',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-12408'): 'fragmented-or-merged-question',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-12943'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-138'): 'suspected-answer-error',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-1510'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-17432'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-1768'): 'suspected-answer-error',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-17871'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-1818'): 'suspected-answer-error',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-1834'): 'suspected-answer-error',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-2155'): 'missing-answer-unit',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-302'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-3236'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-3294'): 'ambiguous-variance-ratio-assumptions',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-3329'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-3441'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-47'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-61'): 'suspected-answer-error',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-8269'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-8276'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-8325'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-8495'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-8987'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-9043'): 'ambiguous-variance-ratio-assumptions',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-9078'): 'unrepresented-mathematical-condition',
    ('material-009', '789d8431ece9d1c14f200cfffadd06f3734b3054fd7686ca066cc5e108237322', 'word/document.xml#paragraph-9191'): 'unrepresented-mathematical-condition',
    ('material-010', '98ab47949b5d8dea852141c6246fca8c26e0f87008fbb32ee0bc3b7b2a5881cf', 'word/document.xml#paragraph-16026'): 'ambiguous-variance-ratio-assumptions',
    ('material-011', 'dfd491896a66b3c6c9240cdf7d4234c3bda3e4854273ccf074069fd62bde8bcd', 'word/document.xml#paragraph-1540'): 'unrepresented-mathematical-condition',
    ('material-011', 'dfd491896a66b3c6c9240cdf7d4234c3bda3e4854273ccf074069fd62bde8bcd', 'word/document.xml#paragraph-5381'): 'unrepresented-mathematical-condition',
    ('material-011', 'dfd491896a66b3c6c9240cdf7d4234c3bda3e4854273ccf074069fd62bde8bcd', 'word/document.xml#paragraph-6131'): 'fragmented-or-merged-question',
    ('material-011', 'dfd491896a66b3c6c9240cdf7d4234c3bda3e4854273ccf074069fd62bde8bcd', 'word/document.xml#paragraph-6208'): 'suspected-answer-error',
    ('material-011', 'dfd491896a66b3c6c9240cdf7d4234c3bda3e4854273ccf074069fd62bde8bcd', 'word/document.xml#paragraph-6281'): 'suspected-answer-error',
    ('material-011', 'dfd491896a66b3c6c9240cdf7d4234c3bda3e4854273ccf074069fd62bde8bcd', 'word/document.xml#paragraph-6518'): 'unrepresented-mathematical-condition',
    ('material-011', 'dfd491896a66b3c6c9240cdf7d4234c3bda3e4854273ccf074069fd62bde8bcd', 'word/document.xml#paragraph-7658'): 'suspected-answer-error',
    ('material-011', 'dfd491896a66b3c6c9240cdf7d4234c3bda3e4854273ccf074069fd62bde8bcd', 'word/document.xml#paragraph-8314'): 'unrepresented-mathematical-condition',
    ('material-011', 'dfd491896a66b3c6c9240cdf7d4234c3bda3e4854273ccf074069fd62bde8bcd', 'word/document.xml#paragraph-9267'): 'missing-answer-unit',
    ('material-011', 'dfd491896a66b3c6c9240cdf7d4234c3bda3e4854273ccf074069fd62bde8bcd', 'word/document.xml#paragraph-9921'): 'truncated-question-stem',
    ('material-012', 'e705bddbedac18970e650ae8068b8d508cdc25d956df9636730c85603357b0a9', 'word/document.xml#paragraph-234'): 'unrepresented-mathematical-condition',
    ('material-012', 'e705bddbedac18970e650ae8068b8d508cdc25d956df9636730c85603357b0a9', 'word/document.xml#paragraph-4374'): 'suspected-answer-error',
    ('material-012', 'e705bddbedac18970e650ae8068b8d508cdc25d956df9636730c85603357b0a9', 'word/document.xml#paragraph-4855'): 'fragmented-or-merged-question',
    ('material-015', '8031ebbf0c7fa5b676d916d426d4350479a8661db41399c42d28ff464edfd85f', '本科模拟A卷!C51'): 'ambiguous-confidence-interpretation',
    ('material-015', '8031ebbf0c7fa5b676d916d426d4350479a8661db41399c42d28ff464edfd85f', '本科模拟A卷!C55'): 'unrepresented-mathematical-condition',
    ('material-015', '8031ebbf0c7fa5b676d916d426d4350479a8661db41399c42d28ff464edfd85f', '本科模拟A卷!C56'): 'unrepresented-mathematical-condition',
    ('material-015', '8031ebbf0c7fa5b676d916d426d4350479a8661db41399c42d28ff464edfd85f', '本科模拟A卷!C84'): 'suspected-answer-error',
    ('material-015', '8031ebbf0c7fa5b676d916d426d4350479a8661db41399c42d28ff464edfd85f', '本科模拟B卷!C53'): 'ambiguous-variance-ratio-assumptions',
    ('material-015', '8031ebbf0c7fa5b676d916d426d4350479a8661db41399c42d28ff464edfd85f', '本科模拟B卷!C57'): 'suspected-answer-error',
    ('material-017', 'b8af70aa95724ee070fef9f350fe16c029a533a5667372b02ef904e8aa5c6ca9', '本科模拟A卷!C51'): 'ambiguous-confidence-interpretation',
    ('material-017', 'b8af70aa95724ee070fef9f350fe16c029a533a5667372b02ef904e8aa5c6ca9', '本科模拟A卷!C55'): 'unrepresented-mathematical-condition',
    ('material-017', 'b8af70aa95724ee070fef9f350fe16c029a533a5667372b02ef904e8aa5c6ca9', '本科模拟A卷!C56'): 'unrepresented-mathematical-condition',
    ('material-017', 'b8af70aa95724ee070fef9f350fe16c029a533a5667372b02ef904e8aa5c6ca9', '本科模拟A卷!C84'): 'suspected-answer-error',
    ('material-017', 'b8af70aa95724ee070fef9f350fe16c029a533a5667372b02ef904e8aa5c6ca9', '本科模拟B卷!C53'): 'ambiguous-variance-ratio-assumptions',
    ('material-017', 'b8af70aa95724ee070fef9f350fe16c029a533a5667372b02ef904e8aa5c6ca9', '本科模拟B卷!C57'): 'suspected-answer-error',
    ('material-018', '17f9edd94bc6625f2213855ff390678349e8587b670d343e0e90374f609ba0ce', '本科模拟A卷!C51'): 'ambiguous-confidence-interpretation',
    ('material-018', '17f9edd94bc6625f2213855ff390678349e8587b670d343e0e90374f609ba0ce', '本科模拟A卷!C55'): 'unrepresented-mathematical-condition',
    ('material-018', '17f9edd94bc6625f2213855ff390678349e8587b670d343e0e90374f609ba0ce', '本科模拟A卷!C56'): 'unrepresented-mathematical-condition',
    ('material-018', '17f9edd94bc6625f2213855ff390678349e8587b670d343e0e90374f609ba0ce', '本科模拟A卷!C84'): 'suspected-answer-error',
    ('material-018', '17f9edd94bc6625f2213855ff390678349e8587b670d343e0e90374f609ba0ce', '本科模拟B卷!C53'): 'ambiguous-variance-ratio-assumptions',
    ('material-018', '17f9edd94bc6625f2213855ff390678349e8587b670d343e0e90374f609ba0ce', '本科模拟B卷!C57'): 'suspected-answer-error',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-1053'): 'unrepresented-mathematical-condition',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-1067'): 'suspected-answer-error',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-147'): 'suspected-answer-error',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-1519'): 'unrepresented-mathematical-condition',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-1777'): 'suspected-answer-error',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-1827'): 'suspected-answer-error',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-1843'): 'suspected-answer-error',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-2164'): 'missing-answer-unit',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-311'): 'unrepresented-mathematical-condition',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-56'): 'unrepresented-mathematical-condition',
    ('material-020', '2729a0fd1379d9a7ca2c158a49d0b2a3a6d8e6bb4456be0969843f5df22b1bde', 'word/document.xml#paragraph-70'): 'suspected-answer-error',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-128'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-154'): 'ambiguous-variance-ratio-assumptions',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-169'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-217'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-2686'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-2689'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-2710'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-2784'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-3001'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-3025'): 'ambiguous-variance-ratio-assumptions',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-3040'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-3089'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-6206'): 'fragmented-or-merged-question',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-6735'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-9378'): 'unrepresented-mathematical-condition',
    ('material-021', '7f5bfa4851b56d12781b002b0f9c69f170f3783686f85cc6df08b2ed718053f2', 'word/document.xml#paragraph-9631'): 'unrepresented-mathematical-condition',
    ('material-023', '36ae026144675914c2fa63a613ce73d70ce3bc508cf6190b6700305d1aea1beb', '试题!C101'): 'ambiguous-source-key',
    ('material-024', '46105bd52ca043246c1ee7240edf791cd3e2d140ec472ea1be38ac71601dcf89', '专科试题!C101'): 'ambiguous-source-key',
    ('material-027', '2f790b4a8e9afb6972676a206f06cd70f547b4dcee3ab46de9b373ffe39d074c', 'document/body/paragraph-106'): 'unrepresented-mathematical-condition',
    ('material-027', '2f790b4a8e9afb6972676a206f06cd70f547b4dcee3ab46de9b373ffe39d074c', 'document/body/paragraph-130'): 'suspected-answer-error',
    ('material-027', '2f790b4a8e9afb6972676a206f06cd70f547b4dcee3ab46de9b373ffe39d074c', 'document/body/paragraph-220'): 'unrepresented-mathematical-condition',
    ('material-027', '2f790b4a8e9afb6972676a206f06cd70f547b4dcee3ab46de9b373ffe39d074c', 'document/body/paragraph-24'): 'unrepresented-mathematical-condition',
    ('material-027', '2f790b4a8e9afb6972676a206f06cd70f547b4dcee3ab46de9b373ffe39d074c', 'document/body/paragraph-328'): 'ambiguous-variance-ratio-assumptions',
    ('material-027', '2f790b4a8e9afb6972676a206f06cd70f547b4dcee3ab46de9b373ffe39d074c', 'document/body/paragraph-343'): 'unrepresented-mathematical-condition',
    ('material-027', '2f790b4a8e9afb6972676a206f06cd70f547b4dcee3ab46de9b373ffe39d074c', 'document/body/paragraph-379'): 'suspected-answer-error',
    ('material-027', '2f790b4a8e9afb6972676a206f06cd70f547b4dcee3ab46de9b373ffe39d074c', 'document/body/paragraph-96'): 'ambiguous-variance-ratio-assumptions',
    ('material-029', '34e1a2c175739bfb51ff72dde30b5b581cb9ef745ed51915fa65fb43c93bd212', 'Sheet1!C12'): 'unrepresented-mathematical-condition',
    ('material-029', '34e1a2c175739bfb51ff72dde30b5b581cb9ef745ed51915fa65fb43c93bd212', 'Sheet1!C48'): 'ambiguous-variance-ratio-assumptions',
    ('material-029', '34e1a2c175739bfb51ff72dde30b5b581cb9ef745ed51915fa65fb43c93bd212', 'Sheet1!C53'): 'unrepresented-mathematical-condition',
    ('material-029', '34e1a2c175739bfb51ff72dde30b5b581cb9ef745ed51915fa65fb43c93bd212', 'Sheet1!C65'): 'suspected-answer-error',
    ('material-031', 'aef9a2b717508e258f83006950d30af913a625b712b227514aa795607ee7f3b1', 'document/body/paragraph-256'): 'unrepresented-mathematical-condition',
    ('material-031', 'aef9a2b717508e258f83006950d30af913a625b712b227514aa795607ee7f3b1', 'document/body/paragraph-259'): 'unrepresented-mathematical-condition',
    ('material-031', 'aef9a2b717508e258f83006950d30af913a625b712b227514aa795607ee7f3b1', 'document/body/paragraph-280'): 'unrepresented-mathematical-condition',
    ('material-031', 'aef9a2b717508e258f83006950d30af913a625b712b227514aa795607ee7f3b1', 'document/body/paragraph-352'): 'unrepresented-mathematical-condition',
    ('material-034', '274bfdcd94ca708909959e72bd4563e024b162ec580ada2258b5c998d752d47e', 'Sheet1!C12'): 'unrepresented-mathematical-condition',
    ('material-034', '274bfdcd94ca708909959e72bd4563e024b162ec580ada2258b5c998d752d47e', 'Sheet1!C48'): 'ambiguous-variance-ratio-assumptions',
    ('material-034', '274bfdcd94ca708909959e72bd4563e024b162ec580ada2258b5c998d752d47e', 'Sheet1!C53'): 'unrepresented-mathematical-condition',
    ('material-034', '274bfdcd94ca708909959e72bd4563e024b162ec580ada2258b5c998d752d47e', 'Sheet1!C65'): 'suspected-answer-error',
    ('material-042-member-8815eb1ac205', '8815eb1ac205cb2e3391bb52479308576ce71edb4004c750dfd7a11e66891073', 'zip-member:本科随机85道题.xlsx/sheet1!C42'): 'suspected-answer-error',
    ('material-042-member-8815eb1ac205', '8815eb1ac205cb2e3391bb52479308576ce71edb4004c750dfd7a11e66891073', 'zip-member:本科随机85道题.xlsx/sheet1!C43'): 'ambiguous-variance-ratio-assumptions',
    ('material-042-member-8815eb1ac205', '8815eb1ac205cb2e3391bb52479308576ce71edb4004c750dfd7a11e66891073', 'zip-member:本科随机85道题.xlsx/sheet1!C50'): 'unrepresented-mathematical-condition',
    ('material-042-member-e7241ed1c460', 'e7241ed1c46010d85a4a9210bcb1becd0457c1d61d851a3a3f51f80459c2ef85', 'zip-member:专科随机100道题.xlsx/Sheet1!C81'): 'ambiguous-source-key',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-1043'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-1057'): 'suspected-answer-error',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-12407'): 'fragmented-or-merged-question',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-12942'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-137'): 'suspected-answer-error',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-1509'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-17431'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-1767'): 'suspected-answer-error',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-17870'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-1817'): 'suspected-answer-error',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-1833'): 'suspected-answer-error',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-2154'): 'missing-answer-unit',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-301'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-3235'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-3293'): 'ambiguous-variance-ratio-assumptions',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-3328'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-3440'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-46'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-60'): 'suspected-answer-error',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-8268'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-8275'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-8324'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-8494'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-8986'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-9042'): 'ambiguous-variance-ratio-assumptions',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-9077'): 'unrepresented-mathematical-condition',
    ('material-043', 'a75f9e1f3d87ee12f147d4cab0679b3977ef3fc333ab0548f943fb2751f53afd', 'word/document.xml#paragraph-9190'): 'unrepresented-mathematical-condition',
}

def norm(text):
    return unicodedata.normalize('NFKC', str(text)).replace('\u00a0',' ').strip()

def canonical(text):
    return re.sub(r'[\s。.,，;；:：?？!！、（）()\[\]【】]+','',norm(text)).lower()

def answer_ids(raw):
    raw=norm(raw).upper().replace('，',',').replace('、',',')
    if raw in ('正确','对','√','TRUE'):return ['true']
    if raw in ('错误','错','×','FALSE'):return ['false']
    if not re.fullmatch(r'[A-H,\s]+',raw):return []
    return sorted(set(re.findall(r'[A-H]',raw)))

def clean_stem(text):
    text=norm(text)
    text=re.sub(r'\[(?:题型|答案)\s*[:：][^\]]*\]','',text)
    explicit_key=KEY_RE.search(text)
    if explicit_key:text=text[:explicit_key.start()]
    text=re.sub(r'\(([A-H](?:\s*[,、]?\s*[A-H])*\s*)\)','( )',text)
    text=re.sub(r'\([\d.]+\s*分\)|\(分\)','',text)
    text=re.sub(r'\(单选题.*?\)|\(多选题.*?\)|\(判断题.*?\)','',text)
    text=re.sub(r'^题目\s*[:：]','',text)
    text=re.sub(r'^\d*[一二三四五六七八九十百]+[、.]\s*','',text)
    text=re.sub(r'[\[【]?\s*题型\s*[:：]\s*(?:单选|多选|判断)题?[\]】]?','',text)
    text=text.strip(' []【】')
    text=re.sub(r'\s*\d*-?选项\s*[:：].*$','',text)
    return re.sub(r'\s+',' ',text).strip()

CHAPTERS = ('市场调查基础','调查方案设计','调查与数据采集','问卷与量表','抽样与估计','描述统计','统计分析与推断','数据处理与报告','专项调研','综合练习')

def normalize_chapter(chapter,stem=''):
    text=norm(chapter or '')
    for pattern,label in [
        ('专项','专项调研'),('问卷|量表','问卷与量表'),('抽样|估计|置信区间','抽样与估计'),
        ('方案|调查设计','调查方案设计'),('处理|报告|整理','数据处理与报告'),
        ('单变量|描述统计|统计基础','描述统计'),('推断|分析|回归|相关|检验','统计分析与推断'),
        ('采集|收集|搜集|组织实施|调查方法|调查与测量','调查与数据采集'),
        ('市场|导论','市场调查基础')]:
        if re.search(pattern,text):return label
    if text:return '综合练习'
    for words,title in [
        ('抽样|样本容量|置信区间','抽样与估计'),('问卷|量表','问卷与量表'),
        ('访谈|访问|调查员|数据收集|数据采集','调查与数据采集'),
        ('调查方案|调查设计','调查方案设计'),('回归|相关|方差分析|假设检验|显著|分布|检验统计量','统计分析与推断'),
        ('均值|众数|中位数|频数|统计','描述统计'),('营销|市场|消费者|细分','市场调查基础')]:
        if re.search(words,stem):return title
    return '综合练习'

def guess_chapter(stem):
    return normalize_chapter(None,stem)

def typed(text):
    for word,value in TYPES.items():
        if word in text:return value
    return None

def make_candidate(stem,options,raw_answer,source,refs,answer_ref=None,qtype=None,chapter=None,parser='labelled-lines',explanation=''):
    raw_stem=stem;stem=clean_stem(stem)
    options=[{'id':o['id'],'text':norm(o['text'])} for o in options]
    aid=answer_ids(raw_answer or '')
    labels={o['text'].strip('。 .') for o in options}
    boolean_labels={'对':'true','正确':'true','是':'true','true':'true','√':'true','错':'false','错误':'false','否':'false','false':'false','×':'false'}
    mapped=[boolean_labels.get(o['text'].strip('。 .').lower()) for o in options]
    isbool=len(options)==2 and set(mapped)=={'true','false'}
    if isbool:
        mapping={o['id']:boolean_labels[o['text'].strip('。 .').lower()] for o in options}
        if aid and aid[0] not in ('true','false'):aid=[mapping.get(a,a) for a in aid]
        options=[{'id':'true','text':'正确'},{'id':'false','text':'错误'}]
        qtype='boolean'
    else:qtype=qtype or ('multiple' if len(aid)>1 else 'single')
    reasons=[]
    if source.get('format')=='pdf':reasons.append('pdf-layout-needs-review')
    if qtype=='boolean' and not isbool:reasons.append('invalid-boolean-options')
    if qtype=='boolean' and len(options)!=2:reasons.append('invalid-boolean-options')
    if qtype!='boolean' and [o['id'] for o in options]!=[chr(65+i) for i in range(len(options))]:reasons.append('noncontiguous-option-labels')
    if any(len(o['text'])>500 or re.search(r'【解析】|试题解析|公众号|题型[:：]|正确答案|[A-H][.、]\s*',o['text']) for o in options):reasons.append('mixed-option-or-explanation-content')
    if re.search(r'[A-H][.、]\s*',stem):reasons.append('embedded-option-in-stem')
    if not stem or len(stem)>2400:reasons.append('invalid-stem')
    if re.search(r'(?:^|\s)(?:\d{1,3}|[一二三四五六七八九十]{1,3})[、.](?=[\u4e00-\u9fff])',stem) or re.match(r'^的(?:置信|估计|概率)',stem):
        reasons.append('fragmented-or-merged-question')

    if not 2<=len(options)<=8 or any(not o['text'] for o in options) or len({o['id'] for o in options})!=len(options):reasons.append('invalid-options')
    if len({canonical(o['text']) for o in options})!=len(options):reasons.append('duplicate-option-text')
    if BAD_ASSET.search(raw_stem) or any(BAD_ASSET.search(o['text']) for o in options):reasons.append('requires-unavailable-figure-or-table')
    if re.search(r'[EVev]\(\s*\)',stem):reasons.append('unrepresented-formula-variable')
    if re.search(r'(?:deff|[\u03b1-\u03c9A-Za-z])\s*=\s*[。;,，；]',stem):
        reasons.append('unrepresented-mathematical-condition')

    if re.search(r'随机变量\s*[,，;；]|(?:样本容量|样本量|检验统计量|均值)\s*(?:为|等于)\s*[,，。;；]|服从\s*[,，。;；]',stem):
        reasons.append('unrepresented-mathematical-condition')

    if any(ch in raw_stem for ch in ('\x01','\ufffd')):reasons.append('unrepresented-source-content')
    complete_text=stem+' '+' '.join(o['text'] for o in options)
    if re.search(r'β0\s*\+\s*β1\s*\+\s*[εϵ]|(?:误差|标准差)的\s*倍(?:[。 ,]|$)|越接近于\s*[,，]|\(\s*通常\s*\)|回归方程\s+所',complete_text):
        reasons.append('unrepresented-mathematical-condition')

    if not aid:reasons.append('missing-answer')
    elif not set(aid)<=set(o['id'] for o in options):reasons.append('answer-outside-options')
    elif (qtype in ('single','boolean') and len(aid)!=1) or (qtype=='multiple' and len(aid)<2):reasons.append('type-answer-mismatch')
    # A known contradictory key is quarantined, never corrected by inference.
    if '估计标准误差为0' in canonical(stem) and any(a=='B' and o['text'].find('回归系数为1')>=0 for a in aid for o in options if o['id']==a):reasons.append('suspected-answer-error')
    if re.search(r'产品订货会.*展览会.*搜集.*资料',stem) and any(a!='A' for a in aid):reasons.append('suspected-answer-error')
    if '方差分析要求资料' in canonical(stem) and any(o['id'] in aid and '非齐性' in o['text'] for o in options):reasons.append('suspected-answer-error')
    sid=source['id'];refs=list(dict.fromkeys(refs))
    for locator in refs:
        # Page-only PDF receipts do not identify one question; layout review stays local.
        if source.get('format')=='pdf' or locator.startswith('page-'):continue
        anchored_reason=SOURCE_EXCLUSIONS.get((sid,source.get('sha256',''),locator))
        if anchored_reason:reasons.append(anchored_reason)

    signature=canonical(stem)+'|'+ '|'.join(sorted(canonical(o['text']) for o in options))
    qid='exam-'+hashlib.sha256(signature.encode()).hexdigest()[:20]
    if qid in REVIEWED_EXCLUSIONS:reasons.append(REVIEWED_EXCLUSIONS[qid])
    return {'id':qid,'type':qtype,'chapter':normalize_chapter(chapter,stem),**({'sourceChapter':norm(chapter)} if chapter else {}),'stem':stem,'options':options,'answer':aid,'answerStatus':'missing' if not aid else 'valid','sourceRefs':[{'sourceId':sid,'locators':refs,'answerLocator':answer_ref or ''}],'verification':{'basis':'explicit-source-key','semanticReviewed':False,'parserVersion':PARSER_VERSION,'parser':parser},'explanation':explanation.strip(),'reviewReasons':reasons}

def expanded(records):
    rows=[]
    for rec in records:
        ref=rec['ref']
        for n,line in enumerate(re.split(r'[\r\n\v]+',str(rec.get('text','')))):
            text=norm(line)
            if not text:continue
            markers=list(re.finditer(r'(?<![A-Za-z0-9])(?:[A-H][.、]\s*|\([A-H]\))',text))
            pieces=[]
            if len(markers)>1 or (markers and markers[0].start()>6):
                if markers[0].start():pieces.append(text[:markers[0].start()])
                pieces.extend(text[a.start():z.start()] for a,z in zip(markers,markers[1:]))
                pieces.append(text[markers[-1].start():])
            else:pieces=[text]
            for j,piece in enumerate(pieces):rows.append({'text':piece.strip(),'ref':ref,'oldStart':n==0 and j==0 and '\v' in str(rec.get('text',''))})
    return rows

def grid_keys(rows):
    start=next((i for i,r in enumerate(rows) if re.search(r'(?:模拟试题|模拟题|试题)答案\s*[:：]?$',r['text'])),None)
    if start is None:return {},None
    tail=[]
    for r in rows[start+1:]:
        tail.extend((s,r['ref']) for s in r['text'].split())
    if [s for s,_ in tail[:10]]!=[str(i) for i in range(1,11)]:return {},None
    out={};i=10;row=0
    while i<len(tail):
        if tail[i][0]!=str(row):return {},None
        i+=1;n=0
        while i<len(tail) and re.fullmatch('[A-H]{1,8}',tail[i][0]) and n<10:
            out[row*10+n+1]=(tail[i][0],tail[i][1]);i+=1;n+=1
        if not n:return {},None
        row+=1
    return out,start

def spreadsheet_candidates(records,source):
    sheets=collections.defaultdict(lambda:collections.defaultdict(dict))
    for rec in records:
        match=re.search(r'^(.*)!([A-Za-z]+)(\d+)$',rec['ref'])
        if match:sheets[match[1]][int(match[3])][match[2].upper()]=(norm(rec.get('text','')),rec['ref'])
    found=[];supported=[]
    for sheet,rows in sheets.items():
        header=next(((n,row) for n,row in rows.items() if any(re.sub(r'\s+','',v[0]) in ('题干','题目') for v in row.values())),None)
        if not header:
            consistent=[row for row in rows.values() if typed(row.get('B',('',''))[0]) and len(row.get('C',('',''))[0])>8 and re.fullmatch('[A-H]{1,8}',row.get('F',('',''))[0])]
            if len(consistent)<5:continue
            header=(0,{col:(label,'') for col,label in zip('ABCDEFGHIJKLMN',['序号','题型','题干','章节','难度','答案','A','B','C','D','E','F','G','H'])})
        hn,hr=header;hm={re.sub(r'\s+','',value[0]):col for col,value in hr.items()}
        stemcol=hm.get('题干',hm.get('题目'));keycol=hm.get('答案');typecol=hm.get('题型',hm.get('分类'));chaptercol=hm.get('章节')
        optcols={label:hm.get(label,hm.get('选项'+label)) for label in 'ABCDEFGH'}
        for n,row in sorted(rows.items()):
            if n<=hn or stemcol not in row:continue
            stem,sref=row[stemcol];options=[{'id':label,'text':row[col][0]} for label,col in optcols.items() if col and col in row]
            key,kref=row.get(keycol,('',''));ktype=typed(row.get(typecol,('',''))[0]);chapter=row.get(chaptercol,('',))[0]
            refs=[sref]+[row[col][1] for col in optcols.values() if col and col in row]+([kref] if kref else [])
            if ktype=='boolean' and not options:options=[{'id':'true','text':'正确'},{'id':'false','text':'错误'}]
            found.append(make_candidate(stem,options,key,source,refs,kref,ktype,chapter or None,'spreadsheet-row'))
        supported.append(sheet)
    return found,{'sheets':len(sheets),'supportedSheets':supported}

def line_candidates(records,source):
    rows=expanded(records);keys,key_start=grid_keys(rows)
    if key_start is not None:rows=rows[:key_start]
    # A final full-set grid can only bind one exact, unique question-number sequence.
    grid_rejected=False
    if keys:
        sequence=[]
        for i,row in enumerate(rows):
            near=any(OPT_RE.match(r['text']) or re.match(r'^[○□]*\s*A(?:[.、]|\s|$)',r['text']) for r in rows[i+1:i+3])
            match=NUMBER_RE.match(row['text']) or (OLD_NUMBER_RE.match(row['text']) if row.get('oldStart') or near else None)
            if match and not OPT_RE.match(row['text']):sequence.append(int(match[1]))
        if len(sequence)!=len(keys) or len(set(sequence))!=len(sequence) or set(sequence)!=set(keys):
            keys={};grid_rejected=True
    found=[];current=None;section_type=None;explaining=False
    def append_option_continuation(text,ref):
        # DOC paragraph breaks are not evidence of a wrapped option.
        # Same-paragraph prose may continue; independent short numeric choices remain ambiguous.
        numeric=lambda value:bool(re.fullmatch(r'[-+]?\d+(?:\.\d+)?%?',value.strip()))
        unclear=source.get('format') in ('doc','docx') and (
            current['options'][-1].get('_ref')!=ref or
            (numeric(current['options'][-1]['text']) and (numeric(text) or text in ('无法计算','不能计算','无法确定'))))
        if unclear:
            reason='short-option-layout-needs-review' if len(current['options'])<4 else 'ambiguous-option-continuation'
            current['flags'].append(reason)
        else:
            current['options'][-1]['text']+=' '+text
        current['refs'].append(ref)

    def record_key(raw_key,ref):
        if current['answer'] and answer_ids(current['answer'])!=answer_ids(raw_key):
            current['flags'].append('conflicting-source-answers-in-block')
        elif not current['answer']:
            current['answer'],current['answerRef']=raw_key,ref
        current['refs'].append(ref)
    def finish():
        nonlocal current
        if not current:return
        # Only bare legacy soft-line blocks with an explicit terminal key can infer ordered labels.
        options=current['options']
        if not options and current['bare'] and current['answer'] and 2<=len(current['bare'])<=8:
            options=[{'id':chr(65+i),'text':item[0]} for i,item in enumerate(current['bare'])]
        grid_conflict=False
        if current['number'] in keys:
            grid_key,grid_ref=keys[current['number']]
            if current['answer']:
                grid_conflict=answer_ids(current['answer'])!=answer_ids(grid_key)
                if grid_conflict:current['refs'].append(grid_ref)
            else:
                current['answer'],current['answerRef']=grid_key,grid_ref
                current['refs'].append(grid_ref)
        if current['stem']:
            candidate=make_candidate(' '.join(current['stem']),options,current['answer'],source,current['refs'],current['answerRef'],current['type'],None,current['parser'],' '.join(current['explanation']))
            candidate['reviewReasons'].extend(current['flags'])
            if grid_conflict:candidate['reviewReasons'].append('explicit-key-grid-conflict');candidate['answerStatus']='conflict'
            found.append(candidate)
        current=None
    for i,row in enumerate(rows):
        text,ref=row['text'],row['ref']
        if re.fullmatch(r'[-─—_=]{3,}',text):continue
        if re.match(r'^[一二三四五六七八九十]+[、.].{0,8}(?:单选|多选|判断)',text):
            finish();section_type=typed(text);continue
        near=any(OPT_RE.match(r['text']) or re.match(r'^[○□]*\s*A(?:[.、]|\s|$)',r['text']) for r in rows[i+1:i+3])
        number=NUMBER_RE.match(text) or (OLD_NUMBER_RE.match(text) if row.get('oldStart') or near else None);named=re.match(r'^题目\s*[:：](.+)',text)
        # For unnumbered stems require an actual next labelled option, not just a bracket.
        next_option=any(OPT_RE.match(x['text']) for x in rows[i+1:i+3])
        unnumbered=(not number and not named and not OPT_RE.match(text) and bool(re.search(r'\([ A-H,]*\)',text)) and next_option and not KEY_RE.search(text) and len(text)>8 and not (current and current['parser']=='explicit-header-key' and not current['stem']))
        if number or named or unnumbered:
            finish();explaining=False
            stem=number[2] if number else named[1] if named else text
            current={'stem':[stem],'number':int(number[1]) if number else None,'options':[],'bare':[],'answer':'','answerRef':'','refs':[ref],'type':typed(stem) if re.search(r'题型\s*[:：]|\((?:单选|多选|判断)题',stem) else section_type,'explanation':[],'parser':'labelled-lines','flags':[]}
            header_key=re.match(r'^\((?:单选|多选|判断)题[^)]*\)\s*([A-H]{1,8})\s*[-—─ ]*$',stem)
            if header_key:
                current['answer']=header_key[1];current['answerRef']=ref;current['stem']=[];current['parser']='explicit-header-key'
            match=KEY_RE.search(stem)
            if match:current['answer']=match[1];current['answerRef']=ref
            inline=re.search(r'\(\s*([A-H](?:[,、\s]*[A-H])*)\s*\)',stem)
            if inline and not match:current['answer']=inline[1];current['answerRef']=ref;current['parser']='inline-parenthesis'
            continue
        if current is None:continue
        match=KEY_RE.search(text)
        if match:
            record_key(match[1],ref)
            prefix=text[:match.start()].strip(' []【】')
            if prefix:
                opt=OPT_RE.match(prefix)
                if opt:current['options'].append({'id':next(x for x in opt.groups()[:3] if x),'text':opt[4],'_ref':ref})
                elif current['bare']:current['bare'].append((prefix,ref))
                elif not current['options']:current['stem'].append(prefix)
                elif source.get('format') in ('doc','docx'):append_option_continuation(prefix,ref)
            continue
        if re.match(r'^[【\[]?(?:试题解析|解析|解释)[】\]]?\s*[:：]?',text):
            explaining=True
            explanation=re.sub(r'^[【\[]?(?:试题解析|解析|解释)[】\]]?\s*[:：]?','',text).strip()
            if explanation:current['explanation'].append(explanation)
            continue
        if explaining:current['explanation'].append(text);continue
        if re.fullmatch(r'[A-H]{1,8}',text) and (current['options'] or current['bare']):
            if source.get('format') in ('doc','docx') and len(text)==1 and i+1<len(rows):
                following=rows[i+1]['text']
                if not (OPT_RE.match(following) or KEY_RE.search(following) or NUMBER_RE.match(following) or re.match(r'^[【\[]?(?:解析|试题解析)',following)):
                    current['flags'].append('ambiguous-isolated-option-label')

            record_key(text,ref);continue
        if re.search(r'选项\s*[:：]$',text):current['parser']='explicit-unlabelled-options';continue
        opt=OPT_RE.match(text)
        if opt:
            current['options'].append({'id':next(x for x in opt.groups()[:3] if x),'text':opt[4],'_ref':ref});current['refs'].append(ref)
            if text.startswith('□'):current['type']='multiple'
            continue
        # Unlabelled legacy blocks and explicit 题目/选项 lists are retained, never guessed a key.
        if not current['options'] and (current['parser']=='explicit-unlabelled-options' or '\v' in str(next((r.get('text','') for r in records if r['ref']==ref),''))):
            current['bare'].append((text,ref));current['refs'].append(ref)
        elif current['answer'] and current['options']:
            current['explanation'].append(text)
        elif current['options']:
            # PDF line wraps belong to the most recent labelled option until key/new question.
            append_option_continuation(text,ref)
        else:current['stem'].append(text);current['refs'].append(ref)
    finish()
    return found,{'rows':len(rows),'gridAnswerCount':len(keys),'gridRejectedForAmbiguousScope':grid_rejected}

def dedupe(candidates):
    groups=collections.defaultdict(list)
    for candidate in candidates:groups[candidate['id']].append(copy.deepcopy(candidate))
    verified=[];review=[]
    for qid,items in groups.items():
        clean=[q for q in items if not q['reviewReasons']]
        answer_texts={tuple(sorted(canonical(o['text']) for o in q['options'] if o['id'] in q['answer'])) for q in clean}
        if len(answer_texts)>1 or any('explicit-key-grid-conflict' in q['reviewReasons'] for q in items):
            for q in items:q['reviewReasons'].append('conflicting-explicit-source-answers');q['answerStatus']='conflict'
            review.extend(items);continue
        # Known source error quarantines matching content even if copied elsewhere with the same bad key.
        if any('suspected-answer-error' in q['reviewReasons'] for q in items):
            for q in items:
                if 'suspected-answer-error' not in q['reviewReasons']:q['reviewReasons'].append('suspected-answer-error')
            review.extend(items);continue
        if clean:
            q=clean[0].copy();q['sourceRefs']=[]
            for item in clean:
                for ref in item['sourceRefs']:
                    if ref not in q['sourceRefs']:q['sourceRefs'].append(ref)
            q.pop('reviewReasons');
            if not q['explanation']:q.pop('explanation')
            verified.append(q)
        review.extend(q for q in items if q['reviewReasons'])
    return sorted(verified,key=lambda q:q['id']),review

def source_asset_refs(path, detected_format=None):
    assets=set()
    if detected_format!='docx' and path.suffix.lower()!='.docx':return assets
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.startswith('word/') or not name.endswith('.xml'):continue
            if name!='word/document.xml' and not re.match(r'word/(?:header|footer|footnotes|endnotes)',name):continue
            root=ET.fromstring(archive.read(name))
            for n,paragraph in enumerate(root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'),1):
                if any(node.tag.endswith('}oMath') or node.tag.endswith('}drawing') or node.tag.endswith('}imagedata') or node.tag.endswith('}object') for node in paragraph.iter()):assets.add(name+'#paragraph-'+str(n))
    return assets

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--extraction',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--review-output',type=Path,required=True)
    args=ap.parse_args();base=args.extraction.resolve();manifest=json.loads((base/'manifest.json').read_text(encoding='utf-8-sig'))
    source_root=Path(manifest['source_root']).resolve()
    for target in (args.output.resolve(),args.review_output.resolve()):
        if target.is_relative_to(source_root):raise ValueError('output must be outside original source tree')
    entries=[e for e in manifest['entries'] if e['source_relative'].startswith('01')];sources=[];candidates=[];coverage=[];seen=set()
    for e in entries:
        original=(source_root/e['source_relative']).resolve()
        if not original.is_relative_to(source_root) or hashlib.sha256(original.read_bytes()).hexdigest()!=e['sha256']:raise ValueError('original source hash or boundary mismatch: '+e['id'])
        source={'id':e['id'],'filename':Path(e['source_relative']).name,'sha256':e['sha256'],'historical':True,'format':e.get('format')};sources.append(source)
        receipt={'sourceId':e['id'],'status':e['status'],'parsedCandidates':0}
        coverage.append(receipt)
        if e['status']=='duplicate':receipt['reason']='identical-source-bytes';continue
        if e['status'] not in ('extracted',):receipt['reason']='source-not-readable-or-container';continue
        path=(base/e['text_path']).resolve()
        if not path.is_relative_to(base):raise ValueError('text receipt outside extraction root')
        records=[json.loads(line) for line in path.read_text(encoding='utf-8-sig').splitlines()]
        receipt['textSha256']=hashlib.sha256(path.read_bytes()).hexdigest()
        if e.get('text_sha256') and receipt['textSha256']!=e['text_sha256']:raise ValueError('text receipt hash mismatch: '+e['id'])
        parser=spreadsheet_candidates if e.get('format') in ('xlsx','xls') else line_candidates
        found,detail=parser(records,source)
        assets=source_asset_refs(original,e.get('format'));receipt['unrepresentedAssetParagraphCount']=len(assets)
        for q in found:
            if any(set(ref['locators']) & assets for ref in q['sourceRefs']):q['reviewReasons'].append('source-equation-or-image-not-rendered')
        if hashlib.sha256(original.read_bytes()).hexdigest()!=e['sha256']:raise ValueError('original source changed during parse: '+e['id'])
        receipt['sourceUnchanged']=True
        receipt.update(detail);receipt['parsedCandidates']=len(found);candidates.extend(found)
        if not found:receipt['reason']='no-supported-question-blocks'
    archives=json.loads((base/'archive-members.json').read_text(encoding='utf-8-sig'))
    for e in archives['entries']:
        if e['archive_id']!='material-042' or e['status']!='extracted':continue
        sid=e['archive_id']+'-member-'+e['sha256'][:12];source={'id':sid,'filename':e['member'],'sha256':e['sha256'],'archiveSourceId':e['archive_id'],'historical':True,'format':e.get('format')};sources.append(source)
        path=(base/e['text_path']).resolve()
        if not path.is_relative_to(base):raise ValueError('archive text outside extraction root')
        if hashlib.sha256(path.read_bytes()).hexdigest()!=e.get('text_sha256'):
            raise ValueError('archive text receipt hash mismatch: '+sid)
        container=next(entry for entry in entries if entry['id']==e['archive_id'])
        archive_path=(source_root/container['source_relative']).resolve()
        if e.get('archive_sha256')!=container['sha256'] or hashlib.sha256(archive_path.read_bytes()).hexdigest()!=container['sha256']:
            raise ValueError('archive source hash mismatch: '+sid)
        with zipfile.ZipFile(archive_path) as archive:
            if hashlib.sha256(archive.read(e['member'])).hexdigest()!=e['sha256']:
                raise ValueError('archive member hash mismatch: '+sid)
        records=[json.loads(line) for line in path.read_text(encoding='utf-8-sig').splitlines()]
        # Keep original ZIP locator as provenance, use cell suffix only for row assembly.
        prefix='zip-member:'+e['member']+'/'
        if any(not r['ref'].startswith(prefix) for r in records):
            raise ValueError('archive member locator mismatch: '+sid)

        cell_records=[{**r,'ref':r['ref'][len(prefix):]} for r in records]
        found,detail=spreadsheet_candidates(cell_records,source)
        for q in found:
            for ref in q['sourceRefs']:
                ref['locators']=[prefix+r for r in ref['locators']];ref['answerLocator']=prefix+ref['answerLocator'] if ref['answerLocator'] else ''
        candidates.extend(found);coverage.append({'sourceId':sid,'status':'archive-member-extracted','parsedCandidates':len(found),'textSha256':e['text_sha256'],'sourceUnchanged':True,'memberHashVerified':True,**detail})
    verified,review=dedupe(candidates)
    explanation_candidates=[{'questionId':q['id'],'text':q['explanation'],'questionSourceRefs':q['sourceRefs'],'status':'unverified-explanation-candidate'} for q in candidates if q.get('explanation')]
    for question in verified:question.pop('explanation',None)

    summary={'sourceFileCount':len(entries),'readableSourceCount':sum(e['status']=='extracted' for e in entries),'duplicateSourceCount':sum(e['status']=='duplicate' for e in entries),'timeoutSourceCount':sum(e['status']=='timeout' for e in entries),'archiveMemberCount':len(sources)-len(entries),'parsedCandidates':len(candidates),'verifiedQuestions':len(verified),'deduplicatedCandidates':len(candidates)-len(verified)-len(review),'missingAnswer':sum('missing-answer' in q['reviewReasons'] for q in review),'conflicts':sum(q['answerStatus']=='conflict' for q in review),'quarantined':len(review),'sourceCoverage':coverage,'semanticReview':'Source-structure and explicit-key checks; not a semantic review of every historical answer.','officialParameters':None,'reviewReasonCounts':dict(collections.Counter(reason for q in review for reason in q['reviewReasons'])),'conflictGroups':len({q['id'] for q in review if q['answerStatus']=='conflict'})}
    version=hashlib.sha256(json.dumps(verified,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:16]
    bank={'version':'historical-'+version,'parserVersion':PARSER_VERSION,'sources':sources,'questions':verified,'reviewItems':[],'coverage':summary}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.review_output.parent.mkdir(parents=True,exist_ok=True)
    parts=[]
    for key,value in bank.items():
        body='[\n'+',\n'.join('  '+json.dumps(q,ensure_ascii=False,separators=(',',':')) for q in value)+'\n]' if key=='questions' else json.dumps(value,ensure_ascii=False,indent=2)
        parts.append('  '+json.dumps(key)+': '+body.replace('\n','\n  '))
    rendered='{\n'+',\n'.join(parts)+'\n}\n'
    args.output.write_text(rendered,encoding='utf-8')
    args.review_output.write_text(json.dumps({'version':bank['version'],'reviewItems':review,'explanationCandidates':explanation_candidates,'coverage':summary},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in summary.items() if k!='sourceCoverage'},ensure_ascii=True))

if __name__=='__main__':main()
