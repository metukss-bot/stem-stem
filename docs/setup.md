# 처음 설정 (한 번만)

전부 무료입니다. 15분 정도 걸립니다.

## 1. 앱 주소 켜기 (GitHub Pages)

1. GitHub 저장소 **Settings → Pages**
2. **Source** 를 **GitHub Actions** 로 바꾸기
3. main 브랜치에 코드가 올라가면 자동으로 배포됩니다.
   주소: https://metukss-bot.github.io/stem-stem/

## 2. 구글 드라이브 연결용 클라이언트 ID 만들기

> 이미 만들어서 앱에 기본값으로 넣어 두었습니다 (구글 클라우드 프로젝트 `stemstem`, 테스트 사용자로 본인 Gmail 등록됨).
> 밴드원도 쓰려면 [대상 페이지](https://console.cloud.google.com/auth/audience?project=stemstem)에서 테스트 사용자로 Gmail을 추가하세요.
> 아래는 새로 만들 때의 순서입니다.

앱이 내 드라이브에 곡을 올리고 결과를 받아오려면 필요합니다.

1. https://console.cloud.google.com/ 접속 → 위쪽에서 **새 프로젝트** (이름 예: stemstem)
2. **API 및 서비스 → 라이브러리** 에서 **Google Drive API** 검색 → **사용**
3. **API 및 서비스 → OAuth 동의 화면**
   - 사용자 유형: **외부**
   - 앱 이름: StemStem, 지원 이메일: 내 Gmail
   - **테스트 사용자** 에 내 Gmail(그리고 밴드원 Gmail) 추가
   - 게시하지 않고 "테스트" 상태로 두면 됩니다.
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 자바스크립트 원본:
     - `https://metukss-bot.github.io`
     - `http://localhost:5173` (개발용, 선택)
5. 만들어진 **클라이언트 ID** (`....apps.googleusercontent.com`) 복사

넣는 방법은 둘 중 하나:

- 폰 앱의 **설정** 에 붙여넣기 (그 폰에만 저장됨), 또는
- GitHub 저장소 **Settings → Secrets and variables → Actions → Variables** 에
  `VITE_GOOGLE_CLIENT_ID` 로 저장 (다음 배포부터 모든 기기에 적용)

로그인할 때 "Google에서 확인하지 않은 앱" 경고가 나오면 **고급 → StemStem(으)로 이동** 을 누르면 됩니다.
내가 만든 테스트 앱이라 나오는 경고입니다.

## 3. 폰 홈 화면에 설치

- 아이폰(사파리): 공유 버튼 → **홈 화면에 추가**
- 안드로이드(크롬): 메뉴 → **앱 설치** 또는 **홈 화면에 추가**

# 사용법

1. 앱에서 **곡 올리기** → 폰에 있는 곡 선택 (드라이브 `StemStem/inbox` 로 올라감)
2. **분석하기 (Colab)** → Colab이 열리면 **런타임 → 모두 실행**
   - 처음 한 번은 **런타임 → 런타임 유형 변경 → T4 GPU** 선택
   - 드라이브 연결 허용
   - 곡당 1~2분 (GPU 기준)
3. 앱에서 **새로고침** → 곡을 누르면 폰에 저장되고 재생 화면이 열림
4. 합주실에서는 인터넷 없이 재생됩니다.

아이폰은 무음 스위치가 켜져 있으면 소리가 안 날 수 있습니다.
