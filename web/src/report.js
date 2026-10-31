// 정보 오류 신고 링크. GitHub 이슈 양식(.github/ISSUE_TEMPLATE/data-report.yml)에 정책 정보를 미리 채워 연다.
// 신고는 GitHub 에 공개되므로 개인정보를 담지 않고, 정책 이름·번호·주소만 넣는다.
export const REPORT_REPO = "asroq1/public-info";
const MAX_TITLE_NAME = 60;

const clip = (text, limit) => (text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`);

export function reportUrl(service, origin = "") {
  const name = (service.n ?? "").replace(/\s+/g, " ").trim();
  const query = new URLSearchParams({
    template: "data-report.yml",
    title: `[정보 오류] ${clip(name, MAX_TITLE_NAME)}`,
    policy_name: name,
    policy_id: service.id ?? "",
    page_url: origin ? `${origin}/p/${service.id}` : "",
    official_url: service.u ?? "",
  });
  return `https://github.com/${REPORT_REPO}/issues/new?${query.toString()}`;
}
