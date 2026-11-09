import { parsePerformanceReturnSnapshot, RETURN_SNAPSHOT_TABLES } from "./performance-return-history-service";
import { parseHolidayPatternPolicy } from "../../shared/domain/holiday-pattern";
import { buildImportedEmployeeHireDateReview } from "./employee-hire-date-review";
import { PATTERN_PRESETS_SETTING_KEY, parsePatternPresetRecords } from "../../shared/bridge/pattern-presets";
import crypto, { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type {
  AppSettingsSnapshot,
  JsonDatabaseBackupSummary,
  JsonDatabaseRestorePreview,
  JsonDatabaseRestoreRequirementCheck,
  JsonDatabaseRestoreRequirementStatus,
  JsonDatabaseRestoreSummary,
  JsonDatabaseTableImpact
} from "../../shared/bridge/contracts";
import { isBpDisplayName } from "../../shared/domain/employment-type";
import {
  type PerformanceEntrySection,
  isPayablePerformanceEntry
} from "../../shared/domain/performance-file";
import type { SubstituteAllowanceReasonCode } from "../../shared/domain/substitute-allowance-policy";
import { getStoredAppSettingsSnapshot } from "./app-settings-storage-service";
import { runDatabaseBackupNow } from "./database-backup-service";
import { resolveDatabaseMigrationInput } from "./database-file-policy-service";
import {
  removeSqliteSidecars,
  replaceDatabaseFileAtomically
} from "./database-replacement-service";
import {
  closeSqliteStorage,
  getSqliteDatabase,
  initializeSqliteStorage
} from "./sqlite-storage-service";
import { initializePolicyHistory, isPolicyHistoryInitialized, matchesPolicyCriteria, IMPLEMENTATION_VERSION, mapRowToRevision } from "./policy-history-service";
import { isValidPolicyKind, isValidRuleKey, isValidDateString, parsePolicyApplicationSnapshot, type PolicyRuleKey } from "../../shared/domain/policy-history";

const APP_SETTINGS_TABLE_NAME = "app_setting_entries";

const JSON_IMPORT_TABLE_ORDER_V1 = [
  "sites",
  "employees",
  "employee_employment_periods",
  "employee_site_assignments",
  "wage_rates",
  "wage_rate_history",
  "employee_retirement_history_closures",
  "employee_employment_period_events",
  "shift_patterns",
  "shift_pattern_steps",
  "shift_pattern_team_indexes",
  "shift_pattern_cycles",
  "shift_pattern_cycle_steps",
  "shift_pattern_cycle_team_indexes",
  "shift_pattern_team_cycles",
  "shift_pattern_team_capacities",
  "shift_pattern_team_settings",
  "shift_pattern_duty_types",
  "monthly_schedules",
  "monthly_schedule_items",
  "schedule_plan_exports",
  "holiday_calendars",
  "holiday_items",
  "allowance_rate_versions",
  "allowance_rate_items",
  "allowance_rate_history",
  "app_users",
  "access_logs",
  "document_template_versions",
  "document_template_history",
  "performance_files",
  "performance_entries",
  "performance_approvals",
  "hidden_approved_performance_rows",
  "allowance_calculations",
  "allowance_calculation_items",
  "allowance_document_exports",
  "allowance_approvals",
  "allowance_proposal_approvals"
] as const;

const JSON_IMPORT_TABLE_ORDER_V2 = [
  "sites",
  "employees",
  "employee_employment_periods",
  "employee_site_assignments",
  "wage_rates",
  "wage_rate_history",
  "employee_retirement_history_closures",
  "employee_employment_period_events",
  "shift_patterns",
  "shift_pattern_steps",
  "shift_pattern_team_indexes",
  "shift_pattern_cycles",
  "shift_pattern_cycle_steps",
  "shift_pattern_cycle_team_indexes",
  "shift_pattern_team_cycles",
  "shift_pattern_team_capacities",
  "shift_pattern_team_settings",
  "shift_pattern_duty_types",
  "monthly_schedules",
  "monthly_schedule_items",
  "schedule_plan_exports",
  "holiday_calendars",
  "holiday_items",
  "allowance_rate_versions",
  "allowance_rate_items",
  "allowance_rate_history",
  "app_users",
  "access_logs",
  "document_template_versions",
  "document_template_history",
  "policy_revisions",
  "policy_events",
  "performance_files",
  "performance_entries",
  "performance_approvals",
  "hidden_approved_performance_rows",
  "allowance_calculations",
  "allowance_calculation_items",
  "allowance_document_exports",
  "allowance_approvals",
  "allowance_proposal_approvals"
] as const;

const JSON_IMPORT_TABLE_ORDER = [...JSON_IMPORT_TABLE_ORDER_V2, "performance_return_history"] as const;

const TABLE_SCHEMA_COLUMNS: Record<string, readonly string[]> = {
  performance_return_history: ["id", "file_id", "occurred_at", "actor_user_id", "actor_name", "reason", "snapshot_json", "snapshot_sha256"],
  sites: [
    "id", "site_code", "name", "customer_name", "status", "timezone", "deleted_at", "created_at", "updated_at"
  ],
  employees: [
    "id", "employee_code", "name", "contact", "email", "rank", "employment_type", "status", "hire_date", "retire_date", "deleted_at", "created_at", "updated_at"
  ],
  employee_employment_periods: [
    "id", "employee_id", "start_date", "end_date", "closure_provenance_complete", "created_at", "updated_at"
  ],
  employee_site_assignments: [
    "id", "employee_id", "employment_period_id", "site_id", "team_name", "shift_group", "sort_order", "start_date", "end_date", "status", "created_at"
  ],
  wage_rates: [
    "id", "employee_id", "employment_period_id", "hourly_rate", "effective_from", "effective_to", "reason", "created_at"
  ],
  wage_rate_history: [
    "id", "wage_rate_id", "employee_id", "employment_period_id", "employee_code", "employee_name", "action_type", "hourly_rate", "effective_from", "effective_to", "wage_reason", "change_reason", "actor_user_id", "actor_login_id", "actor_display_name", "actor_role", "occurred_at"
  ],
  employee_retirement_history_closures: [
    "id", "employment_period_id", "history_kind", "history_id", "previous_status", "previous_end_date", "created_at"
  ],
  employee_employment_period_events: [
    "id", "employee_id", "employment_period_id", "event_type", "event_date", "previous_event_date", "reason", "created_at"
  ],
  shift_patterns: [
    "id", "site_id", "name", "team_count", "cycle_length", "pattern_code", "start_index_rule", "pattern_start_date", "pool_enabled", "pool_start_time", "pool_end_time", "pool_break_minutes", "status", "created_at", "updated_at", "effective_from", "holiday_policy_json"
  ],
  shift_pattern_steps: [
    "id", "pattern_id", "step_index", "duty_code", "start_time", "end_time", "break_minutes", "created_at"
  ],
  shift_pattern_team_indexes: [
    "id", "pattern_id", "team_label", "team_index", "created_at"
  ],
  shift_pattern_cycles: [
    "id", "pattern_id", "cycle_key", "cycle_name", "cycle_order", "shift_count", "cycle_length", "pattern_code", "pattern_string", "pattern_start_date", "holiday_time_mode", "weekday_public_holiday_as_holiday", "created_at"
  ],
  shift_pattern_cycle_steps: [
    "id", "cycle_id", "step_index", "duty_code", "start_time", "end_time", "break_minutes", "holiday_start_time", "holiday_end_time", "holiday_break_minutes", "created_at"
  ],
  shift_pattern_cycle_team_indexes: [
    "id", "cycle_id", "team_label", "team_index", "created_at"
  ],
  shift_pattern_team_cycles: [
    "id", "pattern_id", "team_label", "cycle_key", "created_at"
  ],
  shift_pattern_team_capacities: [
    "id", "pattern_id", "team_label", "max_headcount", "created_at"
  ],
  shift_pattern_team_settings: [
    "id", "pattern_id", "team_label", "display_name", "work_type", "is_active", "sort_order", "created_at"
  ],
  shift_pattern_duty_types: [
    "id", "pattern_id", "duty_type_id", "kind", "label", "sort_order", "start_time", "end_time", "break_minutes", "is_break_dirty", "holiday_start_time", "holiday_end_time", "holiday_break_minutes", "is_holiday_break_dirty", "created_at"
  ],
  monthly_schedules: [
    "id", "site_id", "schedule_month", "pattern_id", "generated_at", "generated_by", "template_version_id"
  ],
  monthly_schedule_items: [
    "id", "schedule_id", "employee_id", "team_label", "sort_order", "work_date", "duty_code", "start_time", "end_time", "break_minutes"
  ],
  schedule_plan_exports: [
    "id", "schedule_id", "schedule_month", "site_name", "pattern_name", "template_version_id", "template_version_label", "output_file_name", "output_path", "update_count", "publish_status", "published_path", "exported_at"
  ],
  holiday_calendars: [
    "id", "year", "source_name", "source_version", "created_at"
  ],
  holiday_items: [
    "id", "calendar_id", "holiday_date", "name", "is_substitute", "created_at"
  ],
  allowance_rate_versions: [
    "id", "year", "version_label", "status", "effective_from", "effective_to", "change_reason", "created_at", "updated_at"
  ],
  allowance_rate_items: [
    "id", "version_id", "allowance_code", "multiplier", "rounding_policy"
  ],
  allowance_rate_history: [
    "id", "rate_version_id", "year", "version_label", "action_type", "reason", "detail", "occurred_at"
  ],
  app_users: [
    "id", "login_id", "display_name", "role", "status", "password_hash", "must_change_password", "sign_in_failure_count", "sign_in_locked_until", "account_recovery_key_hash", "account_recovery_key_issued_at", "account_recovery_failure_count", "account_recovery_locked_until", "extension_number", "contact", "email", "created_at", "updated_at"
  ],
  access_logs: [
    "id", "user_id", "login_id", "display_name", "role", "action_type", "action_label", "route_key", "route_label", "details", "occurred_at"
  ],
  document_template_versions: [
    "id", "template_type", "version_label", "source_path", "status", "is_default", "output_file_name_pattern", "profile_schema_version", "profile_json", "validation_json", "checksum", "created_at", "updated_at", "approved_at"
  ],
  document_template_history: [
    "id", "template_id", "template_type", "version_label", "action_type", "detail", "occurred_at"
  ],
  policy_revisions: [
    "id", "policy_kind", "version_number", "rule_key", "criteria_json", "implementation_version", "effective_from", "origin", "actor_user_id", "actor_login_id", "actor_display_name", "actor_role", "created_at", "reason"
  ],
  policy_events: [
    "id", "policy_kind", "revision_id", "event_type", "replacement_revision_id", "before_json", "after_json", "actor_user_id", "actor_login_id", "actor_display_name", "actor_role", "occurred_at", "related_approval_id"
  ],
  performance_files: [
    "id", "file_name", "file_path", "directory_type", "template_kind", "template_variant", "sheet_name", "row_count", "column_count", "file_size", "modified_time_ms", "duplicate_key", "received_at", "schedule_month", "site_name", "schedule_key", "entry_count", "approved_entry_count", "warning_count", "is_effective", "completed_at", "status", "error_message", "preview_json", "reparse_marker_snapshot_json", "policy_context_fingerprint"
  ],
  performance_entries: [
    "id", "performance_file_id", "logical_key", "employee_code", "employee_name", "employee_rank", "work_date", "work_hours", "schedule_month", "schedule_key", "site_name", "work_type", "section", "duty_code", "start_time", "end_time", "break_minutes", "total_work_minutes", "base_work_minutes", "overtime_minutes", "night_minutes", "department", "category", "reason_text", "evidence_text", "source_signature", "source_row_number", "sort_order", "team_label", "alert_json", "hourly_rate", "note", "is_pool_worker", "substitute_work_type", "target_work_type", "substitute_allowance_eligible", "substitute_allowance_reason_code", "substitute_allowance_policy_version", "policy_snapshot_json"
  ],
  performance_approvals: [
    "id", "file_id", "entry_id", "logical_key", "file_name", "schedule_key", "employee_code", "employee_name", "work_date", "work_type", "decision", "processed_at", "processed_by", "processed_by_name", "comment", "rejection_reason", "snapshot_json", "archived_file_name", "archived_file_path"
  ],
  hidden_approved_performance_rows: [
    "id", "approval_id", "logical_key", "file_id", "entry_id", "hidden_at", "hidden_by", "hidden_by_name"
  ],
  allowance_calculations: [
    "id", "performance_approval_id", "performance_entry_id", "calculation_version", "status", "file_id", "file_name", "site_name", "employee_code", "employee_name", "employee_rank", "work_date", "work_type", "hourly_rate", "rate_version_id", "rate_version_label", "total_work_minutes", "base_work_minutes", "overtime_minutes", "night_minutes", "holiday_minutes", "substitute_minutes", "total_allowance_amount", "early_payout_date", "signature", "snapshot_json", "created_at"
  ],
  allowance_calculation_items: [
    "id", "calculation_id", "allowance_code", "work_minutes", "multiplier", "amount", "detail_json"
  ],
  allowance_document_exports: [
    "id", "work_month", "output_format", "calculation_ids_json", "calculation_count", "employee_count", "total_allowance_amount", "proposal_template_version_id", "attachment1_template_version_id", "attachment2_template_version_id", "proposal_file_name", "proposal_path", "attachment1_file_name", "attachment1_path", "attachment2_file_name", "attachment2_path", "exported_at"
  ],
  allowance_approvals: [
    "id", "calculation_id", "work_month", "site_name", "employee_code", "employee_name", "work_date", "work_type", "decision", "processed_at", "processed_by", "processed_by_name", "comment"
  ],
  allowance_proposal_approvals: [
    "id", "work_month", "calculation_ids_json", "calculation_count", "employee_count", "total_allowance_amount", "regular_total_allowance_amount", "early_payout_total_allowance_amount", "export_record_id", "output_format", "approved_at", "approved_by", "approved_by_name", "comment", "preview_snapshot_json", "backup_summary_json"
  ],
  app_setting_entries: [
    "setting_key", "value", "updated_at"
  ]
};

type ColumnDeclaredType = "TEXT" | "INTEGER" | "REAL";

interface TableColumnContract {
  name: string;
  declaredType: ColumnDeclaredType;
  notNull: boolean;
}

const TABLE_COLUMN_CONTRACTS: Record<string, readonly TableColumnContract[]> = {
  performance_return_history: ["id", "file_id", "occurred_at", "actor_user_id", "actor_name", "reason", "snapshot_json", "snapshot_sha256"].map(name => ({ name, declaredType: "TEXT", notNull: true })),
  sites: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "site_code", declaredType: "TEXT", notNull: true },
    { name: "name", declaredType: "TEXT", notNull: true },
    { name: "customer_name", declaredType: "TEXT", notNull: false },
    { name: "status", declaredType: "TEXT", notNull: true },
    { name: "timezone", declaredType: "TEXT", notNull: true },
    { name: "deleted_at", declaredType: "TEXT", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
    { name: "updated_at", declaredType: "TEXT", notNull: false },
  ],
  employees: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "employee_code", declaredType: "TEXT", notNull: true },
    { name: "name", declaredType: "TEXT", notNull: true },
    { name: "contact", declaredType: "TEXT", notNull: false },
    { name: "email", declaredType: "TEXT", notNull: false },
    { name: "rank", declaredType: "TEXT", notNull: false },
    { name: "employment_type", declaredType: "TEXT", notNull: true },
    { name: "status", declaredType: "TEXT", notNull: true },
    { name: "hire_date", declaredType: "TEXT", notNull: false },
    { name: "retire_date", declaredType: "TEXT", notNull: false },
    { name: "deleted_at", declaredType: "TEXT", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
    { name: "updated_at", declaredType: "TEXT", notNull: false },
  ],
  employee_employment_periods: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "employee_id", declaredType: "TEXT", notNull: true },
    { name: "start_date", declaredType: "TEXT", notNull: true },
    { name: "end_date", declaredType: "TEXT", notNull: false },
    { name: "closure_provenance_complete", declaredType: "INTEGER", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
    { name: "updated_at", declaredType: "TEXT", notNull: false },
  ],
  employee_site_assignments: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "employee_id", declaredType: "TEXT", notNull: true },
    { name: "employment_period_id", declaredType: "TEXT", notNull: false },
    { name: "site_id", declaredType: "TEXT", notNull: true },
    { name: "team_name", declaredType: "TEXT", notNull: false },
    { name: "shift_group", declaredType: "TEXT", notNull: false },
    { name: "sort_order", declaredType: "INTEGER", notNull: true },
    { name: "start_date", declaredType: "TEXT", notNull: true },
    { name: "end_date", declaredType: "TEXT", notNull: false },
    { name: "status", declaredType: "TEXT", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  wage_rates: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "employee_id", declaredType: "TEXT", notNull: true },
    { name: "employment_period_id", declaredType: "TEXT", notNull: false },
    { name: "hourly_rate", declaredType: "INTEGER", notNull: true },
    { name: "effective_from", declaredType: "TEXT", notNull: true },
    { name: "effective_to", declaredType: "TEXT", notNull: false },
    { name: "reason", declaredType: "TEXT", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  wage_rate_history: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "wage_rate_id", declaredType: "TEXT", notNull: true },
    { name: "employee_id", declaredType: "TEXT", notNull: true },
    { name: "employment_period_id", declaredType: "TEXT", notNull: false },
    { name: "employee_code", declaredType: "TEXT", notNull: false },
    { name: "employee_name", declaredType: "TEXT", notNull: false },
    { name: "action_type", declaredType: "TEXT", notNull: true },
    { name: "hourly_rate", declaredType: "REAL", notNull: true },
    { name: "effective_from", declaredType: "TEXT", notNull: true },
    { name: "effective_to", declaredType: "TEXT", notNull: false },
    { name: "wage_reason", declaredType: "TEXT", notNull: false },
    { name: "change_reason", declaredType: "TEXT", notNull: true },
    { name: "actor_user_id", declaredType: "TEXT", notNull: true },
    { name: "actor_login_id", declaredType: "TEXT", notNull: true },
    { name: "actor_display_name", declaredType: "TEXT", notNull: true },
    { name: "actor_role", declaredType: "TEXT", notNull: true },
    { name: "occurred_at", declaredType: "TEXT", notNull: true },
  ],
  employee_retirement_history_closures: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "employment_period_id", declaredType: "TEXT", notNull: true },
    { name: "history_kind", declaredType: "TEXT", notNull: true },
    { name: "history_id", declaredType: "TEXT", notNull: true },
    { name: "previous_status", declaredType: "TEXT", notNull: false },
    { name: "previous_end_date", declaredType: "TEXT", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  employee_employment_period_events: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "employee_id", declaredType: "TEXT", notNull: true },
    { name: "employment_period_id", declaredType: "TEXT", notNull: true },
    { name: "event_type", declaredType: "TEXT", notNull: true },
    { name: "event_date", declaredType: "TEXT", notNull: true },
    { name: "previous_event_date", declaredType: "TEXT", notNull: false },
    { name: "reason", declaredType: "TEXT", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  shift_patterns: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "site_id", declaredType: "TEXT", notNull: true },
    { name: "name", declaredType: "TEXT", notNull: true },
    { name: "team_count", declaredType: "INTEGER", notNull: true },
    { name: "cycle_length", declaredType: "INTEGER", notNull: true },
    { name: "pattern_code", declaredType: "TEXT", notNull: true },
    { name: "start_index_rule", declaredType: "TEXT", notNull: true },
    { name: "pattern_start_date", declaredType: "TEXT", notNull: false },
    { name: "pool_enabled", declaredType: "INTEGER", notNull: true },
    { name: "pool_start_time", declaredType: "TEXT", notNull: false },
    { name: "pool_end_time", declaredType: "TEXT", notNull: false },
    { name: "pool_break_minutes", declaredType: "INTEGER", notNull: true },
    { name: "status", declaredType: "TEXT", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
    { name: "updated_at", declaredType: "TEXT", notNull: false },
    { name: "effective_from", declaredType: "TEXT", notNull: false },
    { name: "holiday_policy_json", declaredType: "TEXT", notNull: false },
  ],
  shift_pattern_steps: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "pattern_id", declaredType: "TEXT", notNull: true },
    { name: "step_index", declaredType: "INTEGER", notNull: true },
    { name: "duty_code", declaredType: "TEXT", notNull: true },
    { name: "start_time", declaredType: "TEXT", notNull: false },
    { name: "end_time", declaredType: "TEXT", notNull: false },
    { name: "break_minutes", declaredType: "INTEGER", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  shift_pattern_team_indexes: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "pattern_id", declaredType: "TEXT", notNull: true },
    { name: "team_label", declaredType: "TEXT", notNull: true },
    { name: "team_index", declaredType: "INTEGER", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  shift_pattern_cycles: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "pattern_id", declaredType: "TEXT", notNull: true },
    { name: "cycle_key", declaredType: "TEXT", notNull: true },
    { name: "cycle_name", declaredType: "TEXT", notNull: true },
    { name: "cycle_order", declaredType: "INTEGER", notNull: true },
    { name: "shift_count", declaredType: "INTEGER", notNull: true },
    { name: "cycle_length", declaredType: "INTEGER", notNull: true },
    { name: "pattern_code", declaredType: "TEXT", notNull: true },
    { name: "pattern_string", declaredType: "TEXT", notNull: false },
    { name: "pattern_start_date", declaredType: "TEXT", notNull: false },
    { name: "holiday_time_mode", declaredType: "TEXT", notNull: false },
    { name: "weekday_public_holiday_as_holiday", declaredType: "INTEGER", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  shift_pattern_cycle_steps: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "cycle_id", declaredType: "TEXT", notNull: true },
    { name: "step_index", declaredType: "INTEGER", notNull: true },
    { name: "duty_code", declaredType: "TEXT", notNull: true },
    { name: "start_time", declaredType: "TEXT", notNull: false },
    { name: "end_time", declaredType: "TEXT", notNull: false },
    { name: "break_minutes", declaredType: "INTEGER", notNull: true },
    { name: "holiday_start_time", declaredType: "TEXT", notNull: false },
    { name: "holiday_end_time", declaredType: "TEXT", notNull: false },
    { name: "holiday_break_minutes", declaredType: "INTEGER", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  shift_pattern_cycle_team_indexes: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "cycle_id", declaredType: "TEXT", notNull: true },
    { name: "team_label", declaredType: "TEXT", notNull: true },
    { name: "team_index", declaredType: "INTEGER", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  shift_pattern_team_cycles: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "pattern_id", declaredType: "TEXT", notNull: true },
    { name: "team_label", declaredType: "TEXT", notNull: true },
    { name: "cycle_key", declaredType: "TEXT", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  shift_pattern_team_capacities: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "pattern_id", declaredType: "TEXT", notNull: true },
    { name: "team_label", declaredType: "TEXT", notNull: true },
    { name: "max_headcount", declaredType: "INTEGER", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  shift_pattern_team_settings: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "pattern_id", declaredType: "TEXT", notNull: true },
    { name: "team_label", declaredType: "TEXT", notNull: true },
    { name: "display_name", declaredType: "TEXT", notNull: false },
    { name: "work_type", declaredType: "TEXT", notNull: true },
    { name: "is_active", declaredType: "INTEGER", notNull: true },
    { name: "sort_order", declaredType: "INTEGER", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  shift_pattern_duty_types: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "pattern_id", declaredType: "TEXT", notNull: true },
    { name: "duty_type_id", declaredType: "TEXT", notNull: true },
    { name: "kind", declaredType: "TEXT", notNull: true },
    { name: "label", declaredType: "TEXT", notNull: true },
    { name: "sort_order", declaredType: "INTEGER", notNull: true },
    { name: "start_time", declaredType: "TEXT", notNull: false },
    { name: "end_time", declaredType: "TEXT", notNull: false },
    { name: "break_minutes", declaredType: "INTEGER", notNull: true },
    { name: "is_break_dirty", declaredType: "INTEGER", notNull: true },
    { name: "holiday_start_time", declaredType: "TEXT", notNull: false },
    { name: "holiday_end_time", declaredType: "TEXT", notNull: false },
    { name: "holiday_break_minutes", declaredType: "INTEGER", notNull: false },
    { name: "is_holiday_break_dirty", declaredType: "INTEGER", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  monthly_schedules: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "site_id", declaredType: "TEXT", notNull: true },
    { name: "schedule_month", declaredType: "TEXT", notNull: true },
    { name: "pattern_id", declaredType: "TEXT", notNull: true },
    { name: "generated_at", declaredType: "TEXT", notNull: true },
    { name: "generated_by", declaredType: "TEXT", notNull: true },
    { name: "template_version_id", declaredType: "TEXT", notNull: false },
  ],
  monthly_schedule_items: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "schedule_id", declaredType: "TEXT", notNull: true },
    { name: "employee_id", declaredType: "TEXT", notNull: true },
    { name: "team_label", declaredType: "TEXT", notNull: false },
    { name: "sort_order", declaredType: "INTEGER", notNull: true },
    { name: "work_date", declaredType: "TEXT", notNull: true },
    { name: "duty_code", declaredType: "TEXT", notNull: true },
    { name: "start_time", declaredType: "TEXT", notNull: false },
    { name: "end_time", declaredType: "TEXT", notNull: false },
    { name: "break_minutes", declaredType: "INTEGER", notNull: true },
  ],
  schedule_plan_exports: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "schedule_id", declaredType: "TEXT", notNull: true },
    { name: "schedule_month", declaredType: "TEXT", notNull: true },
    { name: "site_name", declaredType: "TEXT", notNull: true },
    { name: "pattern_name", declaredType: "TEXT", notNull: true },
    { name: "template_version_id", declaredType: "TEXT", notNull: false },
    { name: "template_version_label", declaredType: "TEXT", notNull: false },
    { name: "output_file_name", declaredType: "TEXT", notNull: true },
    { name: "output_path", declaredType: "TEXT", notNull: true },
    { name: "update_count", declaredType: "INTEGER", notNull: true },
    { name: "publish_status", declaredType: "TEXT", notNull: true },
    { name: "published_path", declaredType: "TEXT", notNull: false },
    { name: "exported_at", declaredType: "TEXT", notNull: true },
  ],
  holiday_calendars: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "year", declaredType: "INTEGER", notNull: true },
    { name: "source_name", declaredType: "TEXT", notNull: true },
    { name: "source_version", declaredType: "TEXT", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  holiday_items: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "calendar_id", declaredType: "TEXT", notNull: true },
    { name: "holiday_date", declaredType: "TEXT", notNull: true },
    { name: "name", declaredType: "TEXT", notNull: true },
    { name: "is_substitute", declaredType: "INTEGER", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  allowance_rate_versions: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "year", declaredType: "INTEGER", notNull: true },
    { name: "version_label", declaredType: "TEXT", notNull: true },
    { name: "status", declaredType: "TEXT", notNull: true },
    { name: "effective_from", declaredType: "TEXT", notNull: true },
    { name: "effective_to", declaredType: "TEXT", notNull: false },
    { name: "change_reason", declaredType: "TEXT", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
    { name: "updated_at", declaredType: "TEXT", notNull: false },
  ],
  allowance_rate_items: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "version_id", declaredType: "TEXT", notNull: true },
    { name: "allowance_code", declaredType: "TEXT", notNull: true },
    { name: "multiplier", declaredType: "REAL", notNull: true },
    { name: "rounding_policy", declaredType: "TEXT", notNull: true },
  ],
  allowance_rate_history: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "rate_version_id", declaredType: "TEXT", notNull: true },
    { name: "year", declaredType: "INTEGER", notNull: true },
    { name: "version_label", declaredType: "TEXT", notNull: true },
    { name: "action_type", declaredType: "TEXT", notNull: true },
    { name: "reason", declaredType: "TEXT", notNull: true },
    { name: "detail", declaredType: "TEXT", notNull: false },
    { name: "occurred_at", declaredType: "TEXT", notNull: true },
  ],
  app_users: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "login_id", declaredType: "TEXT", notNull: true },
    { name: "display_name", declaredType: "TEXT", notNull: true },
    { name: "role", declaredType: "TEXT", notNull: true },
    { name: "status", declaredType: "TEXT", notNull: true },
    { name: "password_hash", declaredType: "TEXT", notNull: false },
    { name: "must_change_password", declaredType: "INTEGER", notNull: true },
    { name: "sign_in_failure_count", declaredType: "INTEGER", notNull: true },
    { name: "sign_in_locked_until", declaredType: "TEXT", notNull: false },
    { name: "account_recovery_key_hash", declaredType: "TEXT", notNull: false },
    { name: "account_recovery_key_issued_at", declaredType: "TEXT", notNull: false },
    { name: "account_recovery_failure_count", declaredType: "INTEGER", notNull: true },
    { name: "account_recovery_locked_until", declaredType: "TEXT", notNull: false },
    { name: "extension_number", declaredType: "TEXT", notNull: false },
    { name: "contact", declaredType: "TEXT", notNull: false },
    { name: "email", declaredType: "TEXT", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
    { name: "updated_at", declaredType: "TEXT", notNull: false },
  ],
  access_logs: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "user_id", declaredType: "TEXT", notNull: true },
    { name: "login_id", declaredType: "TEXT", notNull: true },
    { name: "display_name", declaredType: "TEXT", notNull: true },
    { name: "role", declaredType: "TEXT", notNull: true },
    { name: "action_type", declaredType: "TEXT", notNull: true },
    { name: "action_label", declaredType: "TEXT", notNull: true },
    { name: "route_key", declaredType: "TEXT", notNull: false },
    { name: "route_label", declaredType: "TEXT", notNull: false },
    { name: "details", declaredType: "TEXT", notNull: false },
    { name: "occurred_at", declaredType: "TEXT", notNull: true },
  ],
  document_template_versions: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "template_type", declaredType: "TEXT", notNull: true },
    { name: "version_label", declaredType: "TEXT", notNull: true },
    { name: "source_path", declaredType: "TEXT", notNull: true },
    { name: "status", declaredType: "TEXT", notNull: true },
    { name: "is_default", declaredType: "INTEGER", notNull: true },
    { name: "output_file_name_pattern", declaredType: "TEXT", notNull: false },
    { name: "profile_schema_version", declaredType: "TEXT", notNull: false },
    { name: "profile_json", declaredType: "TEXT", notNull: false },
    { name: "validation_json", declaredType: "TEXT", notNull: false },
    { name: "checksum", declaredType: "TEXT", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
    { name: "updated_at", declaredType: "TEXT", notNull: false },
    { name: "approved_at", declaredType: "TEXT", notNull: false },
  ],
  document_template_history: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "template_id", declaredType: "TEXT", notNull: true },
    { name: "template_type", declaredType: "TEXT", notNull: true },
    { name: "version_label", declaredType: "TEXT", notNull: true },
    { name: "action_type", declaredType: "TEXT", notNull: true },
    { name: "detail", declaredType: "TEXT", notNull: false },
    { name: "occurred_at", declaredType: "TEXT", notNull: true },
  ],
  policy_revisions: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "policy_kind", declaredType: "TEXT", notNull: true },
    { name: "version_number", declaredType: "INTEGER", notNull: true },
    { name: "rule_key", declaredType: "TEXT", notNull: true },
    { name: "criteria_json", declaredType: "TEXT", notNull: true },
    { name: "implementation_version", declaredType: "TEXT", notNull: true },
    { name: "effective_from", declaredType: "TEXT", notNull: false },
    { name: "origin", declaredType: "TEXT", notNull: true },
    { name: "actor_user_id", declaredType: "TEXT", notNull: false },
    { name: "actor_login_id", declaredType: "TEXT", notNull: false },
    { name: "actor_display_name", declaredType: "TEXT", notNull: false },
    { name: "actor_role", declaredType: "TEXT", notNull: false },
    { name: "created_at", declaredType: "TEXT", notNull: true },
    { name: "reason", declaredType: "TEXT", notNull: true },
  ],
  policy_events: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "policy_kind", declaredType: "TEXT", notNull: true },
    { name: "revision_id", declaredType: "TEXT", notNull: true },
    { name: "event_type", declaredType: "TEXT", notNull: true },
    { name: "replacement_revision_id", declaredType: "TEXT", notNull: false },
    { name: "before_json", declaredType: "TEXT", notNull: false },
    { name: "after_json", declaredType: "TEXT", notNull: false },
    { name: "actor_user_id", declaredType: "TEXT", notNull: false },
    { name: "actor_login_id", declaredType: "TEXT", notNull: false },
    { name: "actor_display_name", declaredType: "TEXT", notNull: false },
    { name: "actor_role", declaredType: "TEXT", notNull: false },
    { name: "occurred_at", declaredType: "TEXT", notNull: true },
    { name: "related_approval_id", declaredType: "TEXT", notNull: false },
  ],
  performance_files: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "file_name", declaredType: "TEXT", notNull: true },
    { name: "file_path", declaredType: "TEXT", notNull: true },
    { name: "directory_type", declaredType: "TEXT", notNull: true },
    { name: "template_kind", declaredType: "TEXT", notNull: true },
    { name: "template_variant", declaredType: "TEXT", notNull: false },
    { name: "sheet_name", declaredType: "TEXT", notNull: true },
    { name: "row_count", declaredType: "INTEGER", notNull: true },
    { name: "column_count", declaredType: "INTEGER", notNull: true },
    { name: "file_size", declaredType: "INTEGER", notNull: true },
    { name: "modified_time_ms", declaredType: "INTEGER", notNull: true },
    { name: "duplicate_key", declaredType: "TEXT", notNull: true },
    { name: "received_at", declaredType: "TEXT", notNull: true },
    { name: "schedule_month", declaredType: "TEXT", notNull: false },
    { name: "site_name", declaredType: "TEXT", notNull: false },
    { name: "schedule_key", declaredType: "TEXT", notNull: false },
    { name: "entry_count", declaredType: "INTEGER", notNull: true },
    { name: "approved_entry_count", declaredType: "INTEGER", notNull: true },
    { name: "warning_count", declaredType: "INTEGER", notNull: true },
    { name: "is_effective", declaredType: "INTEGER", notNull: true },
    { name: "completed_at", declaredType: "TEXT", notNull: false },
    { name: "status", declaredType: "TEXT", notNull: true },
    { name: "error_message", declaredType: "TEXT", notNull: false },
    { name: "preview_json", declaredType: "TEXT", notNull: true },
    { name: "reparse_marker_snapshot_json", declaredType: "TEXT", notNull: false },
    { name: "policy_context_fingerprint", declaredType: "TEXT", notNull: false },
  ],
  performance_entries: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "performance_file_id", declaredType: "TEXT", notNull: true },
    { name: "logical_key", declaredType: "TEXT", notNull: true },
    { name: "employee_code", declaredType: "TEXT", notNull: true },
    { name: "employee_name", declaredType: "TEXT", notNull: true },
    { name: "employee_rank", declaredType: "TEXT", notNull: false },
    { name: "work_date", declaredType: "TEXT", notNull: true },
    { name: "work_hours", declaredType: "REAL", notNull: true },
    { name: "schedule_month", declaredType: "TEXT", notNull: false },
    { name: "schedule_key", declaredType: "TEXT", notNull: false },
    { name: "site_name", declaredType: "TEXT", notNull: false },
    { name: "work_type", declaredType: "TEXT", notNull: false },
    { name: "section", declaredType: "TEXT", notNull: false },
    { name: "duty_code", declaredType: "TEXT", notNull: false },
    { name: "start_time", declaredType: "TEXT", notNull: false },
    { name: "end_time", declaredType: "TEXT", notNull: false },
    { name: "break_minutes", declaredType: "INTEGER", notNull: true },
    { name: "total_work_minutes", declaredType: "INTEGER", notNull: true },
    { name: "base_work_minutes", declaredType: "INTEGER", notNull: true },
    { name: "overtime_minutes", declaredType: "INTEGER", notNull: true },
    { name: "night_minutes", declaredType: "INTEGER", notNull: true },
    { name: "department", declaredType: "TEXT", notNull: false },
    { name: "category", declaredType: "TEXT", notNull: false },
    { name: "reason_text", declaredType: "TEXT", notNull: false },
    { name: "evidence_text", declaredType: "TEXT", notNull: false },
    { name: "source_signature", declaredType: "TEXT", notNull: false },
    { name: "source_row_number", declaredType: "INTEGER", notNull: false },
    { name: "sort_order", declaredType: "INTEGER", notNull: true },
    { name: "team_label", declaredType: "TEXT", notNull: false },
    { name: "alert_json", declaredType: "TEXT", notNull: false },
    { name: "hourly_rate", declaredType: "REAL", notNull: false },
    { name: "note", declaredType: "TEXT", notNull: false },
    { name: "is_pool_worker", declaredType: "INTEGER", notNull: true },
    { name: "substitute_work_type", declaredType: "TEXT", notNull: false },
    { name: "target_work_type", declaredType: "TEXT", notNull: false },
    { name: "substitute_allowance_eligible", declaredType: "INTEGER", notNull: false },
    { name: "substitute_allowance_reason_code", declaredType: "TEXT", notNull: false },
    { name: "substitute_allowance_policy_version", declaredType: "TEXT", notNull: false },
    { name: "policy_snapshot_json", declaredType: "TEXT", notNull: false },
  ],
  performance_approvals: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "file_id", declaredType: "TEXT", notNull: true },
    { name: "entry_id", declaredType: "TEXT", notNull: true },
    { name: "logical_key", declaredType: "TEXT", notNull: false },
    { name: "file_name", declaredType: "TEXT", notNull: true },
    { name: "schedule_key", declaredType: "TEXT", notNull: false },
    { name: "employee_code", declaredType: "TEXT", notNull: false },
    { name: "employee_name", declaredType: "TEXT", notNull: false },
    { name: "work_date", declaredType: "TEXT", notNull: false },
    { name: "work_type", declaredType: "TEXT", notNull: false },
    { name: "decision", declaredType: "TEXT", notNull: true },
    { name: "processed_at", declaredType: "TEXT", notNull: true },
    { name: "processed_by", declaredType: "TEXT", notNull: true },
    { name: "processed_by_name", declaredType: "TEXT", notNull: true },
    { name: "comment", declaredType: "TEXT", notNull: false },
    { name: "rejection_reason", declaredType: "TEXT", notNull: false },
    { name: "snapshot_json", declaredType: "TEXT", notNull: false },
    { name: "archived_file_name", declaredType: "TEXT", notNull: false },
    { name: "archived_file_path", declaredType: "TEXT", notNull: false },
  ],
  hidden_approved_performance_rows: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "approval_id", declaredType: "TEXT", notNull: true },
    { name: "logical_key", declaredType: "TEXT", notNull: true },
    { name: "file_id", declaredType: "TEXT", notNull: true },
    { name: "entry_id", declaredType: "TEXT", notNull: true },
    { name: "hidden_at", declaredType: "TEXT", notNull: true },
    { name: "hidden_by", declaredType: "TEXT", notNull: true },
    { name: "hidden_by_name", declaredType: "TEXT", notNull: true },
  ],
  allowance_calculations: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "performance_approval_id", declaredType: "TEXT", notNull: true },
    { name: "performance_entry_id", declaredType: "TEXT", notNull: false },
    { name: "calculation_version", declaredType: "INTEGER", notNull: true },
    { name: "status", declaredType: "TEXT", notNull: true },
    { name: "file_id", declaredType: "TEXT", notNull: true },
    { name: "file_name", declaredType: "TEXT", notNull: true },
    { name: "site_name", declaredType: "TEXT", notNull: false },
    { name: "employee_code", declaredType: "TEXT", notNull: false },
    { name: "employee_name", declaredType: "TEXT", notNull: true },
    { name: "employee_rank", declaredType: "TEXT", notNull: false },
    { name: "work_date", declaredType: "TEXT", notNull: true },
    { name: "work_type", declaredType: "TEXT", notNull: false },
    { name: "hourly_rate", declaredType: "REAL", notNull: false },
    { name: "rate_version_id", declaredType: "TEXT", notNull: true },
    { name: "rate_version_label", declaredType: "TEXT", notNull: true },
    { name: "total_work_minutes", declaredType: "INTEGER", notNull: true },
    { name: "base_work_minutes", declaredType: "INTEGER", notNull: true },
    { name: "overtime_minutes", declaredType: "INTEGER", notNull: true },
    { name: "night_minutes", declaredType: "INTEGER", notNull: true },
    { name: "holiday_minutes", declaredType: "INTEGER", notNull: true },
    { name: "substitute_minutes", declaredType: "INTEGER", notNull: true },
    { name: "total_allowance_amount", declaredType: "INTEGER", notNull: true },
    { name: "early_payout_date", declaredType: "TEXT", notNull: false },
    { name: "signature", declaredType: "TEXT", notNull: true },
    { name: "snapshot_json", declaredType: "TEXT", notNull: true },
    { name: "created_at", declaredType: "TEXT", notNull: true },
  ],
  allowance_calculation_items: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "calculation_id", declaredType: "TEXT", notNull: true },
    { name: "allowance_code", declaredType: "TEXT", notNull: true },
    { name: "work_minutes", declaredType: "INTEGER", notNull: true },
    { name: "multiplier", declaredType: "REAL", notNull: true },
    { name: "amount", declaredType: "INTEGER", notNull: true },
    { name: "detail_json", declaredType: "TEXT", notNull: false },
  ],
  allowance_document_exports: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "work_month", declaredType: "TEXT", notNull: true },
    { name: "output_format", declaredType: "TEXT", notNull: true },
    { name: "calculation_ids_json", declaredType: "TEXT", notNull: true },
    { name: "calculation_count", declaredType: "INTEGER", notNull: true },
    { name: "employee_count", declaredType: "INTEGER", notNull: true },
    { name: "total_allowance_amount", declaredType: "INTEGER", notNull: true },
    { name: "proposal_template_version_id", declaredType: "TEXT", notNull: false },
    { name: "attachment1_template_version_id", declaredType: "TEXT", notNull: false },
    { name: "attachment2_template_version_id", declaredType: "TEXT", notNull: false },
    { name: "proposal_file_name", declaredType: "TEXT", notNull: true },
    { name: "proposal_path", declaredType: "TEXT", notNull: true },
    { name: "attachment1_file_name", declaredType: "TEXT", notNull: true },
    { name: "attachment1_path", declaredType: "TEXT", notNull: true },
    { name: "attachment2_file_name", declaredType: "TEXT", notNull: true },
    { name: "attachment2_path", declaredType: "TEXT", notNull: true },
    { name: "exported_at", declaredType: "TEXT", notNull: true },
  ],
  allowance_approvals: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "calculation_id", declaredType: "TEXT", notNull: true },
    { name: "work_month", declaredType: "TEXT", notNull: true },
    { name: "site_name", declaredType: "TEXT", notNull: false },
    { name: "employee_code", declaredType: "TEXT", notNull: false },
    { name: "employee_name", declaredType: "TEXT", notNull: true },
    { name: "work_date", declaredType: "TEXT", notNull: true },
    { name: "work_type", declaredType: "TEXT", notNull: false },
    { name: "decision", declaredType: "TEXT", notNull: true },
    { name: "processed_at", declaredType: "TEXT", notNull: true },
    { name: "processed_by", declaredType: "TEXT", notNull: true },
    { name: "processed_by_name", declaredType: "TEXT", notNull: true },
    { name: "comment", declaredType: "TEXT", notNull: false },
  ],
  allowance_proposal_approvals: [
    { name: "id", declaredType: "TEXT", notNull: false },
    { name: "work_month", declaredType: "TEXT", notNull: true },
    { name: "calculation_ids_json", declaredType: "TEXT", notNull: true },
    { name: "calculation_count", declaredType: "INTEGER", notNull: true },
    { name: "employee_count", declaredType: "INTEGER", notNull: true },
    { name: "total_allowance_amount", declaredType: "INTEGER", notNull: true },
    { name: "regular_total_allowance_amount", declaredType: "INTEGER", notNull: true },
    { name: "early_payout_total_allowance_amount", declaredType: "INTEGER", notNull: true },
    { name: "export_record_id", declaredType: "TEXT", notNull: true },
    { name: "output_format", declaredType: "TEXT", notNull: true },
    { name: "approved_at", declaredType: "TEXT", notNull: true },
    { name: "approved_by", declaredType: "TEXT", notNull: true },
    { name: "approved_by_name", declaredType: "TEXT", notNull: true },
    { name: "comment", declaredType: "TEXT", notNull: false },
    { name: "preview_snapshot_json", declaredType: "TEXT", notNull: true },
    { name: "backup_summary_json", declaredType: "TEXT", notNull: true },
  ],
  app_setting_entries: [
    { name: "setting_key", declaredType: "TEXT", notNull: false },
    { name: "value", declaredType: "TEXT", notNull: true },
    { name: "updated_at", declaredType: "TEXT", notNull: true },
  ],
};

