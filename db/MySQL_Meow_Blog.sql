-- ----------------------------
-- 2019-4-19 21:40:22
-- MySQL
-- ----------------------------

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for meowv_articlecategories
-- ----------------------------
DROP TABLE IF EXISTS `meowv_articlecategories`;
CREATE TABLE `meowv_articlecategories`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `ArticleId` int(11) NOT NULL,
  `CategoryId` int(11) NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for meowv_articles
-- ----------------------------
DROP TABLE IF EXISTS `meowv_articles`;
CREATE TABLE `meowv_articles`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `Title` varchar(100) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Author` varchar(10) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Source` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Url` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Summary` varchar(200) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Content` text CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Hits` int(11) NOT NULL,
  `MetaKeywords` varchar(100) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `MetaDescription` varchar(200) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `CreationTime` datetime(0) NOT NULL,
  `PostTime` datetime(0) NOT NULL,
  `IsDeleted` bit(1) NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for meowv_articletags
-- ----------------------------
DROP TABLE IF EXISTS `meowv_articletags`;
CREATE TABLE `meowv_articletags`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `ArticleId` int(11) NOT NULL,
  `TagId` int(11) NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for meowv_categories
-- ----------------------------
DROP TABLE IF EXISTS `meowv_categories`;
CREATE TABLE `meowv_categories`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `CategoryName` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `CreationTime` datetime(0) NOT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for meowv_tags
-- ----------------------------
DROP TABLE IF EXISTS `meowv_tags`;
CREATE TABLE `meowv_tags`  (
  `Id` int(11) NOT NULL AUTO_INCREMENT,
  `TagName` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `CreationTime` datetime(0) NOT NULL,
  PRIMARY KEY (`Id`, `TagName`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
