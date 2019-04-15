/*
 Navicat Premium Data Transfer

 Source Server         : 132.232.126.92-qix
 Source Server Type    : MySQL
 Source Server Version : 80012
 Source Host           : 132.232.126.92:3306
 Source Schema         : meowv_blog

 Target Server Type    : MySQL
 Target Server Version : 80012
 File Encoding         : 65001

 Date: 15/04/2019 21:30:30
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for meowv_articlecategories
-- ----------------------------
DROP TABLE IF EXISTS `meowv_articlecategories`;
CREATE TABLE `meowv_articlecategories`  (
  `Id` int(11) NOT NULL,
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
  `Url` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `Summary` varchar(200) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `Content` text CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `Hits` int(11) NOT NULL,
  `MetaKeywords` varchar(100) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `MetaDescription` varchar(200) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `IsDeleted` int(11) NOT NULL DEFAULT 0,
  `DeletionTime` datetime(0) DEFAULT NULL,
  `DeleterUserId` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `CreationTime` datetime(0) NOT NULL,
  `CreatorUserId` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `LastModificationTime` datetime(0) DEFAULT NULL,
  `LastModifierUserId` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for meowv_articletags
-- ----------------------------
DROP TABLE IF EXISTS `meowv_articletags`;
CREATE TABLE `meowv_articletags`  (
  `Id` int(11) NOT NULL,
  `ArticleId` int(11) DEFAULT NULL,
  `TagId` int(11) DEFAULT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for meowv_categories
-- ----------------------------
DROP TABLE IF EXISTS `meowv_categories`;
CREATE TABLE `meowv_categories`  (
  `Id` int(11) NOT NULL,
  `CategoryName` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `IsDeleted` int(11) NOT NULL DEFAULT 0,
  `DeletionTime` datetime(0) DEFAULT NULL,
  `DeleterUserId` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `CreationTime` datetime(0) NOT NULL,
  `CreatorUserId` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `LastModificationTime` datetime(0) DEFAULT NULL,
  `LastModifierUserId` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  PRIMARY KEY (`Id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for meowv_tags
-- ----------------------------
DROP TABLE IF EXISTS `meowv_tags`;
CREATE TABLE `meowv_tags`  (
  `Id` int(11) NOT NULL,
  `TagName` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `CategoryName` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `IsDeleted` int(11) NOT NULL DEFAULT 0,
  `DeletionTime` datetime(0) DEFAULT NULL,
  `DeleterUserId` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `CreationTime` datetime(0) NOT NULL,
  `CreatorUserId` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `LastModificationTime` datetime(0) DEFAULT NULL,
  `LastModifierUserId` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  PRIMARY KEY (`Id`, `TagName`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
