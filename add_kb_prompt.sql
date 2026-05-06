-- 为 prompt 表新增知识库版提示词列（幂等，可重复执行）
-- 适用：MySQL 8.0+

ALTER TABLE `prompt`
  ADD COLUMN IF NOT EXISTS `Req2CodeAlignKbs` TEXT COMMENT '需求找代码-知识库提示词' AFTER `Req2CodeAlign`,
  ADD COLUMN IF NOT EXISTS `Code2ReqAlignKbs` TEXT COMMENT '代码找需求-知识库提示词' AFTER `Code2ReqAlign`,
  ADD COLUMN IF NOT EXISTS `reviewKbs` TEXT COMMENT '审查-知识库提示词' AFTER `review`;

-- 可选：检查结果
SHOW COLUMNS FROM `prompt` LIKE 'Req2CodeAlignKbs';
SHOW COLUMNS FROM `prompt` LIKE 'Code2ReqAlignKbs';
SHOW COLUMNS FROM `prompt` LIKE 'reviewKbs';
