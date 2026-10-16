# Bank Marketing 公开数据验收

使用真实公开的历史数据，对照证见当前的六种确定性统计计算。验收程序默认完全离线，Python 标准库独立计算参考结果，Node 调用项目中的 `runRecipe`；不会修改、上传或将原始 CSV 写入输出。

## 数据与引用

- 官方页面：[UCI Bank Marketing](https://archive.ics.uci.edu/dataset/222/bank+marketing)
- DOI：[10.24432/C5K306](https://doi.org/10.24432/C5K306)
- 官方下载：[bank marketing.zip](https://archive.ics.uci.edu/static/public/222/bank%2Bmarketing.zip)
- 许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。数据集引用：*Bank Marketing* [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5K306
- 原始 `bank-names.txt` 标注创建者为 Paulo Cortez、Sérgio Moro，并请求引用：Moro, S., Laureano, R., & Cortez, P. (2011). *Using Data Mining for Bank Direct Marketing: An Application of the CRISP-DM Methodology*. ESM'2011, pp. 117–121, EUROSIS.

本验收固定使用 `bank.zip` 内的 **bank.csv：4,521 行、17 列**。它是 `bank-full.csv`（45,211 行）的约 10% 随机子集，16 个输入字段加订阅结果 `y`。不要混用 `bank-additional.csv` 等其他文件。原始资料来自葡萄牙银行电话营销历史记录，并非当前赛事实地调查。

固定文件 SHA-256：

```text
dc8d576e9bda0f41ee891251bd84bab9a39ce576cba715aac08adc2374a01fde
```

程序遇到其他文件、全量表或改变字节后的 CSV 会退出失败。文件使用 UTF-8 可读的文本、分号分隔符和双引号字段；不要先通过电子表格软件重新保存。

## 准备与运行

要求项目支持的 Node.js 22.13+、Python 3.10+；Python 不需要第三方包。可用项目隔离的 `apps/evi-x-api/.venv/Scripts/python.exe`。脚本通过自己的位置寻找仓库源码，运行时不要求终端位于仓库根目录。

只需首次手动下载官方归档并解压：先解开下载包，再解开其中的 `bank.zip`，取得 `bank.csv` 与 `bank-names.txt`。建议放在根目录已忽略的 `.collab/public-data/bank/`，或使用仓库外的数据目录。**不要将原始 CSV 加入 Git；本目录只保存脚本与说明。**

在仓库根目录执行（PowerShell）：

```powershell
& "apps/evi-x-api/.venv/Scripts/python.exe" -X utf8 `
  "evals/public-data/verify-bank-marketing.py" `
  --csv ".collab/public-data/bank/bank.csv" `
  --output ".collab/public-data/bank/verification"
```

也可将 Python 可执行文件替换成合适版本的 `python`，并使用绝对路径。两个参数均为必填；目录中的同名验收 JSON 会更新，需要留存历史时使用不同输出目录。数据不自动下载。返回码 `0` 表示通过，非 `0` 表示输入、环境或对照失败；只有全部比较通过才生成本次输出。失败不会删除输出目录中的旧文件，应以本次退出码和运行时间判定本轮结果。

输出：

- `public-data-reference.json`：来源、运行环境、统计源码哈希、口径、样本量及核验摘要。
- `public-data-engine-results.json`：本轮六方法的应用实际统计汇总，包含公开分类标签，不含答卷行。

## 比较内容与口径

每套口径执行频数与比例（`job`）、数值分布（`balance`）、分组描述（`education × balance`）、交叉表及 χ²/Cramér V（`education × y`）、Pearson 和 Spearman（`age × balance`），并增加 `pdays` 的数值保留检查，共 **14 个场景**。比较样本数、排除数、原因计数、每个指标和结果表单元格。

两套口径分别为：

1. **保留原编码**：`unknown` 作为一个类别保留，不自动判断为缺失。
2. **显式 unknown 缺失**：主动指定 `unknown` 为缺失代码，作为敏感性对照。`job` 的分析样本变为 4,483；教育分组和交叉表变为 4,334。此设置不是对官方数据的自动纠错。

`pdays=-1` 表示此前未联系，共 3,705 行，具有明确业务含义。两套口径均保留这部分记录，不把 `-1` 设成全局缺失值；其整体均值仅用于计算验收，不应直接解释成已联系客户的等待天数。

参考实现使用 Python `csv`、`statistics`、`Counter` 与独立的 Type 7 分位数、平均秩及列联表公式。浮点比较使用相对和绝对容差 `1e-10`。不依赖网页展示的四舍五入文本。

## 已核验结果与边界

2026-10-10 本机执行：14 个场景、462 项标量检查通过，最大绝对差约 `1.819e-12`。2026-10-14 加入 Wilson 比例区间后为 508 项，最大绝对差不变。

推断统计另由 `verify-bank-marketing-inference.py` 用 SciPy 1.16.2 与 statsmodels 0.14.5 从原始 CSV 独立复算：均值 t 区间、Welch 方差分析、经典方差分析、Kruskal–Wallis、Welch 两两比较与 Holm 校正、χ² p 值、Pearson p 与 Fisher z 区间、Spearman p，共 42 项，最大相对误差约 `2.5e-12`。运行方式见该脚本开头注释；它需要上述两个第三方包，描述统计验收仍只用标准库。保留原编码时部分参考值：

| 检查 | 结果 |
|---|---:|
| balance 均值 / 中位数 | 1422.657819 / 444 |
| education × y Pearson χ² / Cramér V | 15.236580 / 0.058053 |
| age × balance Pearson r / Spearman ρ | 0.083820 / 0.075998 |

本验收覆盖文件解析与统计引擎，不等于浏览器交互、持久化或性能验收。此数据不构成同一构念的问卷量表，未用于验证 Cronbach α、量表信效度、推断检验、p 值、置信区间、回归、聚类、因果关系或总体代表性。这些结果也不是用户项目的调研成果。
