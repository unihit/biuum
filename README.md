# 비움 PWA

기존 ‘비움 · 중고물품 보관함’의 화면과 동작을 유지하면서 Apps Script 서버 호출을 Google Sheets·Drive API 직접 호출로 교체한 정적 PWA입니다. 별도 서버나 npm 의존성 설치가 필요하지 않습니다.

화면 테마는 사용자가 제공한 `biuum-pwa-orange.zip`의 CSS·주황색 아이콘·PWA 색상 설정을 적용합니다. 휴대폰에서는 사진 왼쪽·물품 정보 오른쪽의 목록을, 큰 화면에서는 카드 그리드를 사용합니다. Google 연결·저장·복구 로직은 최신 구현을 유지합니다.

## 포함된 기능

- 기존 10개 열의 물품 시트 읽기·추가·정보 수정·상태 변경.
- 등록 시 사진 최대 3장, 긴 변 600px 이하 및 JPEG 100KB 이하로 압축.
- 비공개 Drive 사진 업로드·조회. 원본 사진은 별도로 저장하지 않습니다.
- 목록 상태 필터, 12개씩 더 보기, 상세 화면, JSON 목록 내보내기.
- 기기 IndexedDB에 최근 목록과 읽은 사진 캐시, 명시적인 조회 전용 모드.
- Google 파일과 분리된 체험 모드.
- 설치 매니페스트, PNG 아이콘, 저장소 하위 경로에서 동작하는 서비스 워커.
- 단일 화면의 저장 직렬화, 저장 직전 변경 확인, 불확실한 등록 결과 재확인.

## 로컬 실행

Node.js 24 이상에서 이 폴더를 열어 실행합니다.

```powershell
npm test
npm run preview
```

브라우저에서 `http://localhost:4173/` 또는 `http://localhost:4173/biuum/`을 엽니다. Google 로그인은 Chrome·Edge·Safari 등 일반 브라우저에서 진행하세요. 앱 내부 임베디드 브라우저에서는 Google OAuth가 차단될 수 있습니다.

## Google Cloud 설정

사용자가 만든 OAuth 클라이언트와 같은 프로젝트에서 다음을 설정합니다.

1. Google Drive API, Google Sheets API를 활성화합니다.
2. OAuth 클라이언트 유형은 **웹 애플리케이션**이어야 합니다.
3. 승인된 JavaScript 원본에 로컬 확인용 `http://localhost`와 `http://localhost:4173`을 추가합니다. `http://127.0.0.1:4173`을 사용한다면 해당 원본도 별도로 필요합니다.
4. GitHub 배포 후 `https://GITHUB_USERNAME.github.io`를 원본에 추가합니다. `/biuum/` 같은 저장소 경로는 넣지 않습니다. 사용자 도메인을 쓰면 그 HTTPS 원본을 추가합니다.
5. OAuth 대상이 외부·테스트 상태라면 **본인 계정을 테스트 사용자에 추가**합니다. 테스트 사용자 설정은 영구적인 서버 접근 제어를 의미하지 않습니다.
6. 데이터 액세스 범위에 `https://www.googleapis.com/auth/drive`와 `https://www.googleapis.com/auth/userinfo.email`을 구성합니다.

이 버전은 기존 Apps Script 사진 파일을 그대로 연결하기 위해 Drive 전체 권한을 요청합니다. 이 권한으로 필요한 Sheets 값 API도 호출할 수 있으므로 별도 `spreadsheets` 범위를 요청하지 않습니다. 새로운 앱에 파일별 접근 권한을 부여하는 Picker 연결을 구현한 후에는 `drive.file`로 축소할 수 있습니다. 기존 폴더 ID만 아는 것으로 기존 모든 파일의 `drive.file` 접근이 보장되지는 않습니다.

사용자 동의를 거친 접근 토큰은 메모리에만 유지하고 파일·localStorage·IndexedDB에 저장하지 않습니다. 토큰 만료 또는 새로고침 후 Google 연결을 다시 눌러야 합니다. Google 로그인과 새로운 앱 권한 동의는 사용자가 직접 완료합니다. 클라이언트 비밀키는 필요하지 않습니다.

공식 문서:
- https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update

## 기존 데이터 연결

