通过显式配置的 load_dataset 工具读取实际输入文件引用，检查变量、数据类型、缺失情况及来源。check_artifact_refs 只检查引用形状，不能替代文件读取。输出中间 JSON：schema、quality_findings、source_refs。拿不到数据时停止，不编造统计结果。