const SITE_NAME_OPTIONS_SETTING_KEY = "site_name_options_json";

const KNOWN_SETTING_KEYS = new Set([
  SITE_NAME_OPTIONS_SETTING_KEY,
  PATTERN_PRESETS_SETTING_KEY,
  // 1. 설치 대상 기기의 경로 (7개)
  "pending_dir",
  "approved_dir",
  "schedule_export_dir",
  "allowance_proposal_export_dir",
  "allowance_attachment1_export_dir",
  "allowance_attachment2_export_dir",
  "database_backup_dir",
  // 2. 이번에 선택한 입력 (1개)
  "migration_file_path",
  // 3. 설치 대상 기기의 운영 설정 (6개)
  "holiday_api_base_url",
  "database_backup_schedule",
  "database_backup_time",
  "update_last_seen_patch_note_version",
  "update_last_skipped_version",
  "substitute_allowance_policy_reparse_marker",
  // 4. 업무 규칙 (6개 - 선택 JSON에서 필수 제공)
  "schedule_consecutive_night_limit",
  "schedule_minimum_rest_minutes",
  "schedule_require_weekly_holiday",
  "schedule_weekly_max_minutes",
  "substitute_allowance_policy_effective_from",
  "changed_slot_priority_effective_from"
]);

const BUSINESS_RULE_KEYS = [
  "schedule_consecutive_night_limit",
  "schedule_minimum_rest_minutes",
  "schedule_require_weekly_holiday",
  "schedule_weekly_max_minutes",
  "substitute_allowance_policy_effective_from",
  "changed_slot_priority_effective_from"
] as const;

