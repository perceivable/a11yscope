/**
 * Panel-side translation.
 *
 * The rules keep producing English: their `message` is what the CLI prints,
 * what the tests match on, and what a bug report quotes. Each finding also
 * carries a `key` and the values that went into the message, and the panel
 * re-renders it from this dictionary when the browser runs in another
 * language. A key with no entry falls through to the English text, so a
 * missing translation is a cosmetic gap, never a blank line.
 *
 * Only Korean for now. The launch channels are Korean, and the Korean
 * accessibility standard (KWCAG 2.2) tracks WCAG success criteria closely
 * enough that the same findings apply — only the words change.
 */

const KO = {
  ui: {
    "scan": "이 페이지 검사",
    "preparing": "검사 준비 중…",
    "scanning": "검사 중…",
    "no-tab": "활성 탭이 없습니다. 페이지를 먼저 클릭한 뒤 검사하세요.",
    "unknown-failure": "알 수 없는 이유로 검사에 실패했습니다.",
    "next-page": "이 페이지를 검사하려면 툴바의 A11yScope 아이콘을 클릭하세요.",
    "summary-heading": "검사 요약",
    "violations": "위반",
    "needs-review": "검토 필요",
    "checks-passed": "통과한 검사",
    "stats": "검사 {rules}개 · 요소 {elements}개 · {seconds}초",
    "engine-errors": "이 페이지에서 검사 {count}개를 실행하지 못했습니다: {ids}",
    "filter-label": "결과 필터",
    "filter-all": "전체",
    "filter-violations": "위반",
    "filter-review": "검토",
    "filter-passed": "통과",
    "export": "리포트 내보내기",
    "export-pro":
      "리포트 내보내기는 Pro 기능입니다. 화면에 보이는 모든 결과는 지금도, 앞으로도 " +
      "무료입니다. Pro는 공유용 리포트와 여러 페이지 일괄 검사를 추가합니다.",
    "results-label": "검사 결과",
    "none-found": "자동 검사에서 발견된 문제가 없습니다",
    "none-found-detail":
      "이 페이지를 접근 가능하다고 말하려면 키보드와 스크린 리더로 직접 테스트하는 " +
      "과정이 아직 남아 있습니다.",
    "nothing-matches": "이 필터에 해당하는 항목이 없습니다.",
    "count-both": "위반 {violations}건, 검토 {review}건",
    "count-violations": "위반 {violations}건",
    "count-review": "검토 {review}건",
    "count-passed": "통과",
    "level-best-practice": "권장 사항",
    "impact-critical": "치명적",
    "impact-serious": "심각",
    "impact-moderate": "보통",
    "impact-minor": "경미",
    "select-to-highlight": "선택하면 페이지에서 강조 표시됩니다",
    "highlighted": "페이지에 강조 표시됨 ({width}×{height}px)",
    "highlight-failed": "이 요소를 강조 표시할 수 없습니다.",
    "highlight-failed-reason": "강조 표시 실패: {reason}",
    "disclaimer-strong": "자동 검사는 접근성 장벽의 약 3분의 1을 찾아냅니다.",
    "disclaimer":
      " 문제가 없다는 결과는 좋은 신호일 뿐, 준수 증명서가 아닙니다. 키보드 테스트, " +
      "스크린 리더 테스트, 사람의 판단이 여전히 필요하며, 어떤 도구도 KWCAG나 " +
      "장애인차별금지법 준수를 대신 확인해 줄 수 없습니다.",
    "disclaimer-muted":
      "검사는 검사 버튼을 누른 탭에서만 실행되며, 결과는 브라우저 밖으로 나가지 않습니다.",
    // Refusals from the service worker, keyed by its error code.
    "error.browser-page":
      "브라우저 내부 페이지는 검사할 수 없습니다. Chrome이 보안을 위해 확장 프로그램을 " +
      "차단하는 곳입니다. 일반 웹 페이지를 열고 다시 검사하세요.",
    "error.needs-grant":
      "이 페이지를 검사하려면 툴바의 A11yScope 아이콘을 클릭하세요. Chrome은 사용자가 " +
      "아이콘을 클릭한 뒤에만 확장 프로그램이 페이지를 읽도록 허용하므로, 요청하지 않은 " +
      "페이지는 절대 보지 않습니다.",
    "error.tab-closed": "그 탭이 닫혔습니다. 페이지를 다시 열고 재검사하세요.",
    "error.web-store":
      "Chrome 웹 스토어는 검사할 수 없습니다. Chrome이 확장 프로그램을 차단하는 곳입니다. " +
      "일반 웹 페이지를 열고 다시 검사하세요.",
    "error.no-result": "검사가 결과를 반환하지 않았습니다. 페이지를 새로고침한 뒤 다시 시도하세요.",
  },

  report: {
    "title": "접근성 검사 결과 — {page}",
    "url": "URL",
    "scanned": "검사 시각",
    "standard": "기준",
    "standard-value": "WCAG 2.2 Level AA (자동 검사 가능 항목)",
    "result": "결과",
    "result-value": "위반 {violations}건, 검토 필요 {review}건, 검사 {run}개 중 {passed}개 통과",
    "scope": "범위",
    "scope-value": "요소 {elements}개, 최상위 프레임만",
    "disclaimer":
      "자동 검사는 접근성 장벽의 약 3분의 1을 찾아냅니다. 이 리포트는 나열된 문제의 " +
      "근거이지 준수의 근거가 아닙니다. 사람이 직접 하는 키보드·스크린 리더 테스트가 " +
      "여전히 필요합니다.",
    "violations-heading": "위반",
    "rule-meta": "**WCAG {wcag}** · {level} · 영향 {impact} · {count}건",
    "selector": "선택자",
    "element": "요소",
    "review-heading": "사람이 검토할 항목",
    "review-intro":
      "자동으로 판정할 수 없었던 항목입니다. 각각은 무시해도 되는 오탐이 아니라 사람이 " +
      "답해야 하는 실제 질문입니다.",
    "review-meta": "**WCAG {wcag}** · {count}건",
    "passed-heading": "통과한 검사",
    "generated": "A11yScope로 생성.",
  },

  rules: {
    "img-alt": {
      title: "이미지에는 alt 속성이 있어야 합니다",
      help:
        "이미지가 전달하는 내용을 설명하는 대체 텍스트를 넣으세요. 순수한 장식이라면 " +
        'alt=""로 두어 보조 기술이 건너뛰게 합니다. 속성을 아예 생략하면 스크린 리더가 ' +
        "파일 이름을 읽어 버립니다.",
    },
    "img-alt-redundant": {
      title: "대체 텍스트가 파일 이름이나 '이미지'라는 말을 반복해서는 안 됩니다",
      help:
        "이미지의 내용이나 목적을 설명하세요. 파일 이름이나 \"image\", \"photo\" 같은 " +
        "단어는 아무 정보도 주지 않습니다. 이미지라는 사실은 스크린 리더가 이미 알려 줍니다.",
    },
    "input-label": {
      title: "폼 컨트롤에는 레이블이 있어야 합니다",
      help:
        "<label for>로 연결하거나, 컨트롤을 <label>로 감싸거나, aria-label 또는 " +
        "aria-labelledby를 넣으세요. placeholder는 레이블이 아닙니다. 입력을 시작하는 " +
        "순간 사라집니다.",
    },
    "button-name": {
      title: "버튼에는 접근 가능한 이름이 있어야 합니다",
      help:
        "아이콘만 있는 버튼에는 aria-label을 넣거나, 버튼 안에 시각적으로 숨긴 텍스트를 " +
        "두세요. 그렇지 않으면 스크린 리더 사용자는 '버튼'이라는 말만 듣습니다.",
    },
    "link-name": {
      title: "링크에는 식별 가능한 텍스트가 있어야 합니다",
      help:
        "링크가 어디로 가는지 설명하는 텍스트를 넣으세요. 이미지만 있는 링크는 이미지에 " +
        "대체 텍스트가, 아이콘만 있는 링크는 aria-label이 필요합니다.",
    },
    "link-generic-text": {
      title: "링크 텍스트는 목적지를 설명해야 합니다",
      help:
        "위반이 아니라 검토 항목입니다. WCAG 2.4.4는 '문맥 속에서의' 링크 목적을 묻기 " +
        "때문에 주변 문단, 목록 항목, 제목이 목적을 알려 준다면 카드 안의 \"자세히 보기\"도 " +
        "기준을 충족할 수 있습니다. 문제는 편의성입니다. 스크린 리더 사용자는 페이지의 " +
        "링크 목록을 한꺼번에 불러오는 경우가 많은데, 똑같은 항목 12개가 나열되면 아무것도 " +
        "알 수 없습니다. 의미 있는 단어를 링크 안으로 옮기면 해결됩니다. 텍스트만으로 " +
        "목적을 알 수 있어야 한다는 요구는 Level AAA인 2.4.9입니다.",
    },
    "iframe-title": {
      title: "프레임에는 title이 있어야 합니다",
      help:
        "프레임의 내용을 설명하는 title=\"…\"을 넣어 사용자가 들어갈지 판단할 수 있게 " +
        "하세요. 비어 있거나 뻔한 제목은 도움이 되지 않습니다.",
    },
    "svg-name": {
      title: "의미 있는 SVG 그래픽에는 접근 가능한 이름이 필요합니다",
      help:
        'SVG가 정보를 전달한다면 role="img"와 함께 aria-label이나 <title> 자식을 ' +
        '넣으세요. 장식이라면 aria-hidden="true"를 넣어 이름 없는 그래픽으로 읽히는 대신 ' +
        "건너뛰게 합니다.",
    },
    "contrast-text": {
      title: "텍스트는 최소 명도 대비를 충족해야 합니다",
      help:
        "WCAG AA는 일반 텍스트 4.5:1, 큰 텍스트(24px, 굵게는 18.66px) 3:1을 요구합니다. " +
        "비율을 충족할 때까지 글자를 어둡게 하거나 배경을 밝게 하세요. 접근성 민원에서 " +
        "가장 자주 지적되는 항목입니다.",
    },
    "contrast-placeholder": {
      title: "placeholder 텍스트도 명도 대비를 충족해야 합니다",
      help:
        "흰 배경에 회색 placeholder는 가장 흔한 위반 중 하나입니다. placeholder도 " +
        "콘텐츠이므로 4.5:1 규칙이 똑같이 적용됩니다. 또한 placeholder는 레이블이 " +
        "아닙니다. 입력을 시작하는 순간 사라집니다.",
    },
    "doc-lang": {
      title: "페이지는 언어를 선언해야 합니다",
      help:
        '<html> 요소에 lang="ko"(또는 맞는 코드)를 넣으세요. 없으면 스크린 리더가 ' +
        "잘못된 발음 규칙으로 읽어 내용을 알아들을 수 없게 됩니다.",
    },
    "doc-title": {
      title: "페이지에는 내용을 설명하는 제목이 있어야 합니다",
      help:
        "<title>은 페이지가 열릴 때 가장 먼저 읽히고, 탭과 검색 결과에 표시됩니다. " +
        "사이트 이름만이 아니라 이 페이지가 무엇인지 설명해야 합니다.",
    },
    "heading-order": {
      title: "제목 수준을 건너뛰어서는 안 됩니다",
      help:
        "<h2>에서 바로 <h4>로 넘어가면 스크린 리더 사용자가 탐색에 쓰는 개요 구조가 " +
        "깨집니다. 바로 다음 수준을 쓰고, 작게 보여야 한다면 CSS로 조정하세요.",
    },
    "heading-empty": {
      title: "제목은 비어 있어서는 안 됩니다",
      help:
        "빈 제목은 내용 없는 제목으로 읽혀 혼란을 줍니다. 간격만 필요하다면 제목 요소 " +
        "대신 CSS를 쓰세요.",
    },
    "page-has-h1": {
      title: "페이지에는 최상위 제목이 정확히 하나 있어야 합니다",
      help:
        "페이지 이름을 담은 <h1> 하나가 나머지 제목의 기준점이 됩니다. h1이 여럿이면 " +
        "사용자가 페이지의 주제를 알기 어렵습니다.",
    },
    "landmark-main": {
      title: "페이지에는 main 랜드마크가 있어야 합니다",
      help:
        "주요 콘텐츠를 <main>으로 감싸면 스크린 리더 사용자가 키 하나로 내비게이션을 " +
        "건너뛰어 본문으로 바로 이동할 수 있습니다.",
    },
    "skip-link": {
      title: "반복되는 내비게이션을 건너뛸 방법을 제공하세요",
      help:
        "첫 번째 포커스 가능 요소로 \"본문 바로가기\" 링크를 두면 키보드 사용자가 " +
        "페이지마다 메뉴 전체를 Tab으로 지나가지 않아도 됩니다. 포커스될 때까지 시각적으로 " +
        "숨겨 두어도 됩니다.",
    },
    "table-headers": {
      title: "데이터 표에는 머리글 셀이 있어야 합니다",
      help:
        "머리글 셀에 <th>를 써서 스크린 리더가 값이 어느 행·열에 속하는지 알려 줄 수 있게 " +
        '하세요. 레이아웃 용도의 표라면 대신 role="presentation"을 넣으세요.',
    },
    "list-structure": {
      title: "목록에는 목록 항목만 들어가야 합니다",
      help:
        "<ul>과 <ol>의 직접 자식은 <li>(그리고 <script>, <template>)만 허용됩니다. " +
        "다른 요소가 끼어들면 스크린 리더가 알려 주는 항목 개수가 틀어집니다.",
    },
    "duplicate-id": {
      title: "ARIA가 참조하는 id는 고유해야 합니다",
      help:
        "WCAG 2.2는 모든 id가 고유해야 한다는 요구를 없앴지만, aria-labelledby, " +
        "aria-describedby, label[for]가 가리키는 id가 중복되면 연결이 끊어집니다. " +
        "브라우저는 첫 번째 것만 찾습니다.",
    },
    "viewport-scalable": {
      title: "사용자가 페이지를 확대할 수 있어야 합니다",
      help:
        'user-scalable="no"를 지우고 maximum-scale을 5 이상으로 올리세요. 핀치 줌 차단은 ' +
        "저시력 사용자에게 가장 큰 영향을 주는 HTML 한 줄이며, 고치기는 아주 쉽습니다.",
    },
    "tabindex-positive": {
      title: "양수 tabindex는 피하세요",
      help:
        "양수 tabindex는 그 요소를 Tab 순서의 맨 앞으로 끌어와 포커스가 예측 불가능하게 " +
        '튑니다. DOM 순서를 바로잡고 tabindex="0"을 쓰세요.',
    },
    "aria-hidden-focusable": {
      title: "포커스 가능한 요소는 aria-hidden이어서는 안 됩니다",
      help:
        "키보드 사용자는 Tab으로 그 요소에 도달하지만 스크린 리더는 아무것도 읽지 않아 " +
        "포커스가 사라진 것처럼 보입니다. aria-hidden을 지우거나 " +
        'tabindex="-1"로 Tab 순서에서 빼세요.',
    },
    "nested-interactive": {
      title: "대화형 컨트롤을 중첩해서는 안 됩니다",
      help:
        "링크 안의 버튼(또는 그 반대)은 어떤 보조 기술도 제대로 표현할 수 없는 접근성 " +
        "트리를 만듭니다. 두 컨트롤을 나란히 두세요.",
    },
    "target-size": {
      title: "포인터 대상은 최소 24×24픽셀이어야 합니다",
      help:
        "WCAG 2.2에 새로 추가된 기준입니다. 24×24 CSS 픽셀보다 작은 대상은 손가락이나 " +
        "정밀하지 않은 포인터로 누르기 어렵습니다. 컨트롤을 키우거나, 중심에 그린 24px " +
        "원이 다른 대상에 닿지 않을 만큼 주변 여백을 두세요. 문장 안의 링크와 이미 그만한 " +
        "여백이 있는 대상은 예외입니다.",
    },
    "autoplay-media": {
      title: "오디오가 3초 넘게 자동 재생되어서는 안 됩니다",
      help:
        "예고 없는 소리는 스크린 리더 음성을 덮어 페이지를 쓸 수 없게 만듭니다. 음소거로 " +
        "시작하거나, 3초 이내로 끝내거나, 페이지 맨 위에 일시정지 컨트롤을 두세요.",
    },
    "media-captions": {
      title: "동영상에는 자막이 필요합니다",
      help:
        '동영상에 <track kind="captions">를 넣으세요. 자막의 품질이나 플랫폼 플레이어가 ' +
        "자막을 제공하는지는 자동으로 확인할 수 없으므로 위반이 아니라 검토 항목으로 " +
        "표시합니다.",
    },
    "aria-role-valid": {
      title: "ARIA role의 철자가 정확해야 합니다",
      help:
        "인식되지 않는 role은 완전히 무시되어 요소가 원래 의미(대개 아무 의미 없는 " +
        "<div>)로 돌아갑니다. ARIA 명세와 철자를 대조하세요.",
    },
    "aria-required-attr": {
      title: "ARIA role에는 필수 속성이 있어야 합니다",
      help:
        'role은 상태를 알려 주겠다는 약속입니다. aria-checked 없는 role="checkbox"는 ' +
        "스크린 리더가 읽을 것이 없어 사용자가 체크 여부를 알 수 없습니다.",
    },
    "autocomplete-attr": {
      title: "개인정보 입력란은 용도를 선언해야 합니다",
      help:
        "autocomplete 토큰이 있으면 브라우저와 보조 도구가 값을 채워 주고, 기호 지원 " +
        '소프트웨어가 맞는 아이콘을 보여 줍니다. autocomplete="email"이나 ' +
        'autocomplete="tel"처럼 넣으세요.',
    },
    "focus-outline-removed": {
      title: "포커스는 계속 보여야 합니다",
      help:
        "대체 표시 없이 outline: none을 쓰면 키보드 사용자가 페이지의 어디에 있는지 알 수 " +
        "없습니다. 기본 포커스 링을 없앴다면 box-shadow나 테두리로 눈에 띄는 포커스 " +
        "스타일을 직접 넣으세요.",
    },
  },

  messages: {
    "img-alt.missing-src": "<img>에 alt 속성이 없습니다 (src: {src})",
    "img-alt.missing": "<img>에 alt 속성이 없습니다",
    "img-alt-redundant.filename": "대체 텍스트가 파일 이름처럼 보입니다: \"{alt}\"",
    "img-alt-redundant.filler": "대체 텍스트가 내용을 설명하지 않습니다: \"{alt}\"",
    "input-label.placeholder-only":
      "<{tag}>에 placeholder(\"{placeholder}\")만 있습니다. placeholder는 레이블이 아닙니다",
    "input-label.missing": "<{tag}>에 접근 가능한 레이블이 없습니다",
    "button-name.missing": "버튼에 접근 가능한 이름이 없습니다",
    "link-name.missing": "링크에 식별 가능한 텍스트가 없습니다",
    "link-generic-text.generic":
      "링크 텍스트 \"{name}\"만으로는 목적지를 알 수 없습니다. 주변 문맥이 목적지를 " +
      "분명히 알려 주는지, 링크 목록에서 읽었을 때 말이 되는지 확인하세요.",
    "iframe-title.missing-src": "<iframe>에 title이 없습니다 (src: {src})",
    "iframe-title.missing": "<iframe>에 title이 없습니다",
    "svg-name.missing": "<svg>에 접근 가능한 이름이 없고 장식으로 표시되지도 않았습니다",

    "contrast-text.unmeasured-image":
      "배경이 이미지라서 대비를 측정할 수 없습니다. \"{sample}\"을 직접 확인하세요. " +
      "{required}:1이 필요합니다.",
    "contrast-text.unmeasured-unparseable":
      "배경색을 해석할 수 없어 대비를 측정할 수 없습니다. \"{sample}\"을 직접 확인하세요. " +
      "{required}:1이 필요합니다.",
    "contrast-text.gradient":
      "그라데이션 위의 텍스트입니다. 대비가 가장 낮은 색 지점({background})에서 " +
      "{ratio}:1로, 필요한 {required}:1에 못 미칩니다. 텍스트가 실제로 그 지점 위에 " +
      "놓이는지는 레이아웃에 달려 있으니 눈으로 확인하세요.",
    "contrast-text.invisible":
      "텍스트가 배경과 같은 색({foreground})이라 현재 보이지 않습니다. 실제로 표시되는 " +
      "상태에서 대비를 확인하세요.",
    "contrast-text.light-on-light":
      "밝은 텍스트({foreground})가 밝은 배경({background}) 위로 계산되었습니다. 상위 " +
      "요소에서 읽을 수 없는 어두운 층(위치 지정된 오버레이나 가상 요소)이 뒤에 있을 " +
      "가능성이 큽니다. 눈으로 확인하세요.",
    "contrast-text.below":
      "대비 {ratio}:1로 필요한 {required}:1에 못 미칩니다 ({background} 위 {foreground}, " +
      "{fontSize}px)",
    "contrast-placeholder.unmeasured":
      "placeholder \"{sample}\"의 대비를 측정할 수 없습니다. 이 브라우저는 ::placeholder " +
      "색을 노출하지 않습니다. 직접 확인하세요.",
    "contrast-placeholder.unmeasured-bg":
      "placeholder \"{sample}\"의 배경을 측정할 수 없습니다. 직접 확인하세요.",
    "contrast-placeholder.below":
      "placeholder \"{sample}\"의 대비가 {ratio}:1로 필요한 {required}:1에 못 미칩니다 " +
      "({background} 위 {foreground})",

    "doc-lang.missing": "<html>에 lang 속성이 없습니다",
    "doc-lang.invalid": "<html lang=\"{lang}\">은 올바른 언어 태그가 아닙니다",
    "doc-title.missing": "<title>이 없거나 비어 있습니다",
    "doc-title.placeholder": "<title> \"{title}\"은 임시 제목입니다",
    "heading-order.skip": "제목 수준이 h{from}에서 h{to}로 건너뜁니다",
    "heading-empty.empty": "<{tag}>가 비어 있습니다",
    "page-has-h1.none": "페이지에 <h1>이 없습니다",
    "page-has-h1.multiple": "페이지에 <h1>이 {count}개 있습니다. 첫 번째만 최상위여야 합니다",
    "landmark-main.none": "페이지에 <main> 요소나 role=\"main\"이 없습니다",
    "landmark-main.multiple": "페이지에 main 랜드마크가 {count}개 있습니다. 하나여야 합니다",
    "skip-link.none": "건너뛰기 링크가 없습니다. 키보드 사용자가 내비게이션을 건너뛸 수 있는지 확인하세요.",
    "skip-link.none-no-main":
      "건너뛰기 링크도 main 랜드마크도 없습니다. 키보드 사용자가 반복 콘텐츠를 건너뛸 수 없습니다.",
    "table-headers.none": "{rows}행짜리 표에 <th> 머리글 셀이 없습니다",
    "list-structure.stray": "<{tag}>의 직접 자식에 <li> 대신 <{child}>가 있습니다",
    "duplicate-id.referenced": "id=\"{id}\"가 {count}번 나타나며 ARIA나 레이블이 참조합니다",

    "viewport-scalable.user-scalable": "뷰포트에 user-scalable=\"no\"가 있어 핀치 줌이 막힙니다",
    "viewport-scalable.max-scale": "뷰포트가 maximum-scale을 {max}으로 제한합니다. 최소 2가 필요합니다",
    "tabindex-positive.positive": "tabindex=\"{value}\"가 자연스러운 Tab 순서를 덮어씁니다",
    "aria-hidden-focusable.focusable": "포커스는 가능하지만 보조 기술에는 숨겨진 요소입니다",
    "nested-interactive.nested": "{inner}가 {outer} 안에 중첩되어 있습니다",
    "target-size.off-screen":
      "화면 밖에 배치된 컨트롤로, 숨겨진 상태에서 {size}입니다. 포커스로 나타났을 때의 " +
      "크기를 확인하세요.",
    "target-size.in-sentence":
      "링크가 {size}이지만 문장 안에 있어 2.5.8의 예외에 해당할 가능성이 큽니다. 주변 " +
      "텍스트가 사실은 링크 목록이 아닌지 확인하세요.",
    "target-size.small": "대상이 {size}로 최소 24×24에 못 미칩니다",
    "autoplay-media.unmuted": "<{tag} autoplay>가 사용자 동의 없이 소리를 재생합니다",
    "media-captions.no-track": "<video>에 <track kind=\"captions\">가 없습니다. 자막이 있는지 확인하세요.",
    "aria-role-valid.invalid": "role=\"{role}\"은 올바른 ARIA role이 아닙니다",
    "aria-required-attr.missing": "role=\"{role}\"에 {missing}이 없습니다",
    "autocomplete-attr.missing": "<input type=\"{type}\">에 autocomplete 속성이 없습니다",
    "focus-outline-removed.none": "이 컨트롤에 포커스했을 때 보이는 포커스 표시가 없습니다",
  },
};

