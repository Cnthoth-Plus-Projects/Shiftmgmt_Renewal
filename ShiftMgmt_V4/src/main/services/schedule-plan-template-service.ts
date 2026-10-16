import type { SchedulePlanTemplateLayout } from "../../shared/domain/schedule-plan";
import type { DocumentTemplateVersion } from "../../shared/domain/model";
import { inspectSchedulePlanTemplateFromWorkbook } from "./schedule-plan-adapter";
import { createBuiltInExcelWorkbook } from "./built-in-excel-layout-service";
import {
  listStoredApprovedDocumentTemplateVersions,
  listStoredDocumentTemplateVersions,
  resolveStoredDefaultDocumentTemplateVersion
} from "./operations-storage-service";

export const resolveSchedulePlanTemplateVersion = (
  templateVersionId?: string
): DocumentTemplateVersion => {
  const templates = listStoredApprovedDocumentTemplateVersions("schedule");

  if (templates.length === 0) {
    throw new Error("사용 가능한 근무표 양식 버전을 찾을 수 없습니다.");
  }

  if (templateVersionId) {
    const matched = templates.find((template) => template.id === templateVersionId);

    if (!matched) {
      throw new Error("선택된 근무표 양식 버전을 찾을 수 없습니다.");
    }

    return matched;
  }

  return resolveStoredDefaultDocumentTemplateVersion("schedule") ?? templates[0]!;
};

export const resolveSchedulePlanTemplateLayout = async (
  template: DocumentTemplateVersion
): Promise<SchedulePlanTemplateLayout> => {
  if (template.profile?.kind === "schedule") {
    return template.profile.layout;
  }

  if (template.id === "template-schedule-sample1-2026-1") {
    return inspectSchedulePlanTemplateFromWorkbook(
      createBuiltInExcelWorkbook("schedule-xlsx/template1")
    );
  }

  if (template.id === "template-schedule-sample2-2026-1") {
    return inspectSchedulePlanTemplateFromWorkbook(
      createBuiltInExcelWorkbook("schedule-xlsx/template2")
    );
  }

  throw new Error("지원하는 기본 근무표 레이아웃을 확인할 수 없습니다.");
};

export const resolveAnySchedulePlanTemplateVersion = (
  templateVersionId?: string
): DocumentTemplateVersion | null => {
  if (!templateVersionId) {
    return null;
  }

  return (
    listStoredDocumentTemplateVersions("schedule").find(
      (template) => template.id === templateVersionId
    ) ?? null
  );
};