// V1 구판의 작업 재개 정보는 PC별 임시 상태다. 새 PC에서는 이어 쓰지 않고
// 지원되는 미승인 재분석 요청으로 바꾼다. 그 밖의 미인지 설정은 계속 거절한다.
const LEGACY_REPARSE_SETTING_KEYS = new Set(
  ["substitute_allowance_policy", "employee_master", "team_work_type", "monthly_schedule", "wage_rate"]
    .flatMap(prefix => [`${prefix}_reparse_marker`, `${prefix}_reparse_progress`])
);

interface NormalizedJsonBackupSnapshot {
  schemaVersion: number;
  createdAt: string;
  tables: Record<string, Array<Record<string, unknown>>>;
  sourceTableCount: number;
  compatibilityWarnings: string[];
  legacyReparseRequested: boolean;
}

interface PreviewTokenEntry {
  token: string;
  backupFilePath: string;
  backupSha256: string;
  databaseFingerprint: string;
  expiresAt: number;
}

// 10분 TTL 인메모리 토큰 저장소
const previewTokens = new Map<string, PreviewTokenEntry>();
const TOKEN_TTL_MS = 10 * 60 * 1000;

const purgeExpiredTokens = () => {
  const now = Date.now();
  for (const [token, entry] of previewTokens.entries()) {
    if (entry.expiresAt <= now) {
      previewTokens.delete(token);
    }
  }
};

