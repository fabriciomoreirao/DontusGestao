CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`module` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`actor` text NOT NULL,
	`visibility` text DEFAULT 'Compartilhada' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activities_entity_idx` ON `activities` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`customer_id` text,
	`customer_name` text DEFAULT '' NOT NULL,
	`owner` text NOT NULL,
	`team` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'Agendado' NOT NULL,
	`meeting_url` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `appointments_owner_time_idx` ON `appointments` (`owner`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`source_title` text NOT NULL,
	`requester` text NOT NULL,
	`approver_role` text NOT NULL,
	`status` text DEFAULT 'Pendente' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`justification` text DEFAULT '' NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `approvals_status_idx` ON `approvals` (`status`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`resource_id` text NOT NULL,
	`module` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`result` text DEFAULT 'Sucesso' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_resource_idx` ON `audit_events` (`resource`,`resource_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`trade_name` text NOT NULL,
	`document_masked` text DEFAULT '' NOT NULL,
	`segment` text DEFAULT 'Clínica odontológica' NOT NULL,
	`status` text DEFAULT 'Ativo' NOT NULL,
	`owner` text DEFAULT 'Não atribuído' NOT NULL,
	`cs_owner` text DEFAULT 'Não atribuído' NOT NULL,
	`support_owner` text DEFAULT 'Fila de suporte' NOT NULL,
	`strategic` integer DEFAULT false NOT NULL,
	`clinics_count` integer DEFAULT 1 NOT NULL,
	`monthly_revenue_cents` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_status_idx` ON `customers` (`status`);--> statement-breakpoint
CREATE INDEX `customers_owner_idx` ON `customers` (`owner`);--> statement-breakpoint
CREATE TABLE `decision_items` (
	`code` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'Pendente' NOT NULL,
	`risk` text NOT NULL,
	`default_behavior` text NOT NULL,
	`owner` text DEFAULT 'Product Owner' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'administrator' NOT NULL,
	`department` text DEFAULT 'Gestão' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uidx` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`record_type` text NOT NULL,
	`title` text NOT NULL,
	`customer_id` text,
	`customer_name` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT 'Não atribuído' NOT NULL,
	`team` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`priority` text DEFAULT 'P3' NOT NULL,
	`due_at` text,
	`sla_due_at` text,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`origin_type` text,
	`origin_id` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_items_module_status_idx` ON `work_items` (`module`,`status`);--> statement-breakpoint
CREATE INDEX `work_items_customer_idx` ON `work_items` (`customer_id`);--> statement-breakpoint
CREATE INDEX `work_items_owner_idx` ON `work_items` (`owner`);--> statement-breakpoint
CREATE INDEX `work_items_due_idx` ON `work_items` (`due_at`);