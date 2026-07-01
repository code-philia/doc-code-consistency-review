-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: localhost    Database: doc_code
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `abstracts`
--

DROP TABLE IF EXISTS `abstracts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `abstracts` (
  `abstract_id` int NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `user_id` int NOT NULL,
  `project_id` int NOT NULL,
  `filename` varchar(100) NOT NULL COMMENT '文件',
  `abstract` text NOT NULL COMMENT '摘要',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`abstract_id`)
) ENGINE=InnoDB AUTO_INCREMENT=217 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='摘要';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `alignments`
--

DROP TABLE IF EXISTS `alignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alignments` (
  `id` varchar(100) NOT NULL,
  `user_id` int NOT NULL,
  `project_id` int NOT NULL,
  `name` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `isReviewed` int DEFAULT '0',
  `reviewThoughts` text,
  `docRanges` text NOT NULL,
  `codeRanges` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '代码',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT NULL,
  `GenReq` text,
  `GenMermaid` text,
  `is_code_review` tinyint(1) DEFAULT '0',
  `align_type` varchar(100) DEFAULT NULL COMMENT '对齐类型: 需求->代码，代码->需求',
  `is_alignment` tinyint(1) DEFAULT '0' COMMENT '是否对齐：0未对齐，1已对齐',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='对齐';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `code_blocks`
--

DROP TABLE IF EXISTS `code_blocks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `code_blocks` (
  `code_block_row_id` int NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `project_id` int NOT NULL COMMENT '项目id',
  `id` int NOT NULL COMMENT '代码块原始id',
  `name` varchar(255) DEFAULT NULL COMMENT '代码块名称',
  `file` varchar(255) NOT NULL COMMENT '代码文件相对路径',
  `start_line` int NOT NULL COMMENT '起始行',
  `end_line` int NOT NULL COMMENT '结束行',
  `type` varchar(100) DEFAULT NULL COMMENT '代码块类型',
  `code` mediumtext COMMENT '代码块内容',
  `related_id` json DEFAULT NULL COMMENT '关联代码块id列表',
  `related_range` json DEFAULT NULL COMMENT '关联范围映射',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` timestamp NULL DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`code_block_row_id`),
  UNIQUE KEY `code_block_unique` (`project_id`,`id`),
  KEY `idx_code_blocks_project_file` (`project_id`,`file`)
) ENGINE=InnoDB AUTO_INCREMENT=361 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='代码块';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `doc_blocks`
--

DROP TABLE IF EXISTS `doc_blocks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doc_blocks` (
  `doc_block_id` int NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `project_id` int NOT NULL COMMENT '项目id',
  `id` int NOT NULL COMMENT '需求块原始id',
  `name` varchar(255) DEFAULT NULL COMMENT '需求块名称',
  `filename` varchar(255) NOT NULL COMMENT '需求文档相对路径',
  `type` varchar(100) DEFAULT NULL COMMENT '需求块类型',
  `content` mediumtext COMMENT '需求块内容',
  `start` int NOT NULL COMMENT '起始字符偏移',
  `end` int NOT NULL COMMENT '结束字符偏移',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` timestamp NULL DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`doc_block_id`),
  UNIQUE KEY `doc_block_unique` (`project_id`,`id`),
  KEY `idx_doc_blocks_project_file` (`project_id`,`filename`)
) ENGINE=InnoDB AUTO_INCREMENT=901 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='需求块';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `export_tasks`
--

DROP TABLE IF EXISTS `export_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `export_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `project_id` int NOT NULL,
  `user_id` int NOT NULL,
  `export_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'reverse_requirement',
  `status` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pending' COMMENT '状态: pending/processing/success/failure',
  `filename` varchar(500) COLLATE utf8mb4_general_ci NOT NULL,
  `error_msg` text COLLATE utf8mb4_general_ci COMMENT '失败原因',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成时间',
  `url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `export_tasks_unique` (`task_id`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='导出任务记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `issues`
--

DROP TABLE IF EXISTS `issues`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `issues` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `project_id` int NOT NULL,
  `displayId` varchar(100) DEFAULT NULL,
  `alignmentId` varchar(100) NOT NULL,
  `severity` varchar(100) DEFAULT NULL,
  `title` varchar(100) DEFAULT NULL,
  `content` text,
  `status` varchar(100) DEFAULT NULL,
  `relatedDocFile` text,
  `relatedRequirementId` text,
  `briefRequirement` text,
  `briefCode` text,
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL COMMENT '类别',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project`
--

DROP TABLE IF EXISTS `project`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project` (
  `project_id` int NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `user_id` int NOT NULL COMMENT '用户表id',
  `last_opened` varchar(100) NOT NULL COMMENT '项目最后打开时间',
  `name` varchar(100) NOT NULL COMMENT '项目名称',
  `path` varchar(255) NOT NULL COMMENT '项目路径',
  `create_time` varchar(100) DEFAULT NULL COMMENT '创建时间',
  `update_time` varchar(100) DEFAULT NULL COMMENT '更新时间',
  `is_delete` int DEFAULT '0' COMMENT '是否删除',
  PRIMARY KEY (`project_id`)
) ENGINE=InnoDB AUTO_INCREMENT=167 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project_access_log`
--

DROP TABLE IF EXISTS `project_access_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_access_log` (
  `pal_id` int NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `user_id` int NOT NULL COMMENT '用户id',
  `project_id` int NOT NULL COMMENT '项目id',
  `access_time` varchar(100) NOT NULL COMMENT '打开时间',
  PRIMARY KEY (`pal_id`)
) ENGINE=InnoDB AUTO_INCREMENT=273 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='项目打开记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `prompt`
--

DROP TABLE IF EXISTS `prompt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prompt` (
  `prompt_id` int NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `user_id` int NOT NULL COMMENT '用户id',
  `Code2ReqAlign` text,
  `Req2CodeAlign` text,
  `review` text COMMENT '审查',
  `Code2ReqAlignKbs` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `Req2CodeAlignKbs` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `reviewKbs` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '审查',
  `reviewCode` text COMMENT '代码单独审查提示词',
  `reviewCodeKbs` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT '代码单独审查-知识库版',
  PRIMARY KEY (`prompt_id`),
  UNIQUE KEY `prompt_unique` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='提示词表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `user_id` int NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `name` varchar(100) DEFAULT NULL COMMENT '姓名',
  `username` varchar(100) DEFAULT NULL COMMENT '用户',
  `password` varchar(100) DEFAULT NULL COMMENT '密码',
  `ip` varchar(100) DEFAULT NULL COMMENT 'IP地址',
  `role` varchar(100) DEFAULT NULL COMMENT '角色',
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_task_snapshot`
--

DROP TABLE IF EXISTS `user_task_snapshot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_task_snapshot` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `project_id` int NOT NULL,
  `task_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `next_task_id` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `task_type` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'single',
  `task1_total` int DEFAULT '0',
  `task2_total` int DEFAULT '0',
  `current_total` int DEFAULT '0',
  `current_progress` int DEFAULT '0',
  `state` varchar(100) COLLATE utf8mb4_general_ci DEFAULT 'PENDING',
  `title` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_running` tinyint DEFAULT '1',
  `create_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `update_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `task_category` varchar(100) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'align' COMMENT '任务分类: align/review',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=99 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户任务恢复表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping routines for database 'doc_code'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-29 13:56:56
