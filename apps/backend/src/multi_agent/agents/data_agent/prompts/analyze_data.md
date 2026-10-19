调用显式配置的 analyze_dataset 工具完成实际计算，工具须返回 classification=actual 以及 data.deliverable（DataDeliverable）。输出完整 DataOutput JSON；deliverable 必须逐字段保留该工具的计算结果，不改写数字。没有实际读取和分析回执时不能标为 analyzed。
