# 공유 데이터모델 구현과 데모 실행

2026년 10월 28일 구현 기록. 배포 제품을 새로 선택하지 않고 기존 Next.js·TypeScript·SQLite를 확장했다. 기존 AU 데모를 유지했으며 실제 현대차 영업·보증 시스템과 연결하지 않았다.

## 구현 흐름

- `lib/model-schema.ts`: 외래 키·유일성 제약, 공개 과정과 응시 기록의 변경 방지, 최초 샘플 데이터. `schema_migrations`로 시드를 한 번 적용한다.
- `lib/auth.ts`: 데모 두 계정의 비밀번호 검증, 서버 세션, 사용자·직원·딜러 관계 확인. 화면 역할 토글을 권한 근거로 쓰지 않는다.
- `lib/crm.ts`: 딜러·담당 직원 범위의 Contact·Lead·Opportunity·Product·Asset·보증 조회. 내부 사용자는 파일럿 네트워크를 조회한다.
- `lib/training.ts`: 공개 버전, 대상 미리보기, 조건·Account·Contact 할당, 개인 수강과 할당 이유, 서버 채점과 누적 이력, Account별 집계.
- `lib/knowledge.ts`: 시장·공개 상태·대상·유효 기간·버전으로 제한한 검색, 본인 대화 기록. 단어 부분 일치로 VIN 조각을 검색하지 않는다.
- `lib/ai.ts`: 기존 Agents SDK를 재사용한 읽기 전용 지식 답변과 출처 검증. 자료를 가져오지 않거나 허용되지 않은 ID를 인용하면 정상 답변으로 처리하지 않는다.

## 실제 테이블과 논리 객체

Account는 `accounts`, Contact는 `contacts`, 관계는 `account_contact_relations`, 로그인은 `app_users`다. 로그인 세션은 `user_sessions`에 별도로 보관한다.

Course는 기존 legacy `courses`를 덮어쓰지 않고 `learning_courses`에 공개 버전별로 보관한다. 개인 수강은 `enrollments`, 할당 정책은 `learning_assignments`, 여러 배정 근거는 `enrollment_sources`, 응시는 `quiz_attempts`다. 문제와 레슨은 과정 버전의 JSON이다.

영업과 차량은 `products`, `opportunities`, `opportunity_contact_roles`, `leads`, `assets`, `asset_warranties`에 연결한다. `contracts`와 `audit_events`는 보존하고 감사 기록에 조작 User를 추가했다.

지식과 대화는 `knowledge_articles`, `chat_sessions`, `chat_messages`다. 관리용 기사 목록과 챗봇 검색의 대상 범위는 분리한다. 내부 관리자는 딜러용 기사를 편집·게시할 수 있지만, 딜러의 검색에는 내부 전용 기사가 들어가지 않는다.

## 두 계정으로 확인하기

1. 내부 로그인 → Dealer network에서 딜러 등급과 신규 상태, 직원·고객 관계, 차량·보증을 확인한다.
2. Training management에서 새 버전의 과정·문제를 공개한다. 정답을 검토한 뒤 학습 대상을 미리 보고 할당한다.
3. Switch account로 로그아웃한 뒤 Olivia로 로그인한다. Learning hub에서 레슨 완료와 퀴즈 제출을 진행한다.
4. 개인 진도에서 최신·최고 점수와 모든 응시를 확인한다. 퀴즈만 합격하고 레슨을 끝내지 않으면 전체 과정은 완료되지 않는다.
5. 다시 내부 로그인 → Learning performance에서 딜러·직원별 필터로 실제 제출 결과를 확인한다. Prepared sample은 실제 제출과 구분된다.
6. Geelong을 Tier 1로 바꾸고 같은 EV 과정을 New 조건으로도 배정한다. Priya의 수강은 하나이고 이유는 여러 개 남는다.

로그인 상세와 실행 명령은 README에 있다. 샘플 생성은 `npm run seed`로 다시 실행해도 기존 기록을 지우지 않는다.

## 간소화하거나 남겨둔 범위

할당은 대상 미리보기 후 ACTIVE로 저장한다. 별도로 영구 저장하는 DRAFT 할당 화면은 만들지 않았다. PAUSED는 신규 배정을 중단하며 기존 수강을 지우지 않는다. 직원 전근·복수 고용·수강 면제·복원 UI·과정 퇴역 UI는 후속 범위다.

Lead 전환과 차량 인도는 샘플 관계 조회로 구현했다. 쓰기 업무의 자동화는 이번 범위가 아니다. 보증 조건은 가상 예시이며 청구 가능 여부를 판단하지 않는다.

기존 이름 기반 학습 이력은 삭제하지도 새 직원에게 추정 연결하지도 않는다. 기존 계약은 문서 스냅샷으로 보존한다. 실제 Salesforce 동기화는 하지 않는다.

공개된 기본 비밀번호 두 개를 쓰는 가상 데이터 데모다. 실제 조직 SSO나 운영 서비스의 보안 구성이 완성됐다는 뜻은 아니다. 원문 계약 정보가 관찰 로그로 나가지 않도록 기존 tracing 비활성화를 유지했다.

실제 모델 호출 없이도 준비된 지식 답변으로 흐름을 확인할 수 있다. live AI와 그 사실 정확도 검증은 API 키와 별도 평가 데이터가 필요하다. 이번 자동 검증은 데이터 무결성·접근 범위·검색 필터·업무 흐름을 대상으로 한다.

## 검증 결과

- `npm run seed`: 두 계정, 딜러 2곳, Contact 7명 등 초기 자료 생성과 재실행 시 보존을 확인했다.
- `npm test`: 데이터 관계·권한·할당·채점·검색·API 테스트 30개 통과.
- `npm run typecheck` 및 `npm run build`: 통과.
- Playwright: 브라우저 검사 7개 통과. 내부 과정 공개·할당 → 직원 학습·퀴즈 → 내부 성적 확인, 계약 저장, 권한 우회 차단, 챗봇 이력, 모바일 화면을 확인했다. WCAG A/AA 자동 검사도 포함한다.
- `npm run build:preview`: 읽기 전용 정적 화면 빌드 통과. 실제 공유 데이터 기능은 서버 실행이 필요하다.

브라우저 테스트에는 별도 임시 DB를 사용했으며, 일반 데모 DB에는 E2E 교육 과정이나 실제 제출 기록을 넣지 않았다. 테스트는 live OpenAI 호출, 모델의 사실 정확도, 부하 성능이나 운영 보안 인증을 검증하지 않는다.