개인 연결 QR 또는 `#setup=...` 링크를 열면 5개 설정 값이 입력된 설정 창이 열립니다. **이 설정으로 Google 연결**을 누르면 이 기기에 설정을 저장하고 OAuth 연결을 시작합니다. 링크의 설정 부분은 화면에서 읽은 즉시 주소에서 제거됩니다. Google 권한 승인과 Cloud API 사용 설정은 별도로 필요합니다.

연결 설정에는 **설정 파일 저장**과 **연결 링크 복사** 버튼도 있습니다. 파일은 다른 기기에서 가져올 수 있고 링크는 QR로 변환하거나 본인 기기로 전송할 수 있습니다. 링크·QR은 비밀번호나 토큰을 포함하지 않지만 이메일 및 시트·폴더 ID를 포함하므로 본인 기기에서만 사용하세요. 개인 QR·링크·설정 파일은 공개 저장소나 배포 브랜치에 포함하지 않습니다.

상단 **연결 QR** 또는 연결 설정의 **연결 QR 보기**를 누르면 현재 설정을 담은 QR을 브라우저에서 생성해 표시합니다. **QR 이미지 저장**으로 PNG를 내려받을 수 있습니다. QR 생성에 외부 서비스를 호출하지 않으며 Google 로그인 전이나 오프라인에서도 유효한 설정이 있으면 표시할 수 있습니다.

1. 앱의 **연결 설정**을 엽니다.
2. 전달된 `biuum-connection.local.json`을 **설정 파일 가져오기**로 선택합니다. 파일에는 사용자 제공 클라이언트 ID, 계정 이메일, 기존 시트·폴더 ID가 있습니다.
3. 탭 이름이 `물품`인지 확인하고 **설정 저장**을 누릅니다.
4. **Google 연결**에서 본인 계정으로 권한을 승인합니다.
5. 앱은 폴더의 쓰기 가능 여부와 시트 첫 행을 확인한 뒤 기존 물품을 읽습니다. 연결만으로 새 물품이나 파일을 생성하지 않습니다.

시트 첫 행은 다음 순서여야 합니다.

```text
id | name | price | status | place | description | photoIds | createdAt | updatedAt | listedAt
```

사진은 선택한 폴더 안의 등록된 JPEG만 읽으며 100KB 이하로 제한합니다. 파일 권한은 변경하거나 공개하지 않습니다. 기존 데이터는 복사하거나 자동 변환하지 않습니다. 원래 앱의 따옴표 이스케이프 규칙과 ISO 날짜를 유지합니다.

## GitHub Pages 배포

1. 저장소는 `https://github.com/unihit/biuum`, 앱 주소는 `https://unihit.github.io/biuum/`입니다. 로컬 앱 폴더 안의 소스 파일을 저장소 루트에 넣습니다.
2. 개인 연결 파일 `biuum-connection.local.json`은 저장소에 올리지 않습니다. 이 파일은 앱 폴더 밖에 있으며 `*.local.json`은 gitignore에도 등록되어 있습니다.
3. 저장소 Settings → Pages → Source를 **Deploy from a branch**, 브랜치를 **gh-pages**, 폴더를 **/(root)**로 설정합니다.
4. 앱의 정적 파일을 `gh-pages` 브랜치에 올리면 GitHub가 자동으로 배포합니다. 현재 제공된 원격 저장소는 이 방식으로 준비합니다.
5. 배포 주소의 원본을 Google OAuth 설정에 추가한 뒤 일반 브라우저에서 연결 설정 파일을 가져옵니다.

배포 브랜치에는 앱의 정적 파일만 포함합니다. README·테스트·개인 연결 파일은 배포 산출물에 포함하지 않습니다. `deployment/pages-workflow.yml`은 나중에 GitHub Actions 배포로 전환할 때 사용할 선택적 템플릿입니다. 현재 GitHub CLI 토큰에 workflow 범위가 없어 `.github/workflows/`에 넣지 않았습니다. Actions로 전환하려면 해당 범위를 가진 로그인에서 템플릿을 `.github/workflows/pages.yml`로 옮기고 Pages Source를 GitHub Actions로 변경합니다. GitHub Free의 일반적인 Pages 사용은 공개 저장소를 전제로 하며, 비공개 저장소의 Pages는 요금제에 따라 지원됩니다. 비공개 저장소와 비공개 배포 사이트는 별개입니다.

