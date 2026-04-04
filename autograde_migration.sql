-- MySQL dump 10.13  Distrib 8.0.45, for Linux (aarch64)
--
-- Host: localhost    Database: autograde-db
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
-- Table structure for table `assignment_best_grades`
--

DROP TABLE IF EXISTS `assignment_best_grades`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignment_best_grades` (
  `student_id` varchar(255) NOT NULL,
  `assignment_id` varchar(255) NOT NULL,
  `best_grade` double DEFAULT NULL,
  `best_submission_id` int DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`,`assignment_id`),
  KEY `assignment_id` (`assignment_id`),
  KEY `best_submission_id` (`best_submission_id`),
  CONSTRAINT `assignment_best_grades_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `assignment_best_grades_ibfk_2` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `assignment_best_grades_ibfk_3` FOREIGN KEY (`best_submission_id`) REFERENCES `submissions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assignment_best_grades`
--

LOCK TABLES `assignment_best_grades` WRITE;
/*!40000 ALTER TABLE `assignment_best_grades` DISABLE KEYS */;
/*!40000 ALTER TABLE `assignment_best_grades` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assignment_groups`
--

DROP TABLE IF EXISTS `assignment_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignment_groups` (
  `id` varchar(255) NOT NULL,
  `assignment_id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `assignment_id` (`assignment_id`),
  CONSTRAINT `assignment_groups_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assignment_groups`
--

LOCK TABLES `assignment_groups` WRITE;
/*!40000 ALTER TABLE `assignment_groups` DISABLE KEYS */;
INSERT INTO `assignment_groups` VALUES ('grp-1774795057679-0','gamma-demo-8487','Group 1','2026-04-01 03:16:15','2026-04-01 03:16:15'),('grp-1774795057679-1','gamma-demo-8487','Group 2','2026-04-01 03:16:15','2026-04-01 03:16:15'),('grp-1774795057679-2','gamma-demo-8487','Group 3','2026-04-01 03:16:15','2026-04-01 03:16:15');
/*!40000 ALTER TABLE `assignment_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assignments`
--

DROP TABLE IF EXISTS `assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignments` (
  `id` varchar(255) NOT NULL,
  `course_id` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `due_date` datetime NOT NULL,
  `status` enum('active','closed','late') DEFAULT 'active',
  `points` int DEFAULT '100',
  `language` varchar(50) DEFAULT NULL,
  `starter_code_path` varchar(255) DEFAULT NULL,
  `test_case_file_path` varchar(255) DEFAULT NULL,
  `type` enum('individual','group') DEFAULT 'individual',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `late_penalty_enabled` tinyint(1) DEFAULT '0',
  `late_penalty_type` varchar(50) DEFAULT 'per_day',
  `late_penalty_value` double DEFAULT '10',
  `late_penalty_cap` double DEFAULT '50',
  `allow_partial` tinyint(1) DEFAULT '0',
  `partial_pct` int DEFAULT '0',
  `style_points_possible` double DEFAULT '0',
  `efficiency_points_possible` double DEFAULT '0',
  `java_main_class` varchar(255) DEFAULT NULL,
  `run_mode` varchar(50) DEFAULT 'program',
  `rubric_config` text,
  `hide_student_names` tinyint DEFAULT '0',
  `group_submission_type` varchar(50) DEFAULT 'one_for_all',
  `max_group_members` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `course_id` (`course_id`),
  CONSTRAINT `assignments_ibfk_1` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assignments`
--

LOCK TABLES `assignments` WRITE;
/*!40000 ALTER TABLE `assignments` DISABLE KEYS */;
INSERT INTO `assignments` VALUES ('assignment-1-9680','CSCI 4060','Assignment 1','Objective:\nWrite a program or solve manually to convert obtained marks into a percentage.\nProblem Statement:\nA student appears in 5 subjects, each subject carrying 100 marks. Write a program (or steps) to:\nInput the marks obtained in each subject.\nCalculate the total marks obtained.\nCalculate the percentage using the formula\nDisplay the percentage.','2026-03-19 09:59:00','active',10,'python','','1773763509417-136911219-testcase.py','individual','2026-03-17 16:05:09','2026-03-25 17:08:59',1,'per_day',10,50,0,0,0,0,NULL,'program','{\"title\":\"Assignment1 rubric\",\"weighted\":false,\"sections\":[{\"id\":\"sec-1\",\"title\":\"\",\"items\":[{\"id\":\"crit-1\",\"name\":\"Correct output \",\"weight\":null,\"maxPoints\":3,\"comment\":\"\"},{\"id\":\"crit-sec-1-1773763339236\",\"name\":\"Style\",\"weight\":null,\"maxPoints\":2,\"comment\":\"\"},{\"id\":\"crit-sec-1-1773763346180\",\"name\":\"Documentation\",\"weight\":null,\"maxPoints\":2,\"comment\":\"\"},{\"id\":\"crit-sec-1-1773763355371\",\"name\":\"Language\",\"weight\":null,\"maxPoints\":3,\"comment\":\"\"}]}]}',0,'one_for_all',NULL),('beta-demo-3316','CSCI 4060','Beta Demo','<a class=\"attachment-bubble\" href=\"http://localhost:3001/uploads/1774398944355-565007503-Beta Demo Required Elements.pdf\" target=\"_blank\" rel=\"noreferrer\">Beta Demo Required Elements.pdf</a>&nbsp;<div>Your website should be able to run all the requirements.</div>','2026-03-24 12:59:00','active',20,'','[\"1774403328206-976280645-Programming Assignment 1.py\",\"1774403328207-575243749-Programming Assignment 2.py\"]','1773640763032-315457302-sample_test_cases.json','individual','2026-03-16 03:12:33','2026-03-29 03:45:00',0,'per_day',10,50,0,0,0,0,NULL,'program','{\"title\":\"Rubric 1\",\"weighted\":true,\"sections\":[{\"id\":\"sec-1\",\"title\":\"Correctness\",\"items\":[{\"id\":\"crit-1\",\"name\":\"Proper comments\",\"weight\":5,\"maxPoints\":10,\"comment\":\"10 points for proper comment\"},{\"id\":\"crit-sec-1-1773638820173\",\"name\":\"Good Code Structure\",\"weight\":10,\"maxPoints\":10,\"comment\":\"10 points for good code structure\"}]}]}',0,'one_for_all',NULL),('file-i-0-check-5632','CSCI4060','File I/0 Check','input output files','2026-03-14 04:59:00','active',100,'python','','','individual','2026-03-01 22:14:25','2026-03-01 22:14:25',0,'per_day',10,50,0,0,0,0,NULL,'program',NULL,0,'one_for_all',NULL),('first-program-0102','CSCI1001','First Program','print hello world to the screen','2026-03-21 14:59:00','active',100,'python','','','individual','2026-03-01 01:40:00','2026-03-01 01:40:08',0,'per_day',10,50,0,0,0,0,NULL,'program',NULL,0,'one_for_all',NULL),('gamma-demo-8487','CSCI 4060','Gamma Demo','Make sure all gamma demo requirements meet up your submission.','2026-04-08 06:59:00','active',20,'','','','group','2026-03-29 11:52:08','2026-04-01 03:16:15',1,'per_day',10,50,0,0,0,0,NULL,'program','{\"title\":\"Rubric for Grading\",\"weighted\":true,\"sections\":[{\"id\":\"sec-1\",\"title\":\"Test Cases\",\"items\":[{\"id\":\"crit-1\",\"name\":\"Test Case 1\",\"weight\":10,\"maxPoints\":10,\"comment\":\"10 Points for Test case 1\"},{\"id\":\"crit-sec-1-1774785002812\",\"name\":\"Test Case 2\",\"weight\":90,\"maxPoints\":10,\"comment\":\"10 Points for Test case 2\"}]}]}',0,'one_for_all',3),('the-echo-math-test-8240','CSCI4060','The \"Echo\" Math Test','Read a series of integers and print their average','2026-03-11 03:59:00','active',100,'python','','','individual','2026-03-01 19:14:18','2026-03-01 20:34:35',1,'per_day',10,50,0,0,10,10,NULL,'program',NULL,0,'one_for_all',NULL);
/*!40000 ALTER TABLE `assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversation_participants`
--

DROP TABLE IF EXISTS `conversation_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversation_participants` (
  `conversation_id` int NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `last_read_at` datetime DEFAULT NULL,
  `is_starred` tinyint DEFAULT '0',
  `is_archived` tinyint DEFAULT '0',
  `is_deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`conversation_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `conversation_participants_ibfk_1` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conversation_participants_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversation_participants`
--

LOCK TABLES `conversation_participants` WRITE;
/*!40000 ALTER TABLE `conversation_participants` DISABLE KEYS */;
INSERT INTO `conversation_participants` VALUES (3,'30150000','2026-03-31 21:34:33',0,0,0),(3,'30154993','2026-03-29 17:01:01',0,0,0),(3,'30159044','2026-03-29 17:10:33',0,0,0),(4,'30159044','2026-03-31 21:17:08',0,0,1),(4,'admin-example','2026-03-29 16:34:30',0,0,0),(5,'30159044','2026-03-31 21:17:05',0,0,1),(5,'admin-example','2026-03-29 16:56:33',0,0,0),(6,'30150000','2026-03-31 21:39:12',0,0,0),(6,'30159044','2026-03-31 21:17:12',0,0,1),(7,'30150000','2026-03-31 21:39:11',0,0,0),(7,'smith@example.edu','2026-03-30 16:39:15',0,0,0),(8,'30150000','2026-03-31 21:39:13',0,0,0),(8,'30159044','2026-04-01 01:59:35',0,0,0),(9,'30159044','2026-04-01 02:00:37',0,0,0),(9,'smith@example.edu','2026-04-01 02:03:31',0,0,0);
/*!40000 ALTER TABLE `conversation_participants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversations`
--

DROP TABLE IF EXISTS `conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `course_id` varchar(255) DEFAULT NULL,
  `subject` varchar(500) NOT NULL,
  `created_by` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `course_id` (`course_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `conversations_ibfk_1` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conversations_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversations`
--

LOCK TABLES `conversations` WRITE;
/*!40000 ALTER TABLE `conversations` DISABLE KEYS */;
INSERT INTO `conversations` VALUES (3,'CSCI 4060','Group Discussion','30159044','2026-03-29 15:02:08','2026-03-29 17:09:05'),(4,NULL,'[SUPPORT] Hey','30159044','2026-03-29 16:33:57','2026-03-29 16:34:30'),(5,NULL,'[SUPPORT] Hello','30159044','2026-03-29 16:55:05','2026-03-29 16:56:33'),(6,'CSCI 4060','Hi','30150000','2026-03-29 17:09:19','2026-03-29 17:09:19'),(7,'CSCI 4060','Hello','smith@example.edu','2026-03-30 16:28:08','2026-03-30 16:39:15'),(8,'CSCI 4060','New Message','30159044','2026-03-31 21:18:03','2026-03-31 21:18:03'),(9,'CSCI 4060','Hello','30159044','2026-04-01 02:00:00','2026-04-01 02:00:00');
/*!40000 ALTER TABLE `conversations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `course_documents`
--

DROP TABLE IF EXISTS `course_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_documents` (
  `course_id` varchar(255) NOT NULL,
  `syllabus_path` varchar(255) DEFAULT NULL,
  `schedule_path` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`course_id`),
  CONSTRAINT `course_documents_ibfk_1` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `course_documents`
--

LOCK TABLES `course_documents` WRITE;
/*!40000 ALTER TABLE `course_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `course_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `course_enrollments`
--

DROP TABLE IF EXISTS `course_enrollments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_enrollments` (
  `course_id` varchar(255) NOT NULL,
  `student_id` varchar(255) NOT NULL,
  `enrolled_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`course_id`,`student_id`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `course_enrollments_ibfk_1` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `course_enrollments_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `course_enrollments`
--

LOCK TABLES `course_enrollments` WRITE;
/*!40000 ALTER TABLE `course_enrollments` DISABLE KEYS */;
INSERT INTO `course_enrollments` VALUES ('CSCI 4060','30150000','2026-03-29 14:33:10'),('CSCI 4060','30150001','2026-04-01 02:24:00'),('CSCI 4060','30151987','2026-03-29 14:33:13'),('CSCI 4060','30152219','2026-03-29 14:33:17'),('CSCI 4060','30152261','2026-03-29 14:33:20'),('CSCI 4060','30154993','2026-03-29 14:33:23'),('CSCI 4060','30154994','2026-03-29 14:33:26'),('CSCI 4060','30155774','2026-03-29 14:33:32'),('CSCI 4060','30157112','2026-03-29 14:33:34'),('CSCI 4060','30159044','2026-03-29 14:33:29');
/*!40000 ALTER TABLE `course_enrollments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `course_settings`
--

DROP TABLE IF EXISTS `course_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_settings` (
  `student_id` varchar(255) NOT NULL,
  `course_id` varchar(255) NOT NULL,
  `color` varchar(50) NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`,`course_id`),
  KEY `course_id` (`course_id`),
  CONSTRAINT `course_settings_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `course_settings_ibfk_2` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `course_settings`
--

LOCK TABLES `course_settings` WRITE;
/*!40000 ALTER TABLE `course_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `course_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `course_tas`
--

DROP TABLE IF EXISTS `course_tas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_tas` (
  `course_id` varchar(255) NOT NULL,
  `ta_id` varchar(255) NOT NULL,
  `permissions` json DEFAULT NULL,
  `enrolled_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`course_id`,`ta_id`),
  KEY `ta_id` (`ta_id`),
  CONSTRAINT `course_tas_ibfk_1` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `course_tas_ibfk_2` FOREIGN KEY (`ta_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `course_tas`
--

LOCK TABLES `course_tas` WRITE;
/*!40000 ALTER TABLE `course_tas` DISABLE KEYS */;
INSERT INTO `course_tas` VALUES ('CSCI 4060','30159044','{\"can_grade\": true, \"can_edit_assignments\": true}','2026-03-31 23:42:47');
/*!40000 ALTER TABLE `course_tas` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courses` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `term` varchar(255) NOT NULL,
  `instructor_id` varchar(255) DEFAULT NULL,
  `is_archived` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `instructor_id` (`instructor_id`),
  CONSTRAINT `courses_ibfk_1` FOREIGN KEY (`instructor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courses`
--

LOCK TABLES `courses` WRITE;
/*!40000 ALTER TABLE `courses` DISABLE KEYS */;
INSERT INTO `courses` VALUES ('CSCI 4060','Software Engineering','Spring 2026','smith@example.edu',0,'2026-03-16 02:51:57','2026-03-16 02:51:57'),('CSCI1001','Intro ','Spring 2026',NULL,0,'2026-03-01 01:36:39','2026-03-01 01:36:39'),('CSCI4060','Software Engineering','Spring 2026',NULL,0,'2026-03-01 01:31:08','2026-03-01 01:31:08');
/*!40000 ALTER TABLE `courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `group_members`
--

DROP TABLE IF EXISTS `group_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `group_members` (
  `group_id` varchar(255) NOT NULL,
  `student_id` varchar(255) NOT NULL,
  PRIMARY KEY (`group_id`,`student_id`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `group_members_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `assignment_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `group_members_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `group_members`
--

LOCK TABLES `group_members` WRITE;
/*!40000 ALTER TABLE `group_members` DISABLE KEYS */;
INSERT INTO `group_members` VALUES ('grp-1774795057679-0','30150000'),('grp-1774795057679-2','30151987'),('grp-1774795057679-1','30152219'),('grp-1774795057679-2','30152261'),('grp-1774795057679-0','30154993'),('grp-1774795057679-1','30154994'),('grp-1774795057679-2','30155774'),('grp-1774795057679-1','30157112'),('grp-1774795057679-0','30159044');
/*!40000 ALTER TABLE `group_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversation_id` int NOT NULL,
  `sender_id` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `conversation_id` (`conversation_id`),
  KEY `sender_id` (`sender_id`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
INSERT INTO `messages` VALUES (5,3,'30159044','Hey Guys!!','2026-03-29 15:02:08'),(6,3,'30154993','Hello Gaurav','2026-03-29 15:02:32'),(7,3,'30159044','How are you?','2026-03-29 15:07:59'),(8,3,'30159044','Hey','2026-03-29 15:11:06'),(9,3,'30150000','Hey Guys','2026-03-29 15:21:05'),(10,3,'30150000','Hello','2026-03-29 15:37:17'),(11,3,'30150000','Hey','2026-03-29 15:40:45'),(12,3,'30154993','Hey','2026-03-29 15:49:28'),(13,4,'30159044','I have this issue.','2026-03-29 16:33:57'),(14,4,'admin-example','Your issue is fixed.','2026-03-29 16:34:30'),(15,5,'30159044','Is it really fixed?','2026-03-29 16:55:05'),(16,5,'admin-example','Yes for sure.','2026-03-29 16:56:33'),(17,3,'30159044','Hello Guys','2026-03-29 16:59:17'),(18,3,'30154993','Did you do assignment?','2026-03-29 17:01:01'),(19,3,'30159044','Hello','2026-03-29 17:08:41'),(20,3,'30150000','Hi','2026-03-29 17:09:05'),(21,6,'30150000','How are you','2026-03-29 17:09:19'),(22,7,'smith@example.edu','K xa khabar','2026-03-30 16:28:08'),(23,7,'smith@example.edu','Sathi','2026-03-30 16:39:15'),(24,8,'30159044','K xa sathi khabar','2026-03-31 21:18:03'),(25,9,'30159044','How are you?','2026-04-01 02:00:00');
/*!40000 ALTER TABLE `messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `submissions`
--

DROP TABLE IF EXISTS `submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` varchar(255) NOT NULL,
  `student_id` varchar(255) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` text NOT NULL,
  `status` enum('pending','graded','returned') DEFAULT 'pending',
  `grade` float DEFAULT NULL,
  `feedback` text,
  `submitted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `grade_published` tinyint(1) DEFAULT '0',
  `correctness_score` double DEFAULT NULL,
  `style_points` double DEFAULT NULL,
  `efficiency_points` double DEFAULT NULL,
  `deduction_points` double DEFAULT '0',
  `file_name_2` varchar(255) DEFAULT NULL,
  `file_path_2` text,
  `auto_grade` double DEFAULT NULL,
  `auto_feedback` text,
  PRIMARY KEY (`id`),
  KEY `assignment_id` (`assignment_id`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `submissions_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `submissions_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `submissions`
--

LOCK TABLES `submissions` WRITE;
/*!40000 ALTER TABLE `submissions` DISABLE KEYS */;
INSERT INTO `submissions` VALUES (14,'gamma-demo-8487','30159044','2 files','[{\"name\":\"main.java\",\"path\":\"1774785308454-6592179-main.java\"},{\"name\":\"sample_submission.java\",\"path\":\"1774785308454-485653551-sample_submission.java\"}]','pending',NULL,NULL,'2026-03-29 11:55:08','2026-03-29 11:55:08',0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL),(15,'gamma-demo-8487','30150000','1 file','[{\"name\":\"sample_submission.py\",\"path\":\"1774795219971-207200952-sample_submission.py\"}]','graded',12,'Good job Guys!!','2026-03-29 14:40:19','2026-04-01 02:46:19',0,NULL,NULL,NULL,0,NULL,NULL,20,'Correctness: 20/20.\nFinal Grade: 20.00/20.\n---\n[{\"testId\":5,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 60\",\"expected\":\"Sum: 60\",\"timedOut\":false,\"exitCode\":0},{\"testId\":6,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 55\",\"expected\":\"Sum: 55\",\"timedOut\":false,\"exitCode\":0}]'),(16,'gamma-demo-8487','30154993','1 file','[{\"name\":\"sample_submission.py\",\"path\":\"1774795219971-207200952-sample_submission.py\"}]','graded',20,'Good job Guys!!','2026-03-29 14:40:19','2026-04-01 03:13:53',0,NULL,NULL,NULL,0,NULL,NULL,20,'Correctness: 20/20.\nFinal Grade: 20.00/20.\n---\n[{\"testId\":5,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 60\",\"expected\":\"Sum: 60\",\"timedOut\":false,\"exitCode\":0},{\"testId\":6,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 55\",\"expected\":\"Sum: 55\",\"timedOut\":false,\"exitCode\":0}]'),(17,'gamma-demo-8487','30159044','1 file','[{\"name\":\"sample_submission.py\",\"path\":\"1774795219971-207200952-sample_submission.py\"}]','graded',12,'Good job Guys!!','2026-03-29 14:40:19','2026-04-01 02:46:19',0,NULL,NULL,NULL,0,NULL,NULL,20,'Correctness: 20/20.\nFinal Grade: 20.00/20.\n---\n[{\"testId\":5,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 60\",\"expected\":\"Sum: 60\",\"timedOut\":false,\"exitCode\":0},{\"testId\":6,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 55\",\"expected\":\"Sum: 55\",\"timedOut\":false,\"exitCode\":0}]'),(18,'gamma-demo-8487','30151987','1 file','[{\"name\":\"sample_submission.py\",\"path\":\"1774795771891-709229363-sample_submission.py\"}]','pending',NULL,'','2026-03-29 14:49:31','2026-04-01 03:24:36',0,NULL,NULL,NULL,0,NULL,NULL,20,'Correctness: 20/20.\nFinal Grade: 20.00/20.\n---\n[{\"testId\":5,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 60\",\"expected\":\"Sum: 60\",\"timedOut\":false,\"exitCode\":0},{\"testId\":6,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 55\",\"expected\":\"Sum: 55\",\"timedOut\":false,\"exitCode\":0}]'),(19,'gamma-demo-8487','30152261','1 file','[{\"name\":\"sample_submission.py\",\"path\":\"1774795771891-709229363-sample_submission.py\"}]','pending',NULL,'','2026-03-29 14:49:31','2026-04-01 03:24:36',0,NULL,NULL,NULL,0,NULL,NULL,20,'Correctness: 20/20.\nFinal Grade: 20.00/20.\n---\n[{\"testId\":5,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 60\",\"expected\":\"Sum: 60\",\"timedOut\":false,\"exitCode\":0},{\"testId\":6,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 55\",\"expected\":\"Sum: 55\",\"timedOut\":false,\"exitCode\":0}]'),(20,'gamma-demo-8487','30155774','1 file','[{\"name\":\"sample_submission.py\",\"path\":\"1774795771891-709229363-sample_submission.py\"}]','pending',NULL,'','2026-03-29 14:49:31','2026-04-01 03:24:36',0,NULL,NULL,NULL,0,NULL,NULL,20,'Correctness: 20/20.\nFinal Grade: 20.00/20.\n---\n[{\"testId\":5,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 60\",\"expected\":\"Sum: 60\",\"timedOut\":false,\"exitCode\":0},{\"testId\":6,\"is_public\":true,\"passed\":true,\"points\":10,\"maxPoints\":10,\"actual\":\"Sum: 55\",\"expected\":\"Sum: 55\",\"timedOut\":false,\"exitCode\":0}]'),(21,'gamma-demo-8487','30150000','2 files','[{\"name\":\"sample_submission.py\",\"path\":\"1775013417874-976717068-sample_submission.py\"},{\"name\":\"sample_submission.java\",\"path\":\"1775013417875-399544091-sample_submission.java\"}]','graded',18,'','2026-04-01 03:16:57','2026-04-01 03:24:36',0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL),(22,'gamma-demo-8487','30154993','2 files','[{\"name\":\"sample_submission.py\",\"path\":\"1775013417874-976717068-sample_submission.py\"},{\"name\":\"sample_submission.java\",\"path\":\"1775013417875-399544091-sample_submission.java\"}]','graded',18,'','2026-04-01 03:16:57','2026-04-01 03:24:36',0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL),(23,'gamma-demo-8487','30159044','2 files','[{\"name\":\"sample_submission.py\",\"path\":\"1775013417874-976717068-sample_submission.py\"},{\"name\":\"sample_submission.java\",\"path\":\"1775013417875-399544091-sample_submission.java\"}]','graded',18,'','2026-04-01 03:16:57','2026-04-01 03:24:36',0,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `submissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `test_cases`
--

DROP TABLE IF EXISTS `test_cases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test_cases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` varchar(255) NOT NULL,
  `input` text,
  `expected_output` text NOT NULL,
  `points` int DEFAULT '0',
  `is_public` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `input_type` varchar(50) DEFAULT 'stdin',
  `input_filename` varchar(255) DEFAULT NULL,
  `output_filename` varchar(255) DEFAULT NULL,
  `run_args` text,
  `output_filename_2` varchar(255) DEFAULT NULL,
  `expected_output_2` text,
  `compare_mode` varchar(50) DEFAULT 'exact',
  `stdin` text,
  PRIMARY KEY (`id`),
  KEY `assignment_id` (`assignment_id`),
  CONSTRAINT `test_cases_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `test_cases`
--

LOCK TABLES `test_cases` WRITE;
/*!40000 ALTER TABLE `test_cases` DISABLE KEYS */;
INSERT INTO `test_cases` VALUES (1,'first-program-0102','','Hello, World!',100,1,'2026-03-01 01:40:00','2026-03-01 01:40:00','stdin',NULL,NULL,NULL,NULL,NULL,'exact',NULL),(2,'the-echo-math-test-8240','10 20 30 40','25.0',80,1,'2026-03-01 19:14:18','2026-03-01 19:14:18','stdin',NULL,NULL,NULL,NULL,NULL,'exact',NULL),(3,'file-i-0-check-5632','Grader Test 2026!','!6202 tseT redarG',0,1,'2026-03-01 22:14:25','2026-03-01 22:14:25','file','input.txt','output.txt',NULL,NULL,NULL,'exact',NULL),(5,'gamma-demo-8487','10 20 30','Sum: 60',10,1,'2026-03-29 11:52:08','2026-03-29 11:52:08','stdin',NULL,NULL,NULL,NULL,NULL,'exact',NULL),(6,'gamma-demo-8487','25 30','Sum: 55',10,1,'2026-03-29 11:52:08','2026-03-29 11:52:08','stdin',NULL,NULL,NULL,NULL,NULL,'exact',NULL);
/*!40000 ALTER TABLE `test_cases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `todos`
--

DROP TABLE IF EXISTS `todos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `todos` (
  `id` varchar(255) NOT NULL,
  `student_id` varchar(255) NOT NULL,
  `course_id` varchar(255) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `due_date` datetime DEFAULT NULL,
  `completed` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `student_id` (`student_id`),
  KEY `course_id` (`course_id`),
  CONSTRAINT `todos_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `todos_ibfk_2` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `todos`
--

LOCK TABLES `todos` WRITE;
/*!40000 ALTER TABLE `todos` DISABLE KEYS */;
/*!40000 ALTER TABLE `todos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` enum('student','faculty','admin','ta') NOT NULL,
  `profile_picture` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `verified` tinyint DEFAULT '1',
  `student_id` varchar(255) DEFAULT NULL,
  `email_verified` tinyint DEFAULT '1',
  `email_verification_token` varchar(255) DEFAULT NULL,
  `email_verification_otp` varchar(6) DEFAULT NULL,
  `email_verification_expires` datetime DEFAULT NULL,
  `password_reset_token` varchar(255) DEFAULT NULL,
  `password_reset_expires` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('30150000','Prabin Giri','giripr@example.edu','khaki@123','student',NULL,'2026-03-29 14:26:31','2026-03-29 14:26:31',1,'30150000',1,NULL,NULL,NULL,NULL,NULL),('30150001','Naresh Chhetri','chhetrin@warhawks.ulm.edu','khaki@123','student',NULL,'2026-04-01 02:22:48','2026-04-01 02:23:40',1,'30150001',1,NULL,NULL,NULL,NULL,NULL),('30151987','Rabin Regmi','regmir@example.edu','khaki@123','student',NULL,'2026-03-29 14:26:31','2026-03-29 14:26:31',1,'30151987',1,NULL,NULL,NULL,NULL,NULL),('30152219','Sujan Shrestha','shresthas4@example.edu','khaki@123','student',NULL,'2026-03-29 14:26:31','2026-03-29 14:26:31',1,'30152219',1,NULL,NULL,NULL,NULL,NULL),('30152261','Damir Filaretov','filaretovd@example.edu','khaki@123','student',NULL,'2026-03-29 14:26:31','2026-03-29 14:26:31',1,'30152261',1,NULL,NULL,NULL,NULL,NULL),('30154993','Himal Ranabhat','ranabhath@example.edu','khaki@123','student',NULL,'2026-03-29 14:26:31','2026-03-29 14:26:31',1,'30154993',1,NULL,NULL,NULL,NULL,NULL),('30154994','Kapil Paudel','paudelk@example.edu','khaki@123','student',NULL,'2026-03-29 14:26:31','2026-03-29 14:26:31',1,'30154994',1,NULL,NULL,NULL,NULL,NULL),('30155774','Binit Karki','karkibi@example.edu','khaki@123','student',NULL,'2026-03-29 14:26:31','2026-03-29 14:26:31',1,'30155774',1,NULL,NULL,NULL,NULL,NULL),('30157112','Shubrat Simkhada','simkhadas@example.edu','khaki@123','student',NULL,'2026-03-29 14:26:31','2026-03-29 14:26:31',1,'30157112',1,NULL,NULL,NULL,NULL,NULL),('30159044','Gaurav Rijal','rijalg@warhawks.ulm.edu','khaki@123','student','1774784728384-242637733-profile.jpg','2026-03-29 06:59:14','2026-03-29 11:45:28',1,'30159044',1,NULL,NULL,NULL,NULL,NULL),('admin-example','System Admin','admin@example.edu','adminPassword2026','admin',NULL,'2026-03-16 06:09:20','2026-03-16 06:09:20',1,NULL,1,NULL,NULL,NULL,NULL,NULL),('faculty@gmail.com','Test Faculty','faculty@gmail.com','password123','faculty',NULL,'2026-03-16 06:04:32','2026-03-16 06:10:12',1,NULL,1,NULL,NULL,NULL,NULL,NULL),('smith@example.edu','Lon Smith','smith@example.edu','password123','faculty','1773634613736-936289632-profile.jpg','2026-03-02 18:07:39','2026-03-16 04:16:53',1,NULL,1,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-01  3:28:58
