import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAllowanceProposalHtml,
  buildAllowanceAttachmentOneHtml,
  buildAllowanceAttachmentTwoHtml,
  buildProposalLayoutConfigForTest,
  renderAttachmentOneTitleHtmlForTest,
  renderAttachmentTwoTitleHtmlForTest,
  renderAttachmentRateGuideHtmlForTest,
  renderAttachmentOneTableHtmlForTest,
  renderAttachmentTwoTableHtmlForTest,
  renderProposalHighlightCardHtmlForTest,
  renderProposalMetaTableHtmlForTest,
  writeAllowancePdfDocuments
} from "./allowance-document-pdf-service";
import { getDefaultDocumentLayoutDefinition } from "./document-layout-definition-service";

describe("allowance-document-pdf-service", () => {
  it("renders attachment1 rate guide with separate block lines for applied values and formulas", () => {
    const html = renderAttachmentRateGuideHtmlForTest([
      {
        lines: [
          {
            kind: "detail",
            text: "법정공휴일, 공휴일, 휴일근로로 분류된 근무에 적용됩니다."
          },
          {
            kind: "applied",
            text: "적용 요율: 2026.3-테스트 (2026.3.1 ~ 미정)"
          },
          {
            kind: "applied",
            text: "적용 배수: 기본 x1.5 / 연장 x2 / 야간 x0.5"
          },
          {
            kind: "formula",
            text: "계산식 1: 기본수당 = 시급 x 기본시간 x1.5"
          },
          {
            kind: "formula",
            text: "계산식 2: 연장수당 = 시급 x 연장시간 x2"
          },
          {
            kind: "formula",
            text: "계산식 3: 야간수당 = 시급 x 야간시간 x0.5"
          }
        ],
        label: "법정공휴일",
        sequence: 1
      }
    ]);

    expect(html).toContain('<section class="attachment-rate-entry">');
    expect(html).toContain('style="--guide-columns: 1"');
    expect(html).toContain('class="attachment-rate-guide-grid"');
    expect(html).toContain('<div class="attachment-rate-entry-title">1. 법정공휴일</div>');
    expect((html.match(/attachment-rate-line attachment-rate-line-/g) ?? []).length).toBe(6);
    expect((html.match(/attachment-rate-line-formula/g) ?? []).length).toBe(3);
    expect(html).toContain("적용 요율: 2026.3-테스트 (2026.3.1 ~ 미정)");
    expect(html).toContain("적용 배수: 기본 x1.5 / 연장 x2 / 야간 x0.5");
    expect(html).toContain("계산식 3: 야간수당 = 시급 x 야간시간 x0.5");
  });

  it("renders attachment1 rate guide with multi-column layout when entries grow", () => {
    const html = renderAttachmentRateGuideHtmlForTest(
      Array.from({ length: 5 }, (_, index) => ({
        label: `테스트 ${index + 1}`,
        sequence: index + 1,
        lines: [
          { kind: "detail" as const, text: "설명 1" },
          { kind: "applied" as const, text: "설명 2" },
          { kind: "applied" as const, text: "설명 3" },
          { kind: "formula" as const, text: "설명 4" },
          { kind: "formula" as const, text: "설명 5" }
        ]
      }))
    );

    expect(html).toContain('style="--guide-columns: 3"');
    expect(html).toContain('class="attachment-rate-guide-grid"');
  });

  it("renders proposal meta table with one-line author and extension fields plus blank approval cells", () => {
    const html = renderProposalMetaTableHtmlForTest({
      authorExtension: "7251",
      authorName: "운영담당",
      ownerDepartment: "DT사업1팀",
      printedDate: "2026.03.30",
      workMonth: "2026-02"
    });

    expect(html).toContain("작성자");
    expect(html).toContain("(인)");
    expect(html).toContain(">2026-03<");
    expect(html).toContain("내선번호");
    expect(html).toContain("운영담당 <span");
    expect(html).toContain(">7251<");
    expect(html).toContain('class="proposal-approval-cell"');
    expect(html).not.toContain("proposal-meta-inline-label");
  });

  it("renders proposal highlight card with line-separated regular and early payout values", () => {
    const html = renderProposalHighlightCardHtmlForTest({
      earlyPayoutTotalAllowanceAmount: 210000,
      formatCurrencyLabel: (amount) => `₩${amount.toLocaleString("ko-KR")}`,
      regularTotalAllowanceAmount: 409650,
      totalAllowanceAmount: 619650
    });

    expect((html.match(/proposal-highlight-line"/g) ?? []).length).toBe(2);
    expect(html).toContain("정규 지급");
    expect(html).toContain("퇴사자 선지급");
    expect(html).not.toContain(" / ");
  });

  it("builds proposal layout classes without forcing the early payout section onto a new page", () => {
    const layout = buildProposalLayoutConfigForTest({
      regularSiteCount: 14,
      earlyPayoutSiteCount: 2
    });

    expect(layout.mainPageClassName).toContain("proposal-main-page-compact");
    expect(layout.mainPageClassName).toContain("proposal-main-page-compressed");
    expect(layout.regularSectionClassName).toContain("proposal-table-compact");
    expect(layout.regularSectionClassName).toContain("proposal-table-compressed");
    expect(layout.earlyPayoutSectionClassName).toContain("proposal-flow-section");
    expect(layout.earlyPayoutSectionClassName).not.toContain("early-payout-section");
    expect(layout.footerSectionClassName).toContain("proposal-flow-section");
  });

  it("renders attachment1 title without the repeated-column note", () => {
    const html = renderAttachmentOneTitleHtmlForTest({
      logoDataUrl: null,
      workMonth: "2026-03"
    });

    expect(html).toContain("별첨1. DT사업1팀 교대근무자 시간외근로수당 내역 (2026년 3월)");
    expect(html).not.toContain("상단 컬럼은 페이지마다 반복됩니다.");
  });

  it("renders attachment1 table with compact type labels, merged subtotals, and continuous numbering", () => {
    const html = renderAttachmentOneTableHtmlForTest({
      rows: [
        {
          calculation: {
            snapshot: {
              totalAllowanceAmount: 27000,
              breakdown: {
                totalWorkMinutes: 180
              }
            }
          },
          employeeCode: "E001",
          employeeName: "김민수",
          department: "서울센터",
          workDate: "2026-03-04",
          hourlyRate: 15000,
          primaryMinutes: 180,
          primaryMultiplier: 1.5,
          primaryAmount: 27000,
          overtimeMinutes: 0,
          overtimeMultiplier: 0,
          overtimeAmount: 0,
          nightMinutes: 0,
          nightMultiplier: 0,
          nightAmount: 0,
          summaryCategory: "substitute",
          businessCategoryLabel: "평일 대체근무",
          substituteAmount: 27000,
          summaryOvertimeAmount: 0,
          holidayAmount: 0
        },
        {
          calculation: {
            snapshot: {
              totalAllowanceAmount: 62500,
              breakdown: {
                totalWorkMinutes: 600
              }
            }
          },
          employeeCode: "E001",
          employeeName: "홍길동",
          department: "서울센터",
          workDate: "2026-03-01",
          hourlyRate: 15000,
          primaryMinutes: 480,
          primaryMultiplier: 1.5,
          primaryAmount: 180000,
          overtimeMinutes: 60,
          overtimeMultiplier: 2,
          overtimeAmount: 30000,
          nightMinutes: 60,
          nightMultiplier: 2.5,
          nightAmount: 37500,
          summaryCategory: "legalHoliday",
          businessCategoryLabel: "법정공휴일",
          substituteAmount: 0,
          summaryOvertimeAmount: 0,
          holidayAmount: 62500
        }
      ],
      holidayNamesByDate: new Map([["2026-03-01", "대체공휴일(삼일절)"]]),
      formatCurrencyLabel: (amount) => `${amount.toLocaleString("ko-KR")}원`,
      formatDate: (value) => value.replaceAll("-", "."),
      formatHoursLabel: (minutes) => `${minutes / 60}h`,
      summaryCategoryOrder: {
        substitute: 0,
        overtime: 1,
        legalHoliday: 2
      },
      allowanceAxisLabels: {
        base: "기본",
        overtime: "연장",
        night: "야간"
      }
    });

    expect(html).toContain('<th colspan="3">기본</th>');
    expect(html).toContain('<th colspan="3">연장</th>');
    expect(html).toContain('<th colspan="3">야간</th>');
    expect(html).toContain('<th rowspan="2">유형구분</th>');
    expect(html).toContain('<td class="center">1</td>');
    expect(html).toContain('<td class="center">2</td>');
    expect(html).toContain('class="center attachment-date-cell holiday-highlight"');
    expect(html).toContain(">대체근무<");
    expect(html).toContain(">휴일근무<");
    expect(html).toContain("attachment-type-division-note");
    expect(html).toContain(">대체공휴일<");
    expect(html).toContain(">(삼일절)<");
    expect(html).toContain(">x1.5<");
    expect(html).toContain(">x2<");
    expect(html).toContain(">x2.5<");
    expect(html).toContain("15,000.00원");
    expect(html).toContain("27,000원");
    expect(html).toContain("180,000원");
    expect(html).toContain("30,000원");
    expect(html).toContain("37,500원");
    expect(html).toContain("62,500원");
    expect(html).toContain('<tr class="total-row">');
    // 8 identity columns: No / 사번 / 이름 / 직급 / 근무지 / 유형 / 근무일 / 유형구분.
    expect(html).toContain('<td class="center subtotal-label" colspan="8">소계</td>');
    expect(html).toContain('<td class="center total-label" colspan="8">총 소계</td>');
    expect(html).not.toContain("전체 총소계");
  });

  it("renders attachment2 title with the company logo slot on the right", () => {
    const html = renderAttachmentTwoTitleHtmlForTest({
      dateRangeLabel: "2026.03.01 ~ 2026.03.31",
      logoDataUrl: "data:image/png;base64,test",
      workMonth: "2026-03"
    });

    expect(html).toContain("별첨2. 월간 DT사업1팀 교대근무 직원의 연장근로 수당 지급 현황 202603");
    expect(html).toContain("2026.03.01 ~ 2026.03.31");
    expect(html).toContain('class="document-brand-logo"');
  });

  it("renders attachment2 table with centered work date, employee values, and grand subtotal", () => {
    const html = renderAttachmentTwoTableHtmlForTest({
      rows: [
        {
          calculation: {
            snapshot: {
              totalAllowanceAmount: 46000,
              breakdown: {
                totalWorkMinutes: 540
              }
            }
          },
          employeeCode: "E002",
          employeeName: "김철수",
          department: "부산센터",
          workDate: "2026-03-02",
          hourlyRate: 14000,
          primaryMinutes: 420,
          primaryMultiplier: 1,
          primaryAmount: 12000,
          overtimeMinutes: 120,
          overtimeMultiplier: 1.5,
          overtimeAmount: 34000,
          nightMinutes: 0,
          nightMultiplier: 0,
          nightAmount: 0,
          summaryCategory: "overtime",
          businessCategoryLabel: "평일 연장근무",
          substituteAmount: 12000,
          summaryOvertimeAmount: 34000,
          holidayAmount: 0
        }
      ],
      formatCurrencyLabel: (amount) => `${amount.toLocaleString("ko-KR")}원`,
      formatDate: (value) => value.replaceAll("-", "."),
      summaryCategoryOrder: {
        substitute: 0,
        overtime: 1,
        legalHoliday: 2
      }
    });

    expect(html).toContain("<th>근무일</th>");
    expect(html).toContain('<td class="center">2026.03.02</td>');
    expect(html).toContain('<td class="center">김철수</td>');
    expect(html).toContain("12,000원");
    expect(html).toContain("46,000원");
    expect(html).toContain('<tr class="total-row">');
    expect(html).toContain("전체 총소계");
  });

  it("applies layout delta to proposal HTML (position, font, visibility, custom text, colgroup)", () => {
    const baseDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-pdf" });
    const customizedDef = JSON.parse(JSON.stringify(baseDef));

    // 1. Title delta: move, font, remove logo
    const titleBlock = customizedDef.outputs[0].blocks.find(
      (b: { id: string }) => b.id === "allowance-pdf.proposal.title"
    );
    titleBlock.x = 15;
    titleBlock.y = 14;
    titleBlock.width = 185;
    titleBlock.height = 34;
    titleBlock.font = {
      family: "CustomProposalFont",
      sizePt: 16,
      bold: true,
      color: "#123456"
    };
    titleBlock.logoAssetId = null;

    // 2. Chart title custom text
    const chartTitleBlock = customizedDef.outputs[0].blocks.find(
      (b: { id: string }) => b.id === "allowance-pdf.proposal.chart-title"
    );
    chartTitleBlock.text = "맞춤형 수당 지급 분석 차트";
    chartTitleBlock.logoAssetId = null;

    // 3. Regular table colgroup delta
    const regularTableBlock = customizedDef.outputs[0].blocks.find(
      (b: { id: string }) => b.id === "allowance-pdf.proposal.regular-table"
    );
    regularTableBlock.columnWidths = {
      A: 10,
      B: 10,
      C: 20,
      D: 15,
      E: 15,
      F: 15,
      G: 15
    };

    const html = buildAllowanceProposalHtml({
      workMonth: "2026-03",
      rows: [],
      totalAllowanceAmount: 0,
      regularTotalAllowanceAmount: 0,
      earlyPayoutTotalAllowanceAmount: 0,
      formatDate: (v) => v,
      formatMonthLabel: (m) => m,
      formatProposalDateRange: (m) => m,
      formatCurrencyLabel: (a) => `${a}원`,
      formatHoursLabel: (m) => `${m}분`,
      formatNextPayrollMonthLabel: (m) => m,
      layoutDefinition: customizedDef,
      brandLogoDataUrl: "data:image/png;base64,samplelogo"
    });

    // delta styles
    expect(html).toContain('data-layout-block-id="allowance-pdf.proposal.title"');
    expect(html).toContain("margin-left: 5mm");
    expect(html).toContain("margin-top: 4mm");
    expect(html).toContain('font-family: &quot;CustomProposalFont&quot;, sans-serif');
    expect(html).toContain("font-size: 16pt");
    expect(html).toContain("font-weight: bold");
    expect(html).toContain("color: #123456");

    // logo suppressed for title
    expect(html).not.toContain('class="document-brand-logo"');

    // custom text applied
    expect(html).toContain("맞춤형 수당 지급 분석 차트");

    // colgroup applied
    expect(html).toContain("<colgroup>");
    expect(html).toContain('style="width: 10.00%"');
    expect(html).toContain('style="width: 20.00%"');
  });

  it("applies layout delta to attachment1 and attachment2 HTML", () => {
    const baseDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-pdf" });
    const customizedDef = JSON.parse(JSON.stringify(baseDef));

    // attachment1 colgroup delta (20 columns A~T)
    const att1TableBlock = customizedDef.outputs[1].blocks.find(
      (b: { id: string }) => b.id === "allowance-pdf.attachment1.table"
    );
    const keys20 = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T"];
    att1TableBlock.columnWidths = Object.fromEntries(keys20.map((k) => [k, 5]));

    const att1Html = buildAllowanceAttachmentOneHtml({
      workMonth: "2026-03",
      rows: [],
      holidayNamesByDate: new Map(),
      formatCurrencyLabel: (a) => `${a}원`,
      formatDate: (v) => v,
      formatHoursLabel: (m) => `${m}분`,
      summaryCategoryOrder: {},
      rateGuideEntries: [],
      allowanceAxisLabels: { base: "기본", overtime: "연장", night: "야간" },
      layoutDefinition: customizedDef
    });

    expect(att1Html).toContain('data-layout-block-id="allowance-pdf.attachment1.table"');
    expect(att1Html).toContain('style="width: 5.00%"');
    const att1Cols = att1Html.match(/<col style="width: [^"]+" \/>/g) ?? [];
    expect(att1Cols.length).toBe(20);

    // attachment2 colgroup delta (8 columns A~H)
    const att2TableBlock = customizedDef.outputs[2].blocks.find(
      (b: { id: string }) => b.id === "allowance-pdf.attachment2.table"
    );
    const keys8 = ["A","B","C","D","E","F","G","H"];
    att2TableBlock.columnWidths = Object.fromEntries(keys8.map((k) => [k, 12.5]));

    const att2Html = buildAllowanceAttachmentTwoHtml({
      workMonth: "2026-03",
      rows: [],
      formatCurrencyLabel: (a) => `${a}원`,
      formatDate: (v) => v,
      formatProposalDateRange: (m) => m,
      summaryCategoryOrder: {},
      layoutDefinition: customizedDef
    });

    expect(att2Html).toContain('data-layout-block-id="allowance-pdf.attachment2.table"');
    expect(att2Html).toContain('style="width: 12.50%"');
    const att2Cols = att2Html.match(/<col style="width: [^"]+" \/>/g) ?? [];
    expect(att2Cols.length).toBe(8);
  });

  // T-C4: font family 적대 payload 및 style attribute escape 검증
  it("T-C4: font family 적대 payload와 style attribute가 안전하게 escape/정제된다", () => {
    const dangerousPayloads = [
      '" onmouseover="boom',
      "';background:url(http://x)",
      "</style><script>"
    ];

    for (const payload of dangerousPayloads) {
      const baseDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-pdf" });
      const customizedDef = JSON.parse(JSON.stringify(baseDef));
      const titleBlock = customizedDef.outputs[0].blocks.find(
        (b: { id: string }) => b.id === "allowance-pdf.proposal.title"
      )!;
      titleBlock.font = { family: payload, sizePt: 16 };

      const html = buildAllowanceProposalHtml({
        workMonth: "2026-03",
        rows: [],
        totalAllowanceAmount: 0,
        regularTotalAllowanceAmount: 0,
        earlyPayoutTotalAllowanceAmount: 0,
        formatDate: (v) => v,
        formatMonthLabel: (m) => m,
        formatProposalDateRange: (m) => m,
        formatCurrencyLabel: (a) => `${a}원`,
        formatHoursLabel: (m) => `${m}분`,
        formatNextPayrollMonthLabel: (m) => m,
        layoutDefinition: customizedDef
      });

      expect(html).not.toContain("onmouseover=");
      expect(html).not.toContain("url(");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("</style><script>");
      expect((html.match(/<\/style>/g) ?? []).length).toBe(1);
    }
  });

  // T-C5b: 고정표 7/20/8열 col 개수 정확히 7/20/8 검증
  it("T-C5b: proposal(7열), attachment1(20열), attachment2(8열) colgroup 태그 수가 정확하다", () => {
    const defaultDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-pdf" });

    // Proposal regular table: 7 columns
    const propHtml = buildAllowanceProposalHtml({
      workMonth: "2026-03",
      rows: [],
      totalAllowanceAmount: 0,
      regularTotalAllowanceAmount: 0,
      earlyPayoutTotalAllowanceAmount: 0,
      formatDate: (v) => v,
      formatMonthLabel: (m) => m,
      formatProposalDateRange: (m) => m,
      formatCurrencyLabel: (a) => `${a}원`,
      formatHoursLabel: (m) => `${m}분`,
      formatNextPayrollMonthLabel: (m) => m,
      layoutDefinition: defaultDef
    });
    // proposal regular table의 colgroup 확인
    const propTableSection = propHtml.split('data-layout-block-id="allowance-pdf.proposal.regular-table"')[1] ?? "";
    const propColMatches = propTableSection.split("</table>")[0].match(/<col style="width: [^"]+" \/>/g) ?? [];
    expect(propColMatches.length).toBe(7);

    // Attachment 1: 20 columns
    const att1Html = buildAllowanceAttachmentOneHtml({
      workMonth: "2026-03",
      rows: [],
      holidayNamesByDate: new Map(),
      formatCurrencyLabel: (a) => `${a}원`,
      formatDate: (v) => v,
      formatHoursLabel: (m) => `${m}분`,
      summaryCategoryOrder: {},
      rateGuideEntries: [],
      allowanceAxisLabels: { base: "기본", overtime: "연장", night: "야간" },
      layoutDefinition: defaultDef
    });
    const att1ColMatches = att1Html.match(/<col\b/g) ?? [];
    expect(att1ColMatches.length).toBe(20);

    // Attachment 2: 8 columns
    const att2Html = buildAllowanceAttachmentTwoHtml({
      workMonth: "2026-03",
      rows: [],
      formatCurrencyLabel: (a) => `${a}원`,
      formatDate: (v) => v,
      formatProposalDateRange: (m) => m,
      summaryCategoryOrder: {},
      layoutDefinition: defaultDef
    });
    const att2ColMatches = att2Html.match(/<col\b/g) ?? [];
    expect(att2ColMatches.length).toBe(8);
  });

  // T-C6: 기본 proposal HTML/CSS baseline presentation 복원 검증
  it("T-C6: 기본 proposal HTML/CSS baseline presentation 대표값(chart grid, donut, bar gradient) 및 도넛 범례 스타일이 일치한다", () => {
    const html = buildAllowanceProposalHtml({
      workMonth: "2026-03",
      rows: [],
      totalAllowanceAmount: 0,
      regularTotalAllowanceAmount: 0,
      earlyPayoutTotalAllowanceAmount: 0,
      formatDate: (v) => v,
      formatMonthLabel: (m) => m,
      formatProposalDateRange: (m) => m,
      formatCurrencyLabel: (a) => `${a}원`,
      formatHoursLabel: (m) => `${m}분`,
      formatNextPayrollMonthLabel: (m) => m
    });

    // 1. Chart grid: minmax(0, 1.25fr) minmax(0, 0.9fr)
    expect(html).toContain("grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.9fr);");

    // 2. Donut outer/inner: 180px / 118px
    expect(html).toContain("width: 180px;");
    expect(html).toContain("height: 180px;");
    expect(html).toContain("width: 118px;");
    expect(html).toContain("height: 118px;");

    // 3. Bar gradient: #3758b0 -> #8da2de
    expect(html).toContain("linear-gradient(90deg, #3758b0 0%, #8da2de 100%)");

    // 4. Donut legend item: gap 12px, color #41526d (baseline 복원)
    expect(html).toContain(".proposal-donut-legend-item {");
    expect(html).toMatch(/\.proposal-donut-legend-item\s*\{[^}]*gap:\s*12px;/);
    expect(html).toMatch(/\.proposal-donut-legend-item\s*\{[^}]*color:\s*#41526d;/);

    // 5. Donut legend item strong: color #1f325a (baseline 복원)
    expect(html).toMatch(/\.proposal-donut-legend-item\s+strong\s*\{[^}]*color:\s*#1f325a;/);

    // 6. Donut dot: display: inline-block 없음 (baseline에는 없었음)
    expect(html).not.toMatch(/\.proposal-donut-dot\s*\{[^}]*display:\s*inline-block;/);
  });

  // T-C7: 각 output visible === false 시 DOM 완전 생략 검증
  it("T-C7: proposal, attachment1, attachment2 블록 visible=false 시 wrapper 및 내용이 DOM에서 완전히 생략된다", () => {
    // 1. Proposal 블록들 검증
    const proposalBlockIds = [
      "allowance-pdf.proposal.title",
      "allowance-pdf.proposal.meta",
      "allowance-pdf.proposal.criteria",
      "allowance-pdf.proposal.regular-table",
      "allowance-pdf.proposal.early-table",
      "allowance-pdf.proposal.footer",
      "allowance-pdf.proposal.chart-title",
      "allowance-pdf.proposal.chart-note",
      "allowance-pdf.proposal.chart-summary",
      "allowance-pdf.proposal.chart-grid"
    ];

    for (const blockId of proposalBlockIds) {
      const baseDef = getDefaultDocumentLayoutDefinition({ documentKind: "proposal-pdf" });
      const customizedDef = JSON.parse(JSON.stringify(baseDef));
      const targetBlock = customizedDef.outputs[0].blocks.find(
        (b: { id: string }) => b.id === blockId
      )!;
      targetBlock.visible = false;

      const html = buildAllowanceProposalHtml({
        workMonth: "2026-03",
        rows: [],
        totalAllowanceAmount: 1000,
        regularTotalAllowanceAmount: 1000,
        earlyPayoutTotalAllowanceAmount: 0,
        formatDate: (v) => v,
        formatMonthLabel: (m) => m,
        formatProposalDateRange: (m) => m,
        formatCurrencyLabel: (a) => `${a}원`,
        formatHoursLabel: (m) => `${m}분`,
        formatNextPayrollMonthLabel: (m) => m,
        layoutDefinition: customizedDef
      });

      expect(html).not.toContain(`data-layout-block-id="${blockId}"`);
    }

    // 2. Attachment 1 table visible: false
    const att1Def = JSON.parse(JSON.stringify(getDefaultDocumentLayoutDefinition({ documentKind: "proposal-pdf" })));
    const att1TableBlock = att1Def.outputs[1].blocks.find(
      (b: { id: string }) => b.id === "allowance-pdf.attachment1.table"
    )!;
    att1TableBlock.visible = false;
    const att1Html = buildAllowanceAttachmentOneHtml({
      workMonth: "2026-03",
      rows: [],
      holidayNamesByDate: new Map(),
      formatCurrencyLabel: (a) => `${a}원`,
      formatDate: (v) => v,
      formatHoursLabel: (m) => `${m}분`,
      summaryCategoryOrder: {},
      rateGuideEntries: [],
      allowanceAxisLabels: { base: "기본", overtime: "연장", night: "야간" },
      layoutDefinition: att1Def
    });
    expect(att1Html).not.toContain('data-layout-block-id="allowance-pdf.attachment1.table"');

    // 3. Attachment 2 table visible: false
    const att2Def = JSON.parse(JSON.stringify(getDefaultDocumentLayoutDefinition({ documentKind: "proposal-pdf" })));
    const att2TableBlock = att2Def.outputs[2].blocks.find(
      (b: { id: string }) => b.id === "allowance-pdf.attachment2.table"
    )!;
    att2TableBlock.visible = false;
    const att2Html = buildAllowanceAttachmentTwoHtml({
      workMonth: "2026-03",
      rows: [],
      formatCurrencyLabel: (a) => `${a}원`,
      formatDate: (v) => v,
      formatProposalDateRange: (m) => m,
      summaryCategoryOrder: {},
      layoutDefinition: att2Def
    });
    expect(att2Html).not.toContain('data-layout-block-id="allowance-pdf.attachment2.table"');
  });

  it("writes 3 allowance PDF documents atomically using installed Chrome", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "allowance-pdf-test-"));
    const proposalPath = path.join(tempDir, "proposal.pdf");
    const attachment1Path = path.join(tempDir, "attachment1.pdf");
    const attachment2Path = path.join(tempDir, "attachment2.pdf");

    try {
      await writeAllowancePdfDocuments({
        proposalPath,
        attachment1Path,
        attachment2Path,
        workMonth: "2026-03",
        rows: [],
        holidayNamesByDate: new Map(),
        totalAllowanceAmount: 0,
        regularTotalAllowanceAmount: 0,
        earlyPayoutTotalAllowanceAmount: 0,
        formatDate: (v) => v,
        formatMonthLabel: (m) => m,
        formatProposalDateRange: (m) => m,
        formatCurrencyLabel: (a) => `${a}원`,
        formatHoursLabel: (m) => `${m}분`,
        formatNextPayrollMonthLabel: (m) => m,
        summaryCategoryOrder: {},
        rateGuideEntries: [],
        allowanceAxisLabels: { base: "기본", overtime: "연장", night: "야간" }
      });

      const [pBuf, a1Buf, a2Buf] = await Promise.all([
        fs.readFile(proposalPath),
        fs.readFile(attachment1Path),
        fs.readFile(attachment2Path)
      ]);

      expect(pBuf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(a1Buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(a2Buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);
});
