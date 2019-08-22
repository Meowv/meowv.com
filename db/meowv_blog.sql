SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for categories
-- ----------------------------
DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `CategoryName` char(50) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `DisplayName` char(50) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 8 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for commits
-- ----------------------------
DROP TABLE IF EXISTS `commits`;
CREATE TABLE `commits`  (
  `Id` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `Sha` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL,
  `Message` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL,
  `Date` datetime(0) NULL DEFAULT NULL
) ENGINE = InnoDB AUTO_INCREMENT = 519 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for friendlinks
-- ----------------------------
DROP TABLE IF EXISTS `friendlinks`;
CREATE TABLE `friendlinks`  (
  `Id` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Title` char(20) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `LinkUrl` char(100) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for hot_news
-- ----------------------------
DROP TABLE IF EXISTS `hot_news`;
CREATE TABLE `hot_news`  (
  `Id` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `Title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `Url` varchar(250) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `SourceId` int(11) NOT NULL,
  `Time` datetime(0) NOT NULL
) ENGINE = InnoDB AUTO_INCREMENT = 182397 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for nice_articles
-- ----------------------------
DROP TABLE IF EXISTS `nice_articles`;
CREATE TABLE `nice_articles`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `Title` varchar(100) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Author` varchar(50) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Source` varchar(100) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Url` varchar(100) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `CategoryId` int(11) NOT NULL,
  `Time` datetime(0) NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 29 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for post_tags
-- ----------------------------
DROP TABLE IF EXISTS `post_tags`;
CREATE TABLE `post_tags`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `PostId` int(11) NOT NULL,
  `TagId` int(11) NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 104 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for posts
-- ----------------------------
DROP TABLE IF EXISTS `posts`;
CREATE TABLE `posts`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `Title` char(100) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Author` char(10) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Url` char(100) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Html` longtext CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Markdown` longtext CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `CreationTime` datetime(0) NOT NULL,
  `CategoryId` int(11) NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 41 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for signature_logs
-- ----------------------------
DROP TABLE IF EXISTS `signature_logs`;
CREATE TABLE `signature_logs`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `Name` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Type` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Url` varchar(100) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Ip` varchar(50) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Time` datetime(0) NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1721 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for tags
-- ----------------------------
DROP TABLE IF EXISTS `tags`;
CREATE TABLE `tags`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `TagName` char(50) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `DisplayName` char(50) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE,
  INDEX `Id`(`Id`) USING BTREE,
  INDEX `Id_2`(`Id`) USING BTREE,
  INDEX `Id_3`(`Id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 66 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
