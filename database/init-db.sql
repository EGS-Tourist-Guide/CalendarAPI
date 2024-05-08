-- Drop the existing database if it exists
DROP DATABASE IF EXISTS storeDB;

-- Create the database
CREATE DATABASE IF NOT EXISTS storeDB;
USE storeDB;

-- Drop tables if they exist
DROP TABLE IF EXISTS `api_keys`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `calendars`;
DROP TABLE IF EXISTS `events`;

CREATE TABLE IF NOT EXISTS `storeDB`.`api_keys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `api_key` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
);

CREATE TABLE IF NOT EXISTS `storeDB`.`users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `google_id` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `google_id` (`google_id`),
  UNIQUE KEY `email` (`email`)
);

INSERT INTO `storeDB`.`users` (`google_id`, `email`, `name`) VALUES ('superuser_id', 'superuser@example.com', 'Super User');

CREATE TABLE IF NOT EXISTS `storeDB`.`calendars` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `userId` (`userId`),
  CONSTRAINT `calendars_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `storeDB`.`users` (`id`)
);

INSERT INTO `storeDB`.`calendars` (`userId`, `name`) VALUES (1, 'Super User Calendar');
INSERT INTO `storeDB`.`api_keys` (`username`, `password`, `api_key`) VALUES ('luis', 'luis', '7d4d3351-64b9-4d0a-918c-419828a941d3');

CREATE TABLE IF NOT EXISTS `storeDB`.`events` (
  `id` CHAR(36) NOT NULL,
  `calendarId` int DEFAULT NULL,
  `summary` varchar(255) NOT NULL,
  `location` varchar(255) DEFAULT NULL,
  `description` text,
  `startDateTime` datetime NOT NULL,
  `endDateTime` datetime NOT NULL,
  `timeZone` varchar(50) DEFAULT NULL,
  `obs` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `calendarId` (`calendarId`),
  CONSTRAINT `events_ibfk_1` FOREIGN KEY (`calendarId`) REFERENCES `storeDB`.`calendars` (`id`)
);