const getRequiredDatabase = (): DatabaseSync => {
  const database = getSqliteDatabase();
  if (!database) {
    throw new Error("데이터베이스가 초기화되지 않았습니다.");
  }
  return database;
};

const listUserTableNames = (database: DatabaseSync): string[] => {
  return (
    database
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
};

const computeFileSha256 = (filePath: string): string => {
  const bytes = readFileSync(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
};

const serializeValue = (val: unknown): string => {
  if (val === null || val === undefined) {
    return "N";
  }
  if (typeof val === "number") {
    return `F:${Number.isFinite(val) ? val.toString() : String(val)}`;
  }
  if (typeof val === "bigint") {
    return `I:${val.toString()}`;
  }
  if (typeof val === "boolean") {
    return `B:${val ? "1" : "0"}`;
  }
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    const hex = Buffer.from(val).toString("hex");
    return `X:${hex.length}:${hex}`;
  }
  const str = String(val);
  const buf = Buffer.from(str, "utf8");
  return `S:${buf.length}:${str}`;
};

const serializeRow = (row: Record<string, unknown>, sortedColumns: string[]): string => {
  const parts: string[] = [];
  for (const col of sortedColumns) {
    const serializedVal = serializeValue(row[col]);
    parts.push(`${col.length}:${col}:${serializedVal}`);
  }
  return parts.join("|");
};

/**
 * 40개 표의 스키마와 모든 행 내용(값)을 반영하는 지문을 산출한다.
 * 타입·길이 접두어 및 행 정렬을 적용하여 구분자 충돌 및 행 순서 의존성을 원천 차단한다.
 */
export const computeDatabaseContentFingerprint = (database: DatabaseSync): string => {
  const hash = crypto.createHash("sha256");
  const tableNames = listUserTableNames(database).sort();

  for (const tableName of tableNames) {
    const pragmaColumns = (
      database.prepare(`PRAGMA table_info("${tableName.replace(/"/g, '""')}")`).all() as Array<{
        name: string;
      }>
    ).map((col) => col.name).sort();

    hash.update(`TABLE:${tableName.length}:${tableName}:COLS:${pragmaColumns.join(",")}\n`);

    const rows = database
      .prepare(`SELECT * FROM "${tableName.replace(/"/g, '""')}"`)
      .all() as Array<Record<string, unknown>>;

    hash.update(`COUNT:${rows.length}\n`);

    const serializedRows = rows.map((row) => serializeRow(row, pragmaColumns)).sort();

    for (const sRow of serializedRows) {
      hash.update(`${sRow.length}:${sRow}\n`);
    }
  }

  return hash.digest("hex");
};

const ensureMigrationDirectory = (databasePath: string) => {
  const migrationDir = path.join(path.dirname(databasePath), "migration");
  mkdirSync(migrationDir, { recursive: true });
  return migrationDir;
};

const quoteSqlIdentifier = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;

const validateTableRowsSchema = (
  tableName: string,
  rows: Array<Record<string, unknown>>
) => {
  const expectedCols = TABLE_SCHEMA_COLUMNS[tableName];
  if (!expectedCols) {
    const err = new Error(`정규 스키마에 정의되지 않은 테이블입니다: ${tableName}`);
    (err as unknown as { code: string }).code = "INVALID_TABLES";
    throw err;
  }
  const expectedColSet = new Set<string>(expectedCols);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      const err = new Error(`'${tableName}' 표의 ${i + 1}번째 행이 객체 형식이 아닙니다.`);
      (err as unknown as { code: string }).code = "INVALID_JSON";
      throw err;
    }

    const rowKeys = Object.keys(row);
    const missingCols = expectedCols.filter((col) => !(col in row));
    const unknownCols = rowKeys.filter((col) => !expectedColSet.has(col));

    if (missingCols.length > 0 || unknownCols.length > 0) {
      const details = [
        missingCols.length > 0 ? `누락 컬럼: ${missingCols.join(", ")}` : "",
        unknownCols.length > 0 ? `알 수 없는 컬럼: ${unknownCols.join(", ")}` : ""
      ]
        .filter(Boolean)
        .join("; ");
      const err = new Error(
        `'${tableName}' 표의 ${i + 1}번째 행의 컬럼 구성이 올바르지 않습니다 (${details}).`
      );
      (err as unknown as { code: string }).code = "INVALID_COLUMNS";
      throw err;
    }

    const contracts = TABLE_COLUMN_CONTRACTS[tableName];
    for (let c = 0; c < contracts.length; c++) {
      const contract = contracts[c];
      const val = row[contract.name];

      if (val === null) {
        if (contract.notNull) {
          const err = new Error(
            `'${tableName}' 표의 ${i + 1}번째 행의 '${contract.name}' 열은 필수 항목(NOT NULL)이지만 null 값이 전달되었습니다 (기대: NOT NULL ${contract.declaredType}, 실제: null).`
          );
          (err as unknown as { code: string }).code = "CHECK_FAILED";
          throw err;
        }
      } else if (contract.declaredType === "TEXT") {
        if (typeof val !== "string") {
          const actualType = Array.isArray(val) ? "array" : typeof val;
          const err = new Error(
            `'${tableName}' 표의 ${i + 1}번째 행의 '${contract.name}' 열의 값 타입이 올바르지 않습니다 (기대: TEXT(문자열), 실제: ${actualType}).`
          );
          (err as unknown as { code: string }).code = "CHECK_FAILED";
          throw err;
        }
      } else {
        if (typeof val !== "number" || !Number.isFinite(val)) {
          const actualType = Array.isArray(val) ? "array" : typeof val;
          const err = new Error(
            `'${tableName}' 표의 ${i + 1}번째 행의 '${contract.name}' 열의 값 타입이 올바르지 않습니다 (기대: ${contract.declaredType}(숫자), 실제: ${actualType}).`
          );
          (err as unknown as { code: string }).code = "CHECK_FAILED";
          throw err;
        }
      }
    }
  }
};

