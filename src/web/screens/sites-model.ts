// sites-model.ts — 근무지 관리 순수 데이터 모델, 정렬, 필터, 페이징, 검토 및 체크포인트
import { resolveShiftPatternForDate } from "../../shared/domain/shift-pattern-version";
import type {
  SiteRecord,
  ShiftPatternRecord,
  EmployeeRecord
} from "../../shared/domain/model";

export interface SiteListItem {
  id: string;
  siteCode: string;
  name: string;
  customerName: string;
  status: SiteRecord["status"];
  timezone: string;
  teamCount: number;
  assignedCount: number;
  activePatternName?: string;
  activeEffectiveFrom?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SiteListFilter {
  keyword: string;
  status: "ALL" | "active" | "inactive";
  patternFilter: "ALL" | "HAS_PATTERN" | "NO_PATTERN";
  sortBy?: "customer" | "name" | "code" | "teams" | "employees";
  sortOrder?: "asc" | "desc";
}

export interface SitePageResult {
  items: SiteListItem[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  startRange: number;
  endRange: number;
}

export interface SiteKpiSummary {
  totalSites: number;
  activeSites: number;
  inactiveSites: number;
  totalAssignedEmployees: number;
}

export interface SiteValidationIssue {
  field: string;
  message: string;
  step: "basics" | "pattern" | "organization";
}

export interface SiteEmployeeIdentity {
  employeeId: string;
  employeeCode: string;
  name: string;
  rank?: string;
  employmentType: string;
  status: string;
  currentSiteId?: string;
  currentSiteName?: string;
  currentShiftGroup?: string;
  sortOrder: number;
}

/**
 * 직원 목록에서 중복 없는 일관된 employeeId Identity Map을 구축한다.
 */
export function buildEmployeeIdentityMap(
  employees: EmployeeRecord[]
): Map<string, SiteEmployeeIdentity> {
  const map = new Map<string, SiteEmployeeIdentity>();
  for (const emp of employees) {
    if (!map.has(emp.id)) {
      map.set(emp.id, {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        name: emp.name,
        rank: emp.rank,
        employmentType: emp.employmentType,
        status: emp.status,
        currentSiteId: emp.currentSiteId,
        currentSiteName: emp.currentSiteName,
        currentShiftGroup: emp.currentShiftGroup,
        sortOrder: emp.currentAssignmentOrder ?? 0
      });
    }
  }
  return map;
}

/**
 * 사이트, 패턴, 배정 정보를 종합하여 SiteListItem 배열로 변환한다.
 */
export function buildSiteListItems(
  sites: SiteRecord[],
  patterns: ShiftPatternRecord[],
  employees: EmployeeRecord[]
): SiteListItem[] {
  const activePatternMap = new Map<string, ShiftPatternRecord>();
  const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  for (const site of sites) { const p=resolveShiftPatternForDate(patterns.filter(p=>p.siteId===site.id),today); if(p)activePatternMap.set(site.id,p); }

  // siteId -> 배정 인원 집계
  const siteAssignedCount = new Map<string, number>();
  for (const emp of employees) {
    if (emp.currentSiteId && emp.status === "active") {
      siteAssignedCount.set(
        emp.currentSiteId,
        (siteAssignedCount.get(emp.currentSiteId) ?? 0) + 1
      );
    }
  }

  return sites.map((site) => {
    const activePattern = activePatternMap.get(site.id);
    return {
      id: site.id,
      siteCode: site.siteCode,
      name: site.name,
      customerName: site.customerName?.trim() || "기타",
      status: site.status,
      timezone: site.timezone,
      teamCount: activePattern ? activePattern.teamCount : 0,
      assignedCount: siteAssignedCount.get(site.id) ?? 0,
      activePatternName: activePattern?.name,
      activeEffectiveFrom: activePattern?.effectiveFrom,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt
    };
  });
}

/**
 * KPI 요약 집계
 */
export function calculateSiteKpis(items: SiteListItem[]): SiteKpiSummary {
  let activeSites = 0;
  let inactiveSites = 0;
  let totalAssignedEmployees = 0;

  for (const item of items) {
    if (item.status === "active") {
      activeSites++;
    } else {
      inactiveSites++;
    }
    totalAssignedEmployees += item.assignedCount;
  }

  return {
    totalSites: items.length,
    activeSites,
    inactiveSites,
    totalAssignedEmployees
  };
}

/**
 * 검색, 필터링, 고객사 그룹화 및 안정 정렬 후 10개씩 페이징을 수행한다.
 */
export function filterAndPaginateSites(
  items: SiteListItem[],
  filter: SiteListFilter,
  page: number,
  pageSize = 10
): SitePageResult {
  const keyword = filter.keyword.trim().toLowerCase();

  // 1. 필터링
  const filtered = items.filter((item) => {
    if (filter.status !== "ALL" && item.status !== filter.status) {
      return false;
    }
    if (filter.patternFilter === "HAS_PATTERN" && !item.activePatternName) {
      return false;
    }
    if (filter.patternFilter === "NO_PATTERN" && item.activePatternName) {
      return false;
    }
    if (keyword) {
      const matchName = item.name.toLowerCase().includes(keyword);
      const matchCode = item.siteCode.toLowerCase().includes(keyword);
      const matchCustomer = item.customerName.toLowerCase().includes(keyword);
      if (!matchName && !matchCode && !matchCustomer) {
        return false;
      }
    }
    return true;
  });

  // 2. 전체 결과에 사용자 지정 정렬 적용 (안정 정렬)
  const sortBy = filter.sortBy || "customer";
  filtered.sort((a, b) => {
    let primary = 0;
    if (sortBy === "name") {
      primary = a.name.localeCompare(b.name, "ko-KR");
    } else if (sortBy === "code") {
      primary = a.siteCode.localeCompare(b.siteCode, "ko-KR", { numeric: true });
    } else if (sortBy === "teams") {
      primary = b.teamCount - a.teamCount;
    } else if (sortBy === "employees") {
      primary = b.assignedCount - a.assignedCount;
    } else {
      primary = a.customerName.localeCompare(b.customerName, "ko-KR");
    }
    if (primary !== 0) return primary * (filter.sortOrder === "desc" ? -1 : 1);

    const custCompare = a.customerName.localeCompare(b.customerName, "ko-KR");
    if (custCompare !== 0) return custCompare;
    const nameCompare = a.name.localeCompare(b.name, "ko-KR");
    if (nameCompare !== 0) return nameCompare;
    return a.siteCode.localeCompare(b.siteCode, "ko-KR", { numeric: true }) || a.id.localeCompare(b.id);
  });

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalCount);
  const pagedItems = filtered.slice(startIdx, endIdx);

