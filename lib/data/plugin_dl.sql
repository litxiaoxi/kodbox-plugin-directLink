DROP TABLE IF EXISTS `plugin_dl`;
CREATE TABLE `plugin_dl` (
    `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
    `token` varchar(64) NOT NULL COMMENT '直链token',
    `path` text NOT NULL COMMENT '文件KodIO路径',
    `fileID` bigint(20) unsigned NOT NULL DEFAULT '0' COMMENT '文件ID',
    `name` varchar(255) NOT NULL DEFAULT '' COMMENT '文件名',
    `ext` varchar(32) NOT NULL DEFAULT '' COMMENT '扩展名',
    `size` bigint(20) unsigned NOT NULL DEFAULT '0' COMMENT '文件大小',
    `userID` bigint(20) unsigned NOT NULL DEFAULT '0' COMMENT '创建用户ID',
    `status` tinyint(3) unsigned NOT NULL DEFAULT '1' COMMENT '状态 1启用 0停用',
    `numView` int(11) unsigned NOT NULL DEFAULT '0' COMMENT '访问次数',
    `numDownload` int(11) unsigned NOT NULL DEFAULT '0' COMMENT '已废弃:下载量并入 numView,仅保留字段兼容',
    `lastViewTime` int(11) unsigned NOT NULL DEFAULT '0' COMMENT '最后访问时间',
    `createTime` int(11) unsigned NOT NULL DEFAULT '0' COMMENT '创建时间',
    `modifyTime` int(11) unsigned NOT NULL DEFAULT '0' COMMENT '修改时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `token` (`token`),
    KEY `userID` (`userID`),
    KEY `status` (`status`),
    KEY `createTime` (`createTime`),
    KEY `userID_status` (`userID`,`status`),
    KEY `userID_createTime` (`userID`,`createTime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='文件直链表';