const insertTableRows = (
  database: DatabaseSync,
  tableName: string,
  rows: Array<Record<string, unknown>>
) => {
  if (rows.length === 0) {
    return;
  }

  const pragmaColumns = (
    database.prepare(`PRAGMA table_info("${tableName.replace(/"/g, '""')}")`).all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  const dbColSet = new Set(pragmaColumns);

  const columns = Object.keys(rows[0]);
  for (const col of columns) {
    if (!dbColSet.has(col)) {
      throw new Error(`테이블 '${tableName}'에 존재하지 않는 컬럼 '${col}'이 포함되어 있습니다.`);
    }
  }

  const columnList = columns.map(quoteSqlIdentifier).join(", ");
  const placeholderList = columns.map(() => "?").join(", ");
  const statement = database.prepare(
    `INSERT INTO ${quoteSqlIdentifier(tableName)} (${columnList}) VALUES (${placeholderList})`
  );

  rows.forEach((row, idx) => {
    const rowKeys = Object.keys(row);
    if (rowKeys.length !== columns.length || columns.some((col) => !(col in row))) {
      throw new Error(`테이블 '${tableName}'의 ${idx + 1}번째 행의 컬럼 구성이 일치하지 않습니다.`);
    }
    statement.run(...columns.map((column) => (row[column] ?? null) as string | number | bigint | null | Uint8Array));
  });
};

const isValidCalendarDate = (dateStr: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [yStr, mStr, dStr] = dateStr.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
};

/**
 * 백업 JSON을 엄격하게 파싱하고 유효성을 검증한다.
 */
const parseAndValidateBackupJson = (
  filePath: string
): {
  snapshot: NormalizedJsonBackupSnapshot;
  fileSha256: string;
} => {
  const rawBytes = readFileSync(filePath);
  const fileSha256 = crypto.createHash("sha256").update(rawBytes).digest("hex");
  const rawText = rawBytes.toString("utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const err = new Error(
      `백업 파일 JSON 구문 분석에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`
    );
    (err as unknown as { code: string }).code = "INVALID_JSON";
    throw err;
  }

  if (typeof parsed !== "object" || parsed === null) {
    const err = new Error("백업 JSON 최상위 형식이 객체가 아닙니다.");
    (err as unknown as { code: string }).code = "INVALID_JSON";
    throw err;
  }

  const rawObj = parsed as Record<string, unknown>;
  const schemaVersion = Number(rawObj.schemaVersion);

  if (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3) {
    const err = new Error(
      `지원하지 않는 백업 버전입니다. (지원 버전: 1, 2, 3, 백업 파일 버전: ${String(rawObj.schemaVersion)})`
    );
    (err as unknown as { code: string }).code = "UNSUPPORTED_SCHEMA";
    throw err;
  }

  if (typeof rawObj.tables !== "object" || rawObj.tables === null) {
    const err = new Error("백업 JSON에 'tables' 객체가 누락되었습니다.");
    (err as unknown as { code: string }).code = "MISSING_TABLE";
    throw err;
  }

  const tablesObj = rawObj.tables as Record<string, unknown>;

  const allRequiredTableNames =
    schemaVersion === 1
      ? [...JSON_IMPORT_TABLE_ORDER_V1, APP_SETTINGS_TABLE_NAME]
      : schemaVersion === 2 ? [...JSON_IMPORT_TABLE_ORDER_V2, APP_SETTINGS_TABLE_NAME] : [...JSON_IMPORT_TABLE_ORDER, APP_SETTINGS_TABLE_NAME];
  const requiredTableSet = new Set<string>(allRequiredTableNames);
  const rawTableNames = Object.keys(tablesObj);

  const compatibilityWarnings: string[] = [];
  // 0.5.8의 V1에는 새로 도입된 사용자 정의 근무코드 표가 없다.
  // 나머지 39표가 정확히 일치할 때만 새 영역을 보완한다. 입력 파일은 쓰지 않는다.
  const legacyTableNames = allRequiredTableNames.filter(name => name !== "shift_pattern_duty_types");
  if (schemaVersion === 1 && rawTableNames.length === legacyTableNames.length &&
      !Object.hasOwn(tablesObj, "shift_pattern_duty_types") &&
      legacyTableNames.every(name => Object.hasOwn(tablesObj, name))) {
    tablesObj.shift_pattern_duty_types = [];
    compatibilityWarnings.push("이전 버전의 39개 데이터 표를 확인해 새 사용자 정의 근무코드 영역을 준비했습니다. 원본 JSON 파일은 변경하지 않았습니다.");
  }

  const missingTables = allRequiredTableNames.filter((t) => !(t in tablesObj));
  const unknownTables = rawTableNames.filter((t) => !requiredTableSet.has(t));

  if (missingTables.length > 0 || unknownTables.length > 0) {
    const details = [
      missingTables.length > 0 ? `누락 표: ${missingTables.join(", ")}` : "",
      unknownTables.length > 0 ? `알 수 없는 표: ${unknownTables.join(", ")}` : ""
    ]
      .filter(Boolean)
      .join("; ");
    const expectedCount = allRequiredTableNames.length;
    const err = new Error(
      missingTables.length > 0
        ? `백업 JSON에 필수 표가 누락되었습니다: ${missingTables.join(", ")}`
        : `백업 JSON 표 목록이 ${expectedCount}개 정규 스키마와 일치하지 않습니다 (${details}).`
    );
    (err as unknown as { code: string }).code = missingTables.length > 0 ? "MISSING_TABLE" : "INVALID_TABLES";
    throw err;
  }

  // 각 표의 모든 행 검사 (정규 스키마 컬럼 1:1 대조, 누락/추가 컬럼 원천 차단)
  for (const tableName of allRequiredTableNames) {
    const rows = tablesObj[tableName];
    if (!Array.isArray(rows)) {
      const err = new Error(`백업 JSON의 '${tableName}' 표 데이터가 배열 형식이 아닙니다.`);
      (err as unknown as { code: string }).code = "INVALID_JSON";
      throw err;
    }

    // 기존 email / holiday_policy_json 호환 예외 유지
    if (schemaVersion === 1 && tableName === "employees") {
      for (const row of rows) {
        if (row && typeof row === "object" && !Array.isArray(row) && !("email" in row)) row.email = null;
      }
    }
    if (schemaVersion === 1 && tableName === "shift_patterns") {
      for (const row of rows) {
        if (row && typeof row === "object" && !Array.isArray(row) && !("holiday_policy_json" in row)) row.holiday_policy_json = null;
      }
    }

    // v1 전용: 새 policy metadata 두 nullable 열을 NULL로 정규화 (v2에서는 엄격하게 검증)
    if (schemaVersion === 1) {
      if (tableName === "performance_files") {
        for (const row of rows) {
          if (row && typeof row === "object" && !Array.isArray(row) && !("policy_context_fingerprint" in row)) {
            row.policy_context_fingerprint = null;
          }
        }
      }
      if (tableName === "performance_entries") {
        for (const row of rows) {
          if (row && typeof row === "object" && !Array.isArray(row) && !("policy_snapshot_json" in row)) {
            row.policy_snapshot_json = null;
          }
        }
      }
    }
    validateTableRowsSchema(tableName, rows as Array<Record<string, unknown>>);
    if (tableName === "shift_patterns") for (const row of rows) {
      if (row.holiday_policy_json != null) {
        try { parseHolidayPatternPolicy(JSON.parse(String(row.holiday_policy_json))); }
        catch (e) { throw Error(`shift_patterns holiday_policy_json: ${(e as Error).message}`); }
      }
    }
  }

  if (schemaVersion === 3) {
    const seen = new Set<string>();
    for (const row of tablesObj.performance_return_history as Array<Record<string, unknown>>) {
      if (seen.has(String(row.id))) throw Error("취소 보관 이력 식별자가 중복되었습니다.");
      seen.add(String(row.id));
      const snapshot = parsePerformanceReturnSnapshot(row);
      for (const table of RETURN_SNAPSHOT_TABLES) validateTableRowsSchema(table, snapshot.tables[table]);
    }
  }
  if (schemaVersion >= 2) {
    const bad = (message: string): never => { throw Object.assign(new Error(`정책 백업 검증 실패: ${message}`), { code: "INVALID_POLICY_HISTORY" }); };
    const revisions = tablesObj.policy_revisions as Array<Record<string, unknown>>;
    const events = tablesObj.policy_events as Array<Record<string, unknown>>;
    const revisionMap = new Map<string, Record<string, unknown>>();
    const versions = new Set<string>();
    for (const revision of revisions) {
      const kind = String(revision.policy_kind);
      const rule = String(revision.rule_key);
      if (!isValidPolicyKind(kind) || !isValidRuleKey(kind, rule)) bad("정책 종류와 기준이 일치하지 않습니다.");
      const id = String(revision.id ?? "");
      if (!id || revisionMap.has(id)) bad("정책 ID가 없거나 중복되었습니다.");
      if (!Number.isInteger(revision.version_number) || Number(revision.version_number) < 1) bad("정책 버전이 올바르지 않습니다.");
      const versionKey = `${kind}:${revision.version_number}`;
      if (versions.has(versionKey)) bad("종류별 정책 버전이 중복되었습니다.");
      versions.add(versionKey);
      if (!["initial", "registered", "correction"].includes(String(revision.origin))) bad("정책 출처가 올바르지 않습니다.");
      if (revision.effective_from !== null && (typeof revision.effective_from !== "string" || !isValidDateString(revision.effective_from))) bad("정책 적용일이 올바르지 않습니다.");
      if (revision.effective_from === null && revision.origin !== "initial") bad("최초 기준 이외에는 적용일이 필요합니다.");
      if (revision.implementation_version !== IMPLEMENTATION_VERSION || !matchesPolicyCriteria(rule as PolicyRuleKey, revision.criteria_json)) bad("지원 기준의 내용 또는 구현 버전이 일치하지 않습니다.");
      if (!String(revision.reason ?? "").trim() || String(revision.reason).length > 500 || !Number.isFinite(Date.parse(String(revision.created_at)))) bad("정책 사유나 등록 시각이 올바르지 않습니다.");
      if (revision.actor_role !== "admin") bad("정책 등록자의 권한 기록이 올바르지 않습니다.");
      revisionMap.set(id, revision);
    }
    for (const kind of ["substitute-eligibility", "changed-worker-priority"]) {
      const baseline = revisions.filter(row => row.policy_kind === kind && row.effective_from === null && row.origin === "initial");
      if (baseline.length !== 1) bad("각 정책 종류에 최초 기준이 하나씩 있어야 합니다.");
    }
    const stable = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
      if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
      return JSON.stringify(value);
    };
    const sameRevisionSnapshot = (raw: unknown, revision: Record<string, unknown>) => {
      try { return typeof raw === "string" && stable(JSON.parse(raw)) === stable(mapRowToRevision(revision)); } catch { return false; }
    };
    const invalidated = new Set<string>();
    const creations = new Map<string, number>();
    const replacements = new Set<string>();
    const used = new Set<string>();
    const eventIds = new Set<string>();
    for (const event of events) {
      const id = String(event.id ?? "");
      if (!id || eventIds.has(id)) bad("정책 사건 ID가 없거나 중복되었습니다.");
      eventIds.add(id);
      const revisionId = String(event.revision_id ?? "");
      const revision = revisionMap.get(revisionId);
      if (!revision || event.policy_kind !== revision.policy_kind) bad("정책 사건이 다른 종류 또는 없는 정책을 참조합니다.");
      const row = revision!;
      const type = String(event.event_type);
      if (!["initialized", "created", "corrected", "cancelled", "used"].includes(type) || !Number.isFinite(Date.parse(String(event.occurred_at)))) bad("정책 사건 유형이나 시각이 올바르지 않습니다.");
      if (type !== "used" && event.actor_role !== "admin") bad("정책 변경 권한 기록이 올바르지 않습니다.");
      if (type === "initialized" || type === "created") {
        if ((type === "initialized") !== (row.origin === "initial") || event.before_json !== null || event.replacement_revision_id !== null || event.related_approval_id !== null || !sameRevisionSnapshot(event.after_json, row)) bad("정책 생성 사건의 원본 내용이 일치하지 않습니다.");
        creations.set(revisionId, (creations.get(revisionId) ?? 0) + 1);
      } else if (type === "corrected" || type === "cancelled") {
        if (row.origin === "initial" || invalidated.has(revisionId) || event.related_approval_id !== null || !sameRevisionSnapshot(event.before_json, row)) bad("정정·취소 대상 또는 변경 전 내용이 올바르지 않습니다.");
        invalidated.add(revisionId);
        if (type === "corrected") {
          const replacementId = String(event.replacement_revision_id ?? "");
          const replacement = revisionMap.get(replacementId);
          if (!replacement || replacement.policy_kind !== row.policy_kind || replacement.origin !== "correction" || Number(replacement.version_number) <= Number(row.version_number) || replacements.has(replacementId) || !sameRevisionSnapshot(event.after_json, replacement)) bad("정정 후 정책과 변경 전후 기록이 일치하지 않습니다.");
          replacements.add(replacementId);
        } else {
          let cancellation: Record<string, unknown>;
          try { cancellation = JSON.parse(String(event.after_json)) as Record<string, unknown>; } catch { bad("취소 사유 기록을 읽을 수 없습니다."); }
          if (event.replacement_revision_id !== null || !cancellation! || Object.keys(cancellation!).length !== 1 || typeof cancellation!.cancelReason !== "string" || !cancellation!.cancelReason.trim() || cancellation!.cancelReason.length > 500) bad("취소 사유 기록이 올바르지 않습니다.");
        }
      } else {
        if (event.replacement_revision_id !== null || event.before_json !== null || event.after_json !== null || typeof event.related_approval_id !== "string" || !event.related_approval_id) bad("정책 사용 기록이 올바르지 않습니다.");
        const key = `${revisionId}:${event.related_approval_id}`;
        if (used.has(key)) bad("정책 사용 기록이 중복되었습니다.");
        used.add(key);
      }
    }
    for (const revision of revisions) {
      const id = String(revision.id);
      if (creations.get(id) !== 1) bad("정책 생성 기록이 없거나 중복되었습니다.");
      if ((revision.origin === "correction") !== replacements.has(id)) bad("정정 정책의 연결이 올바르지 않습니다.");
      if (invalidated.has(id) && [...used].some(key => key.startsWith(`${id}:`))) bad("사용한 정책이 정정·취소되었습니다.");
    }
    for (const kind of ["substitute-eligibility", "changed-worker-priority"]) {
      const dates = new Set<string>();
      for (const revision of revisions.filter(row => row.policy_kind === kind && !invalidated.has(String(row.id)))) {
        const date = String(revision.effective_from);
        if (dates.has(date)) bad("유효한 정책의 시작일이 중복되었습니다.");
        dates.add(date);
      }
    }
    const validateApplication = (raw: unknown, workDate: unknown) => {
      const application = parsePolicyApplicationSnapshot(raw);
      if (!application || application.workDate !== workDate) return bad("실적에 저장된 정책 기준 또는 지문이 올바르지 않습니다.");
      for (const binding of application.bindings) {
        const revision = revisionMap.get(binding.policyId);
        if (!revision || binding.kind !== revision.policy_kind || binding.ruleKey !== revision.rule_key || binding.versionNumber !== Number(revision.version_number) || binding.effectiveFrom !== revision.effective_from || binding.implementationVersion !== revision.implementation_version || binding.criteriaJson !== revision.criteria_json || !matchesPolicyCriteria(binding.ruleKey, binding.criteriaJson)) bad("실적의 정책 기준과 정책 이력이 일치하지 않습니다.");
      }
      return application;
    };
    const archived = schemaVersion === 3 ? (tablesObj.performance_return_history as Array<Record<string, unknown>>).map(row => parsePerformanceReturnSnapshot(row).tables) : [];
    for (const entry of [...tablesObj.performance_entries as Array<Record<string, unknown>>, ...archived.flatMap(tables => tables.performance_entries)]) {
      if (entry.policy_snapshot_json !== null) {
        let value: unknown;
        try { value = JSON.parse(String(entry.policy_snapshot_json)); } catch { bad("실적 정책 스냅샷 JSON이 올바르지 않습니다."); }
        const application = validateApplication(value, entry.work_date);
        if (entry.section === "substitute" && !application.bindings.some(binding => binding.kind === "substitute-eligibility")) bad("대체 실적의 적용 기준이 누락되었습니다.");
      }
    }
    for (const approval of [...tablesObj.performance_approvals as Array<Record<string, unknown>>, ...archived.flatMap(tables => tables.performance_approvals)]) {
      let snapshot: {entry?: {workDate?: unknown; appliedPolicies?: unknown}} | undefined;
      // Opaque old snapshots are preserved verbatim. A present policy payload must be complete.
      try { snapshot = approval.snapshot_json ? JSON.parse(String(approval.snapshot_json)) : undefined; } catch { snapshot = undefined; }
      const application = snapshot?.entry?.appliedPolicies === undefined ? undefined : validateApplication(snapshot.entry.appliedPolicies, snapshot.entry.workDate);
      if (application && approval.decision === "approved") {
        for (const binding of application.bindings) if (!used.has(`${binding.policyId}:${approval.id}`)) bad("승인에 사용한 정책의 사용 기록이 누락되었습니다.");
      }
      const usage = events.filter(event => event.event_type === "used" && event.related_approval_id === approval.id);
      for (const event of usage) if (!application?.bindings.some(binding => binding.policyId === event.revision_id)) bad("현재 승인과 정책 사용 기록이 일치하지 않습니다.");
    }
    // A used event may refer to an approval deliberately removed by the supported return-to-pending flow.
    // Keep that historical lock instead of requiring a live approval row.
  }
  // app_setting_entries의 타입 및 키 검사 (문자열 타입 강제, 중복 키, 미인지 키, 6대 업무 규칙 존재 여부)
  const settingRows = tablesObj[APP_SETTINGS_TABLE_NAME] as Array<Record<string, unknown>>;
  const seenSettingKeys = new Set<string>();
  let legacyReparseRequested = false;

  for (let i = 0; i < settingRows.length; i++) {
    const row = settingRows[i];
    if (
      typeof row.setting_key !== "string" ||
      typeof row.value !== "string" ||
      typeof row.updated_at !== "string"
    ) {
      const err = new Error(
        `app_setting_entries ${i + 1}번째 행의 필드(setting_key, value, updated_at)는 모두 문자열이어야 합니다.`
      );
      (err as unknown as { code: string }).code = "CHECK_FAILED";
      throw err;
    }

    const key = row.setting_key.trim();
    if (!key) {
      const err = new Error("app_setting_entries에 빈 설정 키가 존재합니다.");
      (err as unknown as { code: string }).code = "CHECK_FAILED";
      throw err;
    }
    if (seenSettingKeys.has(key)) {
      const err = new Error(`app_setting_entries에 중복된 설정 키가 존재합니다: ${key}`);
      (err as unknown as { code: string }).code = "CHECK_FAILED";
      throw err;
    }
    seenSettingKeys.add(key);
    if (key === PATTERN_PRESETS_SETTING_KEY) {
      try { parsePatternPresetRecords(JSON.parse(String(row.value))); } catch { const error=Object.assign(new Error("반복 패턴 보관함 JSON이 올바르지 않습니다."),{code:"CHECK_FAILED"}); throw error; }
    }
    if (key === SITE_NAME_OPTIONS_SETTING_KEY) {
      try {
        const entries: unknown = JSON.parse(String(row.value));
        if (!Array.isArray(entries) || entries.some((entry: unknown) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
          const value = entry as Record<string, unknown>;
          return typeof value.id !== "string" || !value.id.trim() || typeof value.name !== "string" || !value.name.trim();
        })) throw new Error("Invalid site name list");
      } catch {
        const error = new Error("근무지 이름 목록(site_name_options_json)이 올바른 JSON 목록이 아닙니다.");
        (error as Error & { code: string }).code = "CHECK_FAILED";
        throw error;
      }
    }


    const legacyReparseSetting = schemaVersion === 1 && LEGACY_REPARSE_SETTING_KEYS.has(key);
    if (legacyReparseSetting) legacyReparseRequested = true;
    if (!KNOWN_SETTING_KEYS.has(key) && !legacyReparseSetting) {
      const err = new Error(`알 수 없는 설정 키가 백업에 포함되어 있습니다: ${key}`);
      (err as unknown as { code: string }).code = "CHECK_FAILED";
      throw err;
    }
  }

  // 6대 업무 규칙 키 누락 검사 (N3)
  const missingBusinessKeys: string[] = [];
  for (const bizKey of BUSINESS_RULE_KEYS) {
    if (!seenSettingKeys.has(bizKey)) {
      missingBusinessKeys.push(bizKey);
    }
  }

  if (missingBusinessKeys.length > 0) {
    const err = new Error(
      `백업 JSON에 필수 업무 규칙 설정 키가 누락되었습니다: ${missingBusinessKeys.join(", ")}`
    );
    (err as unknown as { code: string }).code = "CHECK_FAILED";
    throw err;
  }

  // 업무 규칙 값 유효성 검사 (N3: 1 이상 유한 정수, 유효 불리언, 실제 달력일)
  for (const row of settingRows) {
    const key = (row.setting_key as string).trim();
    const val = row.value as string;

    if (
      key === "schedule_consecutive_night_limit" ||
      key === "schedule_minimum_rest_minutes" ||
      key === "schedule_weekly_max_minutes"
    ) {
      const trimmed = val.trim();
      if (!/^\d+$/.test(trimmed)) {
        const err = new Error(
          `업무 규칙 설정 '${key}'의 값이 유효한 1 이상 정수가 아닙니다: ${val}`
        );
        (err as unknown as { code: string }).code = "CHECK_FAILED";
        throw err;
      }
      const num = Number(trimmed);
      if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || String(num) !== trimmed) {
        const err = new Error(
          `업무 규칙 설정 '${key}'의 값이 유효한 1 이상 정수가 아닙니다: ${val}`
        );
        (err as unknown as { code: string }).code = "CHECK_FAILED";
        throw err;
      }
    } else if (key === "schedule_require_weekly_holiday") {
      if (val !== "true" && val !== "false") {
        const err = new Error(
          `업무 규칙 설정 '${key}'의 값이 유효한 불리언(true/false)이 아닙니다: ${val}`
        );
        (err as unknown as { code: string }).code = "CHECK_FAILED";
        throw err;
      }
    } else if (
      key === "substitute_allowance_policy_effective_from" ||
      key === "changed_slot_priority_effective_from"
    ) {
      const trimmed = val.trim();
      if (trimmed !== "") {
        if (!isValidCalendarDate(trimmed)) {
          const err = new Error(
            `업무 규칙 설정 '${key}'의 날짜 형식이 올바르지 않거나 존재하지 않는 달력일입니다: ${trimmed}`
          );
          (err as unknown as { code: string }).code = "CHECK_FAILED";
          throw err;
        }
      }
    }
  }

  if (legacyReparseRequested) {
    compatibilityWarnings.push("이전 PC의 재분석 진행 정보는 이어 쓰지 않습니다. 새 PC에서 미승인 실적을 다시 확인하도록 요청하며 이미 승인된 금액과 이력은 유지합니다.");
  }

  return {
    snapshot: {
      schemaVersion: Number(rawObj.schemaVersion),
      createdAt: String(rawObj.createdAt ?? new Date().toISOString()),
      tables: tablesObj as Record<string, Array<Record<string, unknown>>>,
      sourceTableCount: rawTableNames.length,
      compatibilityWarnings,
      legacyReparseRequested
    },
    fileSha256
  };
};