  return {
    items: pagedItems,
    totalCount,
    totalPages,
    currentPage,
    startRange: totalCount === 0 ? 0 : startIdx + 1,
    endRange: endIdx
  };
}

/**
 * 조 정원 초과 및 맞교환 순서 검증
 * 출발 조와 도착 조의 정원 상태를 분석하여 안전하게 저장 가능한 이동 순서가 존재하는지 검증한다.
 */
export function validateTeamCapacities(
  teamCapacities: Record<string, number | undefined>,
  currentTeamCounts: Record<string, number>,
  stagedMoves: Array<{ employeeId: string; fromTeam?: string; toTeam: string }>
): { isValid: boolean; error?: string } {
  // 시뮬레이션용 카운트 복사
  const counts = { ...currentTeamCounts };

  // 각 조별 순 변동 계산
  for (const move of stagedMoves) {
    if (move.fromTeam) {
      counts[move.fromTeam] = Math.max(0, (counts[move.fromTeam] ?? 0) - 1);
    }
    counts[move.toTeam] = (counts[move.toTeam] ?? 0) + 1;
  }

  // 최종 정원 초과 여부 확인
  for (const [team, max] of Object.entries(teamCapacities)) {
    if (typeof max === "number" && max > 0) {
      const finalCount = counts[team] ?? 0;
      if (finalCount > max) {
        return {
          isValid: false,
          error: `${team}조의 정원(${max}명)을 초과했습니다. 현재 배정 인원: ${finalCount}명`
        };
      }
    }
  }

  // 서버가 목적지 정원을 기존 배정 종료 전에 검사하므로,
  // 여유 자리가 없는 꽉 찬 두 조 간의 1:1 맞교환은 단일 순차 저장 시 첫 번째 저장이 실패할 수 있음
  for (const move of stagedMoves) {
    if (move.fromTeam && move.fromTeam !== move.toTeam) {
      const maxTo = teamCapacities[move.toTeam];
      const initialToCount = currentTeamCounts[move.toTeam] ?? 0;
      if (typeof maxTo === "number" && maxTo > 0 && initialToCount >= maxTo) {
        // 도착 조에 초기 여유 공간이 없는 경우, 먼저 다른 인원이 빠져나가는 순서인지 점검 필요
        const departuresFromTo = stagedMoves.filter((m) => m.fromTeam === move.toTeam).length;
        if (departuresFromTo === 0) {
          return {
            isValid: false,
            error: `${move.toTeam}조는 현재 정원이 가득 차 있어 신규 배정이 불가능합니다.`
          };
        }
      }
    }
  }

  return { isValid: true };
}

/**
 * YYYY-MM-DD 형식 및 실제 유효한 달력 날짜인지 검증한다 (예: 2026-99-99 차단).
 */
export function isValidDateString(dateStr: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export type PatternVersionStatus = "past" | "current" | "scheduled" | "inactive";

/**
 * 근무 패턴의 버전 상태(과거, 현재, 예정, 비활성)를 판정한다.
 */
export function resolvePatternVersionStatus(
  pattern: ShiftPatternRecord,
  allPatternsForSite: ShiftPatternRecord[],
  referenceDateStr?: string
): PatternVersionStatus {
  if (pattern.status === "inactive") {
    return "inactive";
  }

  const today = referenceDateStr || new Date().toISOString().slice(0, 10);
  const activePatterns = allPatternsForSite
    .filter((p) => p.status === "active" && p.effectiveFrom)
    .sort((a, b) => (a.effectiveFrom! < b.effectiveFrom! ? -1 : 1));

  if (activePatterns.length === 0) {
    return "current";
  }

  // 오늘 이하 중 가장 최근 버전을 현재(current) 버전으로 판정
  const currentOrPast = activePatterns.filter((p) => p.effectiveFrom! <= today);
  const currentVersion =
    currentOrPast.length > 0
      ? currentOrPast[currentOrPast.length - 1]
      : activePatterns[0];

  if (pattern.effectiveFrom && pattern.effectiveFrom > today) return "scheduled";
  if (pattern.id === currentVersion.id) {
    return "current";
  }

  if (pattern.effectiveFrom && currentVersion.effectiveFrom && pattern.effectiveFrom > currentVersion.effectiveFrom) {
    return "scheduled";
  }

  return "past";
}



export interface AssignmentMovePlan { employeeId:string; fromTeam?:string; toTeam:string; startDate?:string; sortOrder?:number; orderOnly?:boolean }
/** Match the existing server's check-before-ending order; never invent a temporary move. */
export function planAssignmentMoves(employees: EmployeeRecord[], siteId: string, capacities: Record<string,number|undefined>, moves: AssignmentMovePlan[]): AssignmentMovePlan[] {
  if(new Set(moves.map(m=>m.employeeId)).size!==moves.length)throw Error("같은 인력의 배정이 중복되어 있습니다. 이동 내역을 다시 확인해 주세요.");
  if(moves.some(m=>!employees.some(e=>e.id===m.employeeId)))throw Error("배정할 인력을 찾지 못했습니다. 인력 목록을 새로 조회해 주세요.");
  const counts: Record<string,number>={}; const placement=new Map<string,string>();
  for(const e of employees) if(e.currentSiteId===siteId && e.currentShiftGroup){placement.set(e.id,e.currentShiftGroup);counts[e.currentShiftGroup]=(counts[e.currentShiftGroup]||0)+1;}
  const pending=moves.filter(m=>!m.orderOnly).slice(),ordered:AssignmentMovePlan[]=[];
  while(pending.length){const i=pending.findIndex(m=>{const self=placement.get(m.employeeId)===m.toTeam?1:0,limit=capacities[m.toTeam];return !m.toTeam || !limit || (counts[m.toTeam]||0)-self<limit;});
    if(i<0)throw Error("현재 정원에서는 이동 순서를 정할 수 없습니다. 정원이 찬 조의 맞교환은 한 번에 저장할 수 없으니 배정 순서를 확인해 주세요.");
    const [m]=pending.splice(i,1);const old=placement.get(m.employeeId);if(old)counts[old]=Math.max(0,(counts[old]||0)-1);if(m.toTeam){counts[m.toTeam]=(counts[m.toTeam]||0)+1;placement.set(m.employeeId,m.toTeam);}else placement.delete(m.employeeId);ordered.push(m);
  }
  for(const [team,max] of Object.entries(capacities))if(max && (counts[team]||0)>max)throw Error(`${team}의 배정 인원이 정원을 넘습니다. 배정이나 정원을 확인해 주세요.`);
  return [...ordered,...moves.filter(m=>m.orderOnly)];
}