배포된 화면과 코드는 방문자가 받을 수 있지만 목록과 사진 접근은 Google 파일 권한으로 보호합니다. 설정한 이메일 검사는 실수로 다른 계정을 연결하는 것을 방지하는 UI 기능이며, 서버 보안 경계가 아닙니다. 개인 데이터·토큰·시트·폴더 ID는 공개 정적 파일에 넣지 않았습니다.

## 오프라인·캐시

한 번 방문한 기기는 앱 화면을 캐시합니다. **연결 설정 → 저장된 목록 보기**에서 최근 캐시를 읽을 수 있습니다. 이전에 열지 않은 사진은 오프라인에서 표시되지 않습니다. 오프라인 새 등록·수정·업로드 큐는 이 버전에 포함하지 않았습니다.

연결 해제는 현재 토큰을 버리지만 Google의 권한 동의와 기기 캐시를 제거하지 않습니다. **기기 캐시 비우기**는 Google 파일을 삭제하지 않고 기기 목록·사진·체험 데이터·재시도 기록을 지웁니다. 기기를 공유한다면 캐시된 개인정보가 같은 브라우저 사용자에게 보일 수 있으므로 캐시를 비우세요. 동의 철회는 Google 계정의 연결된 앱 설정에서 합니다.

업데이트 때는 `sw.js`의 `VERSION`을 올립니다. 기존 화면이 실행 중일 때 새 코드를 강제로 적용하지 않습니다. 설치된 앱 및 관련 탭을 모두 닫고 다시 열면 새 버전이 적용됩니다. 첫 버전부터 서비스 워커를 활성화하므로 로컬 개발에서도 오래된 탭을 닫고 다시 열어야 합니다.

## 저장의 한계와 복구

Sheets 직접 호출에는 현재 Apps Script의 `LockService`와 같은 원자적 잠금이 없습니다. PC와 휴대폰이 같은 순간 수정하면 마지막 저장이 앞선 수정을 덮어쓸 수 있습니다. 저장 직전 재조회와 updatedAt 비교로 일반적인 오래된 화면 수정은 차단하지만 동시 읽기·쓰기 경합은 완전히 방지하지 못합니다. 기존 Apps Script와 PWA도 동시에 수정하지 마세요.

등록 요청의 응답이 끊기면 같은 입력 재시도에서 물품 ID·사진 ID를 재사용하고 시트를 조회합니다. 결과를 확정할 수 없을 때 생성한 사진을 섣불리 지우지 않습니다. 명확한 목록 저장 거절이며 미등록을 확인한 경우에는 생성 사진을 휴지통으로 옮깁니다. 브라우저 종료·기기 변경·캐시 삭제 후의 모든 재시도나 동시에 열린 두 탭의 동일 입력을 완벽하게 중복 방지하는 분산 트랜잭션은 아닙니다. 사진 업로드 중 중단되면 같은 내용으로 재시도하고 목록을 새로고침하세요. 입력 내용을 바꿔 새 요청을 만들면 이전 실패 요청의 미연결 사진이 남을 수 있습니다.

사진은 처음 등록할 때만 추가합니다. 수정 화면에서 사진 교체·추가·삭제는 원래 앱과 동일하게 제공하지 않습니다. 판매중 버튼은 당근 게시 API가 아니라 상태 기록입니다. 목록 내보내기는 사진 파일을 포함하지 않습니다.

## 코드 구성과 검증

- `google-store.js`: Sheets·Drive 연동, 등록 복구, 저장 직전 변경 확인.
- `store.js`: OAuth·계정 확인·모드 전환·기기별 설정.
- `model.js`: 기존 열 구조, 검증, 상태 및 날짜 처리.
- `cache.js`: IndexedDB 저장.
- `connection.js`: 연결 설정·PWA 설치 UI.
- `app.js`, `react-bundle.js`, `styles.css`: 사용자가 제공한 컴파일된 React 화면을 유지하고 저장 연결부를 교체했습니다. 원래 JSX 소스가 없으므로 기존 화면 부분은 압축된 코드입니다. 새로운 API·설정 코드는 읽기 쉬운 모듈로 분리했습니다.
- `tests/store.test.js`: 실패 후 재시도·사진 정리·기존 행 호환·충돌 검사 등의 모의 API 테스트.

Google OAuth·실제 Drive 읽기/쓰기와 GitHub 배포는 사용자의 로그인·권한 동의 및 원본/API 설정 완료 후 별도로 확인해야 합니다. 모의 API 테스트 통과만으로 실제 연결이 검증됐다는 뜻은 아닙니다.