export const DICTIONARIES = { ko: KO };

/**
 * Which language to render in. The browser's UI language decides, but a
 * `?lang=` query lets the panel be opened in another language for a screenshot
 * or a test without changing Chrome's settings.
 */
export function detectLocale() {
  let override = null;
  try {
    override = new URLSearchParams(globalThis.location?.search ?? "").get("lang");
  } catch {
    override = null;
  }
  const ui = override ?? globalThis.chrome?.i18n?.getUILanguage?.() ?? "en";
  const primary = String(ui).toLowerCase().split(/[-_]/)[0];
  return primary in DICTIONARIES ? primary : "en";
}

function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params && params[name] !== undefined && params[name] !== null ? String(params[name]) : match
  );
}

export function translator(locale) {
  const dict = DICTIONARIES[locale] ?? null;

  return {
    locale,
    /** A panel string, or `fallback` (the English) when there is no entry. */
    ui(key, params, fallback) {
      const template = dict?.ui[key];
      return template ? fill(template, params) : fill(fallback ?? "", params);
    },
    report(key, params, fallback) {
      const template = dict?.report[key];
      return template ? fill(template, params) : fill(fallback ?? "", params);
    },
    /** Title and help for a rule, falling back to what the rule itself says. */
    rule(rule) {
      const entry = dict?.rules[rule.id];
      return { title: entry?.title ?? rule.title, help: entry?.help ?? rule.help };
    },
    /** A finding's message, re-rendered from its key and data when possible. */
    finding(finding) {
      const template = finding.key ? dict?.messages[finding.key] : null;
      return template ? fill(template, finding.data) : finding.message;
    },
    /** Level and impact tags: "AA" is universal, "Best practice" is not. */
    level(level) {
      if (level === "Best practice") return this.ui("level-best-practice", null, level);
      return level;
    },
    impact(impact) {
      return this.ui(`impact-${impact}`, null, impact);
    },
  };
}