/**
 * 1. 복원 요구사항 검사
 */
export const checkDatabaseMigrationRequirements = (input: {
  backupFilePath: string;
}): JsonDatabaseRestoreRequirementCheck => {
  const checkedAt = new Date().toISOString();

  let resolvedPath: string;
  try {
    const resolved = resolveDatabaseMigrationInput(input);
    resolvedPath = resolved.backupFilePath;
  } catch (error) {
    return {
      sourceType: "json",
      isReady: false,
      status: "check-failed",
      checkedAt,
      headline: "복원 요구사항 검사 실패",
      details: [error instanceof Error ? error.message : String(error)],
      recommendedActions: ["올바른 JSON 백업 파일 경로를 지정해 주세요."]
    };
  }

  try {
    const { snapshot, fileSha256 } = parseAndValidateBackupJson(resolvedPath);
    const tableCount = snapshot.sourceTableCount;

    return {
      sourceType: "json",
      isReady: true,
      status: "ready",
      checkedAt,
      backupSha256: fileSha256,
      schemaVersion: String(snapshot.schemaVersion),
      tableCount,
      headline: "JSON 데이터베이스 복원 준비 완료",
      details: [
        `${tableCount}개 필수 데이터 테이블이 모두 확인되었습니다.`,
        "6개 업무 정책 규칙이 확인되었습니다.",
        "백업 원본 파일의 SHA-256이 확인되었습니다.",
        ...snapshot.compatibilityWarnings
      ],
      recommendedActions: [
        "미리보기를 통해 복원 후 영향도를 확인한 뒤 교체 복원을 진행하세요."
      ]
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    let status: JsonDatabaseRestoreRequirementStatus = "check-failed";
    let headline = "복원 요구사항 검사 실패";

    if (code === "INVALID_JSON") {
      status = "invalid-json";
      headline = "JSON 백업 파일 구문 오류";
    } else if (code === "UNSUPPORTED_SCHEMA") {
      status = "unsupported-schema";
      headline = "지원하지 않는 백업 버전";
    } else if (code === "MISSING_TABLE") {
      status = "missing-table";
      headline = "필수 데이터 테이블 누락";
    }

    return {
      sourceType: "json",
      isReady: false,
      status,
      checkedAt,
      headline,
      details: [error instanceof Error ? error.message : String(error)],
      recommendedActions: [
        "유효한 40표 JSON 백업 파일인지 확인하고 다시 시도해 주세요."
      ]
    };
  }
};

interface OperatingSettingsCapture {
  holidayApiBaseUrl: string;
  databaseBackupSchedule: string;
  databaseBackupTime: string;
  updateLastSeenPatchNoteVersion: string | null;
  updateLastSkippedVersion: string | null;
  existingReparseMarker: string | null;
  targetSubstitutePolicyEffectiveFrom: string;
  targetChangedSlotPriorityEffectiveFrom: string;
}

const captureOperatingSettings = (
  database: DatabaseSync,
  currentSettings: AppSettingsSnapshot
): OperatingSettingsCapture => {
  const rows = database
    .prepare(
      `SELECT setting_key, value FROM app_setting_entries WHERE setting_key IN (
        'holiday_api_base_url',
        'database_backup_schedule',
        'database_backup_time',
        'update_last_seen_patch_note_version',
        'update_last_skipped_version',
        'substitute_allowance_policy_reparse_marker',
        'substitute_allowance_policy_effective_from',
        'changed_slot_priority_effective_from'
      )`
    )
    .all() as Array<{ setting_key: string; value: string }>;

  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.setting_key, r.value);
  }

  return {
    holidayApiBaseUrl: map.get("holiday_api_base_url") ?? currentSettings.holidayApiBaseUrl,
    databaseBackupSchedule:
      map.get("database_backup_schedule") ?? currentSettings.databaseBackupSchedule,
    databaseBackupTime: map.get("database_backup_time") ?? currentSettings.databaseBackupTime,
    updateLastSeenPatchNoteVersion: map.get("update_last_seen_patch_note_version") ?? null,
    updateLastSkippedVersion: map.get("update_last_skipped_version") ?? null,
    existingReparseMarker: map.get("substitute_allowance_policy_reparse_marker") ?? null,
    targetSubstitutePolicyEffectiveFrom:
      map.get("substitute_allowance_policy_effective_from") ?? "",
    targetChangedSlotPriorityEffectiveFrom:
      map.get("changed_slot_priority_effective_from") ?? ""
  };
};

