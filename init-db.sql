CREATE DATABASE IF NOT EXISTS storeDB;
USE storeDB;

CREATE TABLE `storeDB`.`api_keys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `api_key` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
);

CREATE TABLE `storeDB`.`users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `google_id` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `google_id` (`google_id`),
  UNIQUE KEY `email` (`email`)
);

CREATE TABLE `storeDB`.`calendars` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `userId` (`userId`),
  CONSTRAINT `calendars_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `storeDB`.`users` (`id`)
);

CREATE TABLE `storeDB`.`events` (
  `id` int NOT NULL AUTO_INCREMENT,
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
