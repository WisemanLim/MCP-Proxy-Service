# 샘플 Spring Boot — items CRUD

GET/POST/PUT/DELETE 지원 (Spring Boot 3 + springdoc). MCP-Proxy 변환 테스트 대상.

## 실행
```bash
cd api-samples/spring-boot

# JAVA_HOME 설정 (필수) — brew openjdk 예
export JAVA_HOME=/opt/homebrew/opt/openjdk
export PATH="$JAVA_HOME/bin:$PATH"

gradle bootRun                                 # 8080
gradle bootRun --args='--server.port=8088'     # 8080 충돌 시
```
요구: JDK 17+ (JDK 26 + Gradle 9.5.1 빌드·기동 확인됨), Gradle 8+.

> **`JAVA_HOME is set to an invalid directory …vscode…/java/latest`**: VSCode Java 확장의 죽은 JDK 경로 탓. 위 `export`로 교체(영구 설정은 `~/.zshrc`에 추가).
>
> **`Port 8080 already in use`**: MCP 프록시(apps/api) HTTP 기본 포트와 동일. 프록시를 끄거나 `--server.port=8088`로 분리.
>
> **bootRun이 `80% EXECUTING [경과시간]`에서 안 끝나는 듯 보임**: 정상. `bootRun`은 앱이 떠 있는 동안 유지되는 태스크 — 멈춘 게 아니라 서버가 동작 중. 중지는 `Ctrl+C`. 백그라운드로 쓰려면:
> ```bash
> gradle bootRun --console=plain --args='--server.port=8088'   # 진행바 제거
> gradle bootJar && java -jar build/libs/sample-spring-boot-1.0.0.jar --server.port=8088 &   # 데몬화
> ```

## 엔드포인트
| 메서드 | 경로 |
|--------|------|
| GET | `/items` |
| POST | `/items` |
| GET | `/items/{id}` |
| PUT | `/items/{id}` |
| DELETE | `/items/{id}` |

## OpenAPI 스키마
- `http://localhost:8080/v3/api-docs` ← apps/web “① 스키마 링크” 모드에 입력
- Swagger UI: `http://localhost:8080/swagger-ui.html`