const buildFinalAppSettingRows = (input: {
  currentSettings: AppSettingsSnapshot;
  operatingSettings: OperatingSettingsCapture;
  sourceSettingsRows: Array<Record<string, unknown>>;
  resolvedBackupFilePath: string;
  nowIso: string;
  legacyReparseRequested: boolean;
}): Array<{ setting_key: string; value: string; updated_at: string }> => {
  const sourceSettingMap = new Map<string, string>();
  for (const r of input.sourceSettingsRows) {
    if (typeof r.setting_key !== "string" || typeof r.value !== "string") {
      throw new Error("app_setting_entries의 키 또는 값이 문자열이 아닙니다.");
    }
    sourceSettingMap.set(r.setting_key, r.value);
  }

  const finalRows: Array<{ setting_key: string; value: string; updated_at: string }> = [];

  // 분류 1: 설치 대상 기기의 경로 (7개) -> 대상 환경 경로 유지
  const pathKeys: Array<[string, string]> = [
    ["pending_dir", input.currentSettings.pendingDir],
    ["approved_dir", input.currentSettings.approvedDir],
    ["schedule_export_dir", input.currentSettings.scheduleExportDir],
    ["allowance_proposal_export_dir", input.currentSettings.allowanceProposalExportDir],
    ["allowance_attachment1_export_dir", input.currentSettings.allowanceAttachment1ExportDir],
    ["allowance_attachment2_export_dir", input.currentSettings.allowanceAttachment2ExportDir],
    ["database_backup_dir", input.currentSettings.databaseBackupDir]
  ];
  for (const [key, val] of pathKeys) {
    finalRows.push({ setting_key: key, value: val, updated_at: input.nowIso });
  }

  // 분류 2: 이번 선택한 입력 (1개) -> 이번 선택 JSON 경로
  finalRows.push({
    setting_key: "migration_file_path",
    value: input.resolvedBackupFilePath,
    updated_at: input.nowIso
  });

  // 분류 3: 설치 대상 기기의 운영 설정 (6개 중 기본 3개 + 선택 2개 + 마커 1개)
  finalRows.push({
    setting_key: "holiday_api_base_url",
    value: input.operatingSettings.holidayApiBaseUrl,
    updated_at: input.nowIso
  });
  finalRows.push({
    setting_key: "database_backup_schedule",
    value: input.operatingSettings.databaseBackupSchedule,
    updated_at: input.nowIso
  });
  finalRows.push({
    setting_key: "database_backup_time",
    value: input.operatingSettings.databaseBackupTime,
    updated_at: input.nowIso
  });

  // 선택적 운영 키 (대상 기기에 키가 존재하면 보존, 없으면 없는 상태 유지)
  if (input.operatingSettings.updateLastSeenPatchNoteVersion !== null) {
    finalRows.push({
      setting_key: "update_last_seen_patch_note_version",
      value: input.operatingSettings.updateLastSeenPatchNoteVersion,
      updated_at: input.nowIso
    });
  }
  if (input.operatingSettings.updateLastSkippedVersion !== null) {
    finalRows.push({
      setting_key: "update_last_skipped_version",
      value: input.operatingSettings.updateLastSkippedVersion,
      updated_at: input.nowIso
    });
  }

  // 정책 시작일 변경 여부 대조
  const sourceSubstitutePolicy =
    sourceSettingMap.get("substitute_allowance_policy_effective_from") ?? "";
  const sourceChangedSlotPriority =
    sourceSettingMap.get("changed_slot_priority_effective_from") ?? "";

  const policyDateChanged =
    input.operatingSettings.targetSubstitutePolicyEffectiveFrom !== sourceSubstitutePolicy ||
    input.operatingSettings.targetChangedSlotPriorityEffectiveFrom !== sourceChangedSlotPriority;

  if (policyDateChanged || input.legacyReparseRequested) {
    // 정책일 변경 시 marker를 새 ISO 타임스탬프로 설정
    finalRows.push({
      setting_key: "substitute_allowance_policy_reparse_marker",
      value: input.nowIso,
      updated_at: input.nowIso
    });
  } else if (input.operatingSettings.existingReparseMarker !== null) {
    // 정책일이 같더라도 대상 기기에 기존 marker가 이미 존재했으면 그 값 보존
    finalRows.push({
      setting_key: "substitute_allowance_policy_reparse_marker",
      value: input.operatingSettings.existingReparseMarker,
      updated_at: input.nowIso
    });
  }

  // 분류 4: 업무 규칙 (6개) -> 선택 JSON 값 필수 복원
  for (const bizKey of BUSINESS_RULE_KEYS) {
    const sourceVal = sourceSettingMap.get(bizKey);
    if (sourceVal === undefined) {
      throw new Error(`백업 JSON에 필수 업무 규칙 '${bizKey}'가 없습니다.`);
    }
    finalRows.push({
      setting_key: bizKey,
      value: sourceVal,
      updated_at: input.nowIso
    });
  }

  const patternPresets = sourceSettingMap.get(PATTERN_PRESETS_SETTING_KEY);
  if (patternPresets !== undefined) finalRows.push({setting_key:PATTERN_PRESETS_SETTING_KEY,value:patternPresets,updated_at:input.nowIso});

  // 근무지 이름 사전은 설치 경로가 아닌 선택한 백업의 업무 자료다.
  const siteNameOptions = sourceSettingMap.get(SITE_NAME_OPTIONS_SETTING_KEY);
  if (siteNameOptions !== undefined) {
    finalRows.push({ setting_key: SITE_NAME_OPTIONS_SETTING_KEY, value: siteNameOptions, updated_at: input.nowIso });
  }

  return finalRows;
};

/**
 * 임시 데이터베이스에 39개 표 및 2026-09-27 승인 설정 변환을 적용하고 검증한다.
 */
const importJsonBackupIntoDatabase = (input: {
  database: DatabaseSync;
  snapshot: NormalizedJsonBackupSnapshot;
  resolvedBackupFilePath: string;
  currentSettings: AppSettingsSnapshot;
  operatingSettings: OperatingSettingsCapture;
}): {
  warningMessages: string[];
  removedPerformanceEntryCount: number;
} => {
  const { database, snapshot, resolvedBackupFilePath, currentSettings, operatingSettings } = input;
  const warningMessages: string[] = [...snapshot.compatibilityWarnings];

  // 경고 메시지 1 & 2: 계정 교체 및 외부 파일 미포함 경고
  warningMessages.push("계정 정보(app_users)가 백업 파일의 계정으로 교체됩니다.");
  warningMessages.push(
    "실적 파일 등 외부 파일 자체는 JSON 백업에 포함되지 않으므로 기기 간 이동 시 별도 보존이 필요할 수 있습니다."
  );

  let removedPerformanceEntryCount = 0;

  database.exec("BEGIN;");

  try {
    // 1. 일반 39개 표 복원
    for (const tableName of JSON_IMPORT_TABLE_ORDER) {
      const rows = snapshot.tables[tableName] ?? [];
      if (Array.isArray(rows) && rows.length > 0) {
        insertTableRows(database, tableName, rows);
      }
    }

    // 2. DEC-001: 사번 없는 비-BP 실적 1건 안전 제외
    const unassignedEntries = database
      .prepare(
        `
        SELECT id, performance_file_id, logical_key, employee_name, employee_code, work_date, alert_json
        FROM performance_entries
        WHERE (employee_code IS NULL OR trim(employee_code) = '')
      `
      )
      .all() as Array<{
      id: string;
      performance_file_id: string;
      logical_key: string;
      employee_name: string;
      employee_code: string | null;
      work_date: string;
      alert_json: string | null;
    }>;

    const unassignedNonBpEntries = unassignedEntries.filter(
      (entry) => !isBpDisplayName(entry.employee_name)
    );

    if (unassignedNonBpEntries.length > 0) {
      for (const entry of unassignedNonBpEntries) {
        const hasApproval = database
          .prepare(
            `SELECT 1 FROM performance_approvals WHERE entry_id = ? OR logical_key = ? LIMIT 1`
          )
          .get(entry.id, entry.logical_key);

        const hasVisibility = database
          .prepare(
            `SELECT 1 FROM hidden_approved_performance_rows WHERE entry_id = ? OR logical_key = ? LIMIT 1`
          )
          .get(entry.id, entry.logical_key);

        const hasCalculation = database
          .prepare(
            `SELECT 1 FROM allowance_calculations WHERE performance_entry_id = ? LIMIT 1`
          )
          .get(entry.id);

        if (hasApproval || hasVisibility || hasCalculation) {
          throw new Error(
            `백업 JSON의 사번 없는 실적(${entry.employee_name}, ${entry.work_date})에 승인/숨김/수당 계산 이력이 연결되어 있어 복원할 수 없습니다.`
          );
        }

        const fileRow = database
          .prepare(`SELECT * FROM performance_files WHERE id = ?`)
          .get(entry.performance_file_id) as Record<string, unknown> | undefined;

        let updatedPreview = "[]";
        let updatedWarningCount = 0;

        if (fileRow) {
          const currentPreview = JSON.parse(
            String(fileRow.preview_json ?? "[]")
          ) as Array<Record<string, unknown>>;

          const matchingIndices: number[] = [];
          currentPreview.forEach((previewRow, idx) => {
            const rowEmpName = String(
              previewRow["직원명"] ?? previewRow["employee_name"] ?? previewRow["employeeName"] ?? ""
            ).trim();
            const rowWorkDate = String(
              previewRow["근무날짜"] ?? previewRow["work_date"] ?? previewRow["workDate"] ?? ""
            ).trim();
            if (rowEmpName === entry.employee_name && rowWorkDate === entry.work_date) {
              matchingIndices.push(idx);
            }
          });

          if (matchingIndices.length > 1) {
            throw new Error(
              `백업 JSON의 사번 없는 실적(${entry.employee_name}, ${entry.work_date})에 대응하는 preview 행이 ${matchingIndices.length}개로 모호하여 복원을 중단했습니다.`
            );
          }

          const filteredPreview =
            matchingIndices.length === 1
              ? currentPreview.filter((_, idx) => idx !== matchingIndices[0])
              : currentPreview;
          updatedPreview = JSON.stringify(filteredPreview);

          let deletedEntryAlertCount = 0;
          try {
            const parsedAlerts = JSON.parse(String(entry.alert_json ?? "[]"));
            if (Array.isArray(parsedAlerts)) {
              deletedEntryAlertCount = parsedAlerts.length;
            }
          } catch {
            deletedEntryAlertCount = 0;
          }

          updatedWarningCount = Math.max(
            0,
            Number(fileRow.warning_count ?? 0) - deletedEntryAlertCount
          );
        }

        database.prepare(`DELETE FROM performance_entries WHERE id = ?`).run(entry.id);
        removedPerformanceEntryCount++;

        if (fileRow) {
          const remainingRows = database
            .prepare(`SELECT * FROM performance_entries WHERE performance_file_id = ?`)
            .all(entry.performance_file_id) as Array<Record<string, unknown>>;

          const remainingPayableRows = remainingRows.filter((r) =>
            isPayablePerformanceEntry({
              employeeCode: String(r.employee_code ?? ""),
              employeeName: String(r.employee_name ?? ""),
              isPoolWorker: Number(r.is_pool_worker ?? 0) === 1,
              section: r.section ? (String(r.section) as PerformanceEntrySection) : undefined,
              substituteAllowanceEligible:
                r.substitute_allowance_eligible === null || r.substitute_allowance_eligible === undefined
                  ? undefined
                  : Number(r.substitute_allowance_eligible) === 1,
              substituteAllowanceReasonCode: r.substitute_allowance_reason_code
                ? (String(r.substitute_allowance_reason_code) as SubstituteAllowanceReasonCode)
                : undefined
            })
          );
          const remainingPayableCount = remainingPayableRows.length;
          const remainingPayableEntryIds = new Set(
            remainingPayableRows.map((r) => String(r.id))
          );

          const approvalHistoryRows = database
            .prepare(
              `SELECT entry_id, decision, processed_at FROM performance_approvals WHERE file_id = ? ORDER BY processed_at DESC, id DESC`
            )
            .all(entry.performance_file_id) as Array<{
            entry_id: string | null;
            decision: string | null;
            processed_at: string;
          }>;

          let resolvedApprovedCount: number;

          if (approvalHistoryRows.length === 0) {
            resolvedApprovedCount = Math.min(
              remainingPayableCount,
              Number(fileRow.approved_entry_count ?? 0)
            );
          } else {
            const latestDecisionByEntryId = new Map<string, string>();
            for (const row of approvalHistoryRows) {
              const entryId = row.entry_id ? String(row.entry_id) : "";
              if (entryId && !latestDecisionByEntryId.has(entryId)) {
                latestDecisionByEntryId.set(entryId, String(row.decision ?? ""));
              }
            }

            let payableApprovedCount = 0;
            for (const [entryId, decision] of latestDecisionByEntryId.entries()) {
              if (decision === "approved" && remainingPayableEntryIds.has(entryId)) {
                payableApprovedCount++;
              }
            }

            resolvedApprovedCount = payableApprovedCount;
          }

          database
            .prepare(
              `
              UPDATE performance_files
              SET preview_json = ?,
                  entry_count = ?,
                  approved_entry_count = ?,
                  warning_count = ?
              WHERE id = ?
            `
            )
            .run(
              updatedPreview,
              remainingPayableCount,
              resolvedApprovedCount,
              updatedWarningCount,
              entry.performance_file_id
            );
        }
      }

      warningMessages.push(
        `백업 JSON의 사번 없는 실적 ${removedPerformanceEntryCount}건을 V4 복원 대상에서 제거했습니다. 원본 백업은 변경하지 않았습니다.`
      );
    }

    // 3. app_setting_entries 복원 (2026-09-27 사용자 승인 설정 변환 정책)
    const finalSettingsRows = buildFinalAppSettingRows({
      currentSettings,
      operatingSettings,
      sourceSettingsRows: snapshot.tables[APP_SETTINGS_TABLE_NAME] ?? [],
      legacyReparseRequested: snapshot.legacyReparseRequested,
      resolvedBackupFilePath,
      nowIso: new Date().toISOString()
    });

    insertTableRows(database, APP_SETTINGS_TABLE_NAME, finalSettingsRows);

    // v1 복원일 경우: 최종 target raw 적용일로 초기 정책 생성 (caller-owned restore transaction)
    if (snapshot.schemaVersion === 1) {
      initializePolicyHistory(database);
    }

    // 경고 메시지 3: 경로 설정 유지 경고
    warningMessages.push("백업 JSON의 경로 설정은 무시하고 현재 환경 경로를 유지했습니다.");

    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }

  // SQLite PRAGMA 무결성 검증
  const quickCheckResult = database.prepare("PRAGMA quick_check;").all() as Array<{
    quick_check: string;
  }>;
  if (quickCheckResult.length === 0 || quickCheckResult[0].quick_check !== "ok") {
    throw new Error(
      `데이터베이스 quick_check 검증에 실패했습니다: ${JSON.stringify(quickCheckResult)}`
    );
  }

  const integrityCheckResult = database.prepare("PRAGMA integrity_check;").all() as Array<{
    integrity_check: string;
  }>;
  if (integrityCheckResult.length === 0 || integrityCheckResult[0].integrity_check !== "ok") {
    throw new Error(
      `데이터베이스 integrity_check 검증에 실패했습니다: ${JSON.stringify(integrityCheckResult)}`
    );
  }

  return {
    warningMessages,
    removedPerformanceEntryCount
  };
};

