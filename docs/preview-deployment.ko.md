# 클릭 가능한 미리보기 배포

이 구성은 **가상 데이터와 브라우저 저장소만 사용하는 미리보기**입니다. 운영 서버·SQLite·업로드 파일·기존 계약 데이터·API 키는 배포하지 않습니다. AI 호출은 발생하지 않습니다. API 서버가 있는 원래 앱은 변경 없이 유지됩니다.

## 정적 파일 만들기

Node.js 24 환경에서 저장소 루트에서 실행합니다.

```sh
npm ci --cache /tmp/dealer-npm
npm run build:preview
```

`preview-dist/`가 생성됩니다. 이 폴더 내용이 정적 웹 호스팅의 배포 루트가 되어야 합니다. `index.html`과 `_next/`가 같은 레벨에 있어야 합니다. 저장소 전체나 `.env.local`, `.data/`는 업로드하지 마세요.

## Netlify

- 수동: Netlify 계정에서 수동 배포를 선택하고 `preview-dist/` 폴더를 업로드합니다.
- Git 연결: 이 코드가 저장된 저장소/브랜치를 연결합니다. `netlify.toml`에 빌드 명령과 공개 폴더를 지정했습니다.
- 공식 수동 배포 안내: https://docs.netlify.com/deploy/create-deploys/

게시 후 호스팅 서비스가 발급한 HTTPS 주소를 사용합니다. 이 문서나 로컬 서버 실행만으로 외부 URL이 생성되지는 않습니다. 계정의 요금제와 사용량 제한을 확인하세요.

## 범위

계약 예제 수정·검토·저장, 관리자 계약 확인, 교육 게시, 퀴즈, 교육성과를 같은 브라우저에서 시험할 수 있습니다. 새로고침 후에도 남습니다. 다른 기기와 공유되지 않으며 브라우저 저장소를 지우면 초기화됩니다. 준비된 계약과 응답만 사용합니다. 업로드는 거절하고 네트워크로 보내지 않습니다. 교육 정답은 브라우저에 있으므로 실제 시험용이 아닙니다.

## 검증

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory preview-dist
# 별도 셸에서
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 STATIC_PREVIEW_CHECK=1 npm run test:e2e
```

실제 외부 배포 후에는 발급받은 HTTPS 주소로 PLAYWRIGHT_BASE_URL을 지정해 같은 기능을 재확인합니다. 외부 URL의 검증 없이 ‘배포 완료’라고 부르지 않습니다.