/** Probe the existing startup backfill inside a rolled-back savepoint on the isolated candidate. */
const assertLegacyEmploymentInitializationCanRun = (database: DatabaseSync): void => {
  database.exec("SAVEPOINT w11_candidate_employment");
  try {
    database.exec(`INSERT INTO employee_employment_periods(id,employee_id,start_date,end_date,closure_provenance_complete,created_at,updated_at)
      SELECT 'legacy:'||employees.id,employees.id,employees.hire_date,employees.retire_date,
        CASE WHEN employees.status='retired' THEN 0 ELSE 1 END,employees.created_at,employees.updated_at
      FROM employees WHERE employees.hire_date IS NOT NULL AND TRIM(employees.hire_date)<>''
        AND NOT EXISTS(SELECT 1 FROM employee_employment_periods WHERE employee_employment_periods.employee_id=employees.id)`);
    database.exec("ROLLBACK TO SAVEPOINT w11_candidate_employment; RELEASE SAVEPOINT w11_candidate_employment");
  } catch (error) {
    try { database.exec("ROLLBACK TO SAVEPOINT w11_candidate_employment; RELEASE SAVEPOINT w11_candidate_employment"); } catch { /* Keep the original candidate validation failure. */ }
    throw new Error("복원할 자료의 입사일·퇴사일과 재직기간을 확인하지 못했습니다. 기존 데이터는 교체하지 않았습니다. 원본 백업의 날짜 순서와 재직기간 연결을 확인한 뒤 다시 미리보기해 주세요.", { cause: error });
  }
};

/**
 * 2. 복원 미리보기
 */
export const previewDatabaseMigrationUpdate = (input: {
  userDataPath: string;
  backupFilePath: string;
  env?: NodeJS.ProcessEnv;
  onPreviewSuccess?: () => void;
}): JsonDatabaseRestorePreview => {
  purgeExpiredTokens();

  const { backupFilePath: resolvedBackupFilePath } = resolveDatabaseMigrationInput(input);
  const { snapshot, fileSha256 } = parseAndValidateBackupJson(resolvedBackupFilePath);
  const employeeHireDateReview = buildImportedEmployeeHireDateReview(snapshot.tables.employees ?? [], fileSha256);

  // 저장소 초기화
  initializeSqliteStorage({
    userDataPath: input.userDataPath,
    env: input.env
  });

  const currentSettings = getStoredAppSettingsSnapshot({
    userDataPath: input.userDataPath,
    env: input.env
  });

  const liveDbBeforeClose = getRequiredDatabase();
  if (!isPolicyHistoryInitialized(liveDbBeforeClose)) {
    initializePolicyHistory(liveDbBeforeClose);
  }
  const operatingSettings = captureOperatingSettings(liveDbBeforeClose, currentSettings);

  const tempDatabasePath = path.join(
    ensureMigrationDirectory(currentSettings.databasePath),
    `preview-${Date.now()}-${randomUUID()}.sqlite`
  );

  closeSqliteStorage();

  const nextRowCounts = new Map<string, number>();
  let warningMessages: string[] = [];

  try {
    initializeSqliteStorage({
      dbPath: tempDatabasePath,
      userDataPath: input.userDataPath,
      env: input.env
    });

    const tempDb = getRequiredDatabase();
    const importResult = importJsonBackupIntoDatabase({
      database: tempDb,
      snapshot,
      resolvedBackupFilePath,
      currentSettings,
      operatingSettings
    });

    warningMessages = importResult.warningMessages;
    assertLegacyEmploymentInitializationCanRun(tempDb);

    const allTables = listUserTableNames(tempDb);
    for (const tableName of allTables) {
      const row = tempDb
        .prepare(`SELECT COUNT(*) as count FROM ${quoteSqlIdentifier(tableName)}`)
        .get() as { count: number };
      nextRowCounts.set(tableName, row.count);
    }
  } finally {
    closeSqliteStorage();
    removeSqliteSidecars(tempDatabasePath);
    rmSync(tempDatabasePath, { force: true });

    // 운영 DB 복원 및 재열기
    initializeSqliteStorage({
      dbPath: currentSettings.databasePath,
      userDataPath: input.userDataPath,
      env: input.env
    });
  }

  const liveDb = getRequiredDatabase();
  if (!isPolicyHistoryInitialized(liveDb)) {
    initializePolicyHistory(liveDb);
  }

  // Sol 코드 전략 4: HTTP 미리보기 성공 시 access_logs 1행을 토큰 발급 전에 동기 콜백으로 기록
  if (input.onPreviewSuccess) {
    input.onPreviewSuccess();
  }

  // 활동 기록 후 현재 live DB의 40개 표 상태 및 지문 확정
  const liveTables = listUserTableNames(liveDb);
  const liveTableSet = new Set(liveTables);

  const tableImpacts: JsonDatabaseTableImpact[] = [];
  const all40Tables = [
    ...JSON_IMPORT_TABLE_ORDER.filter((t) => liveTableSet.has(t)),
    APP_SETTINGS_TABLE_NAME
  ];

  for (const tableName of all40Tables) {
    const row = liveDb
      .prepare(`SELECT COUNT(*) as count FROM ${quoteSqlIdentifier(tableName)}`)
      .get() as { count: number };

    tableImpacts.push({
      tableName,
      currentRowCount: row.count,
      nextRowCount: nextRowCounts.get(tableName) ?? 0
    });
  }

  const databaseFingerprint = computeDatabaseContentFingerprint(liveDb);

  const previewToken = randomUUID();
  const expiresAt = Date.now() + TOKEN_TTL_MS;

  previewTokens.set(previewToken, {
    token: previewToken,
    backupFilePath: resolvedBackupFilePath,
    backupSha256: fileSha256,
    databaseFingerprint,
    expiresAt
  });

  return {
    sourceType: "json",
    backupFilePath: resolvedBackupFilePath,
    backupSha256: fileSha256,
    schemaVersion: String(snapshot.schemaVersion),
    previewToken,
    expiresAt: new Date(expiresAt).toISOString(),
    tableImpacts,
    warningMessages,
    previewedAt: new Date().toISOString()
    ,employeeHireDateReview
  };
};

/**
 * 3. 복원 실행
 */
export const runDatabaseMigrationUpdate = async (input: {
  userDataPath: string;
  backupFilePath: string;
  backupSha256: string;
  previewToken: string;
  confirmationText: "교체";
  env?: NodeJS.ProcessEnv;
}): Promise<JsonDatabaseRestoreSummary> => {
  purgeExpiredTokens();

  if (input.confirmationText !== "교체") {
    throw new Error("확인 문구가 올바르지 않습니다. 정확히 '교체'를 입력해야 합니다.");
  }

  const { backupFilePath: resolvedBackupFilePath } = resolveDatabaseMigrationInput(input);

  // 토큰 검증
  const tokenEntry = previewTokens.get(input.previewToken);
  if (!tokenEntry || tokenEntry.expiresAt <= Date.now()) {
    throw new Error(
      "유효하지 않거나 만료된 미리보기 토큰입니다. 다시 미리보기를 진행해 주세요."
    );
  }

  if (path.resolve(tokenEntry.backupFilePath) !== path.resolve(resolvedBackupFilePath)) {
    throw new Error("미리보기 시점과 다른 백업 파일 경로입니다. 다시 미리보기를 진행해 주세요.");
  }

  if (tokenEntry.backupSha256 !== input.backupSha256) {
    throw new Error("요청된 백업 SHA와 미리보기 토큰 SHA가 일치하지 않습니다.");
  }

  // 실시간 백업 파일 바이트 SHA 재검증 (N4)
  const currentFileSha = computeFileSha256(resolvedBackupFilePath);
  if (currentFileSha.toLowerCase() !== tokenEntry.backupSha256.toLowerCase()) {
    throw new Error("미리보기 이후 백업 파일이 변경되었습니다. 다시 미리보기를 진행해 주세요.");
  }

  // 라이브 DB 연결 및 지문 검증 (N4)
  initializeSqliteStorage({
    userDataPath: input.userDataPath,
    env: input.env
  });

  const currentSettings = getStoredAppSettingsSnapshot({
    userDataPath: input.userDataPath,
    env: input.env
  });

  const liveDb = getRequiredDatabase();
  if (!isPolicyHistoryInitialized(liveDb)) {
    initializePolicyHistory(liveDb);
  }
  const currentFingerprint = computeDatabaseContentFingerprint(liveDb);

  if (currentFingerprint !== tokenEntry.databaseFingerprint) {
    throw new Error(
      "미리보기 이후 데이터베이스 내용이 변경되었습니다. 다시 미리보기를 진행해 주세요."
    );
  }

  // 토큰 1회 소비 (N4)
  previewTokens.delete(input.previewToken);

  // 교체 전 현재 DB의 사전 백업 완료 및 확인
  const backupBeforeRestore: JsonDatabaseBackupSummary = await runDatabaseBackupNow({
    userDataPath: input.userDataPath,
    env: input.env
  });

  if (!existsSync(backupBeforeRestore.jsonBackupPath)) {
    throw new Error("사전 백업 파일이 생성되지 않아 복원을 중단했습니다.");
  }

  // await 사이 원본 파일이나 운영 DB 변경 여부 재확인 (C03, N6)
  const postBackupFileSha = computeFileSha256(resolvedBackupFilePath);
  if (postBackupFileSha.toLowerCase() !== tokenEntry.backupSha256.toLowerCase()) {
    throw new Error("사전 백업 중 백업 원본 파일이 변경되었습니다.");
  }

  // C03: 사전 백업 await 도중 live DB 변경(새 승인/실적 등) 감지
  const postBackupDbFingerprint = computeDatabaseContentFingerprint(liveDb);
  if (postBackupDbFingerprint !== tokenEntry.databaseFingerprint) {
    throw new Error(
      "사전 백업 진행 중 데이터베이스 내용이 변경되었습니다. 다시 미리보기를 진행해 주세요."
    );
  }

  // C03: 실제 파싱된 버퍼의 SHA와 미리보기 토큰 SHA 대조
  const { snapshot, fileSha256: parsedSha } = parseAndValidateBackupJson(resolvedBackupFilePath);
  const employeeHireDateReview = buildImportedEmployeeHireDateReview(snapshot.tables.employees ?? [], parsedSha);
  if (parsedSha.toLowerCase() !== tokenEntry.backupSha256.toLowerCase()) {
    throw new Error("파싱된 백업 파일 해시가 미리보기 토큰 해시와 일치하지 않습니다.");
  }

  // C01: 대상 기기의 6운영 설정 live DB에서 캡처
  const operatingSettings = captureOperatingSettings(liveDb, currentSettings);

  const tempDatabasePath = path.join(
    ensureMigrationDirectory(currentSettings.databasePath),
    `restore-${Date.now()}-${randomUUID()}.sqlite`
  );

  // 비동기 사전 백업 중 생긴 잠금도 기존 연결을 닫기 직전에 확인한다.
  liveDb.exec("BEGIN IMMEDIATE");
  liveDb.exec("ROLLBACK");
  closeSqliteStorage();

  let warningMessages: string[] = [];
  const tableResults: JsonDatabaseTableImpact[] = [];

  try {
    initializeSqliteStorage({
      dbPath: tempDatabasePath,
      userDataPath: input.userDataPath,
      env: input.env
    });

    const tempDb = getRequiredDatabase();
    const importResult = importJsonBackupIntoDatabase({
      database: tempDb,
      snapshot,
      resolvedBackupFilePath,
      currentSettings,
      operatingSettings
    });

    warningMessages = importResult.warningMessages;
    assertLegacyEmploymentInitializationCanRun(tempDb);

    const tempTables = listUserTableNames(tempDb);
    for (const tableName of tempTables) {
      const row = tempDb
        .prepare(`SELECT COUNT(*) as count FROM ${quoteSqlIdentifier(tableName)}`)
        .get() as { count: number };
      tableResults.push({
        tableName,
        currentRowCount: 0, // 교체 후 결과
        nextRowCount: row.count
      });
    }

    closeSqliteStorage();

    // 기존 데이터베이스 파일을 새 복원 DB로 원자적 교체
    replaceDatabaseFileAtomically(currentSettings.databasePath, tempDatabasePath);

    // 새 라이브 DB 재열기
    initializeSqliteStorage({
      dbPath: currentSettings.databasePath,
      userDataPath: input.userDataPath,
      env: input.env
    });

    return {
      sourceType: "json",
      backupFilePath: resolvedBackupFilePath,
      sourceBackupSha256: tokenEntry.backupSha256,
      databasePath: currentSettings.databasePath,
      tableResults,
      backupBeforeRestore,
      warningMessages,
      completedAt: new Date().toISOString()
      ,employeeHireDateReview
    };
  } catch (error) {
    closeSqliteStorage();
    removeSqliteSidecars(tempDatabasePath);
    rmSync(tempDatabasePath, { force: true });

    // 실패 시 기존 운영 DB 유지 및 재열기
    initializeSqliteStorage({
      dbPath: currentSettings.databasePath,
      userDataPath: input.userDataPath,
      env: input.env
    });

    throw error;
  }
};
